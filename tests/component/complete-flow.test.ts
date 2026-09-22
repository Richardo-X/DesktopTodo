import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import HomePanel from '../../src/panels/HomePanel.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

/** T24 勾选完成流：动画后移入已完成，逾期标记带入（PRD §5.2/验收 12） */
describe('T24 勾选完成流', () => {
  function seedOne(overdue: boolean) {
    const item = createTodoItem({ content: '跨天事项', now: new Date(2026, 8, 20, 9), id: 't1' })
    return { todos: [{ ...item, overdue }] }
  }

  it('勾选 → 行播放离场动画 → 移入已完成并带入逾期标记', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, store } = await mountWithStore(HomePanel, seedOne(true))
      expect(store.completed).toHaveLength(0)

      await wrapper.find('[data-testid="row-checkbox"]').trigger('click')
      // 动画期间：行仍在列表并带 leaving 类
      expect(wrapper.find('[data-testid="todo-row"]').classes().join(' ')).toContain('leaving')
      expect(store.completed).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
      // 动画结束：从待办消失、进入已完成、逾期标记带入
      expect(wrapper.find('[data-testid="todo-row"]').exists()).toBe(false)
      expect(store.completed).toHaveLength(1)
      expect(store.completed[0].overdue).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('未逾期事项完成后标记为 false', async () => {
    vi.useFakeTimers()
    try {
      const t = new Date()
      const today = createTodoItem(
        { content: '今天', now: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 1), id: 't2' }
      )
      const { wrapper, store } = await mountWithStore(HomePanel, { todos: [today] })
      await wrapper.find('[data-testid="row-checkbox"]').trigger('click')
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
      expect(store.completed).toHaveLength(1)
      expect(store.completed[0].overdue).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
