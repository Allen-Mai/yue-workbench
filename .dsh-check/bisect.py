"""Bisect a TS file prefix to locate a parse-breaking construct (temporary dev aid)."""
import io
import os
import subprocess
import sys

PROJ = r"D:\HuaweiMoveData\Users\月月\Documents\deepseek-harness\default-workspace\yue-workbench"
NODE = r"C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
TSC = os.path.join(PROJ, "node_modules", "typescript", "bin", "tsc")
SRC = os.path.join(PROJ, "src", "modules", "wealth.ts")
TMP = os.path.join(PROJ, ".dsh-check", "slice.ts")

lines = io.open(SRC, encoding="utf-8").read().split("\n")


def ok(n: int) -> bool:
    body = "\n".join(lines[:n]) + "\nconst __marker: number = 1;\n"
    io.open(TMP, "w", encoding="utf-8", newline="\n").write(body)
    out = subprocess.run(
        [NODE, TSC, "--noEmit", "--target", "ES2020", "--module", "ESNext",
         "--moduleResolution", "bundler", "--skipLibCheck", TMP],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    syn = [l for l in (out.stdout + out.stderr).splitlines() if "error TS1" in l]
    return len(syn) == 0, syn[:2]


lo, hi = 0, len(lines)  # ok(lo) expected True, ok(hi) expected False
good, _ = ok(0)
assert good, "baseline should parse"
bad, diag = ok(hi)
print("full file parses:", bad, diag)
if bad:
    sys.exit(0)

while hi - lo > 1:
    mid = (lo + hi) // 2
    good, _ = ok(mid)
    if good:
        lo = mid
    else:
        hi = mid

print("first bad prefix length:", hi)
print("offending line number:", hi)
print("line content:", lines[hi - 1][:200] if hi - 1 < len(lines) else "<eof>")
_, diag = ok(hi)
for d in diag:
    print(" ", d)
