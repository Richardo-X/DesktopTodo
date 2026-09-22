import { describe, it, expect } from 'vitest'
import {
  deleteTodo,
  deleteTemplate,
  deleteHistory,
  restoreEntry,
  permanentDelete,
  clearRecycleBin,
  purgeExpired
} from '../../src/core/services/recycle'
import {
  defaultAppData,
  createTodoItem,
  createTemplateItem,
  createRecycleEntry,
  type AppData
} from '../../src/core/models'

const NOW = new Date(2026, 8, 21, 12, 0, 0)

function data(p: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(), ...p }
}

/** 本地 N 天前 */
function daysAgo(n: number): Date {
  return new Date(2026, 8, 21 - n, 12, 0, 0)
}

/** T10 回收站（开发计划 §5-E；PRD §5.6） */
describe('E1 删除入站：记录 type + 原始数据 + deletedAt', () => {
  it('删除待办 → type=todo、payload 原样、deletedAt=now、原列表移除', () => {
    const todo = createTodoItem({ content: '被删待办', now: NOW, id: 't1' })
    const d0 = data({ todos: [todo] })
    const r = deleteTodo(d0, 't1', NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.todos).toEqual([])
    expect(r.data.recycleBin).toHaveLength(1)
    const e = r.data.recycleBin[0]
    expect(e.type).toBe('todo')
    expect(e.payload).toEqual(todo)
    expect(e.deletedAt).toBe(NOW.toISOString())
  })

  it('删除模板与历史记录 → type 正确；历史从对应日期组移除', () => {
    const tpl = createTemplateItem({ content: '模板A', now: NOW, id: 'tpl1' })
    const hist = createTodoItem({ content: '历史项', now: daysAgo(3), id: 'h1' })
    const histDone = { ...hist, completedAt: daysAgo(2).toISOString() }
    const d0 = data({ templates: [tpl], archive: { '2026-09-19': [histDone] } })

    const r1 = deleteTemplate(d0, 'tpl1', NOW)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.data.templates).toEqual([])
      expect(r1.data.recycleBin[0].type).toBe('template')
    }

    const r2 = deleteHistory(d0, '2026-09-19', 'h1', NOW)
    expect(r2.ok).toBe(true)
    if (r2.ok) {
      expect(r2.data.archive['2026-09-19']).toEqual([])
      expect(r2.data.recycleBin[0].type).toBe('history')
      expect(r2.data.recycleBin[0].payload).toEqual(histDone)
    }
  })

  it('删除不存在的 id → not-found', () => {
    expect(deleteTodo(data(), 'nope', NOW).ok).toBe(false)
    expect(deleteTemplate(data(), 'nope', NOW).ok).toBe(false)
    expect(deleteHistory(data(), '2026-09-19', 'nope', NOW).ok).toBe(false)
  })
})

describe('E2 恢复：回各自列表末尾；待办受上限约束', () => {
  it('恢复待办 → 追加到待办末尾并从回收站移除', () => {
    const todo = createTodoItem({ content: '找回', now: NOW, id: 't1' })
    const entry = createRecycleEntry({ type: 'todo', payload: todo, deletedAt: NOW, id: 'r1' })
    const keep = createTodoItem({ content: '在列', now: NOW, id: 't2' })
    const d0 = data({ todos: [keep], recycleBin: [entry] })
    const r = restoreEntry(d0, 'r1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.todos.map((t) => t.id)).toEqual(['t2', 't1']) // 末尾
    expect(r.data.recycleBin).toEqual([])
  })

  it('待办满上限 → 恢复被拒，条目留在回收站', () => {
    const todo = createTodoItem({ content: '找回', now: NOW, id: 't1' })
    const entry = createRecycleEntry({ type: 'todo', payload: todo, deletedAt: NOW, id: 'r1' })
    const todos = Array.from({ length: 10 }, (_, i) => createTodoItem({ content: `x${i}`, now: NOW, id: `f${i}` }))
    const d0 = data({ todos, recycleBin: [entry] })
    const r = restoreEntry(d0, 'r1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('limit-reached')
    expect(d0.recycleBin).toHaveLength(1) // 原数据不变
  })

  it('恢复模板 → 追加到模板末尾；恢复历史 → 回到对应日期组末尾', () => {
    const tpl = createTemplateItem({ content: '模板A', now: NOW, id: 'tpl1' })
    const tplKeep = createTemplateItem({ content: '模板B', now: NOW, id: 'tpl2' })
    const hist = createTodoItem({ content: '历史项', now: daysAgo(3), id: 'h1' })
    const histDone = { ...hist, completedAt: daysAgo(2).toISOString() }
    const histKeep = { ...createTodoItem({ content: '保留', now: daysAgo(3), id: 'h2' }), completedAt: daysAgo(2).toISOString() }

    const e1 = createRecycleEntry({ type: 'template', payload: tpl, deletedAt: NOW, id: 'r1' })
    const e2 = createRecycleEntry({ type: 'history', payload: histDone, deletedAt: NOW, id: 'r2' })
    const d0 = data({
      templates: [tplKeep],
      archive: { '2026-09-19': [histKeep] },
      recycleBin: [e1, e2]
    })

    const r1 = restoreEntry(d0, 'r1')
    expect(r1.ok).toBe(true)
    if (r1.ok) expect(r1.data.templates.map((t) => t.id)).toEqual(['tpl2', 'tpl1'])

    const r2 = restoreEntry(r1.ok ? r1.data : d0, 'r2')
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.data.archive['2026-09-19'].map((t) => t.id)).toEqual(['h2', 'h1'])
  })

  it('恢复不存在的条目 → not-found', () => {
    expect(restoreEntry(data(), 'nope').ok).toBe(false)
  })
})

describe('E3 彻底删除与清空（确认框在 UI 层断言）', () => {
  it('彻底删除单条', () => {
    const e1 = createRecycleEntry({ type: 'todo', payload: createTodoItem({ content: 'a', now: NOW }), deletedAt: NOW, id: 'r1' })
    const e2 = createRecycleEntry({ type: 'template', payload: createTemplateItem({ content: 'b', now: NOW }), deletedAt: NOW, id: 'r2' })
    const d0 = data({ recycleBin: [e1, e2] })
    const r = permanentDelete(d0, 'r1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.recycleBin.map((e) => e.id)).toEqual(['r2'])
  })

  it('一键清空', () => {
    const e1 = createRecycleEntry({ type: 'todo', payload: createTodoItem({ content: 'a', now: NOW }), deletedAt: NOW, id: 'r1' })
    const d0 = data({ recycleBin: [e1] })
    const r = clearRecycleBin(d0)
    expect(r.recycleBin).toEqual([])
  })
})

describe('E4/E5 到期自动清理', () => {
  function entryDeletedAt(id: string, at: Date) {
    return createRecycleEntry({ type: 'todo', payload: createTodoItem({ content: id, now: at }), deletedAt: at, id })
  }

  it('E4 时限=7 天：恰好第 7 天清除；未到保留', () => {
    const expired = entryDeletedAt('old', daysAgo(7)) // deletedAt+7d == now → 清除（A4 含恰好到期）
    const fresh = entryDeletedAt('new', daysAgo(6))
    const d0 = data({
      recycleBin: [expired, fresh],
      settings: { ...defaultAppData().settings, recycleKeep: 7 }
    })
    const r = purgeExpired(d0, NOW)
    expect(r.recycleBin.map((e) => e.id)).toEqual(['new'])
  })

  it('E4 时限=30 天：8 天前的保留', () => {
    const d0 = data(
      { recycleBin: [entryDeletedAt('old', daysAgo(8))], settings: { ...defaultAppData().settings, recycleKeep: 30 } }
    )
    expect(purgeExpired(d0, NOW).recycleBin).toHaveLength(1)
  })

  it('E5 时限=永不：永不清除', () => {
    const d0 = data(
      { recycleBin: [entryDeletedAt('old', daysAgo(365))], settings: { ...defaultAppData().settings, recycleKeep: 'never' } }
    )
    expect(purgeExpired(d0, NOW).recycleBin).toHaveLength(1)
  })

  it('E6 清理只移除、绝不新增条目（覆盖导入的历史清空不经回收站，由 CsvService 直接替换实现）', () => {
    const d0 = data(
      { recycleBin: [entryDeletedAt('a', daysAgo(7)), entryDeletedAt('b', daysAgo(1))], settings: { ...defaultAppData().settings, recycleKeep: 7 } }
    )
    const r = purgeExpired(d0, NOW)
    const before = d0.recycleBin.map((e) => e.id)
    const after = r.recycleBin.map((e) => e.id)
    expect(after.every((id) => before.includes(id))).toBe(true)
    expect(after).toEqual(['b'])
  })
})
