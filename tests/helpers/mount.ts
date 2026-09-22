import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import type { Component } from 'vue'
import { installTestApi, type TestApi } from './api'
import { useAppStore } from '../../src/stores/app'
import type { AppData } from '../../src/core/models'

export interface Mounted<T> {
  wrapper: ReturnType<typeof mount<T>>
  store: ReturnType<typeof useAppStore>
  api: TestApi
}

/** 组件测试通用挂载：安装内存测试 API + Pinia，等待 store 初始化完成 */
export async function mountWithStore<T extends Component>(
  component: T,
  seed?: Partial<AppData>,
  props?: Record<string, unknown>
): Promise<Mounted<T>> {
  const pinia = createPinia()
  const api = installTestApi(seed)
  const wrapper = mount(component, { global: { plugins: [pinia] }, props })
  const store = useAppStore()
  await store.init()
  return { wrapper, store, api } as unknown as Mounted<T>
}
