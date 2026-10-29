"""Cloud asset integrity tests; small in-memory fixtures, no network or model loads."""
import copy
import errno
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('survival_assets', Path(__file__).parents[1] / 'server/survival/assets.py')
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)


class Response(io.BytesIO):
    def __init__(self, body, status=200, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}
        self.url = 'https://release-assets.githubusercontent.com/example'


class AssetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.events = []

    def library_zip(self, extra=None):
        dbpath = self.root / 'fixture.sqlite'
        with sqlite3.connect(dbpath) as database:
            database.execute('CREATE TABLE sources (docs INTEGER, done INTEGER)')
            database.execute('INSERT INTO sources VALUES (42, 1)')
        body = io.BytesIO()
        with zipfile.ZipFile(body, 'w') as archive:
            archive.writestr('index.sqlite', dbpath.read_bytes())
            archive.writestr('SOURCES.md', 'Source licences preserved')
            archive.writestr('text/one.md', 'Reference text')
            if extra:
                archive.writestr(*extra)
        return body.getvalue()

    def split(self, body):
        midpoint = len(body) // 2
        paths = [self.root / 'part0', self.root / 'part1']
        paths[0].write_bytes(body[:midpoint]); paths[1].write_bytes(body[midpoint:])
        return paths

    def test_remote_guard_prevents_local_download(self):
        modal = types.SimpleNamespace(is_local=lambda: True)
        with patch.dict(sys.modules, {'modal': modal}), patch.object(assets.urllib.request, 'urlopen') as fetch:
            with self.assertRaises(assets.AssetError):
                assets.ensure_library(self.root / 'library')
            with self.assertRaises(assets.AssetError):
                assets.ensure_model(self.root / 'model')
            fetch.assert_not_called()
        self.assertEqual(list(self.root.iterdir()), [])

    def test_status_is_read_only_and_missing_is_not_ready(self):
        with patch.object(assets.urllib.request, 'urlopen', side_effect=AssertionError('no network')):
            status = assets.asset_status(self.root)
        self.assertFalse(status['ready'])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_parts_reader_handles_boundaries_seeks_and_eof(self):
        paths = self.split(b'abcdefghijklmnopqrstuvwxyz')
        with assets._PartsReader(paths) as stream:
            self.assertEqual(stream.read(14), b'abcdefghijklmn')
            stream.seek(-5, 2)
            self.assertEqual(stream.read(), b'vwxyz')
            stream.seek(100)
            self.assertEqual(stream.read(10), b'')
            stream.seek(2)
            self.assertEqual(stream.read(2), b'cd')

    def test_safe_extracts_split_archive_and_preserves_sources(self):
        paths = self.split(self.library_zip())
        dest = self.root / 'extracted'
        assets._extract_library(paths, dest, self.events.append)
        self.assertEqual(assets._library_stats(dest), {'sources': 1, 'articles': 42})
        self.assertTrue((dest / 'SOURCES.md').is_file())

    def test_path_traversal_absolute_and_backslash_rejected_before_extracting(self):
        for name in ('../escaped', '/tmp/escaped', 'text/../../escape', 'text\\escape', 'C:/escape'):
            with self.subTest(name=name):
                body = self.library_zip((name, b'bad'))
                paths = self.split(body)
                dest = self.root / 'unsafe'
                with self.assertRaises(assets.AssetError):
                    assets._extract_library(paths, dest, self.events.append)
                self.assertFalse(dest.exists())
                (self.root / 'fixture.sqlite').unlink()

    def test_symlinks_and_file_parent_conflicts_rejected(self):
        entry = zipfile.ZipInfo('text/link')
        entry.create_system = 3
        entry.external_attr = (stat.S_IFLNK | 0o777) << 16
        for extra in ((entry, '../outside'), ('text', 'file conflicts with directory')):
            body = self.library_zip(extra)
            with self.assertRaises(assets.AssetError):
                assets._extract_library(self.split(body), self.root / 'unsafe', None)
            (self.root / 'fixture.sqlite').unlink()

    def test_archive_budget_is_enforced(self):
        with patch.object(assets, 'MAX_LIBRARY_BYTES', 5):
            with self.assertRaises(assets.AssetError):
                assets._extract_library(self.split(self.library_zip()), self.root / 'unsafe', None)

    def part(self, body):
        return {'url': 'https://github.com/anonnerdfrenzy/survival-llm/releases/download/library-2026-10-28/full.000',
                'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}

    def test_download_checks_hash_and_reuses_verified_part(self):
        body = b'reference bytes'
        dest = self.root / 'full.000'
        with patch.object(assets.urllib.request, 'urlopen', return_value=Response(body)) as fetch:
            assets._download_part(self.part(body), dest, self.events.append)
            assets._download_part(self.part(body), dest, self.events.append)
            self.assertEqual(fetch.call_count, 1)
        self.assertEqual(dest.read_bytes(), body)

    def test_resume_rejects_wrong_range(self):
        body = b'reference bytes'
        dest = self.root / 'full.000'; dest.write_bytes(body[:3])
        with patch.object(assets.urllib.request, 'urlopen', return_value=Response(body[3:], 206, {'Content-Range': f'bytes 4-14/{len(body)}'})):
            with self.assertRaises(assets.AssetError):
                assets._download_part(self.part(body), dest, None)
        self.assertEqual(dest.read_bytes(), body[:3])

    def test_resume_accepts_correct_range(self):
        body = b'reference bytes'
        dest = self.root / 'full.000'; dest.write_bytes(body[:3])
        with patch.object(assets.urllib.request, 'urlopen', return_value=Response(body[3:], 206, {'Content-Range': f'bytes 3-14/{len(body)}'})) as fetch:
            assets._download_part(self.part(body), dest, self.events.append)
            self.assertEqual(fetch.call_args.args[0].get_header('Range'), 'bytes=3-')
        self.assertEqual(dest.read_bytes(), body)

    def test_wrong_hash_and_source_are_rejected(self):
        body = b'reference bytes'
        part = self.part(body); dest = self.root / 'full.000'
        with patch.object(assets.urllib.request, 'urlopen', return_value=Response(b'x' * len(body))):
            with self.assertRaises(assets.AssetError):
                assets._download_part(part, dest, None)
        self.assertFalse(dest.exists())
        part['url'] = 'https://example.com/unknown'
        with self.assertRaises(assets.AssetError):
            assets._download_part(part, dest, None)

    def test_existing_library_is_preserved(self):
        dest = self.root / 'library'; dest.mkdir(); (dest / 'mine').write_text('keep')
        with patch.object(assets, '_require_remote'):
            with self.assertRaises(assets.AssetError):
                assets.ensure_library(dest)
        self.assertEqual((dest / 'mine').read_text(), 'keep')

    def test_install_falls_back_for_unsupported_rename_flags(self):
        for code in {errno.ENOSYS, errno.EINVAL, errno.EOPNOTSUPP, errno.ENOTSUP}:
            with self.subTest(errno=code):
                staging = self.root / f'staging-{code}'
                staging.mkdir(); (staging / 'file').write_text('verified')
                destination = self.root / f'destination-{code}'
                with patch.object(assets, '_rename_exclusive', side_effect=OSError(code, 'unsupported')):
                    assets._install(staging, destination)
                self.assertEqual((destination / 'file').read_text(), 'verified')
                self.assertFalse(staging.exists())
                self.assertFalse((self.root / f'.destination-{code}-install.lock').exists())

    def test_install_preserves_staging_and_destination_when_locked_or_existing(self):
        staging = self.root / 'staging'; staging.mkdir(); (staging / 'file').write_text('verified')
        destination = self.root / 'destination'
        lock = self.root / '.destination-install.lock'; lock.mkdir()
        with self.assertRaisesRegex(assets.AssetError, 'held or stale'):
            assets._install(staging, destination)
        self.assertTrue(lock.exists()); self.assertTrue(staging.exists())
        lock.rmdir(); destination.mkdir(); (destination / 'mine').write_text('keep')
        with self.assertRaisesRegex(assets.AssetError, 'Destination already exists'):
            assets._install(staging, destination)
        self.assertEqual((destination / 'mine').read_text(), 'keep')
        self.assertEqual((staging / 'file').read_text(), 'verified')
        self.assertFalse(lock.exists())

    def test_unexpected_rename_failure_reports_errno_without_fallback(self):
        staging = self.root / 'staging'; staging.mkdir()
        destination = self.root / 'destination'
        with patch.object(assets, '_rename_exclusive', side_effect=OSError(errno.EIO, 'input/output error')), patch.object(assets.os, 'rename') as rename:
            with self.assertRaisesRegex(assets.AssetError, f'errno {errno.EIO}'):
                assets._install(staging, destination)
            rename.assert_not_called()
        self.assertTrue(staging.exists()); self.assertFalse(destination.exists())
        self.assertFalse((self.root / '.destination-install.lock').exists())

    def test_failed_library_install_retains_verified_extraction_and_retries_without_reextracting(self):
        body = self.library_zip()
        pins = copy.deepcopy(assets.PINS); pins['library']['parts'] = [self.part(body)]
        destination = self.root / 'library'
        with patch.object(assets, 'PINS', pins), patch.object(assets, '_require_remote'), patch.object(assets.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=10**12)):
            with patch.object(assets.urllib.request, 'urlopen', return_value=Response(body)), patch.object(assets, '_install', side_effect=assets.AssetError('simulated install failure')):
                with self.assertRaisesRegex(assets.AssetError, 'simulated'):
                    assets.ensure_library(destination, progress=self.events.append)
            staged = list(self.root.glob('.library-install-*'))
            self.assertEqual(len(staged), 1)
            self.assertTrue(assets.library_status(staged[0])['ready'])
            with patch.object(assets, '_extract_library', side_effect=AssertionError('must not extract twice')), patch.object(assets.urllib.request, 'urlopen', side_effect=AssertionError('must not fetch twice')):
                self.assertTrue(assets.ensure_library(destination, progress=self.events.append)['ready'])
            self.assertFalse(staged[0].exists())
            self.assertFalse(list(self.root.glob('.library-download-*')))

    def test_library_install_ready_and_detects_index_change(self):
        body = self.library_zip()
        pins = copy.deepcopy(assets.PINS)
        pins['library']['parts'] = [self.part(body)]
        dest = self.root / 'library'
        with patch.object(assets, 'PINS', pins), patch.object(assets, '_require_remote'), patch.object(assets.urllib.request, 'urlopen', return_value=Response(body)), patch.object(assets.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=10**12)):
            result = assets.ensure_library(dest, progress=self.events.append)
            self.assertTrue(result['ready']); self.assertEqual(result['articles'], 42)
            self.assertTrue(assets.ensure_library(dest)['ready'])
            with (dest / 'index.sqlite').open('ab') as target:
                target.write(b'changed')
            self.assertFalse(assets.library_status(dest)['ready'])

    def test_model_pin_verification_and_status(self):
        body = b'safetensor fixture'; code = b'config fixture'
        files = [
            {'path': 'one.safetensors', 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()},
            {'path': 'config.json', 'bytes': len(code), 'gitBlobSha1': hashlib.sha1(f'blob {len(code)}\0'.encode() + code).hexdigest()},
        ]
        pins = copy.deepcopy(assets.PINS); pins['model']['files'] = files
        def snapshot(**kwargs):
            self.assertEqual(kwargs['revision'], assets.MODEL_REVISION)
            self.assertFalse(kwargs['token'])
            staging = Path(kwargs['local_dir']); staging.mkdir()
            (staging / 'one.safetensors').write_bytes(body)
            (staging / 'config.json').write_bytes(code)
        hub = types.SimpleNamespace(snapshot_download=snapshot)
        with patch.object(assets, 'PINS', pins), patch.object(assets, '_require_remote'), patch.dict(sys.modules, {'huggingface_hub': hub}):
            result = assets.ensure_model(self.root / 'model', progress=self.events.append)
            self.assertTrue(result['ready'])
            (self.root / 'model/config.json').write_bytes(b'changed')
            self.assertFalse(assets.model_status(self.root / 'model')['ready'])

    def test_model_wrong_hash_never_marks_ready(self):
        pins = copy.deepcopy(assets.PINS)
        pins['model']['files'] = [{'path':'one.safetensors', 'bytes':3, 'sha256':'0'*64}]
        def snapshot(**kwargs):
            staging=Path(kwargs['local_dir']); staging.mkdir(); (staging/'one.safetensors').write_bytes(b'bad')
        with patch.object(assets, 'PINS', pins), patch.object(assets, '_require_remote'), patch.dict(sys.modules, {'huggingface_hub':types.SimpleNamespace(snapshot_download=snapshot)}):
            with self.assertRaises(assets.AssetError):
                assets.ensure_model(self.root / 'model', progress=self.events.append)
        self.assertFalse((self.root / 'model').exists())


if __name__ == '__main__':
    unittest.main()
