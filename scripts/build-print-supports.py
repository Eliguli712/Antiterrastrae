"""Display the uploaded 1:20 project and genuine PrusaSlicer support toolpaths.

Slice using PrusaSlicer 2.7.4 with --dont-arrange, --threads 2, --post-process ''
and --export-gcode. Pass the resulting preview-only G-code with --gcode.
The download remains the unchanged uploaded 3MF; no G-code is sent to a printer.
"""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'downloads/cynthiacetus/Cynthiacetus_Skull_Supports_1-20.3mf'
OUT = ROOT / 'assets/cynthiacetus'
CORE = '{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
ANATOMY_ROLES = {'External perimeter', 'Perimeter', 'Overhang perimeter',
                 'Internal infill', 'Solid infill', 'Top solid infill', 'Bridge infill'}


def project_meshes():
    with zipfile.ZipFile(SOURCE) as archive:
        assert archive.testzip() is None
        model = ET.fromstring(archive.read('3D/3dmodel.model'))
        assert model.get('unit') == 'millimeter'
        resources = {obj.get('id'): obj for obj in model.find(CORE + 'resources')}
        meshes = []
        for item in model.find(CORE + 'build'):
            obj = resources[item.get('objectid')]
            vertices = np.array([[float(v.get(k)) for k in ('x', 'y', 'z')]
                                 for v in obj.find(CORE + 'mesh/' + CORE + 'vertices')])
            faces = np.array([[int(t.get(k)) for k in ('v1', 'v2', 'v3')]
                              for t in obj.find(CORE + 'mesh/' + CORE + 'triangles')], dtype=np.uint32)
            values = np.array(list(map(float, item.get('transform', '1 0 0 0 1 0 0 0 1 0 0 0').split())))
            vertices = vertices @ values[:9].reshape(3, 3) + values[9:]
            assert np.isfinite(vertices).all() and faces.max() < len(vertices)
            meshes.append((vertices, faces))
        return meshes


def read_toolpaths(path):
    position = np.zeros(3)
    e = 0.0
    absolute_xyz = absolute_e = True
    height, width, role = 0.15, 0.28, ''
    segments = []
    counts = Counter()
    first_model_bottom = None
    last_model_top = None
    with path.open() as stream:
        for raw in stream:
            line = raw.strip()
            if line.startswith(';TYPE:'):
                role = line[6:]
            elif line.startswith(';HEIGHT:'):
                height = float(line[8:])
            elif line.startswith(';WIDTH:'):
                width = float(line[7:])
            if not line or line.startswith(';'):
                continue
            fields = line.split(';', 1)[0].strip().split()
            command = fields[0]
            if command in ('G2', 'G3'):
                raise ValueError('Arc toolpaths require explicit tessellation; keep source arc fitting disabled.')
            if command == 'G90': absolute_xyz = True
            if command == 'G91': absolute_xyz = False
            if command == 'M82': absolute_e = True
            if command == 'M83': absolute_e = False
            values = {key: float(value) for key, value in
                      re.findall(r'([XYZE])(-?(?:\d+(?:\.\d*)?|\.\d+))', ' '.join(fields[1:]))}
            if command == 'G92':
                e = values.get('E', e)
                for i, axis in enumerate('XYZ'):
                    position[i] = values.get(axis, position[i])
                continue
            if command not in ('G0', 'G1'):
                continue
            end = position.copy()
            for i, axis in enumerate('XYZ'):
                if axis in values:
                    end[i] = values[axis] + (0 if absolute_xyz else position[i])
            next_e = values.get('E', e if absolute_e else 0) + (0 if absolute_e else e)
            extruding = next_e - e > 1e-7 and np.linalg.norm(end[:2] - position[:2]) > 1e-7
            if extruding and role in ANATOMY_ROLES:
                first_model_bottom = end[2] - height if first_model_bottom is None else first_model_bottom
                last_model_top = max(last_model_top or end[2], end[2])
            if extruding and role.startswith('Support material'):
                assert abs(end[2] - position[2]) < 1e-6
                assert 0 < height < 1 and 0 < width < 2
                segments.append((position.copy(), end.copy(), width, height))
                counts[role] += 1
            position, e = end, next_e
    assert segments and first_model_bottom is not None
    return segments, counts, first_model_bottom, last_model_top


def extrusion_mesh(segments):
    """An exact centerline/width/height ribbon for every extruded support segment."""
    values = np.array([[*a, *b, width, height] for a, b, width, height in segments])
    start, end, width, height = values[:, :3], values[:, 3:6], values[:, 6], values[:, 7]
    delta = end[:, :2] - start[:, :2]
    normal = np.column_stack([-delta[:, 1], delta[:, 0]]) / np.linalg.norm(delta, axis=1)[:, None]
    normal = np.column_stack([normal * width[:, None] / 2, np.zeros(len(values))])
    top = np.stack([start + normal, start - normal, end - normal, end + normal], axis=1)
    bottom = top.copy(); bottom[:, :, 2] -= height[:, None]
    vertices = np.concatenate([bottom, top], axis=1).reshape(-1, 3)
    cube = np.array([[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
                     [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
                     [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]], dtype=np.uint32)
    faces = (cube[None, :, :] + np.arange(len(values), dtype=np.uint32)[:, None, None] * 8).reshape(-1, 3)
    return vertices, faces


def vertex_normals(vertices, faces):
    face_normals = np.cross(vertices[faces[:, 1]] - vertices[faces[:, 0]],
                            vertices[faces[:, 2]] - vertices[faces[:, 0]])
    normals = np.zeros_like(vertices)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    length = np.linalg.norm(normals, axis=1)
    assert np.isfinite(normals).all()
    normals /= np.maximum(length[:, None], 1e-20)
    return normals


def write_glb(path, meshes, center, extra):
    binary = bytearray()
    views, accessors, primitives = [], [], []

    def attribute(data, kind, component=5126):
        data = np.ascontiguousarray(data, dtype='<f4' if component == 5126 else '<u4')
        view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': data.nbytes}
        binary.extend(data.tobytes()); binary.extend(b'\0' * (-len(binary) % 4)); views.append(view)
        accessor = {'bufferView': len(views) - 1, 'componentType': component,
                    'count': len(data), 'type': kind}
        if kind == 'VEC3' and component == 5126:
            accessor.update(min=data.min(0).tolist(), max=data.max(0).tolist())
        accessors.append(accessor)
        return len(accessors) - 1

    for vertices, faces, material in meshes:
        # Common frame for anatomy and support; 3MF mm/Z-up -> glTF m/Y-up.
        display = (vertices - center)[:, [0, 2, 1]] * [1, 1, -1] / 1000
        assert np.isfinite(display).all()
        normals = vertex_normals(display, faces)
        pos = attribute(display, 'VEC3')
        normal = attribute(normals, 'VEC3')
        indices = attribute(faces.reshape(-1), 'SCALAR', 5125)
        primitives.append({'attributes': {'POSITION': pos, 'NORMAL': normal},
                           'indices': indices, 'material': material, 'mode': 4})
    model = {
        'asset': {'version': '2.0', 'generator': 'Full source 3MF / PrusaSlicer support display'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
        'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors,
        'materials': [
            {'name': 'Original print-project anatomy', 'doubleSided': True,
             'pbrMetallicRoughness': {'baseColorFactor': [0.50, 0.43, 0.33, 1], 'metallicFactor': 0, 'roughnessFactor': 0.7}},
            {'name': 'PrusaSlicer support extrusions', 'doubleSided': True,
             'pbrMetallicRoughness': {'baseColorFactor': [0.04, 0.20, 0.23, 1], 'metallicFactor': 0, 'roughnessFactor': 0.85}},
        ],
        'meshes': [{'primitives': primitives}], 'extras': extra,
    }
    data = json.dumps(model, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    blob = struct.pack('<III', 0x46546C67, 2, 28 + len(data) + len(binary))
    blob += struct.pack('<II', len(data), 0x4E4F534A) + data
    blob += struct.pack('<II', len(binary), 0x004E4942) + binary
    path.write_bytes(blob)
    return sha256(blob).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gcode', type=Path, required=True)
    args = parser.parse_args()
    anatomy = project_meshes()
    segments, roles, bottom, top = read_toolpaths(args.gcode)
    all_vertices = np.concatenate([v for v, _ in anatomy])
    # --dont-arrange retains source XY positions. Raft raises the anatomy by the
    # first actual model layer's bottom; keep the raft at its real bed position.
    offset = bottom - all_vertices[:, 2].min()
    shifted = [(v + [0, 0, offset], f) for v, f in anatomy]
    assert abs((all_vertices[:, 2].max() + offset) - top) < 0.11
    support_vertices, support_faces = extrusion_mesh(segments)
    full_vertices = np.concatenate([*(v for v, _ in shifted), support_vertices])
    center = (full_vertices.min(0) + full_vertices.max(0)) / 2
    meta = {'source_sha256': sha256(SOURCE.read_bytes()).hexdigest(),
            'source_triangles': sum(len(f) for _, f in anatomy),
            'source_vertices': sum(len(v) for v, _ in anatomy),
            'support_segments': len(segments), 'support_triangles': len(support_faces),
            'support_roles': dict(roles), 'slicer': 'PrusaSlicer 2.7.4',
            'gcode_sha256': sha256(args.gcode.read_bytes()).hexdigest(),
            'source_scale': '1:20', 'printer_technology': 'FFF', 'simplified': False,
            'anatomy_z_lift_mm': offset, 'display_center_mm': center.tolist(),
            'support_representation': 'Original extruded support centerlines with recorded width/height ribbons; all support and raft segments retained. Not an SLA mesh.',
            'geometry': 'Full, unchanged source triangle connectivity. Neutral display materials; uploaded project contains no textures.'}
    base = [(v, f, 0) for v, f in shifted]
    base_hash = write_glb(OUT / 'print-project-1-20.glb', base, center, meta)
    support_hash = write_glb(OUT / 'print-project-1-20-supports.glb',
                            base + [(support_vertices, support_faces, 1)], center, meta)
    meta.update(source=str(SOURCE.relative_to(ROOT)), source_bytes=SOURCE.stat().st_size,
                anatomy_glb='assets/cynthiacetus/print-project-1-20.glb', anatomy_glb_sha256=base_hash,
                anatomy_glb_bytes=(OUT / 'print-project-1-20.glb').stat().st_size,
                supported_glb='assets/cynthiacetus/print-project-1-20-supports.glb', supported_glb_sha256=support_hash,
                supported_glb_bytes=(OUT / 'print-project-1-20-supports.glb').stat().st_size)
    (OUT / 'print-project-manifest.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(json.dumps(meta, indent=2))


if __name__ == '__main__':
    main()
