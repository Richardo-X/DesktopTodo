import { describe, it, expect, vi } from 'vitest'
import { AppContext } from '../../electron/main/context'
import { MemoryRepository } from '../../src/core/repositories/memory'
import { defaultAppData, createTodoItem, createTemplateItem, createRecycleEntry, type AppData } from '../../src/core/models'
import { SystemClock, type IClock } from '../../src/core/interfaces/clock'
import { hasCrossedMidnight } from '../../electron/main/context'

function fixedClock(y: number, mo: number, d: number, h = 12): IClock {
  let t = new Date(y, mo - 1, d, h, 0, 0)
  return {
    now: () => t,
    set(v: Date) {
      t = v
    }
  } as IClock & { set(v: Date): void }
}

function data(p: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(), ...p }
}

/** T20 应用上下文：启动结算/提交持久化/退出 flush（脱离 Electron 可测） */
describe('AppContext 启动流程', () => {
  it('首次启动：载入 null → 默认空数据，lastSettleDate 置今天并落盘', async () => {
    const repo = new MemoryRepository<AppData>()
    const ctx = new AppContext(repo, new SystemClock())
    const d = await ctx.boot()
    expect(d.todos).toEqual([])
    expect(d.uiState.lastSettleDate).not.toBeNull()
    expect(await repo.load()).toEqual(d) // 已持久化
  })

  it('关机跨天补结算：昨日 completed 归档、待办标逾期、超时回收站清理，变更落盘', async () => {
    const now = fixedClock(2026, 9, 21, 8)
    const todo = createTodoItem({ content: '未完成', now: new Date(2026, 8, 19, 9), id: 't1' })
    const doneItem = { ...createTodoItem({ content: '昨天完成', now: new Date(2026, 8, 19, 9), id: 'a1' }), completedAt: new Date(2026, 8, 20, 18).toISOString() }
    const staleBin = createRecycleEntry({
      type: 'todo',
      payload: createTodoItem({ content: '过期', now: new Date(2026, 8, 1, 9), id: 'x' }),
      deletedAt: new Date(2026, 8, 1, 9),
      id: 'r1'
    })
    const saved = data({
      todos: [todo],
      completed: [doneItem],
      recycleBin: [staleBin],
      settings: { ...defaultAppData().settings, recycleKeep: 7 },
      uiState: { ...defaultAppData().uiState, lastSettleDate: '2026-09-20' }
    })
    const repo = new MemoryRepository<AppData>(saved)
    const ctx = new AppContext(repo, now)
    const d = await ctx.boot()

    expect(d.completed).toEqual([]) // 归档
    expect(d.archive['2026-09-20'].map((t) => t.id)).toEqual(['a1'])
    expect(d.todos[0].overdue).toBe(true)
    expect(d.recycleBin).toEqual([]) // 8 天前 > 7 天时限 → 清理
    expect(d.uiState.lastSettleDate).toBe('2026-09-21')
    expect(await repo.load()).toEqual(d) // 变更已落盘
  })

  it('同一天重复启动：无变更不落盘', async () => {
    const now = fixedClock(2026, 9, 21, 8)
    const saved = data({ uiState: { ...defaultAppData().uiState, lastSettleDate: '2026-09-21' } })
    const repo = new MemoryRepository<AppData>(saved)
    const saveSpy = vi.spyOn(repo, 'save')
    const ctx = new AppContext(repo, now)
    const d = await ctx.boot()
    expect(d).toEqual(saved)
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('AppContext 提交与退出', () => {
  it('commit：合并窗口位置到 uiState.pos 后经仓储保存', async () => {
    const repo = new MemoryRepository<AppData>()
    const ctx = new AppContext(repo, new SystemClock())
    await ctx.boot()
    const d = data()
    d.uiState.topMost = true
    await ctx.commit(d, { x: 111, y: 55 })
    const persisted = await repo.load()
    expect(persisted!.uiState.pos).toEqual({ x: 111, y: 55 })
    expect(persisted!.uiState.topMost).toBe(true)
  })

  it('commit 不带位置（pos null）→ uiState.pos 置 null', async () => {
    const repo = new MemoryRepository<AppData>()
    const ctx = new AppContext(repo, new SystemClock())
    await ctx.boot()
    await ctx.commit(data(), null)
    expect((await repo.load())!.uiState.pos).toBeNull()
  })

  it('flush 幂等且不抛错（退出前调用）', async () => {
    const repo = new MemoryRepository<AppData>()
    const ctx = new AppContext(repo, new SystemClock())
    await ctx.boot()
    await expect(ctx.flush()).resolves.toBeUndefined()
  })
})

describe('hasCrossedMidnight 跨天检测', () => {
  it('日期键变化 → true；同日 → false', () => {
    expect(hasCrossedMidnight('2026-09-20', '2026-09-21')).toBe(true)
    expect(hasCrossedMidnight('2026-09-21', '2026-09-21')).toBe(false)
    expect(hasCrossedMidnight(null, '2026-09-21')).toBe(true)
  })
})
