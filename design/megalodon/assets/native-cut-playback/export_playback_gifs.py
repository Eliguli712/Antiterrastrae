"""Build gallery GIF downloads from the existing rendered MP4 frames."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def media_record(path: Path, relative_to: Path) -> dict:
    result = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,nb_read_frames,codec_name",
            "-of", "json", str(path),
        ],
        text=True,
    )
    with path.open("rb") as source:
        hash_sum = hashlib.file_digest(source, "sha256").hexdigest()
    return {
        "path": path.relative_to(relative_to).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": hash_sum,
        **json.loads(result)["streams"][0],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    assets = directory.parent
    sources = sorted(directory.glob("Native74_Internal_PCA_Axis_*_50mm_1080p*.mp4"))
    sources.append(assets / "studio-art-motion" / "Megalodon_Studio_Cap_Withdrawal.mp4")
    audit = []
    for source in sources:
        target = source.with_suffix(".gif")
        if not args.verify_only:
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                    "-i", str(source), "-i", str(source), "-filter_complex",
                    "[0:v]palettegen=stats_mode=diff[palette];"
                    "[1:v][palette]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                    "-loop", "0", str(target),
                ],
                check=True,
            )
        source_record = media_record(source, assets)
        target_record = media_record(target, assets)
        for key in ("width", "height", "nb_read_frames"):
            if source_record[key] != target_record[key]:
                raise ValueError(f"{target.name}: {key} differs from its source")
        audit.append({"source": source_record, "derived_gif": target_record})
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
