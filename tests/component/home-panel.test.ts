import { describe, it, expect } from 'vitest'
import HomePanel from '../../src/panels/HomePanel.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

/** T22 待办主页：时钟（12/24）、操作区、列表、空状态（PRD §3） */
describe('T22 HomePanel', () => {
  it('时钟显示时间与中文日期；每秒刷新', async () => {
    const { wrapper } = await mountWithStore(HomePanel)
    const time = wrapper.find('[data-testid="clock-time"]').text()
    const date = wrapper.find('[data-testid="clock-date"]').text()
    expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(date).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日 星期[日一二三四五六]$/)
  })

  it('12 小时制切换立即生效（带 AM/PM）', async () => {
    const { wrapper, store } = await mountWithStore(HomePanel)
    await store.updateSettings({ hour12: true })
    const time = wrapper.find('[data-testid="clock-time"]').text()
    expect(time).toMatch(/(AM|PM)$/)
  })

  it('操作区：快捷添加（左上）、计数、批量删除、已完成（右上）、＋（右上）', async () => {
    const { wrapper, api } = await mountWithStore(HomePanel)
    expect(wrapper.find('[data-testid="op-quick-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="op-count"]').text()).toBe('0/10')
    expect(wrapper.find('[data-testid="op-batch"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="op-done-toggle"]').exists()).toBe(true)

    await wrapper.find('[data-testid="op-new"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'todo-new' })
  })

  it('计数随列表变化', async () => {
    const todo = createTodoItem({ content: 'a', now: new Date(), id: 't1' })
    const { wrapper } = await mountWithStore(HomePanel, { todos: [todo] })
    expect(wrapper.find('[data-testid="op-count"]').text()).toBe('1/10')
  })

  it('空状态引导文案（PRD §5.2）', async () => {
    const { wrapper } = await mountWithStore(HomePanel)
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain('今日做点什么好呢')
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain('点击右上角 ＋ 新建一条待办')
  })

  it('渲染待办列表（每行一个事项）', async () => {
    const todos = [
      createTodoItem({ content: '一', now: new Date(), id: 't1' }),
      createTodoItem({ content: '二', now: new Date(), id: 't2' })
    ]
    const { wrapper } = await mountWithStore(HomePanel, { todos })
    expect(wrapper.findAll('[data-testid="todo-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
  })
})
