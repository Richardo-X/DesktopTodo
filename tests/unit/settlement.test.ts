import { describe, it, expect } from 'vitest'
import { settle } from '../../src/core/services/settlement'
import { defaultAppData, type AppData, type TodoItem } from '../../src/core/models'

/** 固定"今天"：本地 2026-09-21 00:00:30（跨过 0 点瞬间） */
const NOW = new Date(2026, 8, 21, 0, 0, 30)

/** 以本地日期时间分量构造 ISO 串（时区无关的测试夹具） */
function localIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  return new Date(y, mo - 1, d, h, mi).toISOString()
}

function item(id: string, p: Partial<TodoItem> & { createdAt: string }): TodoItem {
  return {
    id,
    content: `内容${id}`,
    createdAt: p.createdAt,
    completedAt: p.completedAt ?? null,
    overdue: p.overdue ?? false
  }
}

function withData(p: Partial<AppData>): AppData {
  return { ...defaultAppData(), ...p }
}

/** T07 跨天结算（开发计划 §5-B：归档/标逾期/顺序不变/幂等/补结算/回收清理/静默） */
describe('B 跨天结算 settle()', () => {
  it('B1 已完成区隔：昨天的进 archive[昨天]，今天的留在 completed', () => {
    const data = withData({
      completed: [
        item('a1', { createdAt: localIso(2026, 9, 20, 1), completedAt: localIso(2026, 9, 20, 2) }),
        item('a2', { createdAt: localIso(2026, 9, 21, 1), completedAt: localIso(2026, 9, 21, 2) }),
        item('a3', { createdAt: localIso(2026, 9, 19, 1), completedAt: localIso(2026, 9, 20, 23) })
      ]
    })
    const r = settle(data, NOW)
    expect(r.archivedCount).toBe(2)
    expect(r.data.completed.map((t) => t.id)).toEqual(['a2'])
    expect(r.data.archive['2026-09-20'].map((t) => t.id)).toEqual(['a1', 'a3'])
    expect(r.changed).toBe(true)
  })

  it('B2 未完成待办全部标记逾期，顺序不变', () => {
    const data = withData({
      todos: [
        item('t1', { createdAt: localIso(2026, 9, 20, 1), overdue: false }),
        item('t2', { createdAt: localIso(2026, 9, 21, 1), overdue: false }),
        item('t3', { createdAt: localIso(2026, 9, 19, 1), overdue: false })
      ]
    })
    const r = settle(data, NOW)
    expect(r.data.todos.map((t) => t.id)).toEqual(['t1', 't2', 't3']) // 顺序不变
    expect(r.data.todos[0].overdue).toBe(true)
    expect(r.data.todos[1].overdue).toBe(false) // 今天创建 → 不逾期
    expect(r.data.todos[2].overdue).toBe(true)
    expect(r.markedOverdue).toBe(2)
  })

  it('B3 幂等：同一天连续调用两次，第二次零移动', () => {
    const data = withData({
      completed: [item('a1', { createdAt: localIso(2026, 9, 20, 1), completedAt: localIso(2026, 9, 20, 2) })],
      todos: [item('t1', { createdAt: '2026-09-19T00:00:00.000Z' })]
    })
    const r1 = settle(data, NOW)
    const r2 = settle(r1.data, NOW)
    expect(r2.archivedCount).toBe(0)
    expect(r2.markedOverdue).toBe(0)
    expect(r2.changed).toBe(false)
    expect(r2.data).toEqual(r1.data)
  })

  it('B4 关机跨两天（lastSettleDate=前天）：一次补齐所有非今天记录', () => {
    const data = withData({
      completed: [
        item('a1', { createdAt: localIso(2026, 9, 18, 1), completedAt: localIso(2026, 9, 18, 2) }),
        item('a2', { createdAt: localIso(2026, 9, 19, 1), completedAt: localIso(2026, 9, 19, 2) })
      ],
      todos: [item('t1', { createdAt: localIso(2026, 9, 18, 1) })],
      uiState: { ...defaultAppData().uiState, lastSettleDate: '2026-09-19' }
    })
    const r = settle(data, NOW)
    expect(r.data.completed).toEqual([])
    expect(r.data.archive['2026-09-18'].map((t) => t.id)).toEqual(['a1'])
    expect(r.data.archive['2026-09-19'].map((t) => t.id)).toEqual(['a2'])
    expect(r.data.todos[0].overdue).toBe(true)
    expect(r.data.uiState.lastSettleDate).toBe('2026-09-21')
  })

  it('B5 结算同时触发回收站到期清理（注入回调）', () => {
    const purged: string[] = []
    const data = withData({
      recycleBin: [{ id: 'r1', type: 'todo', payload: item('x', { createdAt: NOW.toISOString() }), deletedAt: localIso(2026, 9, 1) }]
    })
    const r = settle(data, NOW, {
      purgeRecycle: (d) => {
        purged.push(d.recycleBin.map((e) => e.id).join(','))
        return { ...d, recycleBin: [] }
      }
    })
    expect(purged).toEqual(['r1'])
    expect(r.data.recycleBin).toEqual([])
  })

  it('B6 静默：返回结构只含数据结果，无任何用户通知通道', () => {
    const data = withData({ completed: [item('a1', { createdAt: localIso(2026, 9, 20, 1), completedAt: localIso(2026, 9, 20, 2) })] })
    const r = settle(data, NOW)
    expect(Object.keys(r).sort()).toEqual(['archivedCount', 'changed', 'data', 'markedOverdue'])
    expect(typeof r.data).toBe('object')
    expect('notices' in r).toBe(false)
    expect('message' in r).toBe(false)
  })

  it('启动补结算与运行中结算同一入口：lastSettleDate 更新为今天', () => {
    const data = withData({ uiState: { ...defaultAppData().uiState, lastSettleDate: '2026-09-20' } })
    const r = settle(data, NOW)
    expect(r.data.uiState.lastSettleDate).toBe('2026-09-21')
  })
})
