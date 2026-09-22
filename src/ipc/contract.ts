import type { AppData } from '../core/models/types'

/**
 * typed IPC 契约（开发计划 §2.4-4）：渲染层依赖本接口并可 mock；
 * Electron 侧在 preload 中按契约实现同名 API。
 */

export const IPC = {
  getState: 'app:get-state',
  stateUpdated: 'app:state-updated',
  commit: 'data:commit',
  flush: 'data:flush',
  setTopMost: 'window:set-top-most',
  setVisibility: 'window:set-visibility',
  setIgnoreMouseEvents: 'window:set-ignore-mouse-events',
  setAutoStart: 'settings:set-auto-start',
  saveCsv: 'dialog:save-csv',
  openCsv: 'dialog:open-csv',
  requestExit: 'app:request-exit',
  minimizeToTray: 'window:minimize-to-tray'
} as const

export interface WindowPos {
  x: number
  y: number
}

/** 渲染进程可见的 typed API（经 contextBridge 暴露为 window.desktopTodo） */
export interface DesktopTodoApi {
  getState(): Promise<AppData>
  /** 主进程推送（启动结算/跨天结算后） */
  onStateUpdated(cb: (data: AppData) => void): () => void
  /** 渲染层变更后提交完整数据；pos 由主进程自行采集合并 */
  commit(data: AppData): Promise<void>
  flush(): Promise<void>
  setTopMost(enabled: boolean): Promise<void>
  setVisibility(visible: boolean): Promise<void>
  /** 命中检测结果：panel → 接收鼠标；gap → 穿透并转发移动 */
  setIgnoreMouseEvents(opts: { ignore: boolean; forward: boolean }): Promise<void>
  setAutoStart(enabled: boolean): Promise<boolean>
  /** 系统"另存为"对话框；取消返回 null */
  saveCsv(params: { fileName: string; content: string }): Promise<string | null>
  /** 系统文件选择框；取消返回 null */
  openCsv(): Promise<string | null>
  /** × 按钮缩小到通知栏（带动画） */
  minimizeToTray(): Promise<void>
}
