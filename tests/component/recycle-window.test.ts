import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import RecycleWindow from '../../src/windows/RecycleWindow.vue'
import { mountWithStore } from '../helpers/mount'
import {
  createTodoItem,
  createTemplateItem,
  createRecycleEntry,
  defaultAppData,
  type AppData
} from '../../src/core/models'

const NOW = new Date()

function seed(): Partial<AppData> {
  const todo = createTodoItem({ content: '被删的待办', now: NOW, id: 't1' })
  const template = createTemplateItem({ content: '被删的模板', now: NOW, id: 'tp1' })
  const hist = {
    ...createTodoItem({ content: '被删的历史', now: new Date(2026, 8, 1, 8), id: 'h1' }),
    completedAt: new Date(2026, 8, 1, 18).toISOString()
  }
  return {
    ...defaultAppData(),
    archive: { '2026-09-01': [] },
    recycleBin: [
      createRecycleEntry({ type: 'todo', payload: todo, deletedAt: NOW, id: 'r1' }),
      createRecycleEntry({ type: 'template', payload: template, deletedAt: NOW, id: 'r2' }),
      createRecycleEntry({ type: 'history', payload: hist, deletedAt: NOW, id: 'r3' })
    ]
  }
}

/** T35 回收站（PRD §5.6：三类分组、恢复回末尾、彻底删除/清空确认框、删除时间） */
describe('T35 回收站窗口', () => {
  it('按类型分组展示，每条显示内容与删除时间', async () => {
    const { wrapper } = await mountWithStore(RecycleWindow, seed())
    const groups = wrapper.findAll('[data-testid="recycle-group"]')
    expect(groups).toHaveLength(3)
    expect(wrapper.find('[data-group="todo"]').text()).toContain('待办')
    expect(wrapper.find('[data-group="template"]').text()).toContain('模板')
    expect(wrapper.find('[data-group="history"]').text()).toContain('历史')

    const first = wrapper.find('[data-testid="recycle-entry-r1"]')
    expect(first.text()).toContain('被删的待办')
    expect(first.text()).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  })

  it('恢复待办 → 回待办末尾；恢复历史 → 回对应日期组', async () => {
    const keep = createTodoItem({ content: '在列', now: NOW, id: 't0' })
    const s = seed()
    s.todos = [keep]
    const { wrapper, store } = await mountWithStore(RecycleWindow, s)

    await wrapper.find('[data-testid="recycle-restore-r1"]').trigger('click')
    await flushPromises()
    expect(store.todos.map((t) => t.id)).toEqual(['t0', 't1']) // 末尾

    await wrapper.find('[data-testid="recycle-restore-r3"]').trigger('click')
    await flushPromises()
    expect(store.archive['2026-09-01'].map((t) => t.id)).toEqual(['h1'])
  })

  it('恢复模板 → 回模板列表', async () => {
    const { wrapper, store } = await mountWithStore(RecycleWindow, seed())
    await wrapper.find('[data-testid="recycle-restore-r2"]').trigger('click')
    await flushPromises()
    expect(store.templates.map((t) => t.content)).toEqual(['被删的模板'])
  })

  it('彻底删除单条 → 确认框 → 移除', async () => {
    const { wrapper, store } = await mountWithStore(RecycleWindow, seed())
    await wrapper.find('[data-testid="recycle-delete-r1"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.recycleBin.map((e) => e.id)).toEqual(['r2', 'r3'])
  })

  it('一键清空 → 确认框 → 全部移除', async () => {
    const { wrapper, store } = await mountWithStore(RecycleWindow, seed())
    await wrapper.find('[data-testid="recycle-clear"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.recycleBin).toHaveLength(0)
  })

  it('空回收站提示', async () => {
    const { wrapper } = await mountWithStore(RecycleWindow)
    expect(wrapper.find('[data-testid="recycle-empty"]').exists()).toBe(true)
  })
})
