/* ==========================================================================
   modules/ielts.ts · 雅思备考专区（灵感补给站的二级页）
   路由：
     #/inspire/ielts                          专区首页（课程 / 文章 / 词库 三入口）
     #/inspire/ielts/course                   课程列表
     #/inspire/ielts/course/<courseSlug>      单元与课表
     #/inspire/ielts/course/<slug>/<lesson>   单课讲解 + 练习判分
     #/inspire/ielts/article                  备考文章列表
     #/inspire/ielts/article/<inspId>         文章详情
     #/inspire/ielts/words                    雅思核心词库（复用单词学习页）
   数据： courses / lessons / words（kind='ielts'）/ inspirations（kind='ielts'）
   ========================================================================== */

import { h, mount, clear, debounce } from '../ui/dom';
import { pixelIcon } from '../ui/icons';
import {
  Button, Card, EmptyState, IconButton, Input, ListRow, ProgressBar, SectionTitle, Stat, Tag, Toast,
} from '../ui/components';
import { store } from '../core/store';
import { fmtDate, today } from '../core/date';
import { award, coinsOn, settleDay } from '../core/coins';
import { checkAchievements } from '../core/stats';
import { renderWordStudy, speakInline } from './words';
import { currentFilter, stats as wordStats } from '../core/words';
import type { Course, Inspiration, Lesson, LessonExercise, LessonKind, ModuleCtx } from '../types';

const STUDY_DAILY_CAP = 0.6;

const LESSON_KIND_META: Record<LessonKind, { label: string; icon: string }> = {
  listening: { label: '听力', icon: 'speaker' },
  reading: { label: '阅读', icon: 'book' },
  writing: { label: '写作', icon: 'edit' },
  speaking: { label: '口语', icon: 'mic' },
  vocab: { label: '词汇', icon: 'leaf' },
  grammar: { label: '语法', icon: 'list' },
};

function courseIcon(slug: string): string {
  return LESSON_KIND_META[slug as LessonKind]?.icon ?? 'inspire';
}

/* ------------------------------ 数据读取 ------------------------------ */
function allCourses(): Course[] {
  return store.list('courses').slice().sort((a, b) => a.order - b.order);
}
function lessonsOf(courseId: string): Lesson[] {
  return store
    .list('lessons')
    .filter((l) => l.course_id === courseId)
    .sort((a, b) => a.unit_no - b.unit_no || a.order - b.order);
}
function courseProgress(courseId: string): { done: number; total: number; avg: number } {
  const lessons = lessonsOf(courseId);
  const done = lessons.filter((l) => l.done);
  const avg = done.length ? Math.round(done.reduce((s, l) => s + Number(l.score || 0), 0) / done.length) : 0;
  return { done: done.length, total: lessons.length, avg };
}
function articles(): Inspiration[] {
  return store.list('inspirations').filter((i) => i.kind === 'ielts').sort((a, b) => a.created_at - b.created_at);
}
function readIds(): Set<string> {
  return new Set(store.list('reads').filter((r) => r.kind === 'ielts').map((r) => r.inspire_id));
}
function lessonHref(courseSlug: string, lesson: Lesson): string {
  return `#/inspire/ielts/course/${courseSlug}/${lesson.id.replace(/^lesson_/, '')}`;
}
function excerpt(text: string, len = 72): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

/** 从「中文讲解 + 英文例句」混排段落里抽出成句的英文（≥6 词才算，避免误抓单词） */
function englishSentences(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').matchAll(/[A-Za-z][A-Za-z0-9 ,;:'"()\-]*?[.?!]/g)) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    if (s.split(/\s+/).length >= 6) out.push(s);
  }
  return out;
}

/** 渲染一段讲解：含英文例句时，在段落最前面加一个可点击的朗读图标 */
function bodyParagraph(para: string): HTMLElement {
  const text = para.trim();
  const en = englishSentences(text);
  if (!en.length) return h('p', { style: 'margin:0 0 12px' }, text);
  return h('div', { class: 'quote-line', style: 'margin:0 0 12px' },
    speakInline(en.join(' '), '朗读本段英文例句'),
    h('span', null, text),
  );
}

/* ==========================================================================
   专区首页
   ========================================================================== */
function hubView(el: HTMLElement, ctx: ModuleCtx, rerender: () => void): void {
  const courses = allCourses();
  const allLessons = store.list('lessons');
  const doneLessons = allLessons.filter((l) => l.done).length;
  const list = articles();
  const reads = readIds();
  const wf = currentFilter();
  const ws = wordStats({ book: 'ielts', category: 'all' });
  const weekReads = store.list('reads').filter((r) => r.kind === 'ielts' && r.date >= today().slice(0, 8) + '01').length;

  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考' },
  ]);

  if (!list.length && !allLessons.length) {
    mount(el, Card({
      icon: 'inspire',
      title: '雅思语料正在安装',
      subtitle: '首次进入会自动安装（约 1–2 秒），装好后本页自动刷新',
      body: EmptyState({
        icon: 'seed',
        title: '还没有雅思内容',
        text: '如果长时间停在这里，请刷新页面；或到「设置 → 数据存储与云端」确认存储可用。',
        action: Button('刷新页面', { variant: 'primary', icon: 'refresh', onClick: () => location.reload() }),
      }),
      actions: [Button('刷新', { variant: 'ghost', icon: 'refresh', size: 'sm', onClick: () => rerender() })],
    }));
    return;
  }

  const hero = Card({
    variant: 'green',
    decor: true,
    icon: 'inspire',
    title: '雅思备考专区',
    subtitle: '四门课逐课精讲 · 30 篇原创备考文章 · 1050 个核心词（听力 / 阅读 / 写作 / 口语）',
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '课程', value: courses.length, unit: '门', tone: 'green', icon: 'inspire' }),
        Stat({ label: '已完成课数', value: `${doneLessons}/${allLessons.length}`, unit: '节', icon: 'check' }),
        Stat({ label: '备考文章', value: list.length, unit: '篇', tone: 'oak', icon: 'book' }),
        Stat({ label: '核心词库', value: ws.ielts, unit: '词', tone: 'honey', icon: 'leaf' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(allLessons.length ? (doneLessons / allLessons.length) * 100 : 0)),
      h('div', { class: 'tiny muted mt-2' }, `已读文章 ${reads.size}/${list.length} 篇 · 本月阅读记录 ${weekReads} 次 · 已掌握单词 ${ws.learned} 个`),
    ],
  });

  const entries = h('div', { class: 'grid grid-3' },
    ...[
      { icon: 'book', title: '雅思课程', desc: `${courses.length} 门课 ${allLessons.length} 节，讲解 + 要点 + 练习判分`, href: '#/inspire/ielts/course' },
      { icon: 'news', title: '备考文章', desc: `${list.length} 篇原创：题型技巧、评分标准、备考节奏`, href: '#/inspire/ielts/article' },
      { icon: 'leaf', title: '核心词库', desc: `${ws.ielts} 个雅思核心词，按听力/阅读/写作/口语筛选`, href: '#/inspire/ielts/words' },
    ].map((e) => {
      const c = Card({
        hoverable: true,
        decor: true,
        icon: e.icon,
        title: e.title,
        body: h('div', { class: 'tiny muted', style: 'line-height:1.85;min-height:48px' }, e.desc),
        footer: [Button('进入', { variant: 'primary', size: 'sm', icon: 'arrowRight', onClick: () => ctx.go(e.href) })],
      });
      c.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('button')) return;
        ctx.go(e.href);
      });
      return c;
    }),
  );

  const courseRows = h('div', { class: 'list' }, ...courses.map((c) => {
    const p = courseProgress(c.id);
    return ListRow({
      icon: courseIcon(c.slug),
      title: c.title,
      meta: `${c.subtitle} · 完成 ${p.done}/${p.total} 节${p.done ? ` · 平均 ${p.avg} 分` : ''}`,
      right: h('span', { style: 'display:flex;gap:4px;align-items:center' },
        Tag(c.level, 'honey'),
        IconButton('arrowRight', { title: '进入课程', onClick: () => ctx.go(`#/inspire/ielts/course/${c.slug}`) }),
      ),
      onClick: () => ctx.go(`#/inspire/ielts/course/${c.slug}`),
    });
  }));

  const recent = list.slice(0, 6);
  const articleRows = h('div', { class: 'grid grid-auto' }, ...recent.map((a) => {
    const done = reads.has(a.id);
    const card = Card({
      hoverable: true,
      icon: done ? 'check' : 'news',
      title: a.title,
      subtitle: `${a.source} · ${(a.tags ?? []).join(' / ')}`,
      body: h('div', { class: 'tiny muted', style: 'line-height:1.85;min-height:44px' }, a.summary || excerpt(a.body)),
      footer: [
        done ? Tag('已读', 'green') : Tag('未读', 'line'),
        Button('阅读', { variant: 'soft', size: 'sm', icon: 'arrowRight', onClick: () => ctx.go(`#/inspire/ielts/article/${a.id}`) }),
      ],
    });
    card.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      ctx.go(`#/inspire/ielts/article/${a.id}`);
    });
    return card;
  }));

  mount(el,
    hero,
    SectionTitle('三个入口', { icon: 'compass' }),
    entries,
    SectionTitle('课程进度', { icon: 'list' }),
    Card({ icon: 'inspire', title: '四门课', actions: [Button('全部课程', { variant: 'ghost', icon: 'arrowRight', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/course') })], body: courseRows }),
    SectionTitle('最新备考文章', { icon: 'news' }),
    recent.length ? articleRows : EmptyState({ icon: 'news', title: '暂无备考文章' }),
  );
}

/* ==========================================================================
   课程列表
   ========================================================================== */
function courseListView(el: HTMLElement, ctx: ModuleCtx): void {
  const courses = allCourses();
  const allLessons = store.list('lessons');
  const doneAll = allLessons.filter((l) => l.done).length;

  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '雅思课程' },
  ]);

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'trophy',
    title: '雅思课程',
    subtitle: '听力 / 阅读 / 写作 / 口语 · 每节含讲解、要点与练习判分',
    actions: [
      Button('核心词库', { variant: 'soft', icon: 'book', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/words') }),
      Button('返回专区', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go('#/inspire/ielts') }),
    ],
    body: [
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '课程', value: courses.length, unit: '门', tone: 'green', icon: 'inspire' }),
        Stat({ label: '总课数', value: allLessons.length, unit: '节', icon: 'list' }),
        Stat({ label: '已完成', value: doneAll, unit: '节', tone: 'honey', icon: 'check' }),
        Stat({ label: '整体进度', value: allLessons.length ? Math.round((doneAll / allLessons.length) * 100) : 0, unit: '%', tone: 'oak', icon: 'chart' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(allLessons.length ? (doneAll / allLessons.length) * 100 : 0)),
      h('div', { class: 'tiny muted mt-2' }, '每节课：看讲解 → 记要点 → 做练习 → 得分 ≥ 60 即算完成（每节 +0.2 金币，每日学习类金币上限 0.6）。'),
    ],
  });

  const pages = courses.map((c) => {
    const p = courseProgress(c.id);
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    const lessons = lessonsOf(c.id);
    return Card({
      icon: courseIcon(c.slug),
      title: c.title,
      subtitle: c.subtitle,
      body: [
        h('div', { class: 'article-body', style: 'font-size:14px' }, c.desc),
        h('div', { class: 'row row-wrap', style: 'gap:6px;margin:8px 0' },
          Tag(c.level, 'honey'),
          ...(c.tags ?? []).map((t) => Tag(t, 'line')),
        ),
        h('div', { class: 'row', style: 'justify-content:space-between;font-size:12px;color:var(--ink-faint)' },
          h('span', null, `完成 ${p.done}/${p.total} 节`),
          h('span', null, p.done ? `平均 ${p.avg} 分` : '还没开始'),
        ),
        h('div', { class: 'mt-2' }, ProgressBar(pct)),
        h('div', { class: 'mt-3' }, h('div', { class: 'row row-wrap' },
          ...lessons.slice(0, 9).map((l) => Button(`${l.order}. ${l.title.length > 10 ? `${l.title.slice(0, 10)}…` : l.title}`, {
            variant: l.done ? 'soft' : 'ghost',
            size: 'sm',
            icon: l.done ? 'check' : undefined,
            onClick: () => ctx.go(lessonHref(c.slug, l)),
          })),
        )),
      ],
      footer: [
        Button(p.done ? '继续学习' : '开始学习', { variant: 'primary', size: 'sm', icon: 'arrowRight', onClick: () => ctx.go(`#/inspire/ielts/course/${c.slug}`) }),
      ],
      decor: true,
    });
  });

  mount(el, head, SectionTitle('四门课', { icon: 'list' }), ...(pages.length ? pages : [EmptyState({ icon: 'seed', title: '课程还没安装好' })]));
}

/* ==========================================================================
   课程详情
   ========================================================================== */
function courseView(el: HTMLElement, ctx: ModuleCtx, course: Course): void {
  const lessons = lessonsOf(course.id);
  const p = courseProgress(course.id);
  const units = Array.from(new Set(lessons.map((l) => l.unit_no))).sort((a, b) => a - b);

  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '雅思课程', hash: '#/inspire/ielts/course' },
    { label: course.title },
  ]);

  const head = Card({
    variant: 'green',
    decor: true,
    icon: courseIcon(course.slug),
    title: course.title,
    subtitle: course.subtitle,
    actions: [
      Button('返回课程列表', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/course') }),
    ],
    body: [
      h('div', { class: 'article-body', style: 'font-size:14px' }, course.desc),
      h('div', { class: 'row row-wrap', style: 'gap:6px;margin-top:8px' },
        Tag(course.level, 'honey'),
        ...(course.tags ?? []).map((t) => Tag(t, 'line')),
      ),
      h('div', { class: 'grid grid-auto mt-3' },
        Stat({ label: '本课程进度', value: `${p.done}/${p.total}`, unit: '节', tone: 'green', icon: 'check' }),
        Stat({ label: '完成度', value: p.total ? Math.round((p.done / p.total) * 100) : 0, unit: '%', icon: 'chart' }),
        Stat({ label: '平均得分', value: p.done ? p.avg : '—', unit: p.done ? '分' : '', tone: 'honey', icon: 'star' }),
      ),
      h('div', { class: 'mt-3' }, ProgressBar(p.total ? (p.done / p.total) * 100 : 0)),
    ],
  });

  const blocks: Node[] = [head];
  for (const u of units) {
    const inUnit = lessons.filter((l) => l.unit_no === u);
    blocks.push(SectionTitle(inUnit[0]?.unit_title || `第 ${u} 单元`, { icon: 'list' }));
    blocks.push(h('div', { class: 'list' }, ...inUnit.map((l) => {
      const meta = LESSON_KIND_META[l.kind] ?? { label: l.kind, icon: 'list' };
      return ListRow({
        icon: l.done ? 'check' : meta.icon,
        title: l.title,
        meta: `${meta.label} · 约 ${l.minutes} 分钟 · ${(l.exercises ?? []).length} 道练习`,
        right: h('span', { style: 'display:flex;gap:4px;align-items:center' },
          l.done ? Tag(`${l.score} 分`, l.score >= 80 ? 'green' : 'honey') : Tag('未学习', 'line'),
          IconButton('arrowRight', { title: '开始学习', onClick: () => ctx.go(lessonHref(course.slug, l)) }),
        ),
        onClick: () => ctx.go(lessonHref(course.slug, l)),
      });
    })));
  }
  if (!units.length) blocks.push(EmptyState({ icon: 'seed', title: '这门课还没有内容' }));

  mount(el, ...blocks);
}

/* ==========================================================================
   单课（讲解 + 练习判分）
   ========================================================================== */
function lessonView(el: HTMLElement, ctx: ModuleCtx, course: Course, lesson: Lesson, rerender: () => void): void {
  const lessons = lessonsOf(course.id);
  const index = lessons.findIndex((l) => l.id === lesson.id);
  const next = lessons[index + 1];
  const prev = lessons[index - 1];
  const meta = LESSON_KIND_META[lesson.kind] ?? { label: lesson.kind, icon: 'list' };

  ctx.setTitle(lesson.title, `${course.title} · ${lesson.unit_title}`);
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '雅思课程', hash: '#/inspire/ielts/course' },
    { label: course.title, hash: `#/inspire/ielts/course/${course.slug}` },
    { label: lesson.title },
  ]);

  const bodyEl = h('div', { class: 'article-body' });
  for (const para of String(lesson.body ?? '').split('\n')) {
    if (!para.trim()) continue;
    bodyEl.appendChild(bodyParagraph(para));
  }

  const head = Card({
    variant: 'green',
    decor: true,
    icon: meta.icon,
    title: lesson.title,
    subtitle: `${lesson.unit_title} · ${meta.label} · 约 ${lesson.minutes} 分钟`,
    actions: [
      Button('返回课程', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(`#/inspire/ielts/course/${course.slug}`) }),
    ],
    body: [
      (lesson.key_points ?? []).length
        ? h('div', null,
          h('div', { class: 'section-title' }, pixelIcon('star', 15), h('span', null, '本课要点')),
          h('ul', { style: 'margin:0;padding-left:1.3em;line-height:2' },
            ...(lesson.key_points ?? []).map((k) => h('li', null, k)),
          ),
        )
        : null,
      lesson.done ? h('div', { class: 'mt-2' }, Tag(`已完成 · 最高分 ${lesson.score}`, lesson.score >= 80 ? 'green' : 'honey')) : null,
    ],
  });

  /* -------- 练习 -------- */
  const exercises: LessonExercise[] = Array.isArray(lesson.exercises) ? lesson.exercises : [];
  const answers: number[] = new Array(exercises.length).fill(-1);
  let submitted = false;
  const quizHost = h('div', { class: 'col' });
  const resultHost = h('div');
  const optionStore: HTMLButtonElement[][] = [];

  const renderQuiz = () => {
    clear(quizHost);
    optionStore.length = 0;
    exercises.forEach((ex, qi) => {
      const optWrap = h('div', { class: 'col', style: 'gap:6px' });
      const buttons: HTMLButtonElement[] = [];
      ex.options.forEach((opt, oi) => {
        const btn = h('button', {
          type: 'button',
          class: `chip ${answers[qi] === oi ? 'is-active' : ''}`.trim(),
          style: 'justify-content:flex-start;text-align:left;width:100%;min-height:38px;border-radius:12px;white-space:normal;height:auto;padding:8px 12px',
        }, `${String.fromCharCode(65 + oi)}. ${opt}`);
        btn.addEventListener('click', () => {
          if (submitted) return;
          answers[qi] = oi;
          buttons.forEach((b, i) => b.classList.toggle('is-active', i === oi));
        });
        buttons.push(btn);
        optWrap.appendChild(btn);
      });
      optionStore.push(buttons);
      quizHost.appendChild(h('div', { class: 'card', style: 'padding:14px' },
        h('div', { style: 'font-weight:700;margin-bottom:8px' }, `第 ${qi + 1} 题 · ${ex.q}`),
        optWrap,
      ));
    });
  };

  const grade = () => {
    const unanswered = answers.filter((a) => a < 0).length;
    if (unanswered) {
      Toast(`还有 ${unanswered} 题没选`, 'error');
      return;
    }
    submitted = true;
    let right = 0;
    const cards = Array.from(quizHost.children) as HTMLElement[];
    exercises.forEach((ex, qi) => {
      const ok = answers[qi] === ex.answer;
      if (ok) right += 1;
      (optionStore[qi] ?? []).forEach((b, oi) => {
        b.classList.remove('is-active');
        b.style.cursor = 'default';
        if (oi === ex.answer) {
          b.style.borderColor = 'var(--moss)';
          b.style.background = 'var(--moss-mist)';
          b.style.color = 'var(--moss-mid)';
        } else if (oi === answers[qi]) {
          b.style.borderColor = 'var(--red)';
          b.style.background = 'rgba(214,69,80,.1)';
          b.style.color = 'var(--red)';
        }
      });
      cards[qi]?.appendChild(h('div', { class: 'quote-block', style: 'margin-top:8px;font-size:13px' },
        h('b', null, ok ? '✓ 答对了：' : `✗ 正确答案 ${String.fromCharCode(65 + ex.answer)}：`),
        ex.explain,
      ));
    });

    const score = Math.round((right / exercises.length) * 100);
    clear(resultHost);
    resultHost.appendChild(h('div', { class: 'card', style: 'padding:14px' },
      h('div', { class: 'grid grid-auto' },
        Stat({ label: '答对', value: `${right}/${exercises.length}`, unit: '题', tone: right === exercises.length ? 'green' : 'honey', icon: 'check' }),
        Stat({ label: '得分', value: score, unit: '分', tone: score >= 60 ? 'green' : 'red', icon: 'target' }),
        Stat({ label: '判定', value: score >= 60 ? '完成' : '再来一次', tone: score >= 60 ? 'green' : 'red', icon: score >= 60 ? 'trophy' : 'refresh' }),
      ),
      h('div', { class: 'row row-wrap mt-3' },
        Button('重做一次', {
          variant: 'soft', icon: 'refresh',
          onClick: () => { submitted = false; answers.fill(-1); renderQuiz(); clear(resultHost); },
        }),
        next
          ? Button('下一课', { variant: 'primary', icon: 'arrowRight', onClick: () => ctx.go(lessonHref(course.slug, next)) })
          : Button('回到课程列表', { variant: 'primary', icon: 'check', onClick: () => ctx.go('#/inspire/ielts/course') }),
      ),
    ));

    void saveResult(lesson, score, rerender);
  };

  renderQuiz();

  const quizCard = Card({
    icon: 'edit',
    title: `练习（${exercises.length} 道）`,
    subtitle: '选完所有题目后点「提交并判分」，会逐题给出解析',
    body: [
      quizHost,
      h('div', { class: 'mt-3' }, Button('提交并判分', { variant: 'primary', icon: 'check', block: true, onClick: grade })),
      resultHost,
    ],
    footer: exercises.length ? [h('span', { class: 'tiny muted' }, '题目与解析均为原创，用来检验本课技巧是否掌握。')] : [],
  });

  const truncate = (s: string) => (s.length > 12 ? `${s.slice(0, 12)}…` : s);
  const nav = Card({
    icon: 'list',
    title: '课程导航',
    body: h('div', { class: 'row row-wrap' },
      prev ? Button(`上一课 · ${truncate(prev.title)}`, { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go(lessonHref(course.slug, prev)) }) : null,
      Button('课程目录', { variant: 'soft', icon: 'list', size: 'sm', onClick: () => ctx.go(`#/inspire/ielts/course/${course.slug}`) }),
      next ? Button(`下一课 · ${truncate(next.title)}`, { variant: 'primary', icon: 'arrowRight', size: 'sm', onClick: () => ctx.go(lessonHref(course.slug, next)) }) : null,
    ),
  });

  mount(el, head, Card({ icon: 'book', title: '讲解', body: bodyEl }), quizCard, nav);
}

async function saveResult(lesson: Lesson, score: number, rerender: () => void): Promise<void> {
  const first = !lesson.done;
  await store.patch('lessons', lesson.id, {
    done: score >= 60 ? true : lesson.done,
    score: Math.max(Number(lesson.score || 0), score),
    done_at: Date.now(),
  });

  if (score >= 60) {
    const remain = STUDY_DAILY_CAP - coinsOn(today(), 'study');
    if (remain > 0) await award('study', Math.min(0.2, remain), `雅思课程：${lesson.title.slice(0, 14)}`, today());
    await checkAchievements(true);
    Toast(first ? `完成「${lesson.title.slice(0, 12)}」· ${score} 分` : `本次 ${score} 分（保留最高分）`, 'success');
  } else {
    Toast(`本次 ${score} 分，建议重看讲解后重做一次`, 'error');
  }
  rerender();
}

/* ==========================================================================
   文章列表 / 详情
   ========================================================================== */
function articleListView(el: HTMLElement, ctx: ModuleCtx, rerender: () => void): void {
  const list = articles();
  const reads = readIds();
  let keyword = '';
  let only: 'all' | 'unread' | 'read' | 'fav' = 'all';
  const host = h('div', { class: 'grid grid-auto' });
  const countEl = h('span', { class: 'tiny muted' });

  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '备考文章' },
  ]);

  const renderList = () => {
    clear(host);
    const hits = list.filter((a) => {
      if (only === 'read' && !reads.has(a.id)) return false;
      if (only === 'unread' && reads.has(a.id)) return false;
      if (only === 'fav' && !a.favorite) return false;
      if (!keyword) return true;
      return a.title.includes(keyword) || a.body.includes(keyword) || (a.tags ?? []).some((t) => t.includes(keyword));
    });
    for (const a of hits) {
      const done = reads.has(a.id);
      const card = Card({
        hoverable: true,
        icon: done ? 'check' : 'news',
        title: a.title,
        subtitle: `${a.source} · ${(a.tags ?? []).join(' / ')}`,
        body: h('div', { class: 'tiny muted', style: 'line-height:1.85;min-height:44px' }, a.summary || excerpt(a.body, 84)),
        footer: [
          done ? Tag('已读', 'green') : Tag('未读', 'line'),
          a.favorite ? Tag('已收藏', 'honey') : null,
          Button('阅读', { variant: 'soft', size: 'sm', icon: 'arrowRight', onClick: () => ctx.go(`#/inspire/ielts/article/${a.id}`) }),
        ],
      });
      card.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('button')) return;
        ctx.go(`#/inspire/ielts/article/${a.id}`);
      });
      host.appendChild(card);
    }
    if (!hits.length) host.appendChild(EmptyState({ icon: 'search', title: '没有匹配的文章', text: '换个关键词，或把筛选切回「全部」。' }));
    countEl.textContent = `共 ${list.length} 篇 · 命中 ${hits.length} 篇 · 已读 ${reads.size} 篇`;
  };

  const head = Card({
    variant: 'green',
    decor: true,
    icon: 'news',
    title: '雅思备考文章',
    subtitle: '全部原创：考试结构、评分标准、四项技巧、备考节奏与常见误区',
    actions: [
      Button('雅思课程', { variant: 'soft', icon: 'inspire', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/course') }),
      Button('返回专区', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go('#/inspire/ielts') }),
    ],
    body: [
      h('div', { class: 'row row-wrap', style: 'gap:10px;margin-bottom:10px' },
        Input({
          placeholder: '搜索标题 / 正文 / 标签…',
          onInput: debounce((v: string) => { keyword = v; renderList(); }, 240) as (v: string) => void,
        }),
      ),
      h('div', { class: 'row row-wrap', style: 'gap:6px' },
        ...([['all', '全部'], ['unread', '未读'], ['read', '已读'], ['fav', '已收藏']] as const).map(([v, l]) =>
          Button(l, {
            variant: only === v ? 'primary' : 'ghost',
            size: 'sm',
            onClick: () => { only = v; renderList(); rerender; },
          })),
      ),
      h('div', { class: 'mt-2' }, countEl),
    ],
  });

  renderList();
  mount(el, head, host);
}

function articleDetailView(el: HTMLElement, ctx: ModuleCtx, article: Inspiration, rerender: () => void): void {
  const done = readIds().has(article.id);

  ctx.setTitle(article.title, `雅思备考 · ${article.source}`);
  ctx.setBreadcrumb([
    { label: '工作台' },
    { label: '灵感补给站', hash: '#/inspire' },
    { label: '雅思备考', hash: '#/inspire/ielts' },
    { label: '备考文章', hash: '#/inspire/ielts/article' },
    { label: excerpt(article.title, 14) },
  ]);

  const bodyEl = h('div', { class: 'article-body' });
  for (const para of String(article.body ?? '').split('\n')) {
    if (!para.trim()) continue;
    bodyEl.appendChild(h('p', { style: 'margin:0 0 13px' }, para.trim()));
  }

  const markRead = async () => {
    if (done) {
      const row = store.list('reads').find((r) => r.inspire_id === article.id && r.kind === 'ielts');
      if (row) await store.drop('reads', row.id);
      Toast('已取消已读', 'default');
    } else {
      const exist = store.list('reads').find((r) => r.inspire_id === article.id && r.date === today());
      if (!exist) await store.save('reads', { date: today(), inspire_id: article.id, kind: 'ielts' });
      await settleDay(today(), true);
      await checkAchievements(true);
      Toast('已记录阅读 · 满 4 篇可触发阅读套餐 +0.5 金币', 'success');
    }
    rerender();
  };

  const toggleFav = async () => {
    await store.patch('inspirations', article.id, { favorite: !article.favorite });
    Toast(article.favorite ? '已取消收藏' : '已收藏（阅读套餐条件之一）', 'success');
    rerender();
  };

  const head = Card({
    variant: 'green',
    decor: true,
    icon: done ? 'check' : 'news',
    title: article.title,
    subtitle: `${article.source} · ${(article.tags ?? []).join(' / ')}`,
    actions: [
      Button('返回列表', { variant: 'ghost', icon: 'arrowLeft', size: 'sm', onClick: () => ctx.go('#/inspire/ielts/article') }),
    ],
    body: h('div', { class: 'row row-wrap' },
      Button(done ? '已读（点击取消）' : '标记为已读', { variant: done ? 'soft' : 'primary', icon: 'check', size: 'sm', onClick: () => void markRead() }),
      Button(article.favorite ? '取消收藏' : '收藏', { variant: 'ghost', icon: 'heart', size: 'sm', onClick: () => void toggleFav() }),
      Button('复制正文', {
        variant: 'ghost', icon: 'list', size: 'sm',
        onClick: () => {
          void navigator.clipboard?.writeText(`${article.title}\n\n${article.body}`).then(
            () => Toast('正文已复制', 'success'),
            () => Toast('复制失败，请手动选择文本', 'error'),
          );
        },
      }),
    ),
  });

  mount(el, head, Card({ icon: 'book', title: '正文', body: bodyEl }));
}

/* ==========================================================================
   入口
   ========================================================================== */
export async function renderIelts(el: HTMLElement, ctx: ModuleCtx): Promise<void> {
  const section = ctx.params[1] ?? '';
  const slug = ctx.params[2] ?? '';
  const rerender = () => { void renderIelts(el, ctx); };

  if (section === 'words') {
    await renderWordStudy(el, ctx, { backHash: '#/inspire/ielts', backLabel: '雅思备考' });
    return;
  }

  const courses = allCourses();

  if (section === 'course') {
    if (!courses.length) {
      mount(el, EmptyState({
        icon: 'seed',
        title: '课程语料正在安装',
        text: '首次进入会自动安装，装好后刷新即可。',
        action: Button('刷新', { variant: 'primary', icon: 'refresh', onClick: () => location.reload() }),
      }));
      return;
    }
    if (!slug) {
      courseListView(el, ctx);
      return;
    }
    const course = courses.find((c) => c.slug === slug);
    if (!course) {
      mount(el, EmptyState({
        icon: 'search',
        title: '找不到这门课',
        text: `课程「${slug}」不存在，可能语料已更新。`,
        action: Button('回到课程列表', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/inspire/ielts/course') }),
      }));
      return;
    }
    const lessonSlug = ctx.params[3] ?? '';
    if (!lessonSlug) {
      courseView(el, ctx, course);
      return;
    }
    const lesson = store.list('lessons').find((l) => l.id === `lesson_${lessonSlug}` || l.id === lessonSlug);
    if (!lesson) {
      mount(el, EmptyState({
        icon: 'search',
        title: '找不到这节课',
        action: Button('回到课程', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go(`#/inspire/ielts/course/${course.slug}`) }),
      }));
      return;
    }
    lessonView(el, ctx, course, lesson, rerender);
    return;
  }

  if (section === 'article') {
    const list = articles();
    if (!slug) {
      articleListView(el, ctx, rerender);
      return;
    }
    const article = list.find((a) => a.id === slug || a.id === `insp_ielts_${slug}`);
    if (!article) {
      mount(el, EmptyState({
        icon: 'search',
        title: '找不到这篇文章',
        action: Button('回到文章列表', { variant: 'primary', icon: 'arrowLeft', onClick: () => ctx.go('#/inspire/ielts/article') }),
      }));
      return;
    }
    articleDetailView(el, ctx, article, rerender);
    return;
  }

  ctx.setTitle('雅思备考', '课程 · 备考文章 · 核心词库');
  hubView(el, ctx, rerender);
}

export type { Course, Lesson };
