import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../src/stores/app'
import { installTestApi, type TestApi } from '../helpers/api'
import { createTodoItem, createTemplateItem, defaultAppData, type AppData } from '../../src/core/models'

function seed(p: Partial<AppData> = {}): Partial<AppData> {
  return { ...defaultAppData(), ...p }
}

/** M3 地基：app store 领域动作与持久化接线（组件测试复用同一内存 API） */
describe('useAppStore', () => {
  let api: TestApi

  beforeEach(() => {
    setActivePinia(createPinia())
    api = installTestApi()
  })

  it('init：载入状态并订阅推送', async () => {
    const store = useAppStore()
    await store.init()
    expect(store.loaded).toBe(true)
    expect(store.todos).toEqual([])
  })

  it('addTodo：上限内追加末尾并持久化', async () => {
    const store = useAppStore()
    await store.init()
    const r1 = await store.addTodo('第一件事')
    const r2 = await store.addTodo('第二件事')
    expect(r1.ok && r2.ok).toBe(true)
    expect(store.todos.map((t) => t.content)).toEqual(['第一件事', '第二件事'])
    expect(api.snapshot().todos).toHaveLength(2)
  })

  it('addTodo：上限拦截返回 limit-reached', async () => {
    const store = useAppStore()
    api = installTestApi(seed({ settings: { ...defaultAppData().settings, maxItems: 1 } }))
    await store.init()
    expect((await store.addTodo('a')).ok).toBe(true)
    const r = await store.addTodo('b')
    expect(r).toEqual({ ok: false, reason: 'limit-reached' })
  })

  it('completeTodo：移入已完成并重算逾期标记', async () => {
    const store = useAppStore()
    api = installTestApi(seed({ todos: [createTodoItem({ content: '跨天', now: new Date(2026, 8, 20, 9), id: 't1' })] }))
    await store.init()
    await store.completeTodo('t1')
    expect(store.todos).toHaveLength(0)
    expect(store.completed).toHaveLength(1)
    expect(store.completed[0].overdue).toBe(true) // 昨天 09-20 创建 → 已逾期
    expect(api.snapshot().completed).toHaveLength(1)
  })

  it('returnToActive：退回待办末尾并重算逾期', async () => {
    // 相对真实日期构造：昨天创建、今天完成（避免 boot 结算归档）
    const t = new Date()
    const yesterday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 9)
    const today8 = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 8)
    const item = createTodoItem({ content: '昨天创建今天完成', now: yesterday, id: 'c1' })
    const done = { ...item, completedAt: today8.toISOString(), overdue: false }
    api = installTestApi(seed({ completed: [done] }))
    const store = useAppStore()
    await store.init()
    const r = await store.returnToActive('c1')
    expect(r.ok).toBe(true)
    expect(store.todos[0].overdue).toBe(true)
    expect(store.completed).toHaveLength(0)
  })

  it('updateSettings：即时生效并联动系统自启', async () => {
    const store = useAppStore()
    await store.init()
    await store.updateSettings({ hour12: true, autoStart: true })
    expect(store.settings.hour12).toBe(true)
    expect(store.settings.autoStart).toBe(true)
    expect(api.autoStartCalls).toEqual([true])
  })

  it('updateUiState：主题/置顶/面板开关并持久化', async () => {
    const store = useAppStore()
    await store.init()
    await store.updateUiState({ theme: 'night', quickVisible: false })
    expect(store.uiState.theme).toBe('night')
    expect(store.uiState.quickVisible).toBe(false)
    expect(api.snapshot().uiState.theme).toBe('night')
  })

  it('onStateUpdated 推送：替换本地状态（主进程结算后）', async () => {
    const store = useAppStore()
    await store.init()
    const pushed = seed({ todos: [createTodoItem({ content: '推送', now: new Date(), id: 'p1' })] })
    api.emitStateUpdated(pushed as AppData)
    expect(store.todos.map((t) => t.content)).toEqual(['推送'])
  })

  it('模板动作：创建查重/一键添加/删除（B1.5：删除即永久删除）', async () => {
    installTestApi(
      seed({ templates: [createTemplateItem({ content: '喝水', now: new Date(), id: 'tpl1' })] })
    )
    const store = useAppStore()
    await store.init()
    expect((await store.createTemplate('喝水')).ok).toBe(false)
    expect((await store.createTemplate('运动')).ok).toBe(true)
    const r = await store.quickAdd('tpl1')
    expect(r.ok).toBe(true)
    expect(store.todos.map((t) => t.content)).toEqual(['喝水'])
    expect(store.templates).toHaveLength(2) // 模板保留

    await store.deleteTemplate('tpl1')
    expect(store.templates).toHaveLength(1)
    expect(store.recycleBin).toBeUndefined() // 回收站整体退场
  })
})
