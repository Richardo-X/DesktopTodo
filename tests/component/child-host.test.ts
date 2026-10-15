import { describe, it, expect, beforeEach } from 'vitest'
import ChildHost from '../../src/windows/ChildHost.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem, defaultAppData, type AppData } from '../../src/core/models'

beforeEach(() => {
  document.body.innerHTML = ''
})

function seedWithTodo(): Partial<AppData> {
  return {
    ...defaultAppData(),
    todos: [createTodoItem({ content: '一条待办', now: new Date(), id: 't1' })]
  }
}

/** T36/T37 ChildHost：按 kind 渲染对应子窗口页面；主题/字体属性注入 */
describe('ChildHost', () => {
  it('kind=settings → 渲染设置窗口', async () => {
    const { wrapper } = await mountWithStore(ChildHost, seedWithTodo(), { kind: 'settings' })
    expect(wrapper.find('[data-testid="set-max"]').exists()).toBe(true)
  })

  it('kind=todo-edit + id → 渲染编辑窗口并载入内容', async () => {
    const { wrapper } = await mountWithStore(ChildHost, seedWithTodo(), { kind: 'todo-edit', id: 't1' })
    expect((wrapper.find('[data-testid="edit-input"]').element as HTMLTextAreaElement).value).toBe('一条待办')
  })

  it('kind=history → 渲染历史窗口', async () => {
    const { wrapper } = await mountWithStore(ChildHost, seedWithTodo(), { kind: 'history' })
    expect(wrapper.find('[data-testid="hist-today"]').exists()).toBe(true)
  })

  it('kind=detail + id → 渲染详情窗口', async () => {
    const item = createTodoItem({ content: '详情内容', now: new Date(), id: 't1' })
    const { wrapper } = await mountWithStore(ChildHost, { todos: [item] }, { kind: 'detail', id: 't1' })
    expect(wrapper.find('[data-testid="detail-content"]').text()).toBe('详情内容')
  })

  it('主题注入；B3 起 data-font/--fs 机制已移除（决策#3）', async () => {
    const { wrapper, store } = await mountWithStore(ChildHost, seedWithTodo(), { kind: 'settings' })
    await store.updateUiState({ theme: 'night' })
    expect(wrapper.find('[data-testid="child-root"]').attributes('data-theme')).toBe('night')
    expect(wrapper.find('[data-testid="child-root"]').attributes('data-font')).toBeUndefined()
  })

  it('缩放呈现（用户 2026-10-14 文字跟随；2026-10-15 手感迭代）——zoom=视口反推（resize 同帧单通道，store 仅持久化）', async () => {
    const { wrapper } = await mountWithStore(ChildHost, seedWithTodo(), { kind: 'settings' })
    // 视口=基准×1.2（460×1.2=552）→ zoom 反推 1.2（与窗口 resize 同帧，不经 store 广播）
    Object.defineProperty(window, 'innerWidth', { value: 552, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    const root = wrapper.find('[data-testid="child-root"]')
    const style = String(root.attributes('style'))
    expect(style).toContain('width: 460px')
    expect(style).toContain('height: 540px')
    expect(style).toContain('zoom: 1.2')
  })
})
