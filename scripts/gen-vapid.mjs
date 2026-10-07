#!/usr/bin/env node
/**
 * gen-vapid.mjs · 生成 VAPID 密钥对（Web Push 系统级推送必备）
 * 用法： npm run vapid
 * 输出： 三个环境变量，填到 Vercel → Settings → Environment Variables
 *       VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VITE_VAPID_PUBLIC_KEY（与前者相同）
 */

import { generateKeyPairSync } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });

const x = Buffer.from(pubJwk.x, 'base64');
const y = Buffer.from(pubJwk.y, 'base64');
// 未压缩点格式：0x04 || X(32) || Y(32)
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);

const publicKeyB64 = b64url(uncompressed);
const privateKeyB64 = privJwk.d;

console.log('');
console.log('=========================================================');
console.log('  VAPID 密钥对已生成（复制下面 4 行到 Vercel 环境变量）');
console.log('=========================================================');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKeyB64}`);
console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`);
console.log('VAPID_SUBJECT=mailto:你的邮箱@example.com');
console.log('');
console.log('提示：');
console.log('  1) VITE_VAPID_PUBLIC_KEY 与 VAPID_PUBLIC_KEY 值相同（前者供前端读取）。');
console.log('  2) 密钥一旦更换，所有已订阅设备需要重新开启推送。');
console.log('  3) 生成后请妥善保存，不要提交到 Git 仓库。');
console.log('');
