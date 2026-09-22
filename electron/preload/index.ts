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
  setIgnoreMouseEvents: (opts: { ignore: boolean; forward: boolean }) =>
    ipcRenderer.invoke(IPC.setIgnoreMouseEvents, opts),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke(IPC.setAutoStart, enabled),
  saveCsv: (params: { fileName: string; content: string }) => ipcRenderer.invoke(IPC.saveCsv, params),
  openCsv: () => ipcRenderer.invoke(IPC.openCsv),
  minimizeToTray: () => ipcRenderer.invoke(IPC.minimizeToTray),
  setUnsavedEdits: (flag: boolean) => ipcRenderer.send('app:set-unsaved', flag),
  openChild: (params: { kind: ChildKind; id?: string }) => ipcRenderer.invoke(IPC.openChild, params),
  closeSelf: () => ipcRenderer.invoke(IPC.closeSelf)
}

contextBridge.exposeInMainWorld('desktopTodo', api)

export type DesktopTodoPreload = typeof api
