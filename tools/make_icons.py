"""Write simple PNG icons (orange rounded square with a white frame) without PIL."""
import struct
import zlib
import sys
from pathlib import Path


def png(width, height, rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def icon(n):
    rows = []
    r = n * 0.22
    frame_lo, frame_hi = n * 0.28, n * 0.72
    fw = max(1, n * 0.06)
    for y in range(n):
        row = []
        for x in range(n):
            # rounded square mask
            dx = max(r - x - 0.5, x + 0.5 - (n - r), 0)
            dy = max(r - y - 0.5, y + 0.5 - (n - r), 0)
            inside = dx * dx + dy * dy <= r * r
            if not inside:
                row += [0, 0, 0, 0]
                continue
            on_frame = (frame_lo <= x + 0.5 <= frame_hi and frame_lo <= y + 0.5 <= frame_hi and
                        (x + 0.5 - frame_lo < fw or frame_hi - x - 0.5 < fw or y + 0.5 - frame_lo < fw or frame_hi - y - 0.5 < fw))
            row += [255, 255, 255, 255] if on_frame else [234, 88, 12, 255]
        rows.append(row)
    return png(n, n, rows)


out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for n in (16, 48, 128):
    (out / f"icon{n}.png").write_bytes(icon(n))
print("icons written to", out)
