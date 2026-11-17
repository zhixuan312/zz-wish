"""Small deterministic mesh builders for Snow Roof's Round 1 source.

Engine coordinates are x/y-up/z. No scene mutation, rendering or global RNG.
"""
import math
import random
from mathutils import Vector
from snow_lightmap_charts import tube_coordinates


def tube_path(points, radii, radial=10, closed=False, flatten=1):
    vertices=[];faces=[];n=len(points)
    for j,p in enumerate(points):
        tangent=Vector(points[(j+1)%n])-Vector(points[(j-1)%n]) if closed else Vector(points[min(n-1,j+1)])-Vector(points[max(0,j-1)])
        tangent.normalize();reference=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        u=tangent.cross(reference).normalized();v=tangent.cross(u).normalized()
        for i in range(radial):
            a=i/radial*math.tau;q=Vector(p)+radii[j]*(u*math.cos(a)+v*math.sin(a)*flatten)
            vertices.append(tuple(q))
    for j in range(n if closed else n-1):
        for i in range(radial):faces.append((j*radial+i,j*radial+(i+1)%radial,((j+1)%n)*radial+(i+1)%radial,((j+1)%n)*radial+i))
    if not closed:faces.extend([tuple(reversed(range(radial))),tuple((n-1)*radial+i for i in range(radial))])
    return vertices,faces


def append_mesh(target, vertices, faces):
    offset=len(target[0]);target[0].extend(vertices);target[1].extend(tuple(offset+i for i in face) for face in faces)


def soft_ribbon(length,width,height,seed=1,samples=None):
    """Closed snow coping volume; long axis X, centred at the origin."""
    rng=random.Random(seed);phase=rng.random()*math.tau;steps=samples or max(8,int(length/.27));across=8
    vertices=[];faces=[]
    for row in range(steps+1):
        t=row/steps;x=(t-.5)*length
        drift=1+.16*math.sin(t*7+phase)+.08*math.sin(t*19+phase*2)
        edge=1+.04*math.sin(t*17+phase)
        for j in range(across+1):
            u=j/across;z=(u-.5)*width*edge
            y=height*(.25+.75*math.sin(math.pi*u)**.65)*drift
            vertices.append((x,y,z))
    count=len(vertices);vertices.extend((x,-.07,z) for x,y,z in vertices.copy())
    for row in range(steps):
        for j in range(across):
            i=row*(across+1)+j;faces.append((i,i+1,i+across+2,i+across+1));faces.append((i+count,i+across+1+count,i+across+2+count,i+1+count))
    boundary=list(range(across+1))+[r*(across+1)+across for r in range(1,steps+1)]+[steps*(across+1)+i for i in range(across-1,-1,-1)]+[r*(across+1) for r in range(steps-1,0,-1)]
    for k,a in enumerate(boundary):
        b=boundary[(k+1)%len(boundary)];faces.append((a,b,b+count,a+count))
    return vertices,faces


def winter_tree_meshes(origin,height,seed,detail=True):
    """Bowed deciduous limbs split into crooked forks, not a conifer spear crown.

    The trunk finishes in a real fork below the crown. Branches have smooth
    horizontal sag, sideways bends and short terminal twigs; local RNG never
    changes any architectural or resting-prop placement.
    """
    rng=random.Random(seed);x,y,z=origin;bark=([],[]);snow=([],[]);bark_uv=[];snow_uv=[];paths=[]
    phase=rng.random()*math.tau;lean=Vector((rng.uniform(-.43,.43),0,rng.uniform(-.36,.36)))
    def curved(start,end,bow,steps):
        start,end,bow=Vector(start),Vector(end),Vector(bow)
        return [tuple(start.lerp(end,k/steps)+bow*math.sin(math.pi*k/steps)+Vector((0,.035*math.sin(k/steps*math.tau+phase)*math.sin(math.pi*k/steps),0))) for k in range(steps+1)]
    def at(path,t):
        q=t*(len(path)-1);i=min(len(path)-2,int(q));return Vector(path[i]).lerp(Vector(path[i+1]),q-i)
    trunk=[]
    for j in range(10):
        t=j/9;p=Vector((x,y+height*.70*t,z))+lean*t*t
        p+=Vector((height*.034*math.sin(t*4.8+phase)*t,height*.012*math.sin(t*3.1),height*.025*math.sin(t*6+phase)*t))
        trunk.append(tuple(p))
    paths.append((trunk,[height*(.036*(1-j/12)**1.15+.003) for j in range(10)],10 if detail else 8))
    azimuth=rng.random()*math.tau;major_count=7 if detail else 6
    for j in range(major_count):
        t=.38+.60*j/(major_count-1)+rng.uniform(-.035,.025)
        if j>=major_count-2:t=1.0
        start=at(trunk,t);angle=azimuth+j*2.399+rng.uniform(-.65,.65)
        reach=height*rng.uniform(.23,.37)*(1-.20*max(0,t-.65))
        rise=height*rng.uniform(.12,.27)*(1.18 if j>=major_count-2 else 1)
        direction=Vector((math.cos(angle),0,math.sin(angle)))
        endpoint=start+direction*reach+Vector((0,rise,0))
        bow=Vector((-math.sin(angle)*reach*rng.uniform(-.18,.18),-reach*rng.uniform(.16,.27),math.cos(angle)*reach*rng.uniform(-.18,.18)))
        path=curved(start,endpoint,bow,7 if detail else 5);radius=height*rng.uniform(.011,.018)*(1.15-.40*t)
        paths.append((path,[radius*(1-.84*k/(len(path)-1))**1.1 for k in range(len(path))],7 if detail else 6))
        for k in range(3 if detail else 2):
            attach=.40+k*(.26 if detail else .48);branch_start=at(path,attach)
            side=-1 if (j+k)%2 else 1;turn=angle+side*rng.uniform(.50,1.17)
            length=reach*rng.uniform(.32,.57)*(1-.17*k)
            endpoint=branch_start+Vector((math.cos(turn)*length,length*rng.uniform(.05,.43),math.sin(turn)*length))
            fork=curved(branch_start,endpoint,Vector((-math.sin(turn)*length*.13,-length*.17,math.cos(turn)*length*.13)),5 if detail else 3)
            r=radius*(.53-.08*k);paths.append((fork,[r*(1-.88*q/(len(fork)-1)) for q in range(len(fork))],5))
            for q in ([.62,1.0] if detail else [1.0]):
                twig_start=at(fork,q);a=turn+side*rng.uniform(-.35,.85);twig_length=length*rng.uniform(.28,.49)
                twig_end=twig_start+Vector((math.cos(a)*twig_length,twig_length*rng.uniform(-.20,.38),math.sin(a)*twig_length))
                twig=curved(twig_start,twig_end,Vector((-.06*twig_length,-.10*twig_length,.08*twig_length)),3)
                paths.append((twig,[max(.0016,r*.22)*(1-.73*v/3) for v in range(4)],3))
        if j%3==0:
            # Short irregular accumulations sit into the strong inner limbs;
            # they do not trace every bough as an uninterrupted white rail.
            start_t=rng.uniform(.10,.18);end_t=rng.uniform(.52,.67);strip=[];radii=[]
            for k in range(7):
                u=k/6;t=start_t+(end_t-start_t)*u;p=at(path,t);rr=radius*(1-.84*t)
                strip.append((p.x,p.y+rr*.73,p.z));radii.append(max(.003,rr*(.10+.95*math.sin(math.pi*u)**.70)*(1+.12*math.sin(k*2.7+phase))))
            vv,ff=tube_path(strip,radii,7,flatten=.48);append_mesh(snow,vv,ff);snow_uv.extend(tube_coordinates(strip,radii,7))
    for path,radii,radial in paths:
        vv,ff=tube_path(path,radii,radial);append_mesh(bark,vv,ff)
        bark_uv.extend(tube_coordinates(path,radii,radial))
    return bark,snow,{'branchPaths':len(paths),'seed':seed,'heightMetres':height,'trunkEndsInFork':True,'branchPolicy':'Bowed multi-axis limbs, staggered crooked forks and short blunt terminal twigs; no long conical leaders.','barkChartUV':bark_uv,'snowChartUV':snow_uv}


def mature_winter_tree_meshes(origin,height,seed,companion=False):
    """Legible older winter limbs, with a pruned building-facing side.

    Six substantial crooked primary limbs and24 secondary forks make the hero
    crown. The companion has four unequal main orders and12 secondary forks.
    Smallest terminal radii are4mm; silhouette mass is not assigned to1mm twigs.
    """
    rng=random.Random(seed);root=Vector(origin);bark=([],[]);snow=([],[]);bark_uv=[];snow_uv=[];paths=[]
    phase=rng.random()*math.tau;lean=Vector((.31 if companion else -.38,0,.22 if companion else .12))
    trunk_height=height*.64;trunk=[]
    for k in range(11):
        t=k/10;p=root+Vector((0,trunk_height*t,0))+lean*t*t
        p+=Vector((math.sin(t*5.2+phase)*.09*t,0,math.sin(t*4.6+phase)*.07*t))
        trunk.append(tuple(p))
    base_radius=.175 if companion else .265
    paths.append((trunk,[base_radius*(1-.65*k/10)**.86 for k in range(11)],12))
    count=4 if companion else 6
    angles=([.22,1.40,.65,2.45] if companion else [2.77,.28,2.18,.82,1.63,.05])
    def open_angle(a):
        a=a%math.tau
        return math.pi*2-a if a>math.pi else a
    def curve(start,angle,reach,rise,steps,bend):
        direction=Vector((math.cos(angle),0,math.sin(angle)));side=Vector((-direction.z,0,direction.x));start=Vector(start)
        points=[]
        for k in range(steps+1):
            t=k/steps;p=start+direction*reach*t+Vector((0,rise*t,0))
            p+=side*(bend*math.sin(math.pi*t)+.035*math.sin(math.tau*t)*math.sin(math.pi*t))
            p.y-=min(.22,reach*.09)*math.sin(math.pi*t)
            points.append(tuple(p))
        return points
    def at(path,t):
        q=t*(len(path)-1);i=min(len(path)-2,int(q));return Vector(path[i]).lerp(Vector(path[i+1]),q-i)
    major_radii=[];secondary_radii=[];secondary_count=0;outer_count=0
    for j in range(count):
        t=(.62 if companion else .57)+(1-(.62 if companion else .57))*j/(count-1)
        start=at(trunk,t);angle=open_angle(angles[j]+rng.uniform(-.12,.12))
        reach=rng.uniform(1.15,1.65) if companion else rng.uniform(1.75,2.35)
        end_y=root.y+((3.92+.19*j) if companion else (5.02+.19*j))+rng.uniform(-.10,.10)
        radius=rng.uniform(.060,.090) if companion else rng.uniform(.095,.140)
        tip_radius=rng.uniform(.025,.033) if companion else rng.uniform(.030,.045)
        path=curve(start,angle,reach,end_y-start.y,7,rng.uniform(-.23,.23))
        radii=[radius+(tip_radius-radius)*(k/7)**.84 for k in range(8)]
        paths.append((path,radii,9));major_radii.append([radius,tip_radius])
        attach=[(.58,-1),(.86,1),(1.0,-1),(1.0,1)] if not companion else [(.64,-1),(1.0,-1),(1.0,1)]
        for k,(u,side) in enumerate(attach):
            start_fork=at(path,u);turn=open_angle(angle+side*rng.uniform(.43,.95))
            length=rng.uniform(.60,.90) if companion else rng.uniform(.72,1.15)
            rise=rng.uniform(.25,.55) if companion else rng.uniform(.32,.68)
            fork=curve(start_fork,turn,length,rise,5,rng.uniform(-.15,.15))
            r=rng.uniform(.027,.044) if companion else rng.uniform(.037,.061)
            r_end=rng.uniform(.012,.018) if companion else rng.uniform(.014,.022)
            paths.append((fork,[r+(r_end-r)*(v/5)**.85 for v in range(6)],7));secondary_count+=1;secondary_radii.append([r,r_end])
            for twig_side in ([-1,1] if not companion else [1 if k%2 else -1]):
                twig_start=at(fork,.72 if twig_side<0 else 1)
                a=open_angle(turn+twig_side*rng.uniform(.38,.81));length=rng.uniform(.26,.51)
                terminal=curve(twig_start,a,length,rng.uniform(-.04,.18),3,rng.uniform(-.09,.09))
                r0=rng.uniform(.009,.016);r1=rng.uniform(.004,.008)
                paths.append((terminal,[r0+(r1-r0)*v/3 for v in range(4)],5));outer_count+=1
        if j in ([1] if companion else [1,4]):
            # Short, closed rounded accumulations, embedded in the inner bark.
            # They do not outline an entire branch as a straight white rail.
            strip=[];rr=[]
            for k in range(7):
                u=k/6;p=at(path,.16+.24*u);r=radii[min(7,round((.16+.24*u)*7))]
                strip.append((p.x,p.y+r*.72,p.z));rr.append(.006+r*.80*math.sin(math.pi*u)**.75*(.92+.08*math.sin(k*2.1)))
            vv,ff=tube_path(strip,rr,7,flatten=.42);append_mesh(snow,vv,ff);snow_uv.extend(tube_coordinates(strip,rr,7))
    for path,radii,radial in paths:
        vv,ff=tube_path(path,radii,radial);append_mesh(bark,vv,ff);bark_uv.extend(tube_coordinates(path,radii,radial))
    return bark,snow,{'seed':seed,'heightMetres':height,'style':'offset smaller forecourt companion' if companion else 'older broad winter crown',
                     'branchPaths':len(paths),'majorLimbCount':count,'secondaryLimbCount':secondary_count,'outerForkCount':outer_count,
                     'primaryRadiusRangesMetres':major_radii,'secondaryRadiusRangesMetres':secondary_radii,'minimumTerminalRadiusMetres':.004,
                     'branchPolicy':'Visible crooked primary/secondary fork mass; trunk terminates in unequal crown orders; building-facing low limbs pruned by open-forecourt growth directions.',
                     'barkChartUV':bark_uv,'snowChartUV':snow_uv}
