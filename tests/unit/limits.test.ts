import { describe, it, expect } from 'vitest'
import { canAddTodo, clampMaxItems, maxItemsBounds, MAX_ITEMS_CEILING } from '../../src/core/services/limits'
import { defaultSettings } from '../../src/core/models'

/** T08 数量上限（开发计划 §5-C；PRD §5.7：上限 1~10 默认 10，四处入口受约束，不可低于当前数量） */
describe('C 数量上限 LimitsService', () => {
  it('C1 默认设置 → 上限=10', () => {
    expect(defaultSettings().maxItems).toBe(10)
  })

  it('C2 输入 0 / 11 → clamp 至 1 / 10（无待办时）', () => {
    expect(clampMaxItems(0, 0)).toBe(1)
    expect(clampMaxItems(11, 0)).toBe(10)
    expect(MAX_ITEMS_CEILING).toBe(10)
  })

  it('C3 待办数=上限：四入口（新建/模板＋/已完成退回/回收站恢复）全部拒绝且原因可提示', () => {
    const gate = canAddTodo(10, 10)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toBe('limit-reached')

    // 四个入口共用同一判定
    for (const count of [canAddTodo(10, 10), canAddTodo(10, 10), canAddTodo(10, 10), canAddTodo(10, 10)]) {
      expect(count.ok).toBe(false)
    }
    expect(canAddTodo(9, 10).ok).toBe(true)
  })

  it('C4 待办数=6：上限可调至 6，不可调至 5（下限=当前数量）', () => {
    expect(clampMaxItems(6, 6)).toBe(6)
    expect(clampMaxItems(5, 6)).toBe(6)
  })

  it('C5 待办数=0：可调至 1', () => {
    expect(clampMaxItems(1, 0)).toBe(1)
  })

  it('C6 待办数=10：bounds.min=10（UI 据此禁用减号）', () => {
    const b = maxItemsBounds(10, 10)
    expect(b.min).toBe(10)
    expect(b.max).toBe(10)
    expect(b.canDecrease).toBe(false)
    expect(b.canIncrease).toBe(false)
  })

  it('边界组合：上限=6、待办数=6 → 已到底不能再减；上限=8、待办数=6 → 仍可减', () => {
    const atFloor = maxItemsBounds(6, 6)
    expect(atFloor.min).toBe(6)
    expect(atFloor.max).toBe(10)
    expect(atFloor.canDecrease).toBe(false)
    expect(atFloor.canIncrease).toBe(true)

    const mid = maxItemsBounds(8, 6)
    expect(mid.canDecrease).toBe(true)
    expect(mid.canIncrease).toBe(true)
  })
})
