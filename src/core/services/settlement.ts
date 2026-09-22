import type { AppData } from '../models/types'
import { localDateKey } from '../utils/date'
import { recalcActiveOverdue } from './overdue'

export interface SettleOptions {
  /**
   * 回收站到期清理回调（由应用层注入 RecycleService.purgeExpired；
   * 结算与清理同事务执行，见 PRD §7.4 跨天结算）。
   */
  purgeRecycle?: (data: AppData) => AppData
}

export interface SettleResult {
  /** 结算后的新数据（不可变，原数据不改） */
  data: AppData
  /** 归档进历史的事项数 */
  archivedCount: number
  /** 本次新标记逾期的事项数 */
  markedOverdue: number
  /** 是否发生了任何变化 */
  changed: boolean
}

/**
 * 跨天结算（PRD §7.4，全程静默）：
 * - 已完成页中完成日期 ≠ 今天的事项归档进 archive[完成日]
 * - 未完成待办全部重算逾期标记（创建日期 ≠ 今天 → 逾期），顺序不变
 * - 更新 lastSettleDate；关机跨天的在下次启动调用同一函数补结算
 * - 幂等：同一天重复调用零移动
 * - 不产生任何用户通知（返回纯数据结果）
 */
export function settle(data: AppData, now: Date, opts: SettleOptions = {}): SettleResult {
  const todayKey = localDateKey(now)

  let archivedCount = 0
  const archive = { ...data.archive }
  const remainingCompleted = []
  for (const entry of data.completed) {
    if (entry.completedAt === null) continue
    const key = localDateKey(new Date(entry.completedAt))
    if (key === todayKey) {
      remainingCompleted.push(entry)
    } else {
      archive[key] = [...(archive[key] ?? []), entry]
      archivedCount++
    }
  }

  const todos = recalcActiveOverdue(data.todos, todayKey)
  const markedOverdue = todos.reduce((n, t, i) => (t.overdue !== data.todos[i].overdue ? n + 1 : n), 0)

  let next: AppData = {
    ...data,
    todos,
    completed: remainingCompleted,
    archive,
    uiState: { ...data.uiState, lastSettleDate: todayKey }
  }

  if (opts.purgeRecycle) next = opts.purgeRecycle(next)

  return {
    data: next,
    archivedCount,
    markedOverdue,
    changed: archivedCount > 0 || markedOverdue > 0 || data.uiState.lastSettleDate !== todayKey
  }
}
