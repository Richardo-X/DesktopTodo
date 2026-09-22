import { describe, it, expect, beforeEach } from 'vitest'
import AppShell from '../../src/panels/AppShell.vue'
import { mountWithStore } from '../helpers/mount'

beforeEach(() => {
  document.body.innerHTML = ''
})

/** T21 应用骨架：三面板簇、面板开关（记忆）、标题栏工具栏五按钮 */
describe('T21 AppShell 三面板簇', () => {
  it('默认渲染快捷添加/主窗/已完成三面板', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="done-panel"]').exists()).toBe(true)
  })

  it('面板开关：关闭快捷面板后不渲染，且状态持久化', async () => {
    const { wrapper, store, api } = await mountWithStore(AppShell)
    await store.updateUiState({ quickVisible: false })
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="done-panel"]').exists()).toBe(true)
    expect(api.snapshot().uiState.quickVisible).toBe(false)
  })

  it('主题属性注入：day/night', async () => {
    const { wrapper, store } = await mountWithStore(AppShell)
    expect(wrapper.attributes('data-theme')).toBe('day')
    await store.updateUiState({ theme: 'night' })
    expect(wrapper.attributes('data-theme')).toBe('night')
  })
})

describe('T21 标题栏工具栏五按钮', () => {
  it('主题切换/设置/缩进锁定/置顶/×', async () => {
    const { wrapper, store, api } = await mountWithStore(AppShell)
    await wrapper.find('[data-testid="tb-theme"]').trigger('click')
    expect(store.uiState.theme).toBe('night')

    await wrapper.find('[data-testid="tb-settings"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'settings' })

    await wrapper.find('[data-testid="tb-tucklock"]').trigger('click')
    expect(store.uiState.tuckLock).toBe(true)

    await wrapper.find('[data-testid="tb-topmost"]').trigger('click')
    expect(store.uiState.topMost).toBe(true)
    expect(api.topMostCalls).toEqual([true])

    await wrapper.find('[data-testid="tb-minimize"]').trigger('click')
    expect(api.minimizeCalls).toBeGreaterThanOrEqual(1)
  })
})
