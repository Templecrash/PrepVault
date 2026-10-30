"""Pinned, resumable assets for the private Modal Survival LLM service.

Importing this module and calling asset_status never download or execute assets.
Provisioning is restricted to a remote Modal container. The caller must serialize
provisioning and commit its Modal Volume after a successful return.
"""
from __future__ import annotations

import contextlib
import ctypes
import errno
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

PIN_FILE = Path(__file__).with_name('assets.lock.json')
PINS = json.loads(PIN_FILE.read_text())
PINNED_UPSTREAM_COMMIT = PINS['upstream']['commit']
MODEL_REPO = PINS['model']['repository']
MODEL_REVISION = PINS['model']['revision']
RECEIPT = '.prepvault-assets.json'
CHUNK = 4 * 1024 * 1024
MAX_LIBRARY_BYTES = 50_000_000_000


class AssetError(RuntimeError):
    """Provisioning failed without replacing an existing asset directory."""


def _require_remote():
    try:
        import modal
    except ImportError as exc:
        raise AssetError('Provision assets in a remote Modal function, not on this computer.') from exc
    if modal.is_local():
        raise AssetError('Provision assets in a remote Modal function, not on this computer.')


def _emit(callback, phase, **data):
    event = {'phase': phase, **data}
    if callback:
        callback(event)
    else:
        print(json.dumps(event), flush=True)


def _pin_digest(kind):
    raw = json.dumps(PINS[kind], sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def _safe_name(name):
    path = PurePosixPath(name)
    if (not name or len(name) > 4096 or path.is_absolute() or '..' in path.parts
            or '\\' in name or ':' in name or any(ord(c) < 32 for c in name)
            or str(path) in ('.', RECEIPT)):
        raise AssetError('Unsafe asset path in archive or manifest.')
    return path


def _regular_file(path):
    try:
        return stat.S_ISREG(path.lstat().st_mode)
    except FileNotFoundError:
        return False


def _digest_file(path, algorithm='sha256', git_blob=False):
    if not _regular_file(path):
        raise AssetError('Expected a regular asset file.')
    digest = hashlib.new(algorithm)
    if git_blob:
        digest.update(f'blob {path.stat().st_size}\0'.encode())
    with path.open('rb') as source:
        for block in iter(lambda: source.read(CHUNK), b''):
            digest.update(block)
    return digest.hexdigest()


def _read_receipt(path, kind):
    receipt = path / RECEIPT
    if not _regular_file(receipt) or receipt.stat().st_size > 100_000:
        raise AssetError('No verified asset receipt.')
    data = json.loads(receipt.read_text())
    if data.get('kind') != kind or data.get('pinDigest') != _pin_digest(kind):
        raise AssetError('Installed asset does not match the pinned version.')
    return data


def _file_stamp(path):
    if not _regular_file(path):
        raise AssetError('An asset file is missing or is not a regular file.')
    info = path.stat()
    return {'bytes': info.st_size, 'mtimeNs': info.st_mtime_ns}


def _library_stats(path):
    if not _regular_file(path / 'index.sqlite') or not (path / 'text').is_dir() or (path / 'text').is_symlink():
        raise AssetError('Library index or text folder is missing.')
    if not _regular_file(path / 'SOURCES.md'):
        raise AssetError('Library source and licence attribution is missing.')
    uri = (path / 'index.sqlite').resolve().as_uri() + '?mode=ro&immutable=1'
    with contextlib.closing(sqlite3.connect(uri, uri=True)) as database:
        database.execute('PRAGMA trusted_schema=OFF')
        sources, articles = database.execute('SELECT COUNT(*), COALESCE(SUM(docs), 0) FROM sources WHERE done=1').fetchone()
    if sources < 1 or articles < 1:
        raise AssetError('Library has no indexed articles.')
    return {'sources': sources, 'articles': articles}


def _verified_index_stamp(path):
    """Flush and hash the index, accepting a stamp only if the read was stable."""
    index = path / 'index.sqlite'
    for _ in range(3):
        with index.open('rb') as source:
            os.fsync(source.fileno())
        before = _file_stamp(index)
        digest = _digest_file(index)
        with index.open('rb') as source:
            os.fsync(source.fileno())
        after = _file_stamp(index)
        if before == after:
            return after, digest
    raise AssetError('Library index did not settle during verification; receipt was preserved.')


def _quick_check_library(path):
    uri = (path / 'index.sqlite').resolve().as_uri() + '?mode=ro&immutable=1'
    with contextlib.closing(sqlite3.connect(uri, uri=True)) as database:
        database.execute('PRAGMA trusted_schema=OFF')
        if database.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise AssetError('Library SQLite integrity check failed; receipt was preserved.')


def library_status(destination='/data/library'):
    path = Path(destination)
    try:
        if path.is_symlink():
            raise AssetError('Library directory cannot be a symlink.')
        receipt = _read_receipt(path, 'library')
        if receipt.get('index') != _file_stamp(path / 'index.sqlite'):
            raise AssetError('Library index changed after verification.')
        return {'ready': True, 'path': str(path), 'version': PINS['library']['version'], **_library_stats(path)}
    except (OSError, ValueError, KeyError, sqlite3.Error, AssetError):
        return {'ready': False, 'path': str(path), 'reason': 'Pinned library is not installed or needs verification.'}


def model_status(destination='/data/model'):
    path = Path(destination)
    try:
        if path.is_symlink():
            raise AssetError('Model directory cannot be a symlink.')
        receipt = _read_receipt(path, 'model')
        stamps = receipt.get('files', {})
        for item in PINS['model']['files']:
            name = item['path']
            file_path = path.joinpath(*_safe_name(name).parts)
            if stamps.get(name) != _file_stamp(file_path) or file_path.stat().st_size != item['bytes']:
                raise AssetError('Model files changed after verification.')
        return {'ready': True, 'path': str(path), 'repository': MODEL_REPO, 'revision': MODEL_REVISION, 'bytes': PINS['model']['bytes']}
    except (OSError, ValueError, KeyError, AssetError):
        return {'ready': False, 'path': str(path), 'reason': 'Pinned model is not installed or needs verification.'}


def asset_status(root='/data'):
    root = Path(root)
    library, model = library_status(root / 'library'), model_status(root / 'model')
    return {'ready': library['ready'] and model['ready'], 'library': library, 'model': model}


def _download_part(part, path, progress):
    url = urllib.parse.urlsplit(part['url'])
    if (url.scheme != 'https' or url.netloc != 'github.com'
            or not url.path.startswith('/anonnerdfrenzy/survival-llm/releases/download/')
            or not 0 < part['bytes'] <= 2_000_000_000):
        raise AssetError('Unexpected pinned library download source.')
    if path.is_symlink():
        raise AssetError('Download cache cannot contain symlinks.')
    if path.exists() and path.stat().st_size == part['bytes']:
        if _digest_file(path) == part['sha256']:
            _emit(progress, 'library-part-cached', part=path.name, bytes=part['bytes'])
            return
        path.unlink()  # only this function's corrupt cache file
    for attempt in range(3):
        have = path.stat().st_size if path.exists() else 0
        if have > part['bytes']:
            raise AssetError('Download cache is larger than the pinned part.')
        headers = {'User-Agent': 'PrepVault-Private-Survival/1.0', 'Accept-Encoding': 'identity'}
        if have:
            headers['Range'] = f'bytes={have}-'
        last_report = 0.0
        try:
            request = urllib.request.Request(part['url'], headers=headers)
            with urllib.request.urlopen(request, timeout=60) as response:
                final = urllib.parse.urlsplit(response.url)
                if final.scheme != 'https' or final.hostname not in {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}:
                    raise AssetError('Unexpected download redirect.')
                if response.status == 206:
                    content_range = response.headers.get('Content-Range', '')
                    if not content_range.startswith(f'bytes {have}-') or not content_range.endswith('/' + str(part['bytes'])):
                        raise AssetError('Download resume range does not match.')
                    mode = 'ab'
                elif response.status == 200:
                    have, mode = 0, 'wb'
                else:
                    raise AssetError('Unexpected download response.')
                with path.open(mode) as output:
                    while True:
                        chunk = response.read(CHUNK)
                        if not chunk:
                            break
                        have += len(chunk)
                        if have > part['bytes']:
                            raise AssetError('Download exceeds pinned size.')
                        output.write(chunk)
                        if time.monotonic() - last_report > 5:
                            _emit(progress, 'library-downloading', part=path.name, completed=have, total=part['bytes'])
                            last_report = time.monotonic()
            if have != part['bytes']:
                raise OSError('Incomplete download.')
            if _digest_file(path) != part['sha256']:
                path.unlink()
                raise AssetError('Library checksum did not match its pinned SHA256.')
            _emit(progress, 'library-part-verified', part=path.name, bytes=have)
            return
        except (OSError, urllib.error.URLError):
            if attempt == 2:
                raise AssetError('Library download failed; partial files are retained for retry.') from None
            time.sleep(2 * (attempt + 1))


class _PartsReader(io.RawIOBase):
    """Seek a split ZIP without making another multi-GB concatenated copy."""
    def __init__(self, paths):
        self.files = [path.open('rb') for path in paths]
        self.sizes = [path.stat().st_size for path in paths]
        self.length = sum(self.sizes)
        self.position = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        position = offset + (self.position if whence == 1 else self.length if whence == 2 else 0)
        if whence not in (0, 1, 2) or position < 0:
            raise ValueError('Invalid seek')
        self.position = position
        return position

    def readinto(self, buffer):
        left = min(len(buffer), max(0, self.length - self.position))
        written, base = 0, 0
        for source, size in zip(self.files, self.sizes):
            if left and self.position < base + size:
                source.seek(self.position - base)
                block = source.read(min(left, base + size - self.position))
                buffer[written:written + len(block)] = block
                self.position += len(block)
                written += len(block)
                left -= len(block)
            base += size
        return written

    def close(self):
        for source in self.files:
            source.close()
        super().close()


def _extract_library(paths, staging, progress):
    with _PartsReader(paths) as raw, io.BufferedReader(raw) as reader, zipfile.ZipFile(reader) as archive:
        entries = archive.infolist()
        if len(entries) > 2_000_000 or sum(entry.file_size for entry in entries) > MAX_LIBRARY_BYTES:
            raise AssetError('Library archive exceeds extraction limits.')
        seen, regular = set(), set()
        for entry in entries:
            name = str(_safe_name(entry.filename))
            mode = entry.external_attr >> 16
            if name in seen or (stat.S_IFMT(mode) and not (stat.S_ISREG(mode) or stat.S_ISDIR(mode))) or entry.flag_bits & 1:
                raise AssetError('Library archive has duplicate, special or encrypted entries.')
            seen.add(name)
            if not entry.is_dir():
                regular.add(name)
        if not {'index.sqlite', 'SOURCES.md'} <= regular or not any(n.startswith('text/') for n in regular):
            raise AssetError('Library archive is missing required content or attribution.')
        for name in seen:
            if any(str(parent) in regular for parent in PurePosixPath(name).parents):
                raise AssetError('Library archive has conflicting file paths.')
        staging.mkdir(mode=0o700)
        for number, entry in enumerate(entries):
            target = staging.joinpath(*PurePosixPath(entry.filename).parts)
            if entry.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.open(entry) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output, CHUNK)
                    if entry.filename == 'index.sqlite':
                        output.flush()
                        os.fsync(output.fileno())
                target.chmod(0o600)
            if number % 1000 == 0:
                _emit(progress, 'library-extracting', completed=number + 1, total=len(entries))


def _rename_exclusive(staging, destination):
    """Use the OS non-replacing rename when the mounted filesystem supports it."""
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == 'linux' and hasattr(libc, 'renameat2'):
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(-100, os.fsencode(staging), -100, os.fsencode(destination), 1)  # RENAME_NOREPLACE
    elif sys.platform == 'darwin' and hasattr(libc, 'renamex_np'):
        rename = libc.renamex_np
        rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(os.fsencode(staging), os.fsencode(destination), 4)  # RENAME_EXCL
    else:
        raise OSError(errno.ENOSYS, 'Exclusive rename is unavailable')
    if result:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


@contextlib.contextmanager
def _installation_lock(destination):
    lock = destination.parent / ('.' + destination.name + '-install.lock')
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError:
        raise AssetError('Installation lock is held or stale; staging and existing assets were preserved.') from None
    except OSError as exc:
        raise AssetError(f'Installation lock failed (errno {exc.errno}); staging was preserved.') from None
    try:
        yield
    finally:
        lock.rmdir()


def _install(staging, destination):
    # Modal Volume v2 may reject renameat2 flags. All provisioners serialize the
    # existence check and standard rename with the same atomic mkdir lock.
    with _installation_lock(destination):
        if os.path.lexists(destination):
            raise AssetError('Destination already exists; staging and existing assets were preserved.')
        try:
            try:
                _rename_exclusive(staging, destination)
            except OSError as exc:
                unsupported = {errno.ENOSYS, errno.EINVAL, errno.EOPNOTSUPP, errno.ENOTSUP}
                if exc.errno not in unsupported:
                    raise
                # The private Volume has a single writer; other installers must use
                # this lock. Recheck after the rejected syscall before plain rename.
                if os.path.lexists(destination):
                    raise AssetError('Destination already exists; staging and existing assets were preserved.')
                os.rename(staging, destination)
        except OSError as exc:
            raise AssetError(f'Asset installation failed (errno {exc.errno}); staging and existing assets were preserved.') from None


def repair_library_stamp(destination='/data/library', *, progress=None):
    """Explicit CPU repair for a verified index whose final-write mtime settled.

    This never runs from a readiness request. Legacy receipts without an index
    digest require an explicitly authorized repair; all later repairs must also
    match the recorded digest. Only the receipt is replaced, never library data.
    """
    _require_remote()
    destination = Path(destination)
    with _installation_lock(destination):
        if destination.is_symlink():
            raise AssetError('Library directory cannot be a symlink.')
        receipt = _read_receipt(destination, 'library')
        stamp = _file_stamp(destination / 'index.sqlite')
        if stamp['bytes'] != receipt.get('index', {}).get('bytes'):
            raise AssetError('Library index size changed; receipt was preserved.')
        stats = _library_stats(destination)
        if any(stats[key] != receipt.get(key) for key in ('articles', 'sources')):
            raise AssetError('Library source or article counts changed; receipt was preserved.')
        # SQLite quick_check performs small random reads. Run it on an ephemeral
        # copy so a remote Volume does not turn those reads into minutes of I/O.
        # The copy and final original must hash identically before any receipt is
        # changed. Neither the copy nor its temporary files enter the Volume.
        _emit(progress, 'library-repair-copying-index')
        with tempfile.TemporaryDirectory(prefix='prepvault-library-check-') as temporary_dir:
            temporary_path = Path(temporary_dir)
            if shutil.disk_usage(temporary_path).free < stamp['bytes'] + 1_000_000_000:
                raise AssetError('Insufficient ephemeral storage for index validation; receipt was preserved.')
            index = destination / 'index.sqlite'
            with index.open('rb') as source:
                os.fsync(source.fileno())
                copy_stamp = _file_stamp(index)
                copied_digest = hashlib.sha256()
                with (temporary_path / 'index.sqlite').open('xb') as output:
                    for block in iter(lambda: source.read(CHUNK), b''):
                        copied_digest.update(block)
                        output.write(block)
            if copy_stamp != _file_stamp(index):
                raise AssetError('Library index changed while copying; receipt was preserved.')
            _emit(progress, 'library-repair-integrity-check')
            _quick_check_library(temporary_path)
            copy_hash = copied_digest.hexdigest()
        _emit(progress, 'library-repair-verifying-source')
        stamp, digest = _verified_index_stamp(destination)
        if stamp['bytes'] != receipt['index']['bytes']:
            raise AssetError('Library index changed during verification; receipt was preserved.')
        if digest != copy_hash:
            raise AssetError('Library index differs from its validated copy; receipt was preserved.')
        if receipt.get('indexSha256') and digest != receipt['indexSha256']:
            raise AssetError('Library index digest changed; receipt was preserved.')
        updated = {**receipt, 'index': stamp, 'indexSha256': digest}
        temporary = destination / ('.prepvault-receipt-' + uuid.uuid4().hex + '.tmp')
        try:
            with temporary.open('x') as output:
                json.dump(updated, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination / RECEIPT)
        finally:
            if temporary.exists():
                temporary.unlink()
        result = library_status(destination)
        if not result['ready']:
            raise AssetError('Library index changed after repair; readiness remains false.')
        _emit(progress, 'library-repair-ready', **stats)
        return result


def ensure_library(destination='/data/library', *, progress=None):
    _require_remote()
    destination = Path(destination)
    if library_status(destination)['ready']:
        return library_status(destination)
    if os.path.lexists(destination):
        raise AssetError('Existing library is unverified or a different version; it was preserved.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    pack = PINS['library']
    work = destination.parent / ('.library-download-' + pack['version'])
    if work.is_symlink():
        raise AssetError('Library cache cannot be a symlink.')
    # A verified extraction survives install failures. Retry its rename without
    # downloading, hashing split parts or extracting the 21 GB library again.
    for pending in sorted(destination.parent.glob('.library-install-*')):
        if library_status(pending)['ready']:
            _emit(progress, 'library-install-resuming')
            _install(pending, destination)
            if work.exists():
                shutil.rmtree(work)
            result = library_status(destination)
            _emit(progress, 'library-ready', articles=result['articles'], sources=result['sources'])
            return result
    work.mkdir(mode=0o700, exist_ok=True)
    paths = [work / f'full.{i:03d}' for i in range(len(pack['parts']))]
    remaining = sum(max(0, part['bytes'] - (path.stat().st_size if _regular_file(path) else 0)) for part, path in zip(pack['parts'], paths))
    # Keep all verified split parts until installation succeeds, enabling retries.
    required = remaining + MAX_LIBRARY_BYTES + 1_000_000_000
    if shutil.disk_usage(destination.parent).free < required:
        raise AssetError('Insufficient free storage for library download and safe extraction.')
    for part, path in zip(pack['parts'], paths):
        _download_part(part, path, progress)
    staging = destination.parent / ('.library-install-' + uuid.uuid4().hex)
    try:
        _extract_library(paths, staging, progress)
        stats = _library_stats(staging)
        stamp, digest = _verified_index_stamp(staging)
        receipt = {'kind': 'library', 'pinDigest': _pin_digest('library'), 'index': stamp, 'indexSha256': digest, **stats}
        (staging / 'pack.json').write_text(json.dumps({'id': 'full', 'version': pack['version']}))
        (staging / RECEIPT).write_text(json.dumps(receipt))
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    # Keep this outside extraction cleanup: the verified staging directory is
    # useful for retry when a volume rejects or temporarily fails the rename.
    _install(staging, destination)
    shutil.rmtree(work)
    _emit(progress, 'library-ready', **stats)
    return library_status(destination)


def ensure_model(destination='/data/model', *, progress=None):
    _require_remote()
    destination = Path(destination)
    if model_status(destination)['ready']:
        return model_status(destination)
    if os.path.lexists(destination):
        raise AssetError('Existing model is unverified or a different version; it was preserved.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.parent / ('.model-download-' + MODEL_REVISION)
    if staging.is_symlink():
        raise AssetError('Model cache cannot be a symlink.')
    if model_status(staging)['ready']:
        _emit(progress, 'model-install-resuming')
        _install(staging, destination)
        return model_status(destination)
    remaining = 0
    for item in PINS['model']['files']:
        path = staging.joinpath(*_safe_name(item['path']).parts)
        present = path.stat().st_size if _regular_file(path) else 0
        remaining += max(0, item['bytes'] - present)
    if shutil.disk_usage(destination.parent).free < remaining + 1_000_000_000:
        raise AssetError('Insufficient free storage for the pinned model.')
    from huggingface_hub import snapshot_download
    _emit(progress, 'model-downloading', repository=MODEL_REPO, revision=MODEL_REVISION, total=PINS['model']['bytes'])
    snapshot_download(repo_id=MODEL_REPO, revision=MODEL_REVISION, local_dir=str(staging), token=False, max_workers=4)
    stamps = {}
    for number, item in enumerate(PINS['model']['files']):
        path = staging.joinpath(*_safe_name(item['path']).parts)
        stamp = _file_stamp(path)
        if stamp['bytes'] != item['bytes']:
            raise AssetError('Model file size does not match the pinned revision.')
        actual = _digest_file(path) if 'sha256' in item else _digest_file(path, 'sha1', git_blob=True)
        if actual != item.get('sha256', item.get('gitBlobSha1')):
            raise AssetError('Model file checksum does not match the pinned revision.')
        stamps[item['path']] = stamp
        _emit(progress, 'model-verifying', completed=number + 1, total=len(PINS['model']['files']))
    (staging / RECEIPT).write_text(json.dumps({'kind': 'model', 'pinDigest': _pin_digest('model'), 'files': stamps}))
    _install(staging, destination)
    _emit(progress, 'model-ready', revision=MODEL_REVISION)
    return model_status(destination)
