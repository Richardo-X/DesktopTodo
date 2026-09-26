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
  setAutoStart: 'settings:set-auto-start',
  saveCsv: 'dialog:save-csv',
  openCsv: 'dialog:open-csv',
  openChild: 'window:open-child',
  closeSelf: 'window:close-self',
  resizeSelf: 'window:resize-self',
  setTucked: 'window:set-tucked',
  snapChanged: 'app:snap-state',
  windowMoving: 'window:moving',
  bubbleShow: 'bubble:show',
  bubbleHide: 'bubble:hide',
  bubbleResize: 'bubble:resize',
  bubblePayload: 'bubble:payload',
  cursorInside: 'app:cursor-inside',
  childClosed: 'app:child-closed',
  requestExit: 'app:request-exit',
  minimizeToTray: 'window:minimize-to-tray'
} as const

/** 子窗口种类（PRD §2.1；B1.5：回收站窗口已移除） */
export type ChildKind =
  | 'todo-new'
  | 'todo-edit'
  | 'template-new'
  | 'template-edit'
  | 'detail'
  | 'history'
  | 'settings'
  | 'bubble'

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
  setAutoStart(enabled: boolean): Promise<boolean>
  /** 系统"另存为"对话框；取消返回 null */
  saveCsv(params: { fileName: string; content: string }): Promise<string | null>
  /** 系统文件选择框；取消返回 null */
  openCsv(): Promise<string | null>
  /** × 按钮缩小到通知栏（带动画） */
  minimizeToTray(): Promise<void>
  /** 渲染层标记是否存在未保存的编辑输入（托盘退出确认提示用） */
  setUnsavedEdits(flag: boolean): void
  /** 打开子窗口（模态、位置不记忆）；id 用于编辑/详情定位事项 */
  openChild(params: { kind: ChildKind; id?: string }): Promise<void>
  /** 子窗口自我关闭（返回/保存/删除完成后） */
  closeSelf(): Promise<void>
  /** 子窗口真窗口缩放（决策#7/#24：内容 zoom 与窗口 setBounds 1:1） */
  resizeSelf(params: { width: number; height: number }): Promise<void>
  /** 贴边缩进状态：主进程按小条/整簇调整窗口高度 */
  setTucked(tucked: boolean): Promise<void>
  onWindowMoving(cb: (now: number) => void): () => void
  /** 四轮：气泡独立小窗口（渲染层传行视口矩形，主进程换算屏幕坐标并承载/定尺寸） */
  bubbleShow(p: { text: string; theme: 'day' | 'night'; row: { left: number; top: number; right: number; bottom: number } }): Promise<void>
  bubbleHide(): Promise<void>
  bubbleResize(p: { w: number; h: number }): Promise<void>
  onBubblePayload(cb: (p: { text: string; theme: 'day' | 'night'; side: 'left' | 'right' }) => void): () => void
  /** 四轮二修：主进程光标轮询权威判定（光标是否在可见窗口 bounds 内） */
  onCursorInside(cb: (inside: boolean) => void): () => void
  /** 主进程吸附状态变化（窗口移动到/离开上边缘） */
  onSnapChanged(cb: (snapped: boolean) => void): () => void
  /** 任一子窗口关闭（缩进状态机 child-closed） */
  onChildClosed(cb: () => void): () => void
}
