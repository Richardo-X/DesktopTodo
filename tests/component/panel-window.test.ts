import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import PanelWindow from '../../src/windows/PanelWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { defaultAppData } from '../../src/core/models'
import { useUiStore } from '../../src/stores/ui'

/**
 * 批次 B-1 三窗架构：每个 OS 窗口的渲染根 = PanelWindow。
 * 待办主窗（panel=main）承载原 AppShell 的令牌/缩进状态机/标题栏行为断言；
 * 侧窗面板位置/簇宽度断言随架构移入 E2E（三窗几何）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mountMain(seed?: Parameters<typeof mountWithStore>[1]): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await mountWithStore(PanelWindow as any, seed, { panel: 'main' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mountGetUi(seed?: Parameters<typeof mountWithStore>[1]): Promise<any> {
  const r = await mountMain(seed)
  const ui = useUiStore()
  return { ...r, ui }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('PanelWindow 待办主窗（批次 B-1 三窗架构）', () => {
  it('渲染待办面板（home-panel；侧窗面板由各自窗口渲染）', async () => {
    const { wrapper } = await mountMain()
    expect(wrapper.find('[data-testid="home-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="done-panel"]').exists()).toBe(false)
  })

  it('zoom 容器按面板基准尺寸定宽高（+2px 余量，zoom×尺寸=真窗口）', async () => {
    const { wrapper } = await mountMain()
    const style = wrapper.find('.cluster').attributes('style') ?? ''
    expect(style).toMatch(/zoom: [\d.]+; width: calc\(470px \/ [\d.]+ \+ 2px\); height: calc\(640px \/ [\d.]+ \+ 2px\)/)
  })

  it('主题属性注入：day/night（令牌逐窗应用）', async () => {
    const { wrapper, store } = await mountMain()
    expect(wrapper.find('.stage').attributes('data-theme')).toBe('day')
    await store.updateUiState({ theme: 'night' })
    expect(wrapper.find('.stage').attributes('data-theme')).toBe('night')
  })

  it('标题栏手写拖动接线：window pointerup → clusterDragEnd（titlebar 命中链路由 E2E 覆盖）', async () => {
    const { api } = await mountMain()
    const before = api.dragEndCalls.length
    window.dispatchEvent(new Event('pointerup'))
    await Promise.resolve()
    // 同文件先前挂载的监听器经 getApi() 也命中当前实例（≥1）；本断言只验证 pointerup→dragEnd 接线
    expect(api.dragEndCalls.length).toBeGreaterThan(before)
  })

  it('拖动双保险：窗口失焦（blur）→ clusterDragEnd（修 pointerup 丢失导致的永久跟随）', async () => {
    const { api } = await mountMain()
    const before = api.dragEndCalls.length
    window.dispatchEvent(new Event('blur'))
    await Promise.resolve()
    expect(api.dragEndCalls.length).toBeGreaterThan(before)
  })

  describe('T21 标题栏工具栏五按钮', () => {
    it('主题切换/设置/缩进锁定/置顶/×', async () => {
      const { wrapper, store, api } = await mountMain()
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
      const { wrapper } = await mountMain()
      expect(wrapper.find('[data-testid="tb-brand"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tb-brand"] svg').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tb-title"]').text()).toBe('桌面待办')

      const groups = wrapper.findAll('[data-testid="home-panel"] .win-actions')
      expect(groups).toHaveLength(1)
      const order = groups[0].findAll('.wbtn').map((b: { attributes: (n: string) => string | undefined }) => b.attributes('data-testid'))
      expect(order).toEqual(['tb-theme', 'tb-settings', 'tb-tucklock', 'tb-topmost', 'tb-minimize'])
    })

    it('三轮8.2-6：五按钮全部为原型同款 SVG 线性图标；白天显月亮、夜晚显太阳', async () => {
      const { wrapper, store } = await mountMain()
      for (const tid of ['tb-theme', 'tb-settings', 'tb-tucklock', 'tb-topmost', 'tb-minimize']) {
        expect(wrapper.find(`[data-testid="${tid}"] svg`).exists()).toBe(true)
      }
      expect(wrapper.find('[data-testid="tb-theme"] svg').attributes('data-icon')).toBe('moon')

      await store.updateUiState({ theme: 'night' })
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="tb-theme"] svg').attributes('data-icon')).toBe('sun')
    })
  })

  describe('缩进状态机（宿主=待办主窗）', () => {
    it('三轮8.2-1：缩进态渲染胶囊短条；光标回到窗内弹出', async () => {
      const { wrapper, api } = await mountMain()
      const ui = useUiStore()
      ui.dispatchTuck({ type: 'snap' })
      ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(true)

      const bar = wrapper.find('.tuck-bar')
      expect(bar.exists()).toBe(true)

      api.cursorInsideListeners[0](true)
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(false)
    })

    it('三轮CI：dispatchTuck 仅在 tucked 变化时同步主进程', async () => {
      const { api, ui } = await mountGetUi()
      const before = api.tuckedCalls.length
      ui.dispatchTuck({ type: 'window-move', now: Date.now() })
      expect(api.tuckedCalls.length).toBe(before)
      ui.dispatchTuck({ type: 'snap' })
      ui.dispatchTuck({ type: 'window-move', now: Date.now() })
      expect(api.tuckedCalls.length).toBe(before)
      ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
      expect(api.tuckedCalls.length).toBe(before + 1)
      expect(api.tuckedCalls).toContain(true)
    })

    it('四轮二修：onCursorInside 驱动 enter/leave（DOM 事件不再驱动）', async () => {
      const { wrapper, api, ui } = await mountGetUi()
      api.cursorInsideListeners[0](true)
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(false)

      ui.dispatchTuck({ type: 'snap' })
      api.cursorInsideListeners[0](false)
      expect(ui.tuck.leaveAt).not.toBeNull()
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(true)
    })

    it('四轮3：批量删除进行中不自动缩回，批量结束后恢复', async () => {
      const { wrapper, api, ui } = await mountGetUi()
      ui.dispatchTuck({ type: 'snap' })
      api.cursorInsideListeners[0](false)
      ui.enterBatch('todos')
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 1000 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(false)

      ui.exitBatch()
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 1400 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(true)
    })

    it('三轮8.2-1：胶囊只在缩进态出现；弹出后面板恢复', async () => {
      const { wrapper } = await mountMain()
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

    it('四轮5：缩进锁定接线——锁定时贴边不缩回；解锁后光标在外立即恢复缩回', async () => {
      const { wrapper, api, ui } = await mountGetUi()
      await wrapper.find('[data-testid="tb-tucklock"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(ui.tuck.locked).toBe(true)

      ui.dispatchTuck({ type: 'snap' })
      ui.dispatchTuck({ type: 'mouse-leave', now: Date.now() })
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 500 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(false)

      api.cursorInsideListeners[0](false)
      await wrapper.find('[data-testid="tb-tucklock"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(ui.tuck.locked).toBe(false)
      ui.dispatchTuck({ type: 'tick', now: Date.now() + 1000 })
      await wrapper.vm.$nextTick()
      expect(ui.tuck.tucked).toBe(true)
    })

    it('四轮5b：启动按存档 tuckLock 初始化锁定状态', async () => {
      const seed = defaultAppData()
      seed.uiState.tuckLock = true
      await mountMain(seed)
      await new Promise((r) => setTimeout(r, 20))
      expect(useUiStore().tuck.locked).toBe(true)
    })
  })

  it('四轮黑块修复：html/body 画布显式透明', () => {
    for (const el of [document.documentElement, document.body]) {
      expect(getComputedStyle(el).backgroundColor === 'transparent' || getComputedStyle(el).backgroundColor === '').toBe(true)
    }
  })

  it('四轮黑块真因：夜间 .stage 不得被 [data-theme] 裸规则涂色', async () => {
    const { wrapper, store } = await mountMain()
    await store.updateUiState({ theme: 'night' })
    await wrapper.vm.$nextTick()
    const bg = getComputedStyle(wrapper.find('.stage').element).backgroundColor
    expect(bg.includes('38, 42, 52') || bg.includes('262a34'), `stage bg=${bg}`).toBe(false)

    await store.updateUiState({ theme: 'day' })
    await wrapper.vm.$nextTick()
    const bgDay = getComputedStyle(wrapper.find('.stage').element).backgroundColor
    expect(bgDay.includes('38, 42, 52'), `stage day bg=${bgDay}`).toBe(false)
  })
})
