import type { ChildKind } from '../../src/ipc/contract'

export type { ChildKind }

/** 子窗口默认尺寸（DIP；速查 #7：高度一律 ≤ 屏幕高度一半，宽度 ≤ 屏宽；B1.5：无回收站） */
export const CHILD_SIZES: Record<ChildKind, { w: number; h: number }> = {
  'todo-new': { w: 380, h: 340 },
  'todo-edit': { w: 380, h: 420 },
  'template-new': { w: 380, h: 320 },
  'template-edit': { w: 380, h: 380 },
  detail: { w: 360, h: 340 },
  history: { w: 600, h: 516 },
  settings: { w: 460, h: 516 }
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
 * - 尺寸按默认值，钳制到屏宽与半屏高
 * - 位置居中，并按打开序号向右下级联偏移（位置不记忆）
 */
export function childWindowOptions(kind: ChildKind, wa: WorkArea, openIndex: number): ChildWindowPlacement {
  const def = CHILD_SIZES[kind]
  const width = Math.min(def.w, wa.width - 20)
  const height = Math.min(def.h, Math.floor(wa.height / 2))
  const cascade = (openIndex % 8) * 26
  const x = wa.x + Math.round((wa.width - width) / 2) + cascade
  const y = wa.y + Math.round((wa.height - height) / 2) + cascade
  return { width, height, x, y }
}
