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
  }
}

contextBridge.exposeInMainWorld('desktopTodo', api)

// E2E 测试钩子（仅测试模式注册）
if (process.env.DTODO_TEST === '1') {
  contextBridge.exposeInMainWorld('desktopTodoTest', {
    forceSettle: (days: number) => ipcRenderer.invoke('test:force-settle', days)
  })
}

export type DesktopTodoPreload = typeof api
