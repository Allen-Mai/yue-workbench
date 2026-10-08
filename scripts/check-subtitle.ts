/* 字幕/时间轴解析自检：SRT / WebVTT / 带时间戳文本 / 纯文本
   用法： npm run check:subtitle */
import { subtitle } from '../src/core/subtitle';

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got=${got} want=${want}`);
};
const ok = (label: string, cond: boolean, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

console.log('=== 时间码 ===');
eq('01:12 → 秒', subtitle.parseTimecode('01:12'), 72);
eq('00:01:23,456 → 秒', subtitle.parseTimecode('00:01:23,456').toFixed(3), '83.456');
eq('00:00:12.500 → 秒', subtitle.parseTimecode('00:00:12.500'), 12.5);
eq('formatTime(72)', subtitle.formatTime(72), '01:12');
eq('formatTime(3661)', subtitle.formatTime(3661), '1:01:01');
eq('formatTime(0)', subtitle.formatTime(0), '00:00');

console.log('\n=== SRT ===');
const srt = [
  '1',
  '00:00:01,000 --> 00:00:03,500',
  'Hello, this is the first line.',
  '',
  '2',
  '00:00:03,500 --> 00:00:06,000',
  'And here is the <i>second</i> one.',
  '',
  '3',
  '00:01:12,000 --> 00:01:15,000',
  'Third cue after a minute.',
].join('\n');
const srtCues = subtitle.parseSrt(srt);
eq('条目数', srtCues.length, 3);
eq('第 1 条开始', srtCues[0].start, 1);
eq('第 1 条结束', srtCues[0].end, 3.5);
eq('第 1 条文本', srtCues[0].text, 'Hello, this is the first line.');
eq('HTML 标签已剥离', srtCues[1].text, 'And here is the second one.');
eq('第 3 条开始', srtCues[2].start, 72);

console.log('\n=== WebVTT ===');
const vtt = [
  'WEBVTT',
  '',
  'cue-1',
  '00:00:01.000 --> 00:00:03.500',
  'Hello from VTT.',
  '',
  '00:00:03.500 --> 00:00:06.000',
  'Second VTT cue.',
].join('\n');
const vttCues = subtitle.parseVtt(vtt);
eq('条目数', vttCues.length, 2);
eq('第 2 条开始', vttCues[1].start, 3.5);
eq('cue id 行不混入正文', vttCues[0].text, 'Hello from VTT.');

console.log('\n=== 带时间戳的纯文本 ===');
const stamped = ['[00:01] First sentence.', '[00:05] Second sentence.', '[01:12] Third sentence.'].join('\n');
const st = subtitle.parseSubtitle(stamped, 'plain');
eq('格式识别', st.format, 'timestamped');
eq('条目数', st.cues.length, 3);
eq('第 3 条开始', st.cues[2].start, 72);
eq('末条 end 自动补', st.cues[2].end, 78);
eq('原文保留三行', st.transcript.split('\n').length, 3);

console.log('\n=== 无时间戳纯文本 ===');
const plain = 'Just some text\non multiple lines\n\nwith a blank one.';
const pl = subtitle.parseSubtitle(plain, 'plain');
eq('格式识别', pl.format, 'plain');
eq('无时间轴', pl.cues.length, 0);
eq('逐行显示 3 行', subtitle.transcriptToLines(pl.transcript).length, 3);

console.log('\n=== 当前句定位 ===');
eq('t=0（首条字幕之前）→ 无高亮', subtitle.cueAt(srtCues, 0), -1);
eq('t=2 → 第 1 条', subtitle.cueAt(srtCues, 2), 0);
eq('t=3.6（两句之间）→ 仍高亮第 2 条', subtitle.cueAt(srtCues, 3.6), 1);
eq('t=4 → 第 2 条', subtitle.cueAt(srtCues, 4), 1);
eq('t=80 → 第 3 条', subtitle.cueAt(srtCues, 80), 2);
eq('空时间轴返回 -1', subtitle.cueAt([], 5), -1);

console.log('\n=== 格式嗅探 ===');
eq('.srt', subtitle.detectSubtitleFormat('Lesson1.SRT'), 'srt');
eq('.vtt', subtitle.detectSubtitleFormat('a.vtt'), 'vtt');
eq('.txt', subtitle.detectSubtitleFormat('a.txt'), 'plain');

ok('全部断言通过', fails === 0);
console.log(fails ? `\n${fails} 项失败` : '\n全部通过 ✓');
process.exit(fails ? 1 : 0);
