import io
import subprocess

PROJ = r"D:\HuaweiMoveData\Users\月月\Documents\deepseek-harness\default-workspace\yue-workbench"
NODE = r"C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
BIN = PROJ + r"\node_modules\.pnpm\esbuild@0.21.5\node_modules\esbuild\bin\esbuild"
SRC = PROJ + r"\src\modules\wealth.ts"
TMP = PROJ + r"\.dsh-check\snip.ts"
OUT = PROJ + r"\.dsh-check\snip.txt"

lines = io.open(SRC, encoding="utf-8").read().split("\n")
header = (
    "declare function Card(o: any): any;\n"
    "declare function h(...a: any[]): any;\n"
    "declare function Stat(o: any): any;\n"
    "declare function fmtMoney(n: number): string;\n"
    "declare function num(n: any): number;\n"
    "declare function monthCN(s: string): string;\n"
    "declare const store: any;\n"
    "function f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {\n"
)
snippet = header + "\n".join(lines[735:748]) + "\n}\n"
io.open(TMP, "w", encoding="utf-8", newline="\n").write(snippet)
r = subprocess.run([NODE, BIN, TMP, "--outfile=NUL"], capture_output=True, text=True, errors="replace")
io.open(OUT, "w", encoding="utf-8").write(
    "ISOLATED exit %s\n%s\n" % (r.returncode, (r.stdout + r.stderr)[:2000])
)

# Also test lines 739-748 alone (the body array)
snippet2 = header + "\n".join(lines[738:748]) + "\n}\n"
io.open(TMP, "w", encoding="utf-8", newline="\n").write(snippet2)
r2 = subprocess.run([NODE, BIN, TMP, "--outfile=NUL"], capture_output=True, text=True, errors="replace")
io.open(OUT, "a", encoding="utf-8").write(
    "BODY-ONLY exit %s\n%s\n" % (r2.returncode, (r2.stdout + r2.stderr)[:2000])
)
print("done")
