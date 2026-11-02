"""Split a local file into verified parts, or reassemble a parts manifest.

Examples:
  python3 scripts/chunk_file.py split Cynthiacetus_Separated_SLA_All.zip --output parts
  python3 scripts/chunk_file.py join parts/Cynthiacetus_Separated_SLA_All.parts.json --output restored.zip

The default 16 MiB parts fit the attachment tool's 32 MiB transfer limit. The
source file must already be available locally; this is not a remote file reader.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import tempfile


def safe_name(name):
    if not isinstance(name, str) or not name or name in ('.', '..') or '/' in name or '\\' in name:
        raise ValueError('Unsafe part filename')
    return name


def split_file(source, output, chunk_bytes=16 * 1024 * 1024):
    source, output = Path(source), Path(output)
    if not 0 < chunk_bytes < 32 * 1024 * 1024:
        raise ValueError('Part size must be below 32 MiB')
    output.mkdir(parents=True, exist_ok=True)
    parts, total, whole = [], 0, sha256()
    with source.open('rb') as stream:
        for index in range(1, 100001):
            data = stream.read(chunk_bytes)
            if not data:
                break
            name = safe_name(f'{source.stem}.part-{index:03d}.bin')
            path = output / name
            if path.exists() and path.read_bytes() != data:
                raise FileExistsError(f'Preserving different existing part: {path}')
            if not path.exists():
                path.write_bytes(data)
            parts.append({'path': name, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
            total += len(data); whole.update(data)
        else:
            raise ValueError('Too many parts')
    if not parts:
        raise ValueError('Source file is empty')
    manifest = {'format': 'chunked-file-v1', 'filename': source.name,
                'bytes': total, 'sha256': whole.hexdigest(), 'parts': parts}
    path = output / f'{source.stem}.parts.json'
    if path.exists() and json.loads(path.read_text()) != manifest:
        raise FileExistsError(f'Preserving different existing manifest: {path}')
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    read_verified(path)
    return path


def read_verified(manifest_path):
    path = Path(manifest_path)
    manifest = json.loads(path.read_text())
    if manifest.get('format') != 'chunked-file-v1' or not manifest.get('parts'):
        raise ValueError('Unsupported or empty parts manifest')
    names = [safe_name(part['path']) for part in manifest['parts']]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate part filename')
    chunks = []
    for name, part in zip(names, manifest['parts']):
        data = (path.parent / name).read_bytes()
        if len(data) != part['bytes'] or sha256(data).hexdigest() != part['sha256']:
            raise ValueError(f'Part integrity check failed: {name}')
        chunks.append(data)
    data = b''.join(chunks)
    if len(data) != manifest['bytes'] or sha256(data).hexdigest() != manifest['sha256']:
        raise ValueError('Reassembled file integrity check failed')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['split', 'join'])
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--part-mib', type=int, default=16)
    args = parser.parse_args()
    if args.action == 'split':
        print(split_file(args.source, args.output, args.part_mib * 1024 * 1024))
    else:
        data = read_verified(args.source)
        if args.output.exists():
            raise FileExistsError(f'Preserving existing output: {args.output}')
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as file:
            file.write(data); temporary = Path(file.name)
        temporary.replace(args.output)
        print(f'Verified and restored {args.output}: {len(data)} bytes')


if __name__ == '__main__':
    main()
