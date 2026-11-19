"""Render every native source triangle using the original linear Turbo LUT.

No geometry reduction, data recolouring from images, or numerical field edits.
The existing audited raster74 protocol renders front/oblique/reverse together.
Its two colour channels receive the same original linear palette; only one
channel is exported. Run one process for each independently solved field size.
"""
from pathlib import Path
import argparse, gzip, hashlib, json, re, struct, subprocess
import numpy as np
from PIL import Image


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def decode(path, expected_sha=None):
    compressed = path.read_bytes()
    digest = sha256(compressed)
    if expected_sha is not None and digest != expected_sha:
        raise ValueError("Source checksum mismatch: " + str(path))
    raw = gzip.decompress(compressed)
    length = struct.unpack_from('<I', raw)[0]
    header = json.loads(raw[4:4 + length])
    offset = 4 + ((length + 3) // 4) * 4
    arrays = {
        key: np.frombuffer(raw, dtype=segment['dtype'],
                           count=segment['bytes'] // np.dtype(segment['dtype']).itemsize,
                           offset=offset + segment['offset'])
        for key, segment in header['segments'].items()
    }
    return header, arrays, digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('size', type=int, choices=[50, 100])
    parser.add_argument('--geometry-dir', required=True, type=Path)
    parser.add_argument('--field-dir', required=True, type=Path)
    parser.add_argument('--metadata-dir', required=True, type=Path)
    parser.add_argument('--support-dir', required=True, type=Path)
    parser.add_argument('--palette-source', required=True, type=Path)
    parser.add_argument('--raster', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / 'dist/assets/native-plates-r9'
    output.mkdir(parents=True, exist_ok=True)
    temp = Path(__file__).resolve().parent / 'runtime-cache' / str(args.size)
    temp.mkdir(parents=True, exist_ok=True)
    geometry_raw = (args.geometry_dir / 'geometry.json').read_bytes()
    geometry = json.loads(geometry_raw)
    metadata_raw = (args.metadata_dir / f'{args.size}mm-field.json').read_bytes()
    metadata = json.loads(metadata_raw)
    assert geometry['triangles'] == 74293846
    assert len(geometry['chunks']) == len(metadata['chunks']) == 75
    assert metadata['nominal_native_height_mm'] == args.size
    palette_source = args.palette_source.read_bytes()
    palette_match = re.search(r'const spectrum=(\[.*?\]);', palette_source.decode())
    palette_rgb8 = np.array(json.loads(palette_match.group(1)), dtype='uint8')
    assert palette_rgb8.shape == (256, 3)
    palette = palette_rgb8.astype('f8') / 255
    low = metadata['color_scale']['min_pa']
    high = metadata['color_scale']['max_pa']

    def colour(values):
        # Match the restored studio's JS fieldColor() exactly: linear scalar
        # normalization and interpolation between original integer Turbo knots.
        scalar = values.astype('f8')
        good = np.isfinite(scalar) & (scalar >= 0)
        scalar = np.where(good, scalar, low)
        u = np.clip((scalar - low) / (high - low), 0, 1) * 255
        left = np.minimum(254, np.floor(u).astype('i4'))
        weight = (u - left)[:, None]
        rgb = palette[left] * (1 - weight) + palette[left + 1] * weight
        rgb[~good] = [148 / 255, 159 / 255, 169 / 255]
        return rgb

    records = []
    support_records = []
    faces = 0
    vertices_with_overlap = 0
    # Capture the actual renderer face-count assertion in a tiny log.
    log_path = temp / 'raster.log'
    with log_path.open('w') as log:
        proc = subprocess.Popen([str(args.raster), str(temp)],
                                stdin=subprocess.PIPE, stderr=log)
        try:
            for index, chunk in enumerate(geometry['chunks']):
                path = args.geometry_dir / Path(chunk['url']).name
                h, arrays, geometry_sha = decode(path, chunk['sha256'])
                field_path = args.field_dir / f'{args.size}mm-field-{index:02}.bin.gz'
                field_h, field, field_sha = decode(field_path, metadata['chunks'][index]['sha256'])
                assert h['triangles'] == chunk['triangles']
                assert h['vertices'] == field_h['vertices'] == len(field['values'])
                positions = arrays['positions'].reshape(-1, 3)
                assert positions.dtype == np.dtype('float32')
                if args.size == 100:
                    physical_positions = positions
                else:
                    anchor = np.array([0., 0., 86.73910524340096])
                    physical_positions = anchor + (positions - anchor) * (args.size / 100)
                normals = arrays['normals'].reshape(-1, 3).astype('f4') / 127
                rgb = colour(field['values'])
                packed = np.column_stack([physical_positions, normals, rgb, rgb]).astype('<f4')
                proc.stdin.write(struct.pack('<III', h['vertices'], h['triangles'], 0))
                proc.stdin.write(packed.tobytes())
                proc.stdin.write(arrays['indices'].astype('<u4', copy=False).tobytes())
                faces += h['triangles']
                vertices_with_overlap += h['vertices']
                records.append({'index': index, 'triangles': h['triangles'],
                                'vertices_including_overlap': h['vertices'],
                                'geometry_sha256': geometry_sha, 'field_sha256': field_sha})
                if index % 15 == 0:
                    print('LINEAR_NATIVE', args.size, index + 1, faces, flush=True)
            for name in ['main', 'cap']:
                path = args.support_dir / f'{args.size}mm-{name}.bin'
                raw = path.read_bytes()
                nv, nf = struct.unpack_from('<II', raw)
                vertices = np.frombuffer(raw, dtype='<f4', offset=8, count=nv * 6).reshape(-1, 6)
                indices = np.frombuffer(raw, dtype='<u4', offset=8 + nv * 24, count=nf * 3)
                packed = np.column_stack([vertices, np.tile([.63, .86, .93, .63, .86, .93], (nv, 1))]).astype('<f4')
                proc.stdin.write(struct.pack('<III', nv, nf, 1))
                proc.stdin.write(packed.tobytes())
                proc.stdin.write(indices.tobytes())
                support_records.append({'file': path.name, 'triangles': nf, 'sha256': sha256(raw)})
            proc.stdin.close()
            code = proc.wait()
        except BaseException:
            proc.kill()
            proc.wait()
            raise
    assert faces == 74293846
    assert code == 0, log_path.read_text()
    assert 'Source faces rendered per camera: 74293846' in log_path.read_text()
    plates = []
    for view in ['front', 'oblique', 'reverse']:
        rgba = temp / f'spectrum-{view}.rgba'
        image = Image.frombytes('RGBA', (2400, 2800), rgba.read_bytes())
        destination = output / f'{args.size}mm-linear-{view}.webp'
        image.save(destination, quality=98, method=6)
        plates.append({'file': destination.name, 'width': 2400, 'height': 2800,
                       'native_source_faces_rendered': faces,
                       'bytes': destination.stat().st_size,
                       'sha256': sha256(destination.read_bytes())})
        rgba.unlink()
        (temp / f'wash-{view}.rgba').unlink()
    audit = {
        'revision': 'R9', 'nominal_size_mm': args.size,
        'appearance': 'Original restored-studio linear full-spectrum Turbo mode',
        'palette_interpolation': 'Linear scalar normalization and interpolation between the exact 256 integer RGB knots in stress-palette.js',
        'palette_source_sha256': sha256(palette_source),
        'field_revision': 'Independent per-size R7 recovered numerical field, unchanged',
        'scalar_units': 'Pa', 'colour_min_pa': low, 'colour_max_pa': high,
        'source_solution_sha256': metadata['source_solution_sha256'],
        'raw_solved_element_stresses_unchanged': True,
        'source_geometry_sha256': geometry['source_sha256'],
        'geometry_manifest_sha256': sha256(geometry_raw),
        'field_manifest_sha256': sha256(metadata_raw),
        'geometry_position_encoding': 'Original float32 canonical coordinates; 50 mm uses its declared physical display transform',
        'native_source_chunk_count': len(records),
        'native_source_faces_rendered_per_camera': faces,
        'stream_vertices_including_chunk_overlap': vertices_with_overlap,
        'face_reduction': False, 'source_values_modified': False,
        'unsupported_stream_vertices': metadata['unsupported_stream_vertices'],
        'support_revision': 'R8 original 100 mm support and independent 50 mm socket',
        'support_parts': support_records,
        'raster_sha256': sha256(args.raster.read_bytes()),
        'renderer_actual_face_count_assertion': log_path.read_text().strip(),
        'source_chunks': records, 'plates': plates
    }
    (output / f'{args.size}mm-linear-render-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print('COMPLETE_LINEAR_NATIVE', args.size, json.dumps(plates), flush=True)


if __name__ == '__main__':
    main()
