import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
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

  it('B2 结构：面板位于 .cluster 容器内（簇缩放/令牌挂载点）', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    const cluster = wrapper.find('.cluster')
    expect(cluster.exists()).toBe(true)
    expect(cluster.find('[data-testid="home-panel"]').exists()).toBe(true)
    expect(cluster.find('[data-testid="quick-panel"]').exists()).toBe(true)
    expect(cluster.find('[data-testid="done-panel"]').exists()).toBe(true)
  })

  it('缩放修复：zoom 容器按内容基准尺寸定宽高（+2px 余量，zoom×尺寸=真窗口，无溢出裁切）', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    const style = wrapper.find('.cluster').attributes('style') ?? ''
    // 默认全开 → 簇基准宽 1102、高 640
    expect(style).toMatch(/zoom: [\d.]+; width: calc\(1102px \/ [\d.]+ \+ 2px\); height: calc\(640px \/ [\d.]+ \+ 2px\)/)
  })

  it('面板开关：visibility 占位隐藏（槽位不塌陷，主窗零移动），状态持久化', async () => {
    const { wrapper, store, api } = await mountWithStore(AppShell)
    const homeBefore = wrapper.find('[data-testid="home-panel"]').attributes('style') ?? ''
    const styleBefore = wrapper.find('.cluster').attributes('style')

    await store.updateUiState({ quickVisible: false })
    const quick = wrapper.find('[data-testid="quick-panel"]')
    expect(quick.exists()).toBe(true) // 槽位保留
    expect(quick.classes()).toContain('slot-hidden') // visibility:hidden 占位隐藏（不用 display:none 塌陷）
    expect(wrapper.find('.cluster').attributes('style')).toBe(styleBefore) // 窗口几何恒定
    expect(wrapper.find('[data-testid="home-panel"]').attributes('style') ?? '').toBe(homeBefore) // 主窗零移动
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
    await flushPromises()
    expect(store.uiState.theme).toBe('night')

    await wrapper.find('[data-testid="tb-settings"]').trigger('click')
    expect(api.openChildCalls).toContainEqual({ kind: 'settings' })

    await wrapper.find('[data-testid="tb-tucklock"]').trigger('click')
    await flushPromises()
    expect(store.uiState.tuckLock).toBe(true)

    await wrapper.find('[data-testid="tb-topmost"]').trigger('click')
    await flushPromises()
    expect(store.uiState.topMost).toBe(true)
    expect(api.topMostCalls).toEqual([true])

    await wrapper.find('[data-testid="tb-minimize"]').trigger('click')
    expect(api.minimizeCalls).toBeGreaterThanOrEqual(1)
  })
})
