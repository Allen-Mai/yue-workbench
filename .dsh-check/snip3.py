import io
import subprocess

PROJ = r"D:\HuaweiMoveData\Users\月月\Documents\deepseek-harness\default-workspace\yue-workbench"
NODE = r"C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
BIN = PROJ + r"\node_modules\.pnpm\esbuild@0.21.5\node_modules\esbuild\bin\esbuild"
OUT = PROJ + r"\.dsh-check\snip3.txt"
TMP = PROJ + r"\.dsh-check\snip3.ts"

header = (
    "declare function Card(o: any): any;\n"
    "declare function h(...a: any[]): any;\n"
    "declare function Stat(o: any): any;\n"
    "declare function fmtMoney(n: number): string;\n"
)

cases = {
    "1_array_stat_only": """function f(a: number, b: number) {
  const stats = Card({
    body: [
      Stat({ label: 'a', value: fmtMoney(a) }),
      Stat({ label: 'b', value: fmtMoney(b) }),
    ],
  });
}
""",
    "2_array_with_h_div": """function f(a: number, b: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(a) }),
        Stat({ label: 'b', value: fmtMoney(b) }),
      )),
    ],
  });
}
""",
    "3_h_two_children_no_array": """function f(a: number, b: number) {
  const stats = Card({
    body: h('div', { class: 'grid grid-auto' },
      Stat({ label: 'a', value: fmtMoney(a) }),
      Stat({ label: 'b', value: fmtMoney(b) }),
    ),
  });
}
""",
    "4_array_h_then_string": """function f(a: number, b: number) {
  const stats = Card({
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(a) }),
      )),
      h('div', { class: 'x' }, 'note'),
    ],
  });
}
""",
}

log = []
for name, code in cases.items():
    io.open(TMP, "w", encoding="utf-8", newline="\n").write(header + code)
    r = subprocess.run([NODE, BIN, TMP, "--outfile=" + PROJ + r"\.dsh-check\o.js"],
                       capture_output=True, text=True, errors="replace")
    head = (r.stdout + r.stderr).split("node:child_process")[0]
    log.append("=== %s exit %s ===\n%s" % (name, r.returncode, head[:700]))
io.open(OUT, "w", encoding="utf-8").write("\n".join(log))
print("done")
