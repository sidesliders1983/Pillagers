"""Decode video frames with source timestamps for visual water-effect review.

Requires Pillow and an FFmpeg executable. The optional imageio-ffmpeg package may
provide FFmpeg; this script does not install dependencies or approve screenshots.
"""

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


TIMESTAMP_PATTERN = re.compile(
    r"\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([\d.eE+-]+)"
)


def find_ffmpeg(explicit_path):
    if explicit_path:
        executable = Path(explicit_path).resolve()
        if not executable.is_file():
            raise SystemExit(f"FFmpeg executable does not exist: {executable}")
        return str(executable)
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise SystemExit("FFmpeg not found; pass --ffmpeg or install it separately.") from error


def run_ffmpeg(executable, arguments, log_path):
    result = subprocess.run(
        [executable, "-hide_banner", "-nostdin", "-y", *arguments],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    log_path.write_text(result.stderr, encoding="utf-8")
    if result.returncode:
        raise SystemExit(f"FFmpeg failed. See {log_path}\n{result.stderr[-2000:]}")
    return result.stderr


def write_sheet(output, entries, path, columns, cell_size, water_crop=False):
    width, height = cell_size
    label_height = 24
    sheet = Image.new(
        "RGB", (columns * width, math.ceil(len(entries) / columns) * (height + label_height)),
        "#18202b",
    )
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        x = index % columns * width
        y = index // columns * (height + label_height)
        with Image.open(output / entry["path"]) as frame:
            if water_crop:
                frame = frame.crop((0, frame.height // 2, frame.width, frame.height))
            fitted = ImageOps.contain(frame, (width, height), Image.Resampling.LANCZOS)
            sheet.paste(fitted, (x + (width - fitted.width) // 2, y))
        label = f'#{entry["frame"]} | {entry["seconds"]:.3f}s'
        draw.text((x + 4, y + height + 3), label, fill="white")
    sheet.save(path, quality=92)


def extract_samples(executable, source, output, timeline, times):
    selected = sorted(
        {min(timeline, key=lambda row: abs(row["seconds"] - time))["frame"] for time in times}
    )
    sample_directory = output / "full-resolution"
    sample_directory.mkdir(exist_ok=True)
    expression = "+".join(f"eq(n\\,{frame - 1})" for frame in selected)
    run_ffmpeg(executable, [
        "-i", str(source), "-an", "-vf", f"select={expression}",
        "-fps_mode", "passthrough", str(sample_directory / "sample-%02d.png"),
    ], output / "sample-decode-log.txt")
    return [
        {**timeline[frame - 1], "path": f"full-resolution/sample-{index + 1:02d}.png"}
        for index, frame in enumerate(selected)
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffmpeg", help="Path to the FFmpeg executable")
    parser.add_argument("--width", type=int, default=512, help="Decoded review frame width")
    parser.add_argument("--sample-times", nargs="*", type=float, default=[])
    args = parser.parse_args()
    if not args.video.is_file():
        parser.error(f"Video does not exist: {args.video}")
    if args.width < 64 or args.width % 2:
        parser.error("--width must be an even integer of at least 64 pixels")
    if any(not math.isfinite(time) or time < 0 for time in args.sample_times):
        parser.error("--sample-times must contain finite, non-negative timestamps")

    executable = find_ffmpeg(args.ffmpeg)
    source = args.video.resolve()
    output = args.output.resolve()
    frames_directory = output / "frames"
    frames_directory.mkdir(parents=True, exist_ok=True)
    log = run_ffmpeg(executable, [
        "-i", str(source), "-an", "-vf", f"scale={args.width}:-2,showinfo",
        "-fps_mode", "passthrough", "-q:v", "3",
        str(frames_directory / "frame-%05d.jpg"),
    ], output / "decode-log.txt")
    timeline = [
        {"frame": int(match[0]) + 1, "seconds": float(match[2]),
         "path": f"frames/frame-{int(match[0]) + 1:05d}.jpg"}
        for match in TIMESTAMP_PATTERN.findall(log)
    ]
    if not timeline:
        raise SystemExit("No video frame presentation timestamps were decoded.")
    with (output / "frame-timeline.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["frame", "seconds", "path"])
        writer.writeheader()
        writer.writerows(timeline)

    overview = []
    next_second = 0
    for entry in timeline:
        if entry["seconds"] >= next_second:
            overview.append(entry)
            next_second = math.floor(entry["seconds"]) + 1
    for start in range(0, len(overview), 30):
        write_sheet(output, overview[start:start + 30],
                    output / f"overview-{start // 30 + 1:02d}.jpg", 6, (180, 310))
    for start in range(0, len(timeline), 64):
        write_sheet(output, timeline[start:start + 64],
                    output / f"all-frames-water-{start // 64 + 1:02d}.jpg",
                    8, (256, 190), water_crop=True)

    samples = extract_samples(executable, source, output, timeline, args.sample_times) \
        if args.sample_times else []
    with source.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    metadata = {
        "sourceName": source.name, "sourceSha256": digest, "bytes": source.stat().st_size,
        "decodedFrames": len(timeline), "firstTimestamp": timeline[0]["seconds"],
        "lastTimestamp": timeline[-1]["seconds"], "reviewFrameWidth": args.width,
        "waterSheetCrop": "Lower half of each decoded frame; may include scene objects.",
        "fullResolutionSamples": samples,
        "visualReviewStatus": "Not reviewed; extraction does not establish visual acceptance.",
    }
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
