import type { DesktopTodoApi } from '../ipc/contract'

/** 渲染层统一 API 访问器：preload 注入 window.desktopTodo；组件测试环境由测试安装 */
export function getApi(): DesktopTodoApi {
  const api = (globalThis as { window?: { desktopTodo?: DesktopTodoApi } }).window?.desktopTodo
  if (!api) throw new Error('desktopTodo API 未初始化（preload 未加载或测试未安装）')
  return api
}

/** AppData 全程 JSON 安全；跨 IPC 深拷贝用 */
export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
