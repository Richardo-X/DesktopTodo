import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import AppShell from './panels/AppShell.vue'
import ChildHost from './windows/ChildHost.vue'
import type { ChildKind } from './ipc/contract'

// 入口路由：主窗口渲染组件簇；子窗口按 ?win= 参数渲染对应页面
const params = new URLSearchParams(window.location.search)
const kind = params.get('win') as ChildKind | null
const id = params.get('id') ?? undefined

const RootApp = defineComponent({
  setup() {
    return () => (kind ? h(ChildHost, { kind, id }) : h(AppShell))
  }
})

createApp(RootApp).use(createPinia()).mount('#app')
