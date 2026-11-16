"""Rebuild bundled Noto Serif SC UI subsets: pip install fonttools brotli."""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlretrieve
from fontTools import subset

root = Path(__file__).resolve().parent.parent
sources = list((root / 'web/src').rglob('*.ts')) + list((root / 'web/src').rglob('*.tsx')) + list((root / 'web/src').rglob('*.js')) + list((root / 'shared').glob('*.ts'))
characters = ''.join(sorted(set(''.join(p.read_text() for p in sources) + ''.join(chr(i) for i in range(32, 127)))))
fonts = root / 'web/public/fonts'
fonts.mkdir(parents=True, exist_ok=True)
base = 'https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7'
with TemporaryDirectory() as directory:
    temporary = Path(directory)
    text = temporary / 'characters.txt'
    text.write_text(characters)
    for weight, suffix in [(400, 'SCqyWv'), (600, 'RcrCWv'), (700, 'RlrCWv')]:
        source = temporary / f'{weight}.ttf'
        urlretrieve(base + suffix + '.ttf', source)
        subset.main([str(source), '--text-file=' + str(text), '--flavor=woff2', '--output-file=' + str(fonts / f'noto-serif-sc-{weight}.woff2')])
