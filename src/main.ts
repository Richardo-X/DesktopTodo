import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import './styles/global.css'
import PanelWindow from './windows/PanelWindow.vue'
import ChildHost from './windows/ChildHost.vue'
import BubbleWindow from './windows/BubbleWindow.vue'
import BarWindow from './windows/BarWindow.vue'
import type { ChildKind } from './ipc/contract'

// 入口路由：?win=cluster&panel=X = 三窗分离的组件窗口（批次 B-1）；
// ?win=bar = 缩进白条独立窗（2026-10-17 §11.K 步1）；
// ?win=<child-kind> = 二级窗口；?win=bubble = 悬浮气泡
const params = new URLSearchParams(window.location.search)
const win = params.get('win')
const kind = win as ChildKind | null
const id = params.get('id') ?? undefined
const clusterPanel = (params.get('panel') ?? 'main') as 'quick' | 'main' | 'done'

const RootApp = defineComponent({
  setup() {
    if (win === 'cluster') return () => h(PanelWindow, { panel: clusterPanel })
    if (win === 'bar') return () => h(BarWindow)
    // 气泡是内容自适应窗：不能走 ChildHost 的二级窗 zoom（320×160 基准会把气泡内容缩到 0.7）
    if (win === 'bubble') return () => h(BubbleWindow)
    return () => (kind ? h(ChildHost, { kind, id }) : h('div'))
  }
})

const pinia = createPinia()
createApp(RootApp).use(pinia).mount('#app')

// E2E 调试探针
if (import.meta.env.MODE === 'test' || process.env.DTODO_TEST === '1') {
  ;(window as unknown as Record<string, unknown>).__pinia = pinia
}
