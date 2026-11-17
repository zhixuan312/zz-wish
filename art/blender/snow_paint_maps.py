"""Exportable fine painted-timber response derived from the existing CC0 scan.

The photographed plank roughness is remapped into a matte aged-paint range.
Albedo remains the authored red/teal factor and subtle SurfaceTint; no native-only
procedural shader is introduced. Images are immutable recipe-bound build inputs.
"""
import hashlib
from pathlib import Path

import bpy
import numpy as np

from snow_bronze_maps import _png


def painted_finish_maps(root, size=256):
    root=Path(root);source=root/'web/public/materials/scans/weathered_planks/roughness.jpg'
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    recipe=hashlib.sha256(Path(__file__).read_bytes()+source_hash.encode()).hexdigest()
    directory=root/'art/build/authored-materials'/('painted-timber-'+recipe[:12]);directory.mkdir(parents=True,exist_ok=True)
    image=bpy.data.images.load(str(source),check_existing=False)
    image.colorspace_settings.name='Non-Color';image.scale(size,size)
    pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels)
    rough=.73+.18*np.clip(pixels.reshape(size,size,4)[:,:,:3],0,1)
    bpy.data.images.remove(image)
    path=directory/'painted-timber-roughness.png';data=_png(np.clip(rough[::-1]*255+.5,0,255).astype(np.uint8))
    if path.exists() and path.read_bytes()!=data:raise RuntimeError('Immutable paint map recipe collision')
    if not path.exists():path.write_bytes(data)
    return {'path':path,'sha256':hashlib.sha256(data).hexdigest(),'sourcePath':source,'sourceSha256':source_hash,'recipeSha256':recipe}
