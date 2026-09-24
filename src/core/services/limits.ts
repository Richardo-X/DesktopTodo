/**
 * 待办数量上限（PRD §5.7）：
 * - 范围 1~10，默认 10
 * - 上限不可调至低于当前待办数量 → 调节下限 = max(1, 当前待办数)
 * - 新建、模板一键添加、已完成退回三个入口共用同一约束
 */

export const MAX_ITEMS_CEILING = 10

export type LimitResult = { ok: true } | { ok: false; reason: 'limit-reached' }

/** 四个新增入口共用的上限判定；拒绝原因供 UI 提示（C3） */
export function canAddTodo(currentTodoCount: number, maxItems: number): LimitResult {
  return currentTodoCount < maxItems ? { ok: true } : { ok: false, reason: 'limit-reached' }
}

/** 设置页调节上限：clamp 至 [max(1, 当前待办数), 10] */
export function clampMaxItems(value: number, currentTodoCount: number): number {
  const min = Math.max(1, currentTodoCount)
  return Math.min(MAX_ITEMS_CEILING, Math.max(min, value))
}

/** 上限可调节边界（UI：canDecrease=false 时减号置灰并显示"不可低于当前待办数量"） */
export function maxItemsBounds(
  currentMaxItems: number,
  currentTodoCount: number
): {
  min: number
  max: number
  canDecrease: boolean
  canIncrease: boolean
} {
  const min = Math.max(1, currentTodoCount)
  return {
    min,
    max: MAX_ITEMS_CEILING,
    canDecrease: currentMaxItems - 1 >= min,
    canIncrease: currentMaxItems + 1 <= MAX_ITEMS_CEILING
  }
}
