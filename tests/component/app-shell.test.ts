import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import AppShell from '../../src/panels/AppShell.vue'
import { mountWithStore } from '../helpers/mount'
import { useUiStore } from '../../src/stores/ui'


async function mountWithStoreGetUi() {
  const r = await mountWithStore(AppShell)
  const ui = useUiStore()
  return { ...r, ui }
}

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

  it('四轮定稿 B：关闭面板即移出 DOM，簇宽收缩为可见面板并集（去掉占位）', async () => {
    const { wrapper, store, api } = await mountWithStore(AppShell)

    await store.updateUiState({ quickVisible: false })
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(false) // v-if 移出，无占位
    expect(wrapper.find('[data-testid="home-panel"]').exists()).toBe(true)
    let style = wrapper.find('.cluster').attributes('style') ?? ''
    expect(style).toMatch(/width: calc\(786px \/ [\d.]+ \+ 2px\)/) // 470+316
    expect(api.snapshot().uiState.quickVisible).toBe(false)

    await store.updateUiState({ doneVisible: false })
    expect(wrapper.find('[data-testid="done-panel"]').exists()).toBe(false)
    style = wrapper.find('.cluster').attributes('style') ?? ''
    expect(style).toMatch(/width: calc\(470px \/ [\d.]+ \+ 2px\)/) // 只剩待办

    await store.updateUiState({ quickVisible: true })
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(true)
    style = wrapper.find('.cluster').attributes('style') ?? ''
    expect(style).toMatch(/width: calc\(786px \/ [\d.]+ \+ 2px\)/)
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

  it('三轮8.2-6：标题栏照原型——左侧品牌区（勾图标+桌面待办），右侧同一组5按钮', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    expect(wrapper.find('[data-testid="tb-brand"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tb-brand"] svg').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tb-title"]').text()).toBe('桌面待办')

    // 五按钮同组（原型 .win-actions 单组）；当前实现为两组（4左+×右）→ 红
    const groups = wrapper.findAll('[data-testid="home-panel"] .win-actions')
    expect(groups).toHaveLength(1)
    const order = groups[0].findAll('.wbtn').map((b) => b.attributes('data-testid'))
    expect(order).toEqual(['tb-theme', 'tb-settings', 'tb-tucklock', 'tb-topmost', 'tb-minimize'])
  })

  it('三轮8.2-1：缩进态渲染胶囊短条；悬停胶囊弹出（感应区=胶囊本身）', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    const ui = useUiStore()
    ui.dispatchTuck({ type: 'snap' })
    ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
    ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
    await wrapper.vm.$nextTick()
    expect(ui.tuck.tucked).toBe(true)

    const bar = wrapper.find('.tuck-bar')
    expect(bar.exists()).toBe(true)

    // 悬停胶囊 → 弹出（旧实现 mouseenter 绑在 document/stage 上，胶囊无绑定 → 红）
    await bar.trigger('mouseenter')
    expect(ui.tuck.tucked).toBe(false)
  })

  it('三轮CI：dispatchTuck 仅在 tucked 变化时同步主进程（事件乱序不回弹窗口）', async () => {
    const { api, ui } = await mountWithStoreGetUi()
    const before = api.tuckedCalls.length
    ui.dispatchTuck({ type: 'window-move', now: Date.now() })
    expect(api.tuckedCalls.length).toBe(before) // tucked 未变化 → 不发送
    ui.dispatchTuck({ type: 'snap' })
    ui.dispatchTuck({ type: 'window-move', now: Date.now() })
    expect(api.tuckedCalls.length).toBe(before) // 仍为 false → 不发送
    ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
    ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
    expect(api.tuckedCalls.length).toBe(before + 1) // false→true：一次
    expect(api.tuckedCalls).toContain(true)
  })

  it('四轮：伪鼠标离开后指针仍在窗内 → 不自动缩回（缩回前校验指针真实位置）', async () => {
    const { wrapper, ui } = await mountWithStoreGetUi()
    ui.dispatchTuck({ type: 'snap' })
    ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
    // 伪离开（弹出/窗口尺寸变化引发）后指针仍在窗内活动：pointermove 事件到达
    window.dispatchEvent(new Event('pointermove'))
    ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
    await wrapper.vm.$nextTick()
    expect(ui.tuck.tucked).toBe(false) // 指针实际在窗内 → 取消缩回（修闪烁/提前缩回）

    // 真实离开（离开后无任何 pointermove）→ 延时后正常缩回
    ui.dispatchTuck({ type: 'mouse-enter', now: Date.now() })
    ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() + 1000 })
    ui.dispatchTuck({ type: 'tick', now: Date.now() + 1500 })
    await wrapper.vm.$nextTick()
    expect(ui.tuck.tucked).toBe(true)
  })

  it('三轮8.2-1：胶囊只在缩进态出现；弹出后 cluster 恢复', async () => {
    const { wrapper } = await mountWithStore(AppShell)
    const ui = useUiStore()
    expect(wrapper.find('.tuck-bar').exists()).toBe(false)
    expect(wrapper.find('.cluster').exists()).toBe(true)

    ui.dispatchTuck({ type: 'snap' })
    ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
    ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tuck-bar').exists()).toBe(true)
    expect(wrapper.find('.cluster').exists()).toBe(false)
  })

  it('三轮8.2-6：五按钮全部为原型同款 SVG 线性图标；白天显月亮、夜晚显太阳', async () => {
    const { wrapper, store } = await mountWithStore(AppShell)
    for (const tid of ['tb-theme', 'tb-settings', 'tb-tucklock', 'tb-topmost', 'tb-minimize']) {
      expect(wrapper.find(`[data-testid="${tid}"] svg`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="tb-theme"] svg').attributes('data-icon')).toBe('moon')

    await store.updateUiState({ theme: 'night' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="tb-theme"] svg').attributes('data-icon')).toBe('sun')
  })
})
