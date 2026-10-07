/* ==========================================================================
   modules/index.ts · 模块注册表（侧栏顺序即 order）
   1 今日中枢 · 2 植物养护 · 3 灵感补给站 · 4 财富工坊
   5 时光胶囊 · 6 智能提醒中心 · 7 成就殿堂 · 8 设置
   ========================================================================== */

import type { ModuleDef } from '../types';
import { hubModule } from './hub';
import { plantsModule } from './plants';
import { inspireModule } from './inspire';
import { wealthModule } from './wealth';
import { capsuleModule } from './capsule';
import { remindModule } from './remind';
import { trophyModule } from './trophy';
import { settingsModule } from './settings';

export const modules: ModuleDef[] = [
  hubModule,
  plantsModule,
  inspireModule,
  wealthModule,
  capsuleModule,
  remindModule,
  trophyModule,
  settingsModule,
];

export function getModule(id: string): ModuleDef | undefined {
  return modules.find((m) => m.id === id);
}
