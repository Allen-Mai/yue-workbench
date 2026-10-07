#!/usr/bin/env node
/**
 * report-size.mjs · 构建体积体检（规格要求：前端 gzip < 500KB）
 * 用法： npm run build && node scripts/report-size.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const LIMIT_KB = 500;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('✗ 未找到 dist/，请先运行 npm run build');
  process.exit(1);
}

const files = walk(DIST);
const rows = [];
let totalRaw = 0;
let totalGz = 0;
let codeGz = 0;

for (const f of files) {
  const buf = readFileSync(f);
  const gz = gzipSync(buf, { level: 9 }).length;
  totalRaw += buf.length;
  totalGz += gz;
  if (['.js', '.css', '.html', '.json', '.svg'].includes(extname(f))) codeGz += gz;
  rows.push({ file: relative(DIST, f), raw: buf.length, gz });
}

rows.sort((a, b) => b.gz - a.gz);

const kb = (n) => (n / 1024).toFixed(1).padStart(9);

console.log('\n构建体积报告（dist/）');
console.log('-------------------------------------------------');
console.log('  gzip KB      原始 KB   文件');
console.log('-------------------------------------------------');
for (const r of rows.slice(0, 25)) {
  console.log(`${kb(r.gz)}  ${kb(r.raw)}   ${r.file}`);
}
console.log('-------------------------------------------------');
console.log(`  代码+样式 gzip 合计：${(codeGz / 1024).toFixed(1)} KB`);
console.log(`  全部文件   gzip 合计：${(totalGz / 1024).toFixed(1)} KB（原始 ${(totalRaw / 1024).toFixed(1)} KB）`);
console.log(`  预算上限   gzip：${LIMIT_KB} KB`);

if (codeGz / 1024 > LIMIT_KB) {
  console.error(`\n✗ 超出预算：gzip ${(codeGz / 1024).toFixed(1)} KB > ${LIMIT_KB} KB`);
  process.exit(1);
}
console.log(`\n✓ 通过：前端 gzip ${(codeGz / 1024).toFixed(1)} KB，远低于 ${LIMIT_KB} KB 上限\n`);
