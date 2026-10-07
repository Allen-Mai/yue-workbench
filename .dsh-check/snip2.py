import io
import subprocess

PROJ = r"D:\HuaweiMoveData\Users\月月\Documents\deepseek-harness\default-workspace\yue-workbench"
NODE = r"C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
BIN = PROJ + r"\node_modules\.pnpm\esbuild@0.21.5\node_modules\esbuild\bin\esbuild"
OUT = PROJ + r"\.dsh-check\snip2.txt"
TMP = PROJ + r"\.dsh-check\snip2.ts"

header = (
    "declare function Card(o: any): any;\n"
    "declare function h(...a: any[]): any;\n"
    "declare function Stat(o: any): any;\n"
    "declare function fmtMoney(n: number): string;\n"
    "declare function num(n: any): number;\n"
    "declare function monthCN(s: string): string;\n"
    "declare const store: any;\n"
)

variants = {}

variants["A_toys"] = header + """
function f(fixedMonth: number, variableMonth: number, ratio: string) {
  const stats = Card({
    icon: 'home',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(fixedMonth) }),
        Stat({ label: 'b', value: fmtMoney(variableMonth) }),
      )),
      h('div', { class: 'x' }, 'note'),
    ],
  });
  return stats;
}
"""

variants["B_tmpl_ascii"] = header + """
function f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {
  const stats = Card({
    icon: 'home',
    title: `MONTH ${monthCN(month)}`,
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: 'a', value: fmtMoney(fixedMonth) }),
      )),
    ],
  });
}
"""

variants["C_full_cn"] = header + "\nfunction f(month: string, fixedMonth: number, variableMonth: number, ratio: string) {\n" + """  const stats = Card({
    icon: 'home',
    title: `本月固定支出（${monthCN(month)}）`,
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '本月固定支出', value: fmtMoney(fixedMonth), unit: '元', tone: 'red', icon: 'home' }),
        Stat({ label: '本月可变支出', value: fmtMoney(variableMonth), unit: '元', tone: 'oak', icon: 'cart' }),
        Stat({ label: '固定支出占比', value: ratio, unit: '', tone: 'honey', icon: 'pie' }),
      )),
      h('div', { class: 'tiny muted mt-2' }, '固定支出走独立账户：不占日常额度、不计入省钱奖励；比例 = 固定支出 ÷（固定 + 可变）。'),
    ],
  });
}
"""

log = []
for name, code in variants.items():
    io.open(TMP, "w", encoding="utf-8", newline="\n").write(code)
    r = subprocess.run([NODE, BIN, TMP, "--outfile=NUL"], capture_output=True, text=True, errors="replace")
    head = (r.stdout + r.stderr).split("node:child_process")[0]
    log.append("=== %s exit %s ===\n%s" % (name, r.returncode, head[:900]))
io.open(OUT, "w", encoding="utf-8").write("\n".join(log))
print("done")
