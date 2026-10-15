/* ==========================================================================
   modules/index.ts · 模块注册表（侧栏顺序即 order）
   1 今日中枢 · 2 灵感补给站 · 3 财富工坊
   4 时光胶囊 · 5 智能提醒中心 · 6 成就殿堂 · 7 设置
   （植物养护已隐藏，开关见 core/features.ts）
   ========================================================================== */

import type { ModuleDef } from '../types';
import { FEATURES } from '../core/features';
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
  ...(FEATURES.plants ? [plantsModule] : []),
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
