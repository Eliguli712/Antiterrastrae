"""Native vertex scalar fields for fully reproducible public model exports."""
import argparse,json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from export_models import NV
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--solutions',type=Path,required=True);a=p.parse_args();v=np.memmap(a.cache/'vertices.f32',dtype='<f4',mode='r',shape=(NV,3));geo=json.loads((a.cache/'geometry.json').read_text())
for size in [50,100]:
    d=np.load(a.solutions/f'{size}mm-solution.npz');tree=cKDTree(d['points_m'][d['tets']].mean(1));vm=d['element_von_mises_Pa'];scale=size/geo['native_longitudinal_height_mm'];out=np.memmap(a.cache/f'{size}mm-values.f32',dtype='<f4',mode='w+',shape=(NV,))
    for i in range(0,NV,400000):
        q=np.asarray(v[i:i+400000],dtype='f8')*scale/1000;distance,ix=tree.query(q,workers=2);s=vm[ix].astype('f4');s[distance>.00075*scale]=np.nan;out[i:i+len(s)]=s
    out.flush();print('Projected independent numerical field',size,flush=True)
