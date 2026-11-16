"""Reproduce the selected CC0 surface textures. Requires Pillow; no example renders are downloaded.

Run from any directory with Python and Pillow:
    python docs/licenses/fetch-polyhaven-scans.py
The manifest verifies the primary source bytes and records the exact web encoding.
JPEG output can differ between Pillow/libjpeg versions; this script rejects such a mismatch.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / 'docs/licenses/polyhaven-scans.json').read_text())

def fetch(item):
    data = urlopen(Request(item['sourceUrl'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    if sha256(data).hexdigest() != item['sourceSha256']:
        raise ValueError('Source checksum mismatch: ' + item['sourceUrl'])
    encoding = item['encoding']
    image = Image.open(BytesIO(data)).convert(encoding['mode'])
    output = BytesIO()
    image.save(output, format=encoding['format'], quality=encoding['quality'],
               subsampling=encoding['subsampling'], optimize=encoding['optimize'])
    result = output.getvalue()
    if sha256(result).hexdigest() != item['sha256']:
        raise ValueError('JPEG encoder differs from the recorded Pillow/libjpeg build: ' + item['path'])
    path = ROOT / item['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(result)
    return item['path']

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=5) as pool:
        for path in pool.map(fetch, [m for a in MANIFEST['assets'] for m in a['maps']]):
            print(path)
