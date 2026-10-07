/* ==========================================================================
   data/courses/types.ts · 雅思课程数据契约（课程分片共用）
   ========================================================================== */

import type { LessonExercise, LessonKind } from '../../types';

export interface CourseDef {
  /** 唯一标识，小写英文短横线，如 'listening' */
  slug: string;
  title: string;
  /** 一句话副标题 */
  subtitle: string;
  /** 课程介绍，2–4 句 */
  desc: string;
  /** 基础 / 进阶 / 冲刺 */
  level: string;
  order: number;
  tags: string[];
}

export interface LessonDef {
  /** 唯一标识，小写英文短横线，全局唯一（建议前缀课程 slug，如 'listening-1-1'） */
  slug: string;
  /** 所属课程 slug */
  course: string;
  /** 单元序号，从 1 开始 */
  unit_no: number;
  /** 单元名称 */
  unit_title: string;
  title: string;
  kind: LessonKind;
  /** 预计用时（分钟），10–30 */
  minutes: number;
  /** 讲解正文，用 \n\n 分段，不要 markdown 语法，400–900 字 */
  body: string;
  /** 本课要点，3–6 条短句 */
  key_points: string[];
  /** 练习题，3–5 道单选 */
  exercises: LessonExercise[];
  /** 课序号，从 1 开始 */
  order: number;
}

export interface CoursePack {
  course: CourseDef;
  lessons: LessonDef[];
}
