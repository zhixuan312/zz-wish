"""Reproducible authored cast-bronze roughness/metal/pitting maps, CPU only.

These are project-authored material data, not photographed or claimed CC0 scans.
The recipe hash gives each revision immutable ignored source image paths.
"""
import hashlib
from pathlib import Path
import struct
import zlib

import numpy as np


def _png(rgb):
    size=rgb.shape[0]
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    rows=b''.join(b'\0'+row.tobytes() for row in rgb)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')


def bronze_maps(root,size=256):
    recipe=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    directory=Path(root)/'art/build/authored-materials'/('cast-bronze-'+recipe[:12]);directory.mkdir(parents=True,exist_ok=True)
    rng=np.random.default_rng(416901)
    freq=np.fft.fftfreq(size)*size;radius=freq[:,None]**2+freq[None,:]**2
    def field(cutoff):
        raw=rng.standard_normal((size,size));result=np.fft.ifft2(np.fft.fft2(raw)*np.exp(-radius/(cutoff*cutoff))).real
        return (result-result.mean())/max(1e-9,result.std())
    broad=field(5);medium=field(19);fine=field(65)
    oxide=np.clip(.46+.21*broad+.08*medium,0,1)
    rough=np.clip(.48+.31*oxide+.038*fine,.46,.90)
    metal=np.clip(.87-.48*oxide,.36,.88)
    orm=np.stack([np.ones_like(rough),rough,metal],axis=-1)
    pitting=field(49)*.105+field(96)*.035
    dx=(np.roll(pitting,-1,axis=1)-np.roll(pitting,1,axis=1))*.8
    dy=(np.roll(pitting,-1,axis=0)-np.roll(pitting,1,axis=0))*.8
    normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    maps={'orm':orm,'normal':normal*.5+.5};result={}
    for role,values in maps.items():
        path=directory/('bronze-cast-'+role+'.png');data=_png(np.clip(values*255+.5,0,255).astype(np.uint8))
        if path.exists() and path.read_bytes()!=data:raise RuntimeError('Immutable authored material recipe collision')
        if not path.exists():path.write_bytes(data)
        result[role]={'path':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
    return result,recipe
