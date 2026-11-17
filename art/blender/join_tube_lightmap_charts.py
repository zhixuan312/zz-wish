"""Join real tube cap UV2 charts to one boundary edge of their body strip.

The remaining cap circumference stays cut. Each convex cap occupies unique area
outside the rectangular body chart, preserving physical correspondence along the
one joined edge. This changes only packing input UV2, never UVMap or geometry.
"""
from collections import defaultdict
import numpy as np


def join_tube_charts(data, region, source_records):
    if region not in {'hall','court'} or not data.get('packAuthoredCharts'):
        return {'applied':False}
    names={r['owner']:name for name,r in source_records.items() if r['region']==region}
    owners=np.asarray(data['faceOwners'])
    uv=np.asarray(data['vertexUvs'],dtype=np.float64).reshape(-1,3,2)
    refs=np.asarray(data['sourceVertexReferences']).reshape(-1,3)
    reports=[]
    for owner in np.unique(owners):
        name=names[int(owner)]
        rows=np.flatnonzero(owners==owner)
        parents=list(range(len(rows)))
        islands=list(range(len(rows)))
        def root(group,i):
            while group[i]!=i:
                group[i]=group[group[i]]
                i=group[i]
            return i
        def union(group,a,b):
            a,b=root(group,a),root(group,b)
            if a!=b:
                group[a]=b
        physical_edges={}
        uv_edges={}
        for local,ti in enumerate(rows):
            for c in range(3):
                d=(c+1)%3
                pair=tuple(sorted((int(refs[ti,c]),int(refs[ti,d]))))
                if pair in physical_edges:
                    union(parents,local,physical_edges[pair])
                else:
                    physical_edges[pair]=local
                vertices=[(int(refs[ti,j]),np.asarray(uv[ti,j],dtype=np.float32).tobytes()) for j in [c,d]]
                edge=tuple(sorted(vertices))
                if edge in uv_edges:
                    union(islands,local,uv_edges[edge])
                else:
                    uv_edges[edge]=local
        components=defaultdict(lambda:defaultdict(list))
        for local,ti in enumerate(rows):
            components[root(parents,local)][root(islands,local)].append(int(ti))
        joined=0
        reduced=0
        for charts in components.values():
            if len(charts) not in [2,3]:
                continue
            body=None
            for triangles in charts.values():
                values=uv[triangles]
                lower,upper=values.min(axis=(0,1)),values.max(axis=(0,1))
                rectangle=np.prod(upper-lower)
                a,b=values[:,1]-values[:,0],values[:,2]-values[:,0]
                area=np.abs(a[:,0]*b[:,1]-a[:,1]*b[:,0]).sum()*.5
                if rectangle>0 and abs(area/rectangle-1)<.0001:
                    if body is not None:
                        body=None
                        break
                    body=triangles
            if body is None:
                continue
            lower,upper=uv[body].min(axis=(0,1)),uv[body].max(axis=(0,1))
            center=(lower+upper)*.5
            boundaries={}
            edge_count=defaultdict(int)
            for ti in body:
                for c in range(3):
                    d=(c+1)%3
                    edge=tuple(sorted((int(refs[ti,c]),int(refs[ti,d]))))
                    edge_count[edge]+=1
                    boundaries[edge]={int(refs[ti,c]):uv[ti,c].copy(),int(refs[ti,d]):uv[ti,d].copy()}
            boundaries={k:v for k,v in boundaries.items() if edge_count[k]==1 and abs(next(iter(v.values()))[1]-list(v.values())[1][1])<1e-5}
            updates=[]
            for cap in charts.values():
                if cap is body:
                    continue
                vertices={int(refs[ti,c]):uv[ti,c].copy() for ti in cap for c in range(3)}
                shared=[(edge,values) for edge,values in boundaries.items() if all(i in vertices for i in edge)]
                if not shared:
                    updates=[]
                    break
                transformed=None
                for edge,new_values in sorted(shared,key=lambda e:abs(sum(x[0] for x in e[1].values())*.5-center[0])):
                    a,b=edge
                    old_a,old_b=vertices[a],vertices[b]
                    new_a,new_b=new_values[a],new_values[b]
                    old_delta,new_delta=old_b-old_a,new_b-new_a
                    old_length,new_length=np.linalg.norm(old_delta),np.linalg.norm(new_delta)
                    if old_length<=0 or new_length<=0:
                        continue
                    old_axis,new_axis=old_delta/old_length,new_delta/new_length
                    old_normal=np.array([-old_axis[1],old_axis[0]])
                    new_normal=np.array([-new_axis[1],new_axis[0]])
                    old_center=np.mean(list(vertices.values()),axis=0)
                    side=np.dot(old_center-old_a,old_normal)*np.dot(center-new_a,new_normal)
                    reflection=-1 if side>0 else 1
                    proposal={}
                    for index,p in vertices.items():
                        d=p-old_a
                        proposal[index]=new_a+new_length/old_length*(np.dot(d,old_axis)*new_axis+reflection*np.dot(d,old_normal)*new_normal)
                    proposal[a],proposal[b]=new_a,new_b
                    proposal={i:np.asarray(p,dtype=np.float32).astype(np.float64) for i,p in proposal.items()}
                    all_values=np.array(list(proposal.values()))
                    body_side=np.dot(center-new_a,new_normal)
                    if np.any((all_values-new_a)@new_normal*body_side>1e-5) or all_values[:,0].min()<lower[0]-1e-4 or all_values[:,0].max()>upper[0]+1e-4:
                        continue
                    # A new floating cap vertex must stay strictly outside the
                    # body, not round onto an unrelated segment of its edge.
                    if any(np.dot(p-new_a,new_normal)*body_side>=0 for i,p in proposal.items() if i not in [a,b]):
                        continue
                    stable=True
                    for ti in cap:
                        source=uv[ti]
                        s1,s2=source[1]-source[0],source[2]-source[0]
                        signed_source=s1[0]*s2[1]-s1[1]*s2[0]
                        for factor in [.10,.35,.4,.65,1.,1.2,1.8,2.,4.]:
                            target=np.asarray([proposal[int(refs[ti,c])]*factor for c in range(3)],dtype=np.float32).astype(np.float64)
                            d1,d2=target[1]-target[0],target[2]-target[0]
                            signed_target=d1[0]*d2[1]-d1[1]*d2[0]
                            if signed_source*signed_target*reflection<=0 or abs(signed_target)*.5<1e-6:
                                stable=False
                                break
                        if not stable:
                            break
                    if not stable:
                        continue
                    transformed=proposal
                    break
                if transformed is None:
                    updates=[]
                    break
                updates.append((cap,transformed))
            if not updates:
                continue
            for cap,transformed in updates:
                for ti in cap:
                    for c in range(3):
                        uv[ti,c]=transformed[int(refs[ti,c])]
            joined+=1
            reduced+=len(updates)
        reports.append({'object':name,'physicalComponents':len(components),'successfullyJoinedTubeNets':joined,'capChartsJoinedToActualBodyEdges':reduced})
    data['vertexUvs']=uv.reshape(-1).tolist()
    return {'applied':True,'scope':__doc__,'owners':reports,'totalCapChartsJoined':sum(r['capChartsJoinedToActualBodyEdges'] for r in reports)}
