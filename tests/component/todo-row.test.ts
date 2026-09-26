import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoRow from '../../src/components/TodoRow.vue'
import { contentBubble } from '../../src/components/content-bubble'
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

  it('内容截断时悬停内容 1 秒 → 气泡状态显示全文（行左侧）；移开消失（8.2-4 重做）', async () => {
    vi.useFakeTimers()
    try {
      const long = makeRow({ content: '很'.repeat(80) })
      const w = mount(TodoRow, { props: { item: long } })
      expect(w.find('[data-testid="row-content"]').classes().join(' ')).toContain('ellipsis')

      // happy-dom 无布局引擎：注入截断测量所需的宽度
      const contentEl = w.find('[data-testid="row-content"]').element
      const inn = contentEl.querySelector('.tt-in') as HTMLElement
      Object.defineProperty(inn, 'offsetWidth', { value: 500, configurable: true })
      Object.defineProperty(contentEl, 'clientWidth', { value: 220, configurable: true })
      Object.defineProperty(w.find('[data-testid="todo-row"]').element, 'getBoundingClientRect', {
        value: () => ({ left: 300, top: 100, right: 560, bottom: 136, width: 260, height: 36, x: 300, y: 100, toJSON: () => ({}) }),
        configurable: true
      })

      await w.find('[data-testid="row-content"]').trigger('mouseenter')
      expect(contentBubble.visible).toBe(false) // 未满 1 秒不显示
      await vi.advanceTimersByTimeAsync(1000)
      expect(contentBubble.visible).toBe(true)
      expect(contentBubble.text).toBe(long.content)
      expect(contentBubble.x).toBeLessThanOrEqual(300) // 行左侧，不遮列表
      expect(contentBubble.y).toBe(118) // 垂直居中对齐行

      await w.find('[data-testid="row-content"]').trigger('mouseleave')
      expect(contentBubble.visible).toBe(false)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('未截断的内容悬停超过 1 秒也不弹气泡（8.2-4：只有确实截断才弹）', async () => {
    vi.useFakeTimers()
    try {
      const w = mount(TodoRow, { props: { item: makeRow() } })
      const contentEl = w.find('[data-testid="row-content"]').element
      const inn = contentEl.querySelector('.tt-in') as HTMLElement
      Object.defineProperty(inn, 'offsetWidth', { value: 60, configurable: true })
      Object.defineProperty(contentEl, 'clientWidth', { value: 220, configurable: true })

      await w.find('[data-testid="row-content"]').trigger('mouseenter')
      await vi.advanceTimersByTimeAsync(1200)
      expect(contentBubble.visible).toBe(false)
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

  it('连点保护窗（8.2-9）：勾选框点击后 450ms 内行双击不触发编辑（第二击偏出按钮落到行上的场景）', async () => {
    const w = mount(TodoRow, { props: { item: makeRow() } })
    await w.find('[data-testid="row-checkbox"]').trigger('click')
    await w.find('[data-testid="todo-row"]').trigger('dblclick')
    expect(w.emitted('toggle')).toHaveLength(1)
    expect(w.emitted('edit')).toBeUndefined()
  })

  it('批量模式（决策#25）：勾选框原位变为选中示意——点勾选框/点行均切换选中，不触发完成', async () => {
    const w = mount(TodoRow, { props: { item: makeRow(), batchMode: true, selected: false } })
    expect(w.find('[data-testid="row-select-circle"]').exists()).toBe(false) // 选择圈方案已否决
    const cb = w.find('[data-testid="row-checkbox"]')
    expect(cb.exists()).toBe(true)
    await cb.trigger('click')
    expect(w.emitted('select-toggle')).toHaveLength(1)
    expect(w.emitted('toggle')).toBeUndefined()
    await w.find('[data-testid="todo-row"]').trigger('click')
    expect(w.emitted('select-toggle')).toHaveLength(2)
    // 批量模式下双击不进编辑
    await w.find('[data-testid="row-content"]').trigger('dblclick')
    expect(w.emitted('edit')).toBeUndefined()
  })

  it('批量模式下拖拽柄置灰禁用（决策#25）；常规模式可拖', async () => {
    const batch = mount(TodoRow, { props: { item: makeRow(), batchMode: true } })
    expect(batch.find('[data-testid="row-handle"]').classes()).toContain('disabled')

    const normal = mount(TodoRow, { props: { item: makeRow() } })
    expect(normal.find('[data-testid="row-handle"]').classes()).not.toContain('disabled')
  })
})
