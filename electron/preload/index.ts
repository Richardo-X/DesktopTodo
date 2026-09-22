import { contextBridge } from 'electron'

// M0 占位：M1/M2 起按 typed IPC 契约逐步充实
contextBridge.exposeInMainWorld('desktopTodo', {
  protocol: 'desktop-todo'
})
