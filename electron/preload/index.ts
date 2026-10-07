import { contextBridge, ipcRenderer } from 'electron'
import type { AppData } from '../../src/core/models/types'
import { IPC, type ChildKind } from '../../src/ipc/contract'

const api = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onStateUpdated: (cb: (data: AppData) => void) => {
    const listener = (_e: unknown, data: AppData): void => cb(data)
    ipcRenderer.on(IPC.stateUpdated, listener)
    return () => ipcRenderer.removeListener(IPC.stateUpdated, listener)
  },
  commit: (data: AppData) => ipcRenderer.invoke(IPC.commit, data),
  flush: () => ipcRenderer.invoke(IPC.flush),
  setTopMost: (enabled: boolean) => ipcRenderer.invoke(IPC.setTopMost, enabled),
  setVisibility: (visible: boolean) => ipcRenderer.invoke(IPC.setVisibility, visible),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke(IPC.setAutoStart, enabled),
  saveCsv: (params: { fileName: string; content: string }) => ipcRenderer.invoke(IPC.saveCsv, params),
  openCsv: () => ipcRenderer.invoke(IPC.openCsv),
  minimizeToTray: () => ipcRenderer.invoke(IPC.minimizeToTray),
  setUnsavedEdits: (flag: boolean) => ipcRenderer.send('app:set-unsaved', flag),
  diagnosticLog: (msg: string) => ipcRenderer.send('app:cursor-diag', msg),
  openChild: (params: { kind: ChildKind; id?: string }) => ipcRenderer.invoke(IPC.openChild, params),
  closeSelf: () => ipcRenderer.invoke(IPC.closeSelf),
  resizeSelf: (params: { width: number; height: number }) => ipcRenderer.invoke(IPC.resizeSelf, params),
  setTucked: (tucked: boolean) => ipcRenderer.invoke(IPC.setTucked, tucked),
  onSnapChanged: (cb: (snapped: boolean) => void) => {
    const listener = (_e: unknown, snapped: boolean): void => cb(snapped)
    ipcRenderer.on(IPC.snapChanged, listener)
    return () => ipcRenderer.removeListener(IPC.snapChanged, listener)
  },
  onWindowMoving: (cb: (now: number) => void) => {
    const listener = (_e: unknown, now: number): void => cb(now)
    ipcRenderer.on(IPC.windowMoving, listener)
    return () => ipcRenderer.removeListener(IPC.windowMoving, listener)
  },
  clusterResizeFreeze: (frozen: boolean) => ipcRenderer.invoke(IPC.resizeFreeze, frozen),
  setVeil: (v: boolean) => ipcRenderer.invoke(IPC.setVeil, v),
  onVeil: (cb: (v: boolean) => void) => {
    const listener = (_e: unknown, v: boolean): void => cb(v)
    ipcRenderer.on(IPC.veil, listener)
    return () => ipcRenderer.removeListener(IPC.veil, listener)
  },
  onResizeFreeze: (listener: (frozen: boolean) => void): (() => void) => {
    ipcRenderer.on(IPC.resizeFreeze, (_e, v) => listener(v))
    return () => ipcRenderer.removeAllListeners(IPC.resizeFreeze)
  },
  bubbleShow: (p: { text: string; theme: 'day' | 'night'; row: { left: number; top: number; right: number; bottom: number } }) =>
    ipcRenderer.invoke(IPC.bubbleShow, p),
  bubbleHide: () => ipcRenderer.invoke(IPC.bubbleHide),
  bubbleResize: (p: { w: number; h: number }) => ipcRenderer.invoke(IPC.bubbleResize, p),
  onBubblePayload: (cb: (p: { text: string; theme: 'day' | 'night'; side: 'left' | 'right' }) => void) => {
    const listener = (_e: unknown, p: { text: string; theme: 'day' | 'night'; side: 'left' | 'right' }): void => cb(p)
    ipcRenderer.on(IPC.bubblePayload, listener)
    return () => ipcRenderer.removeListener(IPC.bubblePayload, listener)
  },
  onCursorInside: (cb: (inside: boolean) => void) => {
    const listener = (_e: unknown, inside: boolean): void => cb(inside)
    ipcRenderer.on(IPC.cursorInside, listener)
    return () => ipcRenderer.removeListener(IPC.cursorInside, listener)
  },
  onChildClosed: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.childClosed, listener)
    return () => ipcRenderer.removeListener(IPC.childClosed, listener)
  },
  clusterDragStart: () => ipcRenderer.invoke(IPC.clusterDragStart),
  clusterDragEnd: () => ipcRenderer.invoke(IPC.clusterDragEnd),
  setBatchState: (target: 'todos' | 'templates' | 'history' | null) => ipcRenderer.invoke(IPC.uiBatchState, target),
  onBatchState: (cb: (target: 'todos' | 'templates' | 'history' | null) => void) => {
    const listener = (_e: unknown, target: 'todos' | 'templates' | 'history' | null): void => cb(target)
    ipcRenderer.on(IPC.uiBatchState, listener)
    return () => ipcRenderer.removeListener(IPC.uiBatchState, listener)
  },
  /** 用户验收#5：子窗口数量跨窗广播（任一窗打开/关闭二级窗都同步三窗缩进状态机） */
  onChildCount: (cb: (n: number) => void) => {
    const listener = (_e: unknown, n: number): void => cb(n)
    ipcRenderer.on(IPC.childCount, listener)
    return () => ipcRenderer.removeListener(IPC.childCount, listener)
  }
}

contextBridge.exposeInMainWorld('desktopTodo', api)

// E2E 测试钩子（仅测试模式注册）
if (process.env.DTODO_TEST === '1') {
  contextBridge.exposeInMainWorld('desktopTodoTest', {
    forceSettle: (days: number) => ipcRenderer.invoke('test:force-settle', days),
    clusterDragDelta: (dx: number, dy: number) => ipcRenderer.invoke('test:cluster-drag-delta', { dx, dy }),
    clusterState: () => ipcRenderer.invoke('test:cluster-state'),
    dragState: () => ipcRenderer.invoke('test:drag-state'),
    sysShowWindow: (cmd: number) => ipcRenderer.invoke('test:sys-show-window', cmd),
    sysWmClose: (panel: string) => ipcRenderer.invoke('test:sys-wm-close', panel),
    exstyle: (panel: string) => ipcRenderer.invoke('test:exstyle', panel),
    pixelAt: (x: number, y: number) => ipcRenderer.invoke('test:pixel-at', { x, y }),
    setFakeCursor: (p: { x: number; y: number } | null) => ipcRenderer.invoke('test:set-fake-cursor', p),
  })
}

export type DesktopTodoPreload = typeof api
