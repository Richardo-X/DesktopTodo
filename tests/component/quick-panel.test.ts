import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import QuickPanel from '../../src/panels/QuickPanel.vue'
import AppShell from '../../src/panels/AppShell.vue'
import { mountWithStore } from '../helpers/mount'
import { useUiStore } from '../../src/stores/ui'
import { createTemplateItem, createTodoItem } from '../../src/core/models'

function tpl(id: string, content: string) {
  return createTemplateItem({ content, now: new Date(2026, 8, 20, 9), id })
}

/** T29 快捷添加面板（PRD §五：标题 N/10、行+一键添加、双击编辑、底部说明、批量删除） */
describe('T29 快捷添加面板', () => {
  it('标题"模板 · N/10"；底部说明文案', async () => {
    const { wrapper } = await mountWithStore(QuickPanel, { templates: [tpl('a', '喝水'), tpl('b', '运动')] })
    expect(wrapper.find('[data-testid="quick-title"]').text()).toBe('模板 · 2/10')
    expect(wrapper.find('[data-testid="quick-note"]').text()).toBe(
      '模板不计入待办数量上限；点击条目右侧 ＋ 可加入今日待办，模板不会消失'
    )
  })

  it('模板行：内容 + 右端「＋」；一键添加到待办末尾且模板保留', async () => {
    const todo = createTodoItem({ content: '已有', now: new Date(), id: 't0' })
    const { wrapper, store } = await mountWithStore(QuickPanel, {
      todos: [todo],
      templates: [tpl('a', '喝水'), tpl('b', '运动')]
    })
    const rows = wrapper.findAll('[data-testid="tpl-row"]')
    expect(rows).toHaveLength(2)

    await rows[1].find('[data-testid="tpl-add"]').trigger('click')
    await flushPromises()
    expect(store.todos.map((t) => t.content)).toEqual(['已有', '运动']) // 末尾
    expect(store.templates).toHaveLength(2) // 模板保留
  })

  it('待办满上限时一键添加被拦截并提示', async () => {
    const { wrapper } = await mountWithStore(QuickPanel, {
      templates: [tpl('a', '喝水')],
      settings: { maxItems: 1, hour12: false, autoStart: false, doneSort: 'asc' },
      todos: [createTodoItem({ content: '占满', now: new Date(), id: 't0' })]
    })
    await wrapper.find('[data-testid="tpl-add"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="quick-error"]').text()).toContain('上限')
  })

  it('双击模板 → 打开编辑窗口；「＋」→ 打开新建模板窗口', async () => {
    const { wrapper, api } = await mountWithStore(QuickPanel, { templates: [tpl('a', '喝水')] })
    await wrapper.find('[data-testid="tpl-row"]').trigger('dblclick')
    expect(api.openChildCalls).toContainEqual({ kind: 'template-edit', id: 'a' })

    await wrapper.find('[data-testid="quick-new"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'template-new' })
  })

  it('其他列表批量进行中：快捷添加面板整面板冻结（8.2-7 全禁）；自身批量时不冻结', async () => {
    const { wrapper } = await mountWithStore(QuickPanel, { templates: [tpl('a', '喝水')] })
    const ui = useUiStore()
    ui.enterBatch('todos')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="quick-panel"]').classes()).toContain('frozen')

    ui.enterBatch('templates')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="quick-panel"]').classes()).not.toContain('frozen')
  })

  it('连点「＋」不触发行双击→不弹编辑模板窗口（8.2-5：plusbox dblclick 不冒泡）', async () => {
    const { wrapper, api } = await mountWithStore(QuickPanel, { templates: [tpl('a', '喝水')] })
    await wrapper.find('[data-testid="tpl-add"]').trigger('dblclick')
    await flushPromises()
    expect(api.openChildCalls).toHaveLength(0)
  })

  it('批量删除：进多选、选择、删除所选直接删除（B1.5）', async () => {
    const { wrapper, store } = await mountWithStore(AppShell, { templates: [tpl('a', '一'), tpl('b', '二')] })
    await wrapper.find('[data-testid="quick-batch"]').trigger('click')
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(true)

    const rows = wrapper.findAll('[data-testid="tpl-row"]')
    await rows[0].trigger('click')
    await rows[1].trigger('click')
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 2 项')

    await wrapper.find('[data-testid="batch-delete"]').trigger('click')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.templates).toHaveLength(0)
    expect('recycleBin' in store.data).toBe(false) // 回收站整体退场
  })

  it('模板拖拽排序后持久化', async () => {
    const { store, api } = await mountWithStore(QuickPanel, { templates: [tpl('a', '一'), tpl('b', '二'), tpl('c', '三')] })
    await store.reorderTemplates(0, 2)
    expect(store.templates.map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(api.snapshot().templates.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })
})
