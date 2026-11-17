"""Read-only evaluated HERO fingerprints shared by contact proof and bake guard."""
from array import array
from hashlib import sha256
import json

import bpy


def dynamic_profiles(scene):
    graph=bpy.context.evaluated_depsgraph_get();profiles={};combined=sha256()
    for obj in sorted([o for o in scene.objects if o.type=='MESH' and o.get('one_light_dynamic')],key=lambda o:o.name):
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
        fields={}
        def record(name,values,kind='f'):
            fields[name]=sha256(array(kind,values).tobytes()).hexdigest()
        record('worldPositions',(component for vertex in mesh.vertices for component in (evaluated.matrix_world@vertex.co)))
        record('triangles',(i for triangle in mesh.loop_triangles for i in triangle.vertices),'I')
        record('cornerNormals',(component for normal in mesh.corner_normals for component in normal.vector))
        for uv in mesh.uv_layers:record('uv:'+uv.name,(component for value in uv.data for component in value.uv))
        for attr in mesh.color_attributes:record('color:'+attr.name+':'+attr.domain,(component for value in attr.data for component in value.color))
        payload={'fields':fields,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'materials':[m.name if m else None for m in mesh.materials],'heroId':obj.get('hero_id')}
        fingerprint=sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        profiles[obj.name]={**payload,'geometryFingerprint':fingerprint}
        combined.update(obj.name.encode());combined.update(fingerprint.encode())
        evaluated.to_mesh_clear()
    return profiles,combined.hexdigest()
