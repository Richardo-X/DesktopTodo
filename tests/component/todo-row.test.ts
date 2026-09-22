import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoRow from '../../src/components/TodoRow.vue'
import { createTodoItem } from '../../src/core/models'

function makeRow(overrides = {}) {
  return {
    ...createTodoItem({ content: '喝水', now: new Date(2026, 8, 21, 9), id: 't1' }),
    ...overrides
  }
}

/** T23 事项行：手柄/截断/悬停1s气泡/逾期红标签/右端勾选框（PRD §3） */
describe('T23 TodoRow', () => {
  it('渲染手柄、内容、右端勾选框', () => {
    const w = mount(TodoRow, { props: { item: makeRow() } })
    expect(w.find('[data-testid="row-handle"]').exists()).toBe(true)
    expect(w.find('[data-testid="row-content"]').text()).toBe('喝水')
    expect(w.find('[data-testid="row-checkbox"]').exists()).toBe(true)
  })

  it('逾期 → 红色"逾期"标签；未逾期 → 无标签', async () => {
    const on = mount(TodoRow, { props: { item: makeRow({ overdue: true }) } })
    expect(on.find('[data-testid="row-overdue-tag"]').exists()).toBe(true)
    expect(on.find('[data-testid="row-overdue-tag"]').classes().join(' ')).toMatch(/overdue|red/)

    const off = mount(TodoRow, { props: { item: makeRow({ overdue: false }) } })
    expect(off.find('[data-testid="row-overdue-tag"]').exists()).toBe(false)
  })

  it('内容超长 → 截断样式；悬停 1 秒后气泡显示全文；提前移开不出现', async () => {
    vi.useFakeTimers()
    try {
      const long = makeRow({ content: '很'.repeat(80) })
      const w = mount(TodoRow, { props: { item: long }, attachTo: document.body })
      expect(w.find('[data-testid="row-content"]').classes().join(' ')).toContain('ellipsis')

      await w.find('[data-testid="todo-row"]').trigger('mouseenter')
      expect(w.find('[data-testid="row-bubble"]').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(999)
      expect(w.find('[data-testid="row-bubble"]').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      expect(w.find('[data-testid="row-bubble"]').exists()).toBe(true)
      expect(w.find('[data-testid="row-bubble"]').text()).toBe(long.content)

      // 移开关闭气泡
      await w.find('[data-testid="todo-row"]').trigger('mouseleave')
      await vi.advanceTimersByTimeAsync(1200)
      expect(w.find('[data-testid="row-bubble"]').exists()).toBe(false)

      // 未满 1 秒移开 → 气泡永不出现
      await w.find('[data-testid="todo-row"]').trigger('mouseenter')
      await vi.advanceTimersByTimeAsync(500)
      await w.find('[data-testid="todo-row"]').trigger('mouseleave')
      await vi.advanceTimersByTimeAsync(1200)
      expect(w.find('[data-testid="row-bubble"]').exists()).toBe(false)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('双击行（手柄/勾选框除外）→ emit edit；单击不触发', async () => {
    const w = mount(TodoRow, { props: { item: makeRow() } })
    await w.find('[data-testid="row-content"]').trigger('dblclick')
    expect(w.emitted('edit')).toHaveLength(1)

    await w.find('[data-testid="todo-row"]').trigger('click')
    expect(w.emitted('edit')).toHaveLength(1) // 单击无操作
  })

  it('双击手柄/勾选框不打开编辑', async () => {
    const w = mount(TodoRow, { props: { item: makeRow() } })
    await w.find('[data-testid="row-handle"]').trigger('dblclick')
    await w.find('[data-testid="row-checkbox"]').trigger('dblclick')
    expect(w.emitted('edit')).toBeUndefined()
  })

  it('勾选框点击 → emit toggle；与 edit 互不触发', async () => {
    const w = mount(TodoRow, { props: { item: makeRow() } })
    await w.find('[data-testid="row-checkbox"]').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
    expect(w.emitted('edit')).toBeUndefined()
  })

  it('批量模式：行点击=选中切换，显示选择圈而非勾选框', async () => {
    const w = mount(TodoRow, { props: { item: makeRow(), batchMode: true, selected: false } })
    expect(w.find('[data-testid="row-select-circle"]').exists()).toBe(true)
    await w.find('[data-testid="todo-row"]').trigger('click')
    expect(w.emitted('select-toggle')).toHaveLength(1)
    // 批量模式下双击不进编辑
    await w.find('[data-testid="row-content"]').trigger('dblclick')
    expect(w.emitted('edit')).toBeUndefined()
  })
})
