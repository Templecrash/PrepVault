"""Rebuild the portable PDF pack after updating public/handbooks/sources.json.

Run with Python 3. Standard library only; no network access or PDF modifications.
"""
import hashlib
import html
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "public" / "handbooks"
books = json.loads((DIRECTORY / "sources.json").read_text())
entries = []
files = {}
for book in books:
    name = Path(book["path"]).name
    data = (DIRECTORY / name).read_bytes()
    if len(data) != book["bytes"] or hashlib.sha256(data).hexdigest() != book["sha256"]:
        raise ValueError(f"PDF verification failed: {name}")
    files[name] = data
    text = lambda value: html.escape(str(value), quote=True)
    audience = "For trained healthcare professionals" if book["audience"] == "professional" else "Preparedness reference"
    entries.append(f'<article><p class="label">{text(book["category"])} · {audience}</p>'
                   f'<h2><a href="{text(name)}">{text(book["title"])}</a></h2>'
                   f'<p>{text(book["description"])}</p><p>{text(book.get("usageNote", ""))}</p><p>{text(book["publisher"])} · {text(book["edition"])}</p>'
                   f'<details><summary>Source and use</summary><p>{text(book.get("citation", ""))}</p>'
                   f'<p>{text(book["license"])}</p><a href="{text(book["sourceUrl"])}">Original publisher (internet required)</a></details></article>')

index = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PrepVault emergency handbooks</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#243d30;background:#f6f7f3;max-width:850px;margin:0 auto;padding:32px 22px}h1{font-size:38px;line-height:1.15}h2{font-size:22px;margin:8px 0}a{color:#214c39}article{padding:24px;margin:20px 0;background:white;border:1px solid #dce3d5;border-radius:12px}p{margin:8px 0}.label{font-size:13px;color:#5e6b60}summary{cursor:pointer}</style>
<p class="label">PREPVAULT · READY FOR REAL LIFE</p><h1>Emergency handbooks</h1>
<p>These original PDFs work without an internet connection. Extract the entire ZIP into one folder, then open this index or any PDF with a PDF reader.</p>
<p>Surgery and clinical manuals are for trained professionals. For urgent care, contact local emergency services. These are reference editions; guidance can change.</p>
''' + "\n".join(entries) + '''<footer><p>Original guides are free from their publishers. Included for personal, noncommercial use; each publisher's license applies. No publisher endorses PrepVault. The original PDFs are unmodified. See sources.json for attribution, download sources, verification dates and checksums.</p></footer></html>'''
files["OPEN-ME.html"] = index.encode()
files["sources.json"] = (DIRECTORY / "sources.json").read_bytes()
files["PUBLISHER-NOTES.txt"] = (DIRECTORY / "README.txt").read_bytes()
files["README.txt"] = b"PrepVault emergency handbooks\n\nExtract all files, then open OPEN-ME.html or any PDF. No internet is needed to read the PDFs. Original publisher links need a connection.\n\nFor personal, noncommercial use. Publisher licenses apply; see sources.json and the notices inside each unchanged PDF. No publisher endorses PrepVault. Surgery and clinical manuals require professional training. For urgent care, contact local emergency services. Reference editions can become outdated.\n"
pack = DIRECTORY / "prepvault-handbook-pack.zip"
with zipfile.ZipFile(pack, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name, data in files.items():
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, data)
with zipfile.ZipFile(pack) as archive:
    if archive.testzip() is not None:
        raise ValueError("ZIP integrity check failed")
print(f"Verified {len(books)} PDFs; portable pack: {pack.stat().st_size:,} bytes")
