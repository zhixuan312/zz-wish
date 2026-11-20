#!/usr/bin/env python3
"""Draw the directional Snow Roof Court site plan from its metre coordinates."""

import argparse
from html import escape
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'shared/snow-roof-court-site.json'
INK = '#263c46'
COLD = '#637889'
SNOW = '#f1f3f1'
WARM = '#a56f46'
ROUTE = '#2d6276'


def draw(site):
    art = ['<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1080" viewBox="0 0 1500 1080">']
    art.append('<rect width="1500" height="1080" fill="#f8f8f4"/>')

    def text(x, y, label, size=19, color=INK, weight=400):
        art.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Helvetica, Arial, sans-serif"'
                   f' font-size="{size}" font-weight="{weight}">{escape(label)}</text>')

    def line(points, color=INK, width=1, dash=''):
        curve = ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)
        dashes = f' stroke-dasharray="{dash}"' if dash else ''
        art.append(f'<polyline points="{curve}" fill="none" stroke="{color}" stroke-width="{width}"'
                   f' stroke-linejoin="round" stroke-linecap="round"{dashes}/>')

    def circle(x, y, radius, color, stroke='none'):
        art.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{radius}" fill="{color}" stroke="{stroke}"/>')

    text(72, 85, 'SNOW ROOF COURT', 53, weight=700)
    text(75, 122, 'Winter pass · P1 site plan · north at top', 22, COLD)
    line([(73, 153), (1426, 153)], '#b9c4c7')
    text(75, 218, 'The exposed crossing', 27, weight=700)
    for row, label in enumerate(('An old road climbs from the market town.', 'A walled refuge sits in the lee of the pass.',
                                 'A low gate delays the open view of the peak.')):
        text(75, 255 + row * 29, label, 16, COLD)

    def plan(x, z):
        return 738 + 11.6 * x, 403 + 11.6 * z

    def plan_line(pairs, color, width, dash=''):
        line([plan(*pair) for pair in pairs], color, width, dash)

    for side in (-1, 1):
        for rank in range(6):
            pairs = [(side * (14.7 + rank * 1.04 + .6 * math.sin(z * .24 + rank)
                              + .33 * math.cos(z * .51)), z) for z in range(-16, 51)]
            plan_line(pairs, '#e3e9e9', 1)
        for i in range(16):
            z = 16 + (i * 17 % 33)
            x = side * (6.5 + (i * 11 % 8) * 1.36)
            px, py = plan(x, z)
            circle(px, py, 4.5 + i % 3, '#b4c1bc')
            line([(px - 4, py + 4), (px + 2, py - 6)], '#7f9388', 1.5)

    court = site['court']
    left, top = plan(court['west'], court['rear'])
    right, bottom = plan(court['east'], court['front'])
    art.append(f'<rect x="{left}" y="{top}" width="{right - left}" height="{bottom - top}"'
               f' rx="5" fill="{SNOW}" stroke="#657683" stroke-width="6"/>')
    road = [(pose['position'][0], pose['position'][2]) for pose in site['walk']]
    plan_line(road[:6], '#e7e5db', 35)
    plan_line(site['sweptPath'], '#ccbba3', 20)
    plan_line(site['sweptPath'], '#e9dfc9', 15)
    for depth in (12.44, 12.83, 13.22, 13.61):
        plan_line([(-1.68, depth), (1.68, depth)], '#bfc5c4', 2)

    def footprint(bounds, color, roof='#697e88'):
        x, y = plan(bounds['west'], bounds['rear'])
        xx, yy = plan(bounds['east'], bounds['front'])
        art.append(f'<rect x="{x}" y="{y}" width="{xx - x}" height="{yy - y}" fill="{color}"'
                   f' rx="2" stroke="{roof}" stroke-width="2"/>')
        line([(x - 2, (y + yy) / 2), (xx + 2, (y + yy) / 2)], roof, 1.4)

    gate = site['gate']
    gx, _, gz = gate['center']
    gw, gd = gate['width'] / 2, gate['depth'] / 2
    footprint({'west': gx - gw, 'east': gx + gw, 'rear': gz - gd, 'front': gz + gd}, '#9e8580')
    footprint(site['hall'], '#b6c3cc')
    for room in site['rooms']:
        footprint(room, '#c7c9bb' if room['boarded'] else '#b9c9c8')
    footprint(site['kitchen'], '#c9b4a3')
    for x, _, z in site['gateLights']:
        px, py = plan(x, z)
        circle(px, py, 5, '#e5b454', '#8f6639')
    plan_line(road, ROUTE, 2.8)
    plan_line([(site['walk'][-1]['position'][0], site['walk'][-1]['position'][2]),
               *[(p[0], p[2]) for p in site['chooseEntry']]], ROUTE, 2, '5 5')

    for index, frame in enumerate(site['keyFrames'], 1):
        pose = next(pose for pose in site['walk'] if pose['time'] == frame['time'])
        x, _, z = pose['position']
        tx, _, tz = pose['look']
        px, py = plan(x, z)
        length = math.hypot(tx - x, tz - z)
        dx, dy = (tx - x) * 24 / length, (tz - z) * 24 / length
        line([(px, py), (px + dx, py + dy)], ROUTE, 1.8)
        circle(px, py, 10.5, ROUTE)
        text(px - 4.2, py + 4.6, str(index), 13, '#ffffff', 700)

    burn = site['views']['burn']['position']
    px, py = plan(burn[0], burn[2])
    circle(px, py, 9, WARM)
    text(px - 6.6, py + 4, 'B', 10.5, '#ffffff', 700)
    mx, my = plan(0.0, -11.9)
    line([(mx, my), (mx, 189), (mx - 8, 202), (mx, 189), (mx + 8, 202)], ROUTE, 1.8, '3 4')
    text(mx - 94, 180, 'Snow peak beyond the hall', 15, ROUTE, 700)

    callouts = (
        ((-7.1, -7.4), 395, 'Kitchen', 'Hearth, dry fuel and leeward chimney'),
        ((-7.3, -1.9), 471, 'West room', 'Boarded up for the winter'),
        ((2.7, -8.5), 241, 'Main hall', 'Buddha, altar lamp and timber lantern beams'),
        ((7.4, -2.1), 312, 'East rest room', 'Repaired tile and warm paper windows'),
        ((0.0, 1.8), 410, 'Swept path', 'Footprints emerge through fine drifting snow'),
        ((2.8, 10.85), 515, 'Sheltered gate', 'Two oil lamps separated from the wish lights'),
    )
    for (x, z), y, label, detail in callouts:
        px, py = plan(x, z)
        edge = 470 if x < -4 else 1010
        line([(px, py), (edge - 14 if edge > px else edge + 14, py),
              (edge, y)], '#93a4aa', 1)
        if edge == 470:
            text(75, y, label, 20, weight=700)
            text(75, y + 24, detail, 15, COLD)
        else:
            text(edge + 10, y, label, 20, weight=700)
            text(edge + 10, y + 24, detail, 15, COLD)

    x, y = 1030, 662
    text(x, y, '30-second arrival', 25, weight=700)
    beats = (('1', '0–12 s', 'Snow road among pines and rock'),
             ('2', '12–22 s', 'Warm oil lamps appear ahead'),
             ('3', '22–26 s', 'Stairs and the low gate shadow'),
             ('4', '26–30 s', 'Court and peak open to view'),
             ('B', '13:00 · 22:00', 'One cord, two burning takes'))
    for i, (tag, when, label) in enumerate(beats):
        yy = y + 39 + i * 48
        circle(x + 10, yy - 5, 10, WARM if tag == 'B' else ROUTE)
        text(x + 6, yy, tag, 13, '#fff', 700)
        text(x + 26, yy - 3, when, 16, weight=700)
        text(x + 26, yy + 16, label, 15, COLD)
    text(75, 955, 'Road continues downslope to the market town', 16, COLD)
    line([(77, 1000), (193, 1000)], INK, 2)
    for px in (77, 135, 193):
        line([(px, 996), (px, 1004)], INK, 1.5)
    for px, label in ((75, '0'), (130, '5'), (180, '10 m')):
        text(px, 1026, label, 15, COLD)
    art.append('</svg>')
    return '\n'.join(art) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(draw(json.loads(SITE.read_text())))


if __name__ == '__main__':
    main()
