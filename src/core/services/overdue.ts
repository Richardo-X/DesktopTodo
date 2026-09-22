import type { TodoItem } from '../models/types'
import { localDateKey } from '../utils/date'

/**
 * 逾期判定（PRD §7.4 统一口径）：
 * - 未完成：创建日期 ≠ 今天 → 逾期（每天跨天时由 SettlementService 标记）
 * - 已完成：创建日期 ≠ 完成日期 → "已逾期"
 * - 从已完成退回待办时按今日重算；导入记录同样按此口径推算
 */

/** 待办（未完成）是否逾期 */
export function isActiveOverdue(item: TodoItem, todayKey: string): boolean {
  if (item.completedAt !== null) return false
  return localDateKey(new Date(item.createdAt)) !== todayKey
}

/** 已完成事项是否"已逾期" */
export function isCompletedOverdue(item: TodoItem): boolean {
  if (item.completedAt === null) return false
  return localDateKey(new Date(item.createdAt)) !== localDateKey(new Date(item.completedAt))
}

/** 详情窗口逾期标签（UI 层映射"已逾期/未逾期"文案） */
export type OverdueLabel = 'overdue' | 'ontime'

export function completedOverdueLabel(item: TodoItem): OverdueLabel {
  return isCompletedOverdue(item) ? 'overdue' : 'ontime'
}

/** 批量重算未完成事项的逾期标记（跨天结算/退回后调用）；不可变，保持顺序 */
export function recalcActiveOverdue(todos: TodoItem[], todayKey: string): TodoItem[] {
  return todos.map((t) => (t.completedAt === null ? { ...t, overdue: isActiveOverdue(t, todayKey) } : t))
}

/** 完成事项：写入 completedAt 并按完成口径重算逾期标记（勾选完成时调用） */
export function markCompleted(item: TodoItem, now: Date): TodoItem {
  const completedAt = now.toISOString()
  return { ...item, completedAt, overdue: isCompletedOverdue({ ...item, completedAt }) }
}

/** 已完成退回待办：清空 completedAt、按今日重算逾期 */
export function returnToActive(item: TodoItem, todayKey: string): TodoItem {
  return { ...item, completedAt: null, overdue: isActiveOverdue({ ...item, completedAt: null }, todayKey) }
}
