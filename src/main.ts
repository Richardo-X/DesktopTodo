import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import './styles/global.css'
import AppShell from './panels/AppShell.vue'
import ChildHost from './windows/ChildHost.vue'
import ClusterSpikePanel from './windows/ClusterSpikePanel.vue'
import type { ChildKind } from './ipc/contract'

// 入口路由：主窗口渲染组件簇；子窗口按 ?win= 参数渲染对应页面；
// ?win=spike 为批次 A 三窗分离技术验证占位面板（DTODO_CLUSTER_SPIKE=1 时由主进程创建）
const params = new URLSearchParams(window.location.search)
const win = params.get('win')
const kind = win as ChildKind | null
const id = params.get('id') ?? undefined
const spikePanel = (params.get('panel') ?? 'main') as 'quick' | 'main' | 'done'

const RootApp = defineComponent({
  setup() {
    if (win === 'spike') return () => h(ClusterSpikePanel, { panel: spikePanel })
    return () => (kind ? h(ChildHost, { kind, id }) : h(AppShell))
  }
})

const pinia = createPinia()
createApp(RootApp).use(pinia).mount('#app')

// E2E 调试探针
if (import.meta.env.MODE === 'test' || process.env.DTODO_TEST === '1') {
  ;(window as unknown as Record<string, unknown>).__pinia = pinia
}
