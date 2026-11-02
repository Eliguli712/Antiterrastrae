from pathlib import Path
import tempfile
import unittest
from scripts.chunk_file import read_verified, split_file


class ChunkIntegrityTests(unittest.TestCase):
    def test_split_round_trip_and_reject_corrupted_part(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            original = bytes(range(256)) * 17 + b'last partial block'
            source = root / 'source.zip'
            source.write_bytes(original)
            manifest = split_file(source, root / 'parts', chunk_bytes=1024)
            self.assertEqual(read_verified(manifest), original)
            part = next((root / 'parts').glob('*.bin'))
            part.write_bytes(b'corrupted')
            with self.assertRaisesRegex(ValueError, 'integrity check failed'):
                read_verified(manifest)

    def test_never_overwrite_different_existing_part(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            source = root / 'source.zip'
            source.write_bytes(b'first version')
            split_file(source, root / 'parts', chunk_bytes=1024)
            source.write_bytes(b'different version')
            with self.assertRaises(FileExistsError):
                split_file(source, root / 'parts', chunk_bytes=1024)
