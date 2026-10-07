"""Binary-search the byte offset where a TS file stops parsing (temporary dev aid)."""
import io
import os
import re
import subprocess
import sys

PROJ = r"D:\HuaweiMoveData\Users\月月\Documents\deepseek-harness\default-workspace\yue-workbench"
NODE = r"C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
TSC = os.path.join(PROJ, "node_modules", "typescript", "bin", "tsc")
SRC = os.path.join(PROJ, "src", "modules", "wealth.ts")
TMP = os.path.join(PROJ, ".dsh-check", "slice.ts")

src = io.open(SRC, encoding="utf-8").read()
line_starts = [0]
for i, ch in enumerate(src):
    if ch == "\n":
        line_starts.append(i + 1)
lines = src.split("\n")


def offset(line: int, col: int) -> int:
    if line - 1 >= len(line_starts):
        return len(src) + 10_000
    return line_starts[line - 1] + (col - 1)


def first_error(limit: int):
    body = src[:limit] + "\nconst __marker: number = 1;\n"
    io.open(TMP, "w", encoding="utf-8", newline="\n").write(body)
    out = subprocess.run(
        [NODE, TSC, "--noEmit", "--target", "ES2020", "--module", "ESNext",
         "--moduleResolution", "bundler", "--skipLibCheck", TMP],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    for l in (out.stdout + out.stderr).splitlines():
        m = re.match(r".*slice\.ts\((\d+),(\d+)\): error (TS\d+)", l)
        if m:
            return offset(int(m.group(1)), int(m.group(2))), l
    return None, None


lo, hi = 0, len(src)  # true error offset lies in (lo, hi]
off, msg = first_error(hi)
print("full:", off, msg)
if off is None:
    print("file parses fine")
    sys.exit(0)

while hi - lo > 20:
    mid = (lo + hi) // 2
    off, msg = first_error(mid)
    if off is not None and off <= mid:
        hi = mid
    else:
        lo = mid

off, msg = first_error(hi)
line_no = src[:off].count("\n") + 1
col = off - line_starts[line_no - 1] + 1
print("first bad offset:", off, "line", line_no, "col", col, "|", msg)
for i in range(max(1, line_no - 14), min(len(lines), line_no + 2) + 1):
    print(f"{i:5d}: {lines[i-1]}")
