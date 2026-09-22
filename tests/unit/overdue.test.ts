import { describe, it, expect } from 'vitest'
import {
  isActiveOverdue,
  isCompletedOverdue,
  completedOverdueLabel,
  recalcActiveOverdue,
  markCompleted,
  returnToActive
} from '../../src/core/services/overdue'
import type { TodoItem } from '../../src/core/models'

/** 固定日期辅助：本地 2026-09-21（周一） */
const TODAY = '2026-09-21'

function todo(params: Partial<TodoItem> & { createdAt: string }): TodoItem {
  return {
    id: params.id ?? 'x',
    content: params.content ?? '事项',
    createdAt: params.createdAt,
    completedAt: params.completedAt ?? null,
    overdue: params.overdue ?? false
  }
}

/** T06 逾期判定（开发计划 §5-A，PRD §7.4 统一口径） */
describe('A 未完成口径：创建日期 ≠ 今天 → 逾期', () => {
  it('A1 今天创建、未完成 → 未逾期', () => {
    const item = todo({ createdAt: '2026-09-21T00:00:30.000Z' })
    expect(isActiveOverdue(item, TODAY)).toBe(false)
  })

  it('A2 昨天创建、未完成 → 逾期', () => {
    const item = todo({ createdAt: '2026-09-20T10:00:00.000Z' })
    expect(isActiveOverdue(item, TODAY)).toBe(true)
  })
})

describe('A 已完成口径：创建日期 ≠ 完成日期 → 已逾期', () => {
  it('A3 今天创建、今天完成 → 详情"未逾期"', () => {
    const item = todo({ createdAt: '2026-09-21T01:00:00.000Z', completedAt: '2026-09-21T05:00:00.000Z' })
    expect(isCompletedOverdue(item)).toBe(false)
    expect(completedOverdueLabel(item)).toBe('ontime')
  })

  it('A4 昨天创建、今天完成 → 详情"已逾期"', () => {
    const item = todo({ createdAt: '2026-09-20T10:00:00.000Z', completedAt: '2026-09-21T05:00:00.000Z' })
    expect(isCompletedOverdue(item)).toBe(true)
    expect(completedOverdueLabel(item)).toBe('overdue')
  })
})

describe('A 退回待办重算', () => {
  it('A5 创建日=今天 → 退回后不逾期；创建日=昨天 → 退回后逾期', () => {
    const todayCreated = todo({ createdAt: '2026-09-21T01:00:00.000Z', completedAt: '2026-09-21T02:00:00.000Z', overdue: false })
    const back1 = returnToActive(todayCreated, TODAY)
    expect(back1.completedAt).toBeNull()
    expect(back1.overdue).toBe(false)

    const yesterdayCreated = todo({ createdAt: '2026-09-20T01:00:00.000Z', completedAt: '2026-09-21T02:00:00.000Z', overdue: false })
    const back2 = returnToActive(yesterdayCreated, TODAY)
    expect(back2.overdue).toBe(true)
  })
})

describe('A 导入记录推算', () => {
  it('A6 创建 09-20 10:00、完成 09-21 09:00 → 已逾期', () => {
    const item = todo({ createdAt: '2026-09-20T10:00:00.000+08:00', completedAt: '2026-09-21T09:00:00.000+08:00' })
    // 本地时区换算后：创建日 09-20，完成日 09-21 → 已逾期（与具体时区无关）
    expect(isCompletedOverdue(item)).toBe(true)
  })
})

describe('A 跨日边界', () => {
  it('A7 昨天 23:59 创建、今天 00:01 完成 → 已逾期（跨日即逾期）', () => {
    const created = new Date(2026, 8, 20, 23, 59, 0)
    const completed = new Date(2026, 8, 21, 0, 1, 0)
    const item = todo({ createdAt: created.toISOString(), completedAt: completed.toISOString() })
    expect(isCompletedOverdue(item)).toBe(true)
  })

  it('A8 同日 00:00 创建、23:59 完成 → 未逾期', () => {
    const created = new Date(2026, 8, 21, 0, 0, 0)
    const completed = new Date(2026, 8, 21, 23, 59, 0)
    const item = todo({ createdAt: created.toISOString(), completedAt: completed.toISOString() })
    expect(isCompletedOverdue(item)).toBe(false)
  })
})

describe('批量重算与完成标记', () => {
  it('recalcActiveOverdue：只更新未完成事项，保持顺序与原对象不变', () => {
    const list = [
      todo({ id: '1', createdAt: '2026-09-20T00:00:00.000Z', overdue: false }),
      todo({ id: '2', createdAt: '2026-09-21T00:00:00.000Z', overdue: true }),
      todo({ id: '3', createdAt: '2026-09-19T00:00:00.000Z', completedAt: '2026-09-20T00:00:00.000Z', overdue: true })
    ]
    const out = recalcActiveOverdue(list, TODAY)
    expect(out.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(out[0].overdue).toBe(true)
    expect(out[1].overdue).toBe(false)
    // 已完成事项不被此函数改动
    expect(out[2].overdue).toBe(true)
    // 不可变：原数组元素未被修改
    expect(list[0].overdue).toBe(false)
  })

  it('markCompleted：写入 completedAt 并按完成口径重算逾期标记', () => {
    const now = new Date(2026, 8, 21, 8, 0, 0)
    const late = markCompleted(todo({ id: '1', createdAt: '2026-09-20T00:00:00.000Z' }), now)
    expect(late.completedAt).toBe(now.toISOString())
    expect(late.overdue).toBe(true)

    const ontime = markCompleted(todo({ id: '2', createdAt: '2026-09-21T00:00:00.000Z' }), now)
    expect(ontime.overdue).toBe(false)
  })
})
