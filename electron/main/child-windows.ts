import type { ChildKind } from '../../src/ipc/contract'

export type { ChildKind }

/** 二级窗口基准尺寸（DIP；决策#5/#14，原型 v3.1.2；速查 #7：高度 ≤ 半屏、宽度 ≤ 屏宽） */
export const CHILD_SIZES: Record<ChildKind, { w: number; h: number }> = {
  'todo-new': { w: 360, h: 360 },
  'todo-edit': { w: 400, h: 430 },
  'template-new': { w: 360, h: 360 },
  'template-edit': { w: 360, h: 380 },
  detail: { w: 360, h: 430 },
  history: { w: 560, h: 540 },
  settings: { w: 400, h: 470 }
}

/** 缩放分组（PRD §二：事项类/模板类/历史/设置；detail 归事项组；主进程与渲染层单一来源） */
export type ChildGroup = 'todo' | 'template' | 'history' | 'settings'

export const GROUP_OF: Record<ChildKind, ChildGroup> = {
  'todo-new': 'todo',
  'todo-edit': 'todo',
  detail: 'todo',
  'template-new': 'template',
  'template-edit': 'template',
  history: 'history',
  settings: 'settings'
}

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface ChildWindowPlacement {
  width: number
  height: number
  x: number
  y: number
}

/**
 * 子窗口创建参数（纯函数）：
 * - 尺寸 = round(基准 × 组缩放)，屏幕放不下按 (屏-24) 钳制（照原型，二轮反馈）
 * - 位置居中，并按打开序号向右下级联偏移（位置不记忆）
 */
export function childWindowOptions(
  kind: ChildKind,
  wa: WorkArea,
  openIndex: number,
  groupScale = 1
): ChildWindowPlacement {
  const def = CHILD_SIZES[kind]
  const width = Math.min(Math.round(def.w * groupScale), wa.width - 24)
  const height = Math.min(Math.round(def.h * groupScale), wa.height - 24)
  const cascade = (openIndex % 8) * 26
  const x = wa.x + Math.round((wa.width - width) / 2) + cascade
  const y = wa.y + Math.round((wa.height - height) / 2) + cascade
  return { width, height, x, y }
}
