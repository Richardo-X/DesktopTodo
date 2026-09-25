import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DonePanel from '../../src/panels/DonePanel.vue'
import DetailWindow from '../../src/windows/DetailWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

const T = new Date()
const TODAY_KEY = `${T.getFullYear()}-${String(T.getMonth() + 1).padStart(2, '0')}-${String(T.getDate()).padStart(2, '0')}`

function doneToday(id: string, content: string, hour: number, overdue = false) {
  const item = createTodoItem({ content, now: new Date(T.getFullYear(), T.getMonth(), T.getDate(), 1), id })
  return { ...item, completedAt: new Date(T.getFullYear(), T.getMonth(), T.getDate(), hour).toISOString(), overdue }
}

/** T31 已完成面板（PRD §六：反选退回/详情/排序切换/历史按钮/空提示） */
describe('T31 已完成面板', () => {
  it('标题"已完成 · N"；行含勾选框/内容/逾期标签/完成时间', async () => {
    const { wrapper } = await mountWithStore(DonePanel, {
      completed: [doneToday('a', '喝水', 8), doneToday('b', '运动', 9, true)]
    })
    expect(wrapper.find('[data-testid="done-title"]').text()).toBe('已完成 · 2')
    const rows = wrapper.findAll('[data-testid="done-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('[data-testid="done-check"]').exists()).toBe(true)
    expect(rows[1].find('[data-testid="done-overdue-tag"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="done-time"]').text()).toMatch(/^\d{2}:\d{2}/)
  })

  it('默认正序（最早完成在上）；切换倒序后历史页共享设置', async () => {
    const { wrapper, store, api } = await mountWithStore(DonePanel, {
      completed: [doneToday('a', '早', 8), doneToday('b', '晚', 10)]
    })
    let ids = wrapper.findAll('[data-testid="done-row"]').map((r) => r.attributes('data-id'))
    expect(ids).toEqual(['a', 'b']) // 正序

    await wrapper.find('[data-testid="done-sort"]').trigger('click')
    await flushPromises()
    ids = wrapper.findAll('[data-testid="done-row"]').map((r) => r.attributes('data-id'))
    expect(ids).toEqual(['b', 'a'])
    expect(api.snapshot().settings.doneSort).toBe('desc')
    expect(store.settings.doneSort).toBe('desc')
  })

  it('排序按钮为原型 SVG 图标（无文字），title 反映当前方向', async () => {
    const { wrapper } = await mountWithStore(DonePanel, {
      completed: [doneToday('a', '早', 8), doneToday('b', '晚', 10)]
    })
    const btn = wrapper.find('[data-testid="done-sort"]')
    expect(btn.find('svg').exists()).toBe(true) // 原型图标
    expect(btn.text().trim()).toBe('') // 无文字
    expect(btn.attributes('title')).toContain('正序')

    await btn.trigger('click')
    expect(btn.attributes('title')).toContain('倒序')
  })

  it('勾选框反选退回待办', async () => {
    const { wrapper, store } = await mountWithStore(DonePanel, { completed: [doneToday('a', '喝水', 8)] })
    await wrapper.find('[data-testid="done-check"]').trigger('click')
    await flushPromises()
    expect(store.todos).toHaveLength(1)
    expect(store.completed).toHaveLength(0)
  })

  it('双击行打开详情窗口；底部历史按钮打开历史窗口', async () => {
    const { wrapper, api } = await mountWithStore(DonePanel, { completed: [doneToday('a', '喝水', 8)] })
    await wrapper.find('[data-testid="done-row"]').trigger('dblclick')
    expect(api.openChildCalls).toContainEqual({ kind: 'detail', id: 'a' })

    await wrapper.find('[data-testid="done-history"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'history' })
  })

  it('空提示"今天也要继续加油"（决策#18）', async () => {
    const { wrapper } = await mountWithStore(DonePanel)
    expect(wrapper.find('[data-testid="done-empty"]').text()).toBe('今天也要继续加油')
  })

  it('今天键一致（供测试对照）', () => {
    expect(TODAY_KEY).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/** T32 详情窗口（纯查看四项 + 关闭，速查 #13） */
describe('T32 详情窗口', () => {
  it('显示内容、创建时间、完成时间、逾期标签（已逾期）+ 仅「关闭」按钮', async () => {
    const item = { ...createTodoItem({ content: '跨天完成', now: new Date(T.getFullYear(), T.getMonth(), 10, 9), id: 'x' }), completedAt: new Date(T.getFullYear(), T.getMonth(), T.getDate(), 8).toISOString() }
    const { wrapper, api } = await mountWithStore(DonePanel, { completed: [item] }, { itemId: 'x' })
    // 用 DonePanel 挂载环境直接测 DetailWindow 组件
    const detail = await mountWithStore(DetailWindow, { completed: [item] }, { itemId: 'x' })
    expect(detail.wrapper.find('[data-testid="detail-content"]').text()).toBe('跨天完成')
    expect(detail.wrapper.find('[data-testid="detail-created"]').text()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(detail.wrapper.find('[data-testid="detail-completed"]').text()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(detail.wrapper.find('[data-testid="detail-overdue"]').text()).toBe('已逾期')
    expect(detail.wrapper.find('[data-testid="detail-close"]').exists()).toBe(true)
    expect(detail.wrapper.findAll('button')).toHaveLength(1) // 只有「关闭」

    await detail.wrapper.find('[data-testid="detail-close"]').trigger('click')
    expect(detail.api.closeSelfCalls).toBe(1)
    void api
    void wrapper
  })

  it('未逾期完成 → "未逾期"', async () => {
    const item = {
      ...createTodoItem({ content: '当天完成', now: new Date(T.getFullYear(), T.getMonth(), T.getDate(), 1), id: 'y' }),
      completedAt: new Date(T.getFullYear(), T.getMonth(), T.getDate(), 8).toISOString()
    }
    const detail = await mountWithStore(DetailWindow, { completed: [item] }, { itemId: 'y' })
    expect(detail.wrapper.find('[data-testid="detail-overdue"]').text()).toBe('未逾期')
  })
})
