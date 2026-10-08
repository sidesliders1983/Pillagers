"""Compose actual captured neutral pixels; never infer visual acceptance."""
import argparse, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--report', action='append', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--expected', type=int, default=15)
parser.add_argument('--allow-candidates', action='store_true')
args = parser.parse_args()
selected = {}
for file in args.report:
    report = json.loads(Path(file).read_text(encoding='utf-8-sig'))
    if report.get('errors'):
        raise SystemExit(f'Capture report has errors: {file}')
    if not args.allow_candidates and report.get('authority') != 'actual public registry and assets':
        raise SystemExit(f'Final public montage requires explicit no-override capture authority: {file}')
    loaded = report.get('loadedAssets', [])
    if not args.allow_candidates and any(a.get('currentSha256') != a['sha256'] for a in loaded):
        raise SystemExit(f'Candidate or changed asset hashes; public montage refused: {file}')
    for check in report['checks']:
        if (check['profile'] == 'golden_neutral_01' and check['lod'] == 2
                and check['ratio'] == 1 and check['clip'] == 'Idle'
                and check['phase'] == 0 and check['angle'] == 'front'):
            if check.get('violations'):
                raise SystemExit(f'Structural failure: {check["id"]}')
            selected[check['id']] = check
if len(selected) != args.expected:
    raise SystemExit(f'Expected {args.expected} neutral module views; found {len(selected)}')

kind_order = {'hair': 0, 'beard': 1, 'garment': 2}
checks = sorted(selected.values(), key=lambda c: (kind_order[c['id'].split('/')[0]], c['id']))
columns, cell_width, cell_height = 3, 360, 440
rows = math.ceil(len(checks) / columns)
sheet = Image.new('RGB', (columns * cell_width, rows * cell_height + 60), '#edf1e6')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
label = 'CANDIDATE views' if args.allow_candidates else 'PUBLIC asset views'
draw.text((12, 12), f'{label} | neutral Golden | body LOD2 | ratio 1 | Idle', font=font, fill='#314531')
for index, check in enumerate(checks):
    x, y = (index % columns) * cell_width, 60 + (index // columns) * cell_height
    screenshot = Image.open(check['screenshot']).convert('RGB')
    screenshot.thumbnail((350, 390), Image.Resampling.LANCZOS)
    sheet.paste(screenshot, (x + (cell_width - screenshot.width) // 2, y))
    draw.text((x + 8, y + 395), check['id'], font=font, fill='#314531')
    draw.text((x + 8, y + 419), f'{check["triangles"]} triangles | {check["materials"]} material(s)', font=small, fill='#314531')
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output, quality=95)
output.with_suffix('.json').write_text(json.dumps({'mode': label, 'sourceReports': args.report,
    'inspected': False, 'acceptance': 'Requires independent inspection and separate verdict',
    'views': [{'id': c['id'], 'screenshot': c['screenshot'], 'triangles': c['triangles'],
               'materials': c['materials']} for c in checks]}, indent=2), encoding='utf-8')
print(json.dumps({'modules': len(checks), 'output': str(output), 'mode': label}))
