/* 雅思语料自检：词库去重与分类统计、备考文章完整性
   用法： npm run check:ielts  （esbuild 打包后 node 执行） */
import {
  IELTS_WORDS, IELTS_WORD_PACKS, IELTS_WORD_DUPLICATES, countByCategory,
  WORD_CATEGORY_LABEL, type WordCategory,
} from '../src/data/words';
import { IELTS_ARTICLES } from '../src/data/ielts-articles';
import { IELTS_COURSES, IELTS_LESSONS } from '../src/data/courses';

let fails = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

console.log('=== 词库 ===');
const counts = countByCategory();
for (const [k, v] of Object.entries(counts)) {
  console.log(`     ${WORD_CATEGORY_LABEL[k as WordCategory].padEnd(6)} ${String(v).padStart(4)} 词`);
}
console.log(`     合计 ${IELTS_WORDS.length} 词（分片原始 ${IELTS_WORD_PACKS.reduce((s, p) => s + p.words.length, 0)} 条，跨分片去重 ${IELTS_WORD_DUPLICATES.length} 条）`);

ok('雅思核心词 ≥ 1000', IELTS_WORDS.length >= 1000, `实际 ${IELTS_WORDS.length}`);
ok('八个分片齐全', IELTS_WORD_PACKS.length === 8, `实际 ${IELTS_WORD_PACKS.length}`);
ok('四个分类都有词', Object.values(counts).every((v) => v > 0), Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
ok('词条无重复', new Set(IELTS_WORDS.map((w) => w[0].toLowerCase())).size === IELTS_WORDS.length);

const bad = IELTS_WORDS.filter((w) => !w[0] || !w[1] || !w[2] || !w[3] || !w[4] || !w[5]);
ok('每条 6 个字段且非空', bad.length === 0, bad.slice(0, 3).map((b) => JSON.stringify(b)).join(' '));
const noSlash = IELTS_WORDS.filter((w) => !/^\/.+\/$/.test(String(w[1]).trim()));
ok('音标格式合规（/.../）', noSlash.length === 0, noSlash.slice(0, 5).map((w) => `${w[0]}→${w[1]}`).join(' '));
const noPos = IELTS_WORDS.filter((w) => !/(n\.|v\.|adj\.|adv\.|prep\.|phr\.|conj\.|pron\.|num\.|art\.)/.test(String(w[2])));
ok('释义带词性', noPos.length === 0, noPos.slice(0, 5).map((w) => `${w[0]}→${w[2]}`).join(' '));
const badCat = IELTS_WORDS.filter((w) => !(String(w[5]) in WORD_CATEGORY_LABEL));
ok('分类取值合法', badCat.length === 0, badCat.slice(0, 3).map((w) => `${w[0]}→${w[5]}`).join(' '));
const shortEx = IELTS_WORDS.filter((w) => String(w[3]).split(/\s+/).length < 6);
ok('例句长度合理（≥6 词）', shortEx.length === 0, shortEx.slice(0, 3).map((w) => `${w[0]}: ${w[3]}`).join(' | '));
const cnInEn = IELTS_WORDS.filter((w) => /[\u4e00-\u9fa5]/.test(String(w[3])));
ok('英文例句不含中文', cnInEn.length === 0, cnInEn.slice(0, 3).map((w) => w[0]).join(' '));

console.log('\n=== 备考文章 ===');
ok('文章正好 30 篇', IELTS_ARTICLES.length === 30, `实际 ${IELTS_ARTICLES.length}`);
ok('slug 唯一', new Set(IELTS_ARTICLES.map((a) => a.slug)).size === IELTS_ARTICLES.length);
const shortBody = IELTS_ARTICLES.filter((a) => a.body.replace(/\s/g, '').length < 400);
ok('每篇正文 ≥400 字', shortBody.length === 0, shortBody.map((a) => a.slug).join(' '));
const mdLeft = IELTS_ARTICLES.filter((a) => /(^|\n)[#*-]\s|\*\*/.test(a.body));
ok('正文不含 markdown 标记', mdLeft.length === 0, mdLeft.map((a) => a.slug).join(' '));
const noSummary = IELTS_ARTICLES.filter((a) => !a.summary);
ok('每篇都有摘要', noSummary.length === 0);

console.log('\n=== 课程 ===');
ok('四门课', IELTS_COURSES.length === 4, IELTS_COURSES.map((c) => c.slug).join(' '));
ok('课程 slug 唯一', new Set(IELTS_COURSES.map((c) => c.slug)).size === IELTS_COURSES.length);
ok('课数 36 节', IELTS_LESSONS.length === 36, `实际 ${IELTS_LESSONS.length}`);
ok('课 slug 唯一', new Set(IELTS_LESSONS.map((l) => l.slug)).size === IELTS_LESSONS.length);
const badEx = IELTS_LESSONS.filter((l) => !Array.isArray(l.exercises) || l.exercises.length < 3);
ok('每节 ≥3 道练习', badEx.length === 0, badEx.map((l) => l.slug).join(' '));
const badAns = IELTS_LESSONS.flatMap((l) => (l.exercises ?? [])
  .map((e, i) => ({ slug: l.slug, i, e }))
  .filter(({ e }) => !Array.isArray(e.options) || e.options.length < 2 || e.answer < 0 || e.answer >= e.options.length));
ok('每题 answer 下标合法', badAns.length === 0, badAns.slice(0, 4).map((b) => `${b.slug}#${b.i + 1}`).join(' '));
const badBody = IELTS_LESSONS.filter((l) => String(l.body ?? '').replace(/\s/g, '').length < 400);
ok('每节讲解 ≥400 字', badBody.length === 0, badBody.map((l) => l.slug).join(' '));
const badCourse = IELTS_LESSONS.filter((l) => !IELTS_COURSES.some((c) => c.slug === l.course));
ok('每节都挂在存在的课程上', badCourse.length === 0, badCourse.slice(0, 3).map((l) => l.slug).join(' '));
ok('每门课 9 节', IELTS_COURSES.every((c) => IELTS_LESSONS.filter((l) => l.course === c.slug).length === 9));
const noPoints = IELTS_LESSONS.filter((l) => !Array.isArray(l.key_points) || l.key_points.length < 3);
ok('每节 ≥3 条要点', noPoints.length === 0, noPoints.map((l) => l.slug).join(' '));

console.log(fails ? `\n${fails} 项失败` : '\n全部通过 ✓');
process.exit(fails ? 1 : 0);
