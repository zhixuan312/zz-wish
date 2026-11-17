"""Read-only EXR correlation for the measured runtime ridge rays. No Cycles."""
import bpy
import json
import hashlib
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
folder = ROOT / 'art/build/cloud-cliff-round1/runtime-ridge-trace'
report = json.loads((folder / 'trace.json').read_text())
production = ROOT / 'art/build/cloud-cliff-round1/production'
masters = {}
for stem in ['far-night', 'far-night-raw', 'far-dusk', 'far-day']:
    path = production / (stem + '.exr')
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    masters[stem] = pixels.reshape(height, width, 4)
    report.setdefault('masters', {})[stem] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'dimensions': [width, height]}
for item in report['reports']:
    x, y_top = item['lightmap']['xyTopLeft']
    item['masterNearest'] = {name: values[values.shape[0]-1-y_top, x, :3].tolist() for name, values in masters.items()}
    v = np.array(item['masterNearest']['far-night'])
    decoded = np.array(item['lightmap']['linear'])
    item['codecAbsoluteRGBError'] = abs(v-decoded).tolist()
input_matrix = np.array([[.59719,.35458,.04823],[.076,.90834,.01566],[.02840,.13383,.83777]])
output_matrix = np.array([[1.60475,-.53108,-.07367],[-.10208,1.10813,-.00605],[-.00327,-.07276,1.07602]])
def inverse_aces(rgb):
    value = np.array(rgb) / 255
    value = np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)
    fitted = np.linalg.solve(output_matrix, value)
    # Invert the exact Three160 scalar RRT/ODT rational fit.
    aa = .983729*fitted-1
    bb = .432951*fitted-.0245786
    cc = .238081*fitted+.000090537
    roots = (-bb-np.sqrt(bb*bb-4*aa*cc))/(2*aa)
    return np.linalg.solve(input_matrix, roots) * .6
air_colours=[]
for item in report['reports']:
    transmittance = np.exp(-.0009*item['distance'])
    desired = inverse_aces(item['screenshotRGB']['native'])
    surface = np.array(item['expectedDiffuse'])
    air = (desired-surface*transmittance)/(1-transmittance)
    item['appearanceMatchedAirRadiance'] = air.tolist()
    air_colours.append(air)
report['airCalibration'] = {'densityPerMetre': .0009, 'meanRadiance': np.mean(air_colours, axis=0).tolist(), 'scope': 'Appearance calibration to the accepted native AgX frame using the runtime ACES transform; preserves original baked surface radiance. It is not a new transport bake.'}
report['airCalibration']['looks']={}
for look in ['night','dusk','day']:
    colors=[]
    for item in report['reports']:
        x,y_top=item['lightmap']['xyTopLeft'];values=masters['far-'+look]
        coefficient=values[values.shape[0]-1-y_top,x,:3]
        albedo=np.array(item['expectedDiffuse'])/np.maximum(item['lightmap']['linear'],1e-12)
        transmittance=np.exp(-.0009*item['distance'])
        desired=inverse_aces(item['nativeLooksRGB'][look])
        colors.append((desired-coefficient*albedo*transmittance)/(1-transmittance))
    report['airCalibration']['looks'][look]=np.mean(colors,axis=0).tolist()
(folder / 'master-correlation.json').write_text(json.dumps(report, indent=2) + '\n')
print('RIDGE_CORRELATION_READY', folder / 'master-correlation.json')
