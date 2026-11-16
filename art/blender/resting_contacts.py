"""Evaluated-mesh contact placement and source-bound resting-prop registry.

Blender coordinates are Z-up. Every contact height comes from a downward BVH
ray into explicitly owned evaluated support triangles, never an object bound.
"""
import contextlib
import json
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def engine(v):
    return [float(v.x), float(v.z), float(-v.y)]


def blender(v):
    return Vector((v[0], -v[2], v[1]))


class RestingContacts:
    GAP_LIMIT = .002
    PENETRATION_LIMIT = .005
    LOWEST_BAND = .00005
    PLACEMENT_PENETRATION_SAFETY = .00025
    NUMERIC_EPSILON = .000001

    def __init__(self, height_query=None):
        self.entries = []
        self.stack = []
        self.support_cache = {}
        self.height_query = height_query

    def vertices(self, objects):
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        result = []
        for obj in objects:
            if obj.type != 'MESH':
                continue
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
            result.extend((obj.name, vertex.index, evaluated.matrix_world @ vertex.co)
                          for vertex in mesh.vertices)
            evaluated.to_mesh_clear()
        return result

    def support(self, objects):
        bpy.context.view_layer.update()
        key = tuple((obj.name, tuple(value for row in obj.matrix_world for value in row))
                    for obj in objects)
        if key in self.support_cache:
            return self.support_cache[key]
        graph = bpy.context.evaluated_depsgraph_get()
        vertices, faces, owners = [], [], []
        for obj in objects:
            if obj.type != 'MESH':
                raise RuntimeError('Contact support must be an actual mesh: ' + obj.name)
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
            mesh.calc_loop_triangles()
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
            for triangle in mesh.loop_triangles:
                faces.append(tuple(offset + i for i in triangle.vertices))
                owners.append({'object': obj.name, 'polygon': triangle.polygon_index})
            evaluated.to_mesh_clear()
        if not faces:
            raise RuntimeError('Empty evaluated contact support')
        result = (BVHTree.FromPolygons(vertices, faces, all_triangles=True), owners)
        self.support_cache[key] = result
        return result

    def measure(self, members, supports):
        if set(members) & set(supports):
            raise RuntimeError('A prop cannot support itself')
        points = self.vertices(members)
        if not points:
            raise RuntimeError('Resting semantic group has no evaluated mesh vertices')
        tree, owners = self.support(supports)
        minimum = min(p.z for _, _, p in points)
        contacts, all_hits = [], []
        misses = 0
        for name, index, p in points:
            # This fixed scene-scale origin only bounds the ray. The hit on real
            # evaluated triangles supplies the support height and ownership.
            hit, normal, triangle, distance = tree.ray_cast(
                Vector((p.x, p.y, 50)), Vector((0, 0, -1)), 100)
            if hit is None:
                misses += 1
                continue
            value = {'object': name, 'vertex': index, 'pointEngine': engine(p),
                     'supportPointEngine': engine(hit), 'supportNormalEngine': engine(normal),
                     'supportObject': owners[triangle]['object'],
                     'supportPolygon': owners[triangle]['polygon'],
                     'gapMetres': float(p.z - hit.z)}
            all_hits.append(value)
            if p.z <= minimum + self.LOWEST_BAND:
                contacts.append(value)
        if not contacts:
            raise RuntimeError('No evaluated lowest vertex is over its declared support')
        contact = min(contacts, key=lambda value: value['gapMetres'])
        worst = min(all_hits, key=lambda value: value['gapMetres'])
        penetration = max(0., -worst['gapMetres'])
        passed = (contact['gapMetres'] <= self.GAP_LIMIT
                  and penetration <= self.PENETRATION_LIMIT)
        return {'passed': passed, 'lowestEvaluatedYEngine': float(minimum),
                'evaluatedMeshVertices': len(points), 'lowestBandVerticesWithSupport': len(contacts),
                'rayMisses': misses, 'contact': contact, 'worstPenetrationContact': worst,
                'maximumPenetrationMetres': penetration,
                'lowestSetGapRangeMetres': [min(v['gapMetres'] for v in contacts),
                                           max(v['gapMetres'] for v in contacts)],
                'gapLimitMetres': self.GAP_LIMIT, 'penetrationLimitMetres': self.PENETRATION_LIMIT,
                'lowestSetRule': 'At least one real lowest-band bearing vertex contacts; hollow bowl centres and gaps between feet need not touch. All evaluated vertices are tested for penetration.'}

    @staticmethod
    def shift(members, delta):
        for obj in members:
            matrix = obj.matrix_world.copy()
            matrix.translation.z += delta
            obj.matrix_world = matrix
        bpy.context.view_layer.update()

    def measure_mount(self, members, supports, probes):
        tree, owners = self.support(supports)
        points = self.vertices(members)
        hits = []
        for probe in probes:
            start, direction = blender(probe['startEngine']), blender(probe['directionEngine']).normalized()
            hit, normal, triangle, distance = tree.ray_cast(start, direction, 2)
            nearby = [p for _, _, p in points if abs(p.x - start.x) < .025 and abs(p.z - start.z) < .025]
            if hit is None or not nearby:
                raise RuntimeError('Mounted support lacks actual wall/fastener geometry')
            extent = max((p - start).dot(direction) for p in nearby)
            embed = extent - distance
            hits.append({'supportObject': owners[triangle]['object'],
                         'supportPolygon': owners[triangle]['polygon'],
                         'wallPointEngine': engine(hit), 'wallNormalEngine': engine(normal),
                         'actualFastenerEmbeddingMetres': float(embed), 'passed': embed >= .001})
        return {'passed': all(v['passed'] for v in hits), 'mode': 'wall-fastened bearing rail',
                'mounts': hits, 'restingGapGuardApplicable': False,
                'reason': 'Explicit wall fasteners intentionally enter masonry. Screen leaves and molding rest on the rail and receive ordinary downward contact/penetration guards.'}

    @contextlib.contextmanager
    def group(self, name, supports, mode='resting', mount_probes=None):
        if any(entry['name'] == name for entry in self.entries):
            raise RuntimeError('Duplicate semantic contact group: ' + name)
        before = set(bpy.data.objects)
        parent = self.stack[-1] if self.stack else None
        self.stack.append(name)
        holder = {}
        try:
            yield holder
        finally:
            self.stack.pop()
        members = [obj for obj in bpy.data.objects if obj not in before and obj.type in {'MESH', 'LIGHT'}]
        if not members:
            raise RuntimeError('Empty semantic prop group: ' + name)
        entry = {'name': name, 'parentGroup': parent, 'mode': mode,
                 'members': [obj.name for obj in members], 'supports': [obj.name for obj in supports]}
        if mode == 'resting':
            initial = self.measure(members, supports)
            if self.height_query is None:
                raise RuntimeError('Source placement requires its reusable evaluated-support height helper')
            bearing = initial['contact']['pointEngine']
            surface_height = self.height_query(bearing[0], bearing[2], supports)
            contact_delta = surface_height - bearing[1]
            # Uneven paving can meet another part of a broad soft cushion
            # before its absolute lowest point. Use the smallest extra lift
            # that satisfies the unchanged5mm penetration guard; the final
            # lowest-point gap must still pass the independent2mm guard.
            penetration_delta = (-self.PENETRATION_LIMIT
                                 - initial['worstPenetrationContact']['gapMetres']
                                 + self.PLACEMENT_PENETRATION_SAFETY)
            delta = max(contact_delta, penetration_delta)
            if abs(delta) < self.NUMERIC_EPSILON:
                delta = 0.
            self.shift(members, delta)
            entry.update(initial=initial, correctionEngine=[0, delta, 0],
                         placementRaycastHeightEngine=surface_height,
                         placementPenetrationSafetyMetres=self.PLACEMENT_PENETRATION_SAFETY,
                         settlingPolicy='Lowest contact first; minimum additional lift if required by the unchanged all-vertex penetration guard. No deformation or relaxed tolerance.')
        else:
            entry['mountProbes'] = mount_probes or []
        for obj in members:
            groups = json.loads(obj.get('resting_prop_groups', '[]'))
            obj['resting_prop_groups'] = json.dumps(groups + [name])
        holder.update(members=members, entry=entry)
        self.entries.append(entry)

    def audit(self, fail=True, write_metadata=True):
        records = []
        for entry in self.entries:
            members = [bpy.data.objects[name] for name in entry['members']]
            supports = [bpy.data.objects[name] for name in entry['supports']]
            measured = (self.measure(members, supports) if entry['mode'] == 'resting'
                        else self.measure_mount(members, supports, entry['mountProbes']))
            records.append({**entry, 'final': measured})
        result = {'version': 1, 'method': 'Downward rays onto actual evaluated loop triangles; actual evaluated lowest vertex set and all-vertex penetration checks. No bounding-box support placement.',
                  'gapLimitMetres': self.GAP_LIMIT, 'penetrationLimitMetres': self.PENETRATION_LIMIT,
                  'passed': all(r['final']['passed'] for r in records), 'groups': records}
        if write_metadata:
            bpy.context.scene['resting_contact_groups'] = json.dumps(self.entries)
            bpy.context.scene['resting_contact_audit'] = json.dumps(result)
        if fail and not result['passed']:
            failures = [(r['name'], r['final']) for r in records if not r['final']['passed']]
            raise RuntimeError('Resting contact guard failed: ' + json.dumps(failures))
        return result

    @classmethod
    def from_scene(cls):
        registry = cls()
        registry.entries = json.loads(bpy.context.scene['resting_contact_groups'])
        return registry
