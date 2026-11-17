"""Experimental UV2-only source-chart weighting; no geometry/material UV edits.

Used only by an isolated preparation snapshot until all existing overlap,
coverage, mapping, physical-contact and visual gates accept the result.
"""
import numpy as np


def monotonic_warp(value, edges, slopes):
    x = np.asarray(value,dtype=np.float64)
    result = slopes[0]*x
    for edge,before,after in zip(edges,slopes,slopes[1:]):
        result += (after-before)*np.maximum(0,x-edge)
    # A constant translation has no density effect; retain the original origin.
    zero = sum((after-before)*max(0,-edge) for edge,before,after in zip(edges,slopes,slopes[1:]))
    return result-zero


def apply_priority_allocation(data, region, source_records):
    if region not in {'hall','court'} or not data.get('packAuthoredCharts'):
        return {'applied':False,'reason':'Only hall/court authored UV2 charts are affected'}
    names = {r['owner']:name for name,r in source_records.items() if r['region']==region}
    owners = np.asarray(data['faceOwners'],dtype=np.int32)
    uv = np.asarray(data['vertexUvs'],dtype=np.float64).reshape(-1,3,2)
    points = np.asarray(data['positions'],dtype=np.float64).reshape(-1,3,3)
    if len(owners)!=len(uv):
        raise RuntimeError('Per-corner authored chart correspondence required')
    rows=[]
    for owner in np.unique(owners):
        name=names[int(owner)]
        lower=name.lower()
        mask=owners==owner
        original=uv[mask].copy()
        if name=='Continuous snowfield footprints and stair-edge drifts':
            # Source uses an X/Z planar chart in centimetres. Verify actual
            # affine parameters instead of assuming its normalization scale.
            x=points[mask,:,0].reshape(-1)
            z=-points[mask,:,1].reshape(-1)
            targets=original.reshape(-1,2)
            u=np.linalg.lstsq(np.column_stack((x,np.ones(len(x)))),targets[:,0],rcond=None)[0]
            v=np.linalg.lstsq(np.column_stack((z,np.ones(len(z)))),targets[:,1],rcond=None)[0]
            error=max(np.max(np.abs(targets[:,0]-(u[0]*x+u[1]))),np.max(np.abs(targets[:,1]-(v[0]*z+v[1]))))
            if error>.001 or u[0]<=0 or v[0]<=0:
                raise RuntimeError('Continuous route is not the actual positive affine X/Z chart')
            # Full route and wall contact bands retain density; remote blank
            # acreage gets less area through strictly positive derivatives.
            xedges=[-13,-8,-2.5,2.5,8,13]
            xslopes=[.15,.6,.25,1,.25,.6,.15]
            zedges=[-11,45]
            zslopes=[.25,1,.25]
            warped=targets.copy()
            warped[:,0]=u[0]*monotonic_warp(x,xedges,xslopes)+u[1]
            warped[:,1]=v[0]*monotonic_warp(z,zedges,zslopes)+v[1]
            uv[mask]=warped.reshape(-1,3,2)
            rows.append({'object':name,'method':'Strictly monotonic separable route/wall-band UV2 warp','actualOriginalAffineFitMaximumErrorCentimetreUnits':float(error),'xEdgesMetres':xedges,'xPositiveSlopes':xslopes,'zEdgesMetres':zedges,'zPositiveSlopes':zslopes})
            continue
        if region=='hall':
            if any(s in lower for s in ['paving','polished','step','threshold','floor','column']):
                proposed=4.
            elif any(s in lower for s in ['beam','bracket','brace','purlin','rafter','tenon']):
                proposed=4.
            elif any(s in lower for s in ['door','hinge','stud','lattice','paper','window']):
                proposed=1.2
            else:
                proposed=.10
        elif 'tree' in lower:
            proposed=.4
        elif any(s in lower for s in ['beam','bracket','brace','purlin','rafter','tenon','column']):
            proposed=1.
        elif any(s in lower for s in ['roof','tile','snow cap']):
            proposed=.4
        else:
            proposed=.65
        delta1,delta2=original[:,1]-original[:,0],original[:,2]-original[:,0]
        area=np.abs(delta1[:,0]*delta2[:,1]-delta1[:,1]*delta2[:,0])*.5
        positive=area[area>0]
        # Preserve microchart representability at xatlas's absolute input UV
        # area epsilon. This is a safety floor, not a coverage waiver.
        safe=max(proposed,min(1.,float(np.sqrt(1e-6/positive.min())))) if len(positive) and proposed<1 else proposed
        uv[mask]=original*safe
        rows.append({'object':name,'proposedLinearUV2Scale':proposed,'actualLinearUV2Scale':safe,'minimumOriginalPositiveUVTriangleArea':float(positive.min()) if len(positive) else None})
    data['vertexUvs']=uv.reshape(-1).tolist()
    return {'applied':True,'region':region,'scope':'Only SourceLightmap allocation coordinates supplied to packing change. Positions, indices, source references, owners and UVMap/normals/tints/materials remain exact. Eight pixel gutters and all original proof gates remain mandatory. No GI reuse.',
            'objects':rows}
