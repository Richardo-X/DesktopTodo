import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import TodoNewWindow from '../../src/windows/TodoNewWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

/** T26 新增事项窗口（PRD §四：300字+计数+将满变红、清空、禁用逻辑、返回询问、末尾插入） */
describe('T26 新增事项窗口', () => {
  it('初始：输入框空、计数 0/300、「新建事项」不可用', async () => {
    const { wrapper } = await mountWithStore(TodoNewWindow)
    const input = wrapper.find('[data-testid="new-input"]')
    expect((input.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-testid="new-count"]').text()).toBe('0/300')
    expect((wrapper.find('[data-testid="new-submit"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('输入后可用；创建成功追加到待办列表末尾并关闭窗口', async () => {
    const existing = createTodoItem({ content: '已有', now: new Date(), id: 't0' })
    const { wrapper, store, api } = await mountWithStore(TodoNewWindow, { todos: [existing] })

    await wrapper.find('[data-testid="new-input"]').setValue('新事项')
    expect((wrapper.find('[data-testid="new-submit"]').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('[data-testid="new-submit"]').trigger('click')
    await flushPromises()
    expect(store.todos.map((t) => t.content)).toEqual(['已有', '新事项']) // 末尾
    expect(api.closeSelfCalls).toBe(1)
  })

  it('300 字上限：无法继续输入，计数变红；清空后恢复', async () => {
    const { wrapper } = await mountWithStore(TodoNewWindow)
    const input = wrapper.find('[data-testid="new-input"]')
    await input.setValue('a'.repeat(300))
    expect((input.element as HTMLTextAreaElement).value).toHaveLength(300)
    expect(wrapper.find('[data-testid="new-count"]').text()).toBe('300/300')
    expect(wrapper.find('[data-testid="new-count"]').classes().join(' ')).toContain('danger')

    await wrapper.find('[data-testid="new-clear"]').trigger('click')
    expect((input.element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('[data-testid="new-count"]').classes().join(' ')).not.toContain('danger')
  })

  it('返回：无输入直接关闭', async () => {
    const { wrapper, api } = await mountWithStore(TodoNewWindow)
    await wrapper.find('[data-testid="new-back"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(1)
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
  })

  it('返回：有输入 → 询问"返回将不保存"；取消留下，确定不保存关闭', async () => {
    const { wrapper, api, store } = await mountWithStore(TodoNewWindow)
    await wrapper.find('[data-testid="new-input"]').setValue('未保存内容')
    await wrapper.find('[data-testid="new-back"]').trigger('click')

    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('返回将不保存')

    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(0)
    expect((wrapper.find('[data-testid="new-input"]').element as HTMLTextAreaElement).value).toBe('未保存内容')

    await wrapper.find('[data-testid="new-back"]').trigger('click')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(api.closeSelfCalls).toBe(1)
    expect(store.todos).toHaveLength(0) // 未保存
  })
})
