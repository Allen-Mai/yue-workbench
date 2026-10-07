/* ==========================================================================
   data/courses/index.ts · 雅思课程汇总（四门课 → 课程表 + 课表）
   ========================================================================== */

import type { CourseDef, CoursePack, LessonDef } from './types';
import { COURSE_LISTENING } from './listening';
import { COURSE_READING } from './reading';
import { COURSE_WRITING } from './writing';
import { COURSE_SPEAKING } from './speaking';

function safe(pack: CoursePack | undefined): CoursePack | null {
  if (!pack || !pack.course || !Array.isArray(pack.lessons) || !pack.lessons.length) return null;
  return pack;
}

export const IELTS_COURSE_PACKS: CoursePack[] = [
  safe(COURSE_LISTENING),
  safe(COURSE_READING),
  safe(COURSE_WRITING),
  safe(COURSE_SPEAKING),
].filter((p): p is CoursePack => !!p).sort((a, b) => a.course.order - b.course.order);

export const IELTS_COURSES: CourseDef[] = IELTS_COURSE_PACKS.map((p) => p.course);

export const IELTS_LESSONS: LessonDef[] = IELTS_COURSE_PACKS.flatMap((p) =>
  p.lessons.map((l, i) => ({ ...l, course: p.course.slug, order: l.order || i + 1 })),
);

export function lessonsOfCourse(courseSlug: string): LessonDef[] {
  return IELTS_LESSONS.filter((l) => l.course === courseSlug).sort((a, b) => a.order - b.order);
}

export type { CourseDef, CoursePack, LessonDef } from './types';
