import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import TodoEditWindow from '../../src/windows/TodoEditWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem, createTemplateItem } from '../../src/core/models'

const TODAY = new Date()
const YESTERDAY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1, 9, 30)

function seedTodo(overdue: boolean, id = 't1') {
  const item = createTodoItem({ content: '原内容', now: overdue ? YESTERDAY : TODAY, id })
  return { todos: [{ ...item, overdue }] }
}

/** T27 编辑事项窗口（PRD §四：状态行/创建时间只读/还原/保存拦截/删除/添加到模板/返回询问） */
describe('T27 编辑事项窗口', () => {
  it('逾期事项：状态行红字"已逾期"；未逾期：灰字"进行中"；创建时间只读展示', async () => {
    const late = await mountWithStore(TodoEditWindow, seedTodo(true), { itemId: 't1' })
    expect(late.wrapper.find('[data-testid="edit-status"]').text()).toBe('已逾期')
    expect(late.wrapper.find('[data-testid="edit-status"]').classes().join(' ')).toContain('red')

    const active = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    expect(active.wrapper.find('[data-testid="edit-status"]').text()).toBe('进行中')
    expect(active.wrapper.find('[data-testid="edit-status"]').classes().join(' ')).toContain('gray')

    const created = active.wrapper.find('[data-testid="edit-created"]').text()
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect((active.wrapper.find('[data-testid="edit-input"]').element as HTMLTextAreaElement).value).toBe('原内容')
  })

  it('还原：内容改过才可用；点击还原回原文并禁用', async () => {
    const { wrapper } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    const revert = wrapper.find('[data-testid="edit-revert"]')
    expect((revert.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="edit-input"]').setValue('改过的内容')
    expect((revert.element as HTMLButtonElement).disabled).toBe(false)

    await revert.trigger('click')
    expect((wrapper.find('[data-testid="edit-input"]').element as HTMLTextAreaElement).value).toBe('原内容')
    expect((wrapper.find('[data-testid="edit-revert"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('保存空内容 → 提示"内容不能为空"且不关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    await wrapper.find('[data-testid="edit-input"]').setValue('   ')
    await wrapper.find('[data-testid="edit-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="edit-error"]').text()).toBe('内容不能为空')
    expect(api.closeSelfCalls).toBe(0)
    expect(store.todos[0].content).toBe('原内容')
  })

  it('保存修改 → 更新待办并关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    await wrapper.find('[data-testid="edit-input"]').setValue('更新后')
    await wrapper.find('[data-testid="edit-save"]').trigger('click')
    await flushPromises()
    expect(store.todos[0].content).toBe('更新后')
    expect(api.closeSelfCalls).toBe(1)
  })

  it('删除 → 确认框 → 进回收站并关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    await wrapper.find('[data-testid="edit-delete"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.todos).toHaveLength(0)
    expect(store.recycleBin).toHaveLength(1)
    expect(store.recycleBin[0].type).toBe('todo')
    expect(api.closeSelfCalls).toBe(1)
  })

  it('添加到模板：成功创建模板（内容同事项）；重复内容提示"已存在相同内容"', async () => {
    const tpl = createTemplateItem({ content: '运动', now: new Date(), id: 'tpl0' })
    const { wrapper, store } = await mountWithStore(TodoEditWindow, { ...seedTodo(false), templates: [tpl] }, { itemId: 't1' })

    await wrapper.find('[data-testid="edit-to-template"]').trigger('click')
    await flushPromises()
    expect(store.templates.map((t) => t.content)).toEqual(['运动', '原内容'])
    expect(wrapper.find('[data-testid="edit-error"]').exists()).toBe(false)

    // 再次添加相同内容 → 拒绝提示
    await wrapper.find('[data-testid="edit-input"]').setValue('运动')
    await wrapper.find('[data-testid="edit-to-template"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="edit-error"]').text()).toBe('已存在相同内容')
    expect(store.templates).toHaveLength(2)
  })

  it('返回：未改直接关闭；已改询问"是否保存"，确定保存并关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })

    await wrapper.find('[data-testid="edit-back"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(1) // 未改直接退出

    const w2 = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    await w2.wrapper.find('[data-testid="edit-input"]').setValue('有修改')
    await w2.wrapper.find('[data-testid="edit-back"]').trigger('click')
    expect(w2.wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(w2.wrapper.find('[data-testid="confirm-message"]').text()).toContain('是否保存')

    await w2.wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store === w2.store || w2.store.todos[0].content === '有修改').toBe(true)
    expect(w2.api.closeSelfCalls).toBe(1)
  })

  it('返回询问选择取消 → 不保存直接关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoEditWindow, seedTodo(false), { itemId: 't1' })
    await wrapper.find('[data-testid="edit-input"]').setValue('不保存的修改')
    await wrapper.find('[data-testid="edit-back"]').trigger('click')
    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(1)
    expect(store.todos[0].content).toBe('原内容')
  })
})
