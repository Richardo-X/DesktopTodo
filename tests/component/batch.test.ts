import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import AppShell from '../../src/panels/AppShell.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

function seedTodos() {
  return {
    todos: [
      createTodoItem({ content: '甲', now: new Date(2026, 8, 21, 9), id: 't1' }),
      createTodoItem({ content: '乙', now: new Date(2026, 8, 21, 10), id: 't2' }),
      createTodoItem({ content: '丙', now: new Date(2026, 8, 21, 11), id: 't3' })
    ]
  }
}

/** T25 批量删除：多选状态机 + 确认后进回收站（PRD §5.2/验收 14） */
describe('T25 批量删除模式', () => {
  it('进入批量模式：批量条出现，行显示选择圈，点击行=选中/取消', async () => {
    const { wrapper } = await mountWithStore(AppShell, seedTodos())
    await wrapper.find('[data-testid="op-batch"]').trigger('click')

    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 0 项')

    const rows = wrapper.findAll('[data-testid="todo-row"]')
    await rows[0].trigger('click')
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 1 项')
    await rows[0].trigger('click')
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 0 项')
  })

  it('全选 → 全部选中；取消 → 退出批量模式', async () => {
    const { wrapper } = await mountWithStore(AppShell, seedTodos())
    await wrapper.find('[data-testid="op-batch"]').trigger('click')

    await wrapper.find('[data-testid="batch-select-all"]').trigger('click')
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 3 项')
    expect(wrapper.findAll('[data-testid="row-select-circle"].checked')).toHaveLength(3)

    await wrapper.find('[data-testid="batch-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="row-checkbox"]')).toHaveLength(3) // 勾选框恢复
  })

  it('删除所选 → 确认框（提示不可恢复）→ 确认后直接删除并退出批量模式（B1.5）', async () => {
    const { wrapper, store } = await mountWithStore(AppShell, seedTodos())
    await wrapper.find('[data-testid="op-batch"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="todo-row"]')
    await rows[0].trigger('click')
    await rows[2].trigger('click')

    await wrapper.find('[data-testid="batch-delete"]').trigger('click')
    // 确认框出现
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('无法恢复')
    expect(wrapper.find('[data-testid="confirm-ok"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-cancel"]').exists()).toBe(true)

    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.todos).toHaveLength(1)
    expect(store.todos[0].id).toBe('t2')
    expect(store.recycleBin).toBeUndefined() // 回收站整体退场
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(false)
  })

  it('删除所选 → 取消 → 不删除，保持批量模式', async () => {
    const { wrapper, store } = await mountWithStore(AppShell, seedTodos())
    await wrapper.find('[data-testid="op-batch"]').trigger('click')
    await wrapper.findAll('[data-testid="todo-row"]')[0].trigger('click')

    await wrapper.find('[data-testid="batch-delete"]').trigger('click')
    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(store.todos).toHaveLength(3)
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="batch-count"]').text()).toBe('已选 1 项')
  })

  it('批量模式下勾选框被选择圈替代，无法触发完成', async () => {
    const { wrapper } = await mountWithStore(AppShell, seedTodos())
    await wrapper.find('[data-testid="op-batch"]').trigger('click')
    expect(wrapper.find('[data-testid="row-checkbox"]').exists()).toBe(false)
  })
})
