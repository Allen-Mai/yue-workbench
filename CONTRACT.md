# 月月的工作台 · 开发契约 (CONTRACT v10.0)

> **给所有模块作者（人 / 子代理）的强制约定。写任何模块前必须先读这份文件。**
> 项目：`yue-workbench` · 像素森系 + 治愈护眼风 · 本地优先 PWA。

---

## 0. 风格总纲（治愈温馨 · 森系绿 · 健康护眼）

| 项 | 规定 |
|---|---|
| 底色 | 暖奶油米黄，**禁止纯白 `#fff`**。卡片用 `var(--card)`（半透明暖白 + 毛玻璃） |
| 文字 | **禁止纯黑**。正文 `var(--ink)` 深棕，次要 `var(--ink-soft)`，弱化 `var(--ink-faint)` |
| 主绿 | `--moss #5A7A4A` / `--moss-deep #1A3C2A` / `--moss-soft #7DBF8A` / `--sage #A8BBA0` |
| 强调 | `--red #D64550`（像素苹果红、警示）、`--orange #E8A87C`、`--honey #F0D58C` |
| 阴影 | 只用暖棕阴影（`--shadow-1/2`），禁止 `rgba(0,0,0,*)` 硬阴影 |
| 圆角 | 卡片 `--r 18px`，小控件 `--r-sm 12px`，胶囊 `--r-full` |
| 质感 | 毛玻璃 `var(--glass)` + 1px 暖描边 `--line` + 手绘抖动描边（`.hand`） |
| 装饰 | 波点（暖棕）、像素叶片、线条小狗（`decor.ts`），只出现在卡片角落/加载页/空状态，**不遮挡内容、不可点击** |
| 像素元素 | 所有图标/徽章/边框装饰用像素 SVG（`icons.ts`），`image-rendering: pixelated` |
| 动效 | 轻柔缓慢：`--dur .28s`、`--ease` 回弹；呼吸/摇摆类动画 3–6s 循环；尊重 `prefers-reduced-motion` |
| 护眼 | `<html data-eye="soft|warm|night">` 三档，设置页可切换；`soft` 为默认（低蓝光暖纸） |
| 移动端 | 侧栏 200px ⇄ 折叠 72px；≤880px 自动变抽屉。**禁止底部 Tab / 悬浮窗** |

字号：正文 15–16px，行高 1.7（护眼）；标题用 `--font` 加 0.5px 字距。

---

## 1. 目录结构

```
src/
  main.ts            应用外壳：侧栏导航 + 路由分发
  modules/<id>.ts    每个板块一个文件，导出 ModuleDef
  core/              db / store / supabase / router / notify / push / image / exporter / coins / date
  ui/                dom / components / charts / gallery / icons / decor
  data/presets.ts    预设植物、单词、名句、好书、电影等
  styles/            tokens.css / base.css / ui.css
api/                 Vercel Serverless Functions（push、cron）
supabase/migrations/ PostgreSQL 迁移 + RLS
public/              manifest.json / sw.js / icons/
```

---

## 2. 数据模型（IndexedDB 表名 = Supabase 表名）

**每一行都必须有**：`id: string`（uuid）、`user_id: string`、`created_at: number`（ms）、`updated_at: number`。
本地模式 `user_id = 'local'`；云端模式为 Supabase auth uid。

| 表 | 关键字段 |
|---|---|
| `todos` | title, date(`YYYY-MM-DD`), time(`HH:mm`\|''), done:boolean, done_at, source(`manual`\|`plant`\|`reminder`\|`study`), source_ref, locked:boolean |
| `plants` | name, category(`hydro2`\|`hydro10`\|`soil`), planted_at(`YYYY-MM-DD`), status(`seed`\|`sprout`\|`growing`\|`flowering`\|`dormant`), note |
| `plant_logs` | plant_id, date, text, tags:string[]（换水/浇水/施肥/修剪/观察）, feedback（发芽/生长/开花/休眠/茂盛）, photos:string[] |
| `inspirations` | kind(`book`\|`quote`\|`movie`\|`knowledge`\|`beads`\|`words`), title, body, cover, source, url, tags:string[], favorite:boolean |
| `quotes` | text, author, source, tags:string[] |
| `words` | word, phonetic, meaning, example, example_cn, date, stage(`new`\|`review`), learned:boolean |
| `word_logs` | word_id, date, correct:boolean, recording:boolean |
| `accounts` | kind(`daily`\|`fixed`\|`income`\|`coin`\|`wish`), balance:number, quota:number, month(`YYYY-MM`) |
| `transactions` | kind(`variable`\|`fixed`\|`income`\|`coin`\|`wish`), amount, category, date, note, photos:string[] |
| `fixed_items` | name, amount, day:number, active:boolean, last_charged(`YYYY-MM`), skip_months:string[] |
| `shopping` | name, price, qty, date, status(`pending`\|`bought`), bought_at |
| `wishes` | title, tier(10\|20\|50\|100), status(`open`\|`done`), date |
| `gold_prices` | date, intl, domestic, change, high, low |
| `couple` | start_date, title |
| `couple_logs` | date, text, photos:string[] |
| `memos` | date, text, photos:string[] |
| `reminders` | type(`birthday`\|`contact`\|`custom`), title, calendar(`solar`\|`lunar`), date, advance:number, repeat(`none`\|`yearly`\|`monthly`\|`weekly`), time, contact, phone, note, done_dates:string[] |
| `coins` | date, amount, kind(`todo`\|`study`\|`save`\|`combo`), reason |
| `achievements` | key, unlocked_at |
| `settings` | key, value (any) |
| `push_subs` | endpoint, keys(json), ua |

照片统一存 **WebP dataURL 字符串**（≤200KB）于 `photos` 数组；配置 Supabase 后由 `core/supabase.ts` 自动上传到 Storage 并替换为 `https://…` 链接。

---

## 3. 核心 API（必须使用，不要重复造轮子）

### `core/db.ts`
```ts
db.all<T>(table): Promise<T[]>                  // 按 created_at 倒序
db.get<T>(table, id): Promise<T|undefined>
db.put<T>(table, row: Partial<T>): Promise<T>   // 自动补 id/user_id/时间戳
db.remove(table, id): Promise<void>
db.where<T>(table, pred): Promise<T[]>
db.clear(table): Promise<void>
db.bulkPut(table, rows): Promise<void>
db.exportAll(): Promise<Record<string, unknown[]>>
db.importAll(payload, mode:'merge'|'replace'): Promise<void>
on('change', (table) => …)                      // 任意写操作后触发
```

### `core/store.ts`（应用级状态 + 事件）
```ts
state: { settings, accounts, plants, todos, …缓存 }
await store.ready()                 // 首次启动：建表 + 写入预设
store.settings()                    // Record<string, any>
await store.setSetting(key, value)
store.on(evt, cb) / store.emit(evt, payload)
evt: 'change' | 'route' | 'toast' | 'banner' | 'coins'
await store.refresh(module?)        // 重新加载缓存并广播
```

### `core/date.ts`
`today()`, `ymd(d)`, `addDays(s,n)`, `diffDays(a,b)`, `fmt(s,'M月D日 周X')`, `weekdayCN`, `lunarToSolar(y,m,d)`（内置 1900–2100 农历表）、`nextAnniversary(start)`、`daysTogether(start)`

### `core/coins.ts`
`award(kind, amount, reason)` / `summary(startYmd,endYmd)` / `weekKey(date)` / `checkPopup()`
规则：每日可变支出 0元→0币、1–15元→2币、16–30元→1币、≥31元→0币；每周上限 14 币。
组合技：晨间（待办全完成 + 已读满4篇）+1；阅读（已读满4篇 + 收藏≥1）+0.5；记录（情侣日志/备忘录单次≥100字且含手绘插图）+0.5。
奖励额度：各独立计算，不设总封顶；10/20/50/100 弹窗庆祝。

### `core/notify.ts` / `core/push.ts`
```ts
notify.banner(text, opts?)          // 站内横幅（右下角滑入，可点开）
notify.toast(text, type?)           // 轻提示
notify.system(title, body, data?)   // 系统级：Notification API（锁屏可见）
await push.enable()                 // 申请权限 + PushManager.subscribe + 上报后端
await push.disable()
push.status()                       // 'unsupported'|'default'|'granted'|'denied'|'subscribed'
```

### `core/image.ts`
```ts
await image.compress(file, { maxBytes: 200*1024, maxSide: 1600 }): Promise<{dataUrl, blob, width, height, bytes}>
await image.pick({ multiple: true, onProgress? }): Promise<Result[]>   // 弹系统相册
```

### `core/exporter.ts`
`exporter.json()` / `exporter.csv(table?)` / `exporter.txt(text, name)` / `exporter.pickImport()`

### `ui/dom.ts`（轻量 h 函数，无框架）
```ts
h(tag, props?, ...children): HTMLElement   // props: class/style/on*/dataset/attrs；child 可为 string|Node|null
frag(...children): DocumentFragment
svg(tag, props?, ...children): SVGElement  // 命名空间正确
mount(parent, ...children): parent         // 清空并挂载
on(el, evt, sel, handler)                  // 事件委托
qs(el, sel) / qsa(el, sel)
esc(str): string                           // XSS 过滤（所有用户输入渲染前必须过）
```

### `ui/components.ts`
```ts
Card({ title?, subtitle?, icon?, actions?, body, footer?, className? }): HTMLElement
Button(label, { variant:'primary'|'ghost'|'soft'|'danger'|'pixel', icon?, size?, onClick }): HTMLButtonElement
IconButton(name, { title, onClick })
Field(label, control, { hint?, required? }): HTMLElement
Input({ value, placeholder, type, onInput, onEnter }): HTMLInputElement
TextArea({ value, rows, onInput })
Select(options, { value, onChange })
DatePicker({ value, onChange }) / TimePicker({ value, onChange })
NumberInput({ value, min, max, step, onChange })
Chips(items, { value, multi, onChange })     // 标签/筛选
Segmented(items, { value, onChange })
Modal({ title, body, actions, width? }): { close(): void; el: HTMLElement }
confirmDialog(title, text?): Promise<boolean>
Toast(text, type?) / Banner(text, opts?)
EmptyState({ icon?, title, text?, action? })
Stat({ label, value, unit?, tone?, icon? }): HTMLElement
ListRow({ icon?, title, meta?, right?, onClick?, thumb? })
ProgressBar(pct, tone?)
Tag(text, tone?)
Skeleton()
SectionTitle(text, { icon?, extra? })
```

### `ui/charts.ts`（纯手写 SVG，零依赖）
```ts
lineChart({ series:[{name,color,points:[{x,y}]}], height?, yFormat?, grid? }): SVGSVGElement
barChart({ items:[{label,value,color?}], height?, horizontal? }): SVGSVGElement
pieChart({ items:[{label,value,color}], size?, donut? }): SVGSVGElement
heatmap({ days:[{date,value}] })
sparkline(values, color?)
```
图表配色只用主题绿/棕/蜂蜜黄，网格线 `--line-soft`，坐标文字 `--ink-faint`。

### `ui/gallery.ts`
```ts
Gallery(photos, { cols:3, onDelete?, onAdd? }): HTMLElement   // 九宫格缩略图
Lightbox(photos, startIndex)                                   // 全屏放大 + 左右滑动 + 双指缩放
Uploader({ multiple, max, onChange, label? }): HTMLElement      // 压缩 WebP ≤200KB
```

### `ui/icons.ts`
```ts
pixelIcon(name, size=20, color?): SVGSVGElement   // 像素图标（18×18 网格）
PIXEL_NAMES: string[]
dogLine(size=64, tone?): SVGElement               // 线条小狗
leafDecor(size), dotPattern(el)                   // 波点/叶片装饰
```
可用图标名见文件内 `ART` 表；新增图标请沿用同一 18×18 网格与绿色系。

### `ui/decor.ts`
`corners(el, kind?)` 给卡片四角加波点/叶片；`paperTexture(el)`；`emptyForest()` 空状态插画；`loadingForest()` 启动动画。

---

## 4. 模块接口（`src/modules/<id>.ts`）

```ts
import type { ModuleDef } from '../types';

export const plantsModule: ModuleDef = {
  id: 'plants',                 // 路由 id：#/plants
  title: '植物养护',
  icon: 'plant',                // pixelIcon 名称
  order: 2,                     // 侧栏顺序
  async render(el, ctx) { … },  // ctx: { params, query, go(hash), refresh() }
  async onEnter?(ctx) {},       // 进入时（如同步、刷新行情）
  onLeave?() {},
};
```
`main.ts` 自动收集 `src/modules/index.ts` 中导出的所有模块并按 `order` 排列。
**路由**：`#/<id>`；二级页 `#/<id>/<sub>/<param>`，用 `ctx.params` 读取。
切换模块必须 `mount(el, …)` 清空容器，禁止遗留定时器（用 `ctx.onCleanup(fn)` 注册清理）。

侧栏顺序（强制，不增不减）：
1 今日中枢 `hub` · 2 植物养护 `plants` · 3 灵感补给站 `inspire` · 4 财富工坊 `wealth`
5 时光胶囊 `capsule` · 6 智能提醒中心 `remind` · 7 成就殿堂 `trophy` · 8 设置 `settings`

单词学习为二级页：`#/hub/words`（今日中枢每日学习卡进入）与 `#/inspire/words`。

---

## 5. 编码红线

1. 用户输入渲染前必须 `esc()`；禁止 `innerHTML = 用户数据`。
2. 禁止引入第三方 UI/图表/日期库（体积与 CSP 约束）。零运行时依赖。
3. 每个异步渲染函数必须有 loading 与错误兜底（`EmptyState` + 重试按钮）。
4. 时间一律存 `YYYY-MM-DD` 字符串或 ms 数值，禁止 `Date` 对象入库。
5. 金额统一 `number`，展示用 `fmtMoney()`，保留两位。
6. 所有写操作走 `db.put`，写完 `await store.refresh()` 让其它板块同步。
7. 移动端优先：最小点击区 44×44，横向滚动容器加 `-webkit-overflow-scrolling:touch`。
8. `prefers-reduced-motion` 下关闭循环动效。
