"""Check that web export preserves every uploaded anatomy triangle and support path."""
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import struct
import unittest

import numpy as np
from scripts.chunk_file import read_verified

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path):
    data = read_verified(path) if path.name.endswith('.parts.json') else path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    size, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    model = json.loads(data[20:20 + size])
    binary_size, kind = struct.unpack_from('<II', data, 20 + size)
    assert kind == 0x004E4942
    binary = data[28 + size:28 + size + binary_size]

    def accessor(index):
        a = model['accessors'][index]
        view = model['bufferViews'][a['bufferView']]
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        width = {'VEC3': 3, 'SCALAR': 1}[a['type']]
        dtype = {5126: '<f4', 5125: '<u4'}[a['componentType']]
        return np.frombuffer(binary, dtype=dtype, count=a['count'] * width, offset=offset).reshape(-1, width)
    return model, accessor


class PrintGeometryTests(unittest.TestCase):
    def test_source_connectivity_and_common_frame(self):
        manifest = json.loads((ROOT / 'assets/cynthiacetus/print-project-manifest.json').read_text())
        spec = importlib.util.spec_from_file_location('print_supports', ROOT / 'scripts/build-print-supports.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        source_meshes = builder.project_meshes()
        base, base_values = read_glb(ROOT / manifest['anatomy_glb'])
        supported, support_values = read_glb(ROOT / manifest['supported_glb'])
        base_meshes = base['meshes'][0]['primitives']
        full_meshes = supported['meshes'][0]['primitives']
        self.assertEqual(len(source_meshes), 2)
        self.assertEqual(len(base_meshes), 2)
        self.assertEqual(len(full_meshes), 3)
        for (vertices, faces), primitive, full in zip(source_meshes, base_meshes, full_meshes):
            actual_faces = base_values(primitive['indices']).reshape(-1, 3)
            np.testing.assert_array_equal(faces, actual_faces)
            actual = base_values(primitive['attributes']['POSITION'])
            original_mm = actual[:, [0, 2, 1]] * [1, -1, 1] * 1000 + manifest['display_center_mm']
            expected_mm = vertices + [0, 0, manifest['anatomy_z_lift_mm']]
            np.testing.assert_allclose(original_mm, expected_mm, atol=1e-5, rtol=0)
            np.testing.assert_array_equal(actual, support_values(full['attributes']['POSITION']))
            np.testing.assert_array_equal(actual_faces, support_values(full['indices']).reshape(-1, 3))
        support = full_meshes[-1]
        self.assertEqual(len(support_values(support['indices'])) // 3, manifest['support_segments'] * 12)
        self.assertTrue(np.isfinite(support_values(support['attributes']['POSITION'])).all())
        self.assertEqual(support['material'], 1)
        self.assertFalse(supported['extras']['simplified'])
        for key, digest in [('anatomy_glb', 'anatomy_glb_sha256'), ('supported_glb', 'supported_glb_sha256')]:
            path = ROOT / manifest[key]
            data = read_verified(path) if path.name.endswith('.parts.json') else path.read_bytes()
            self.assertEqual(sha256(data).hexdigest(), manifest[digest])
