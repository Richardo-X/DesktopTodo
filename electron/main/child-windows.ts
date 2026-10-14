import type { ChildKind } from '../../src/ipc/contract'

export type { ChildKind }

/** 二级窗口基准尺寸（DIP；宽度统一 420；高度=内容适配——4:3 输入框(294)+各窗行数，4px 栅格取整；
 * 用户 2026-10-14 晚迭代：输入框 4:3 填满窗体消灭底部空白，原"统一 3:4=560"废弃） */
export const CHILD_SIZES: Record<ChildKind, { w: number; h: number }> = {
  'todo-new': { w: 420, h: 400 },
  'todo-edit': { w: 420, h: 388 },
  'template-new': { w: 420, h: 428 },
  'template-edit': { w: 420, h: 392 },
  detail: { w: 415, h: 490 },
  history: { w: 645, h: 620 },
  settings: { w: 460, h: 540 },
  // 四轮：气泡独立小窗口（非用户子窗口，不经 openChild 打开；仅为类型完备）
  bubble: { w: 320, h: 160 }
}

/** 缩放分组（PRD §二：事项类/模板类/历史/设置；detail 归事项组；主进程与渲染层单一来源） */
export type ChildGroup = 'todo' | 'template' | 'history' | 'settings' | 'bubble'

export const GROUP_OF: Record<ChildKind, ChildGroup> = {
  'todo-new': 'todo',
  'todo-edit': 'todo',
  detail: 'todo',
  'template-new': 'template',
  'template-edit': 'template',
  history: 'history',
  settings: 'settings',
  bubble: 'bubble'
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
