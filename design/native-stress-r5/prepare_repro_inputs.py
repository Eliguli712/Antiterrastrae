"""Prepare public original inputs, with no dependency on exhibition hosting."""
from pathlib import Path
import argparse, hashlib, json, subprocess, urllib.request
from export_models import prepare
import numpy as np

p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--inputs',type=Path,required=True);a=p.parse_args();a.cache.mkdir(parents=True,exist_ok=True);a.inputs.mkdir(parents=True,exist_ok=True)
expected={'solution.npz':'f816917260e5fd875134e266590120cbab9d2258546306f31b021f02c94ea27a','qf_solution.npz':'78eec317bf22fc3c89cd6f79dfbf786e7a718958eea0982daf762e05f9161da6','qf_region_masks.npz':'217b9c961c586e7dd75cc0f232e916b3ae1b6e1d4016feaef436c53d4456d001'}
base='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/main/fea_research/high_res_meg_teeth/data/'
for name,sha in expected.items():
    target=a.inputs/name;urllib.request.urlretrieve(base+name,target)
    with target.open('rb')as f:assert hashlib.file_digest(f,'sha256').hexdigest()==sha
helper=a.cache/'export_stream';subprocess.run(['g++','-O3','-std=c++17',str(Path(__file__).with_name('export_stream.cpp')),'-o',str(helper)],check=True);prepare(a.cache,helper)
geo=json.loads(Path(__file__).with_name('exhibition-geometry.json').read_text());(a.cache/'geometry.json').write_text(json.dumps(geo));np.savez(a.cache/'orientation.npz',basis=geo['basis'],center_mm=geo['center_mm'],low=geo['native_oriented_low_mm'],high=geo['native_oriented_high_mm'])
print('Public source inputs and exact native geometry verified',flush=True)
