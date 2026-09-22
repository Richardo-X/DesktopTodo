/** 窗口状态应用（置顶/缩进锁/主题）：Electron 调用薄壳 + uiState 归约（T17） */

interface AlwaysOnTopWindow {
  setAlwaysOnTop(flag: boolean, level: 'screen-saver'): void
}

/** 置顶开关应用到窗口（screen-saver 层级：浮在其他软件窗口之上） */
export function applyTopMost(win: AlwaysOnTopWindow, enabled: boolean): void {
  win.setAlwaysOnTop(enabled, 'screen-saver')
}

export interface UiStateFlags {
  topMost: boolean
  tuckLock: boolean
  theme: 'day' | 'night'
}

/** uiState 归约：置顶（不可变） */
export function withTopMost<T extends UiStateFlags>(state: T, enabled: boolean): T {
  return { ...state, topMost: enabled }
}

/** uiState 归约：缩进锁定 */
export function withTuckLock<T extends UiStateFlags>(state: T, enabled: boolean): T {
  return { ...state, tuckLock: enabled }
}

/** uiState 归约：日/夜主题 */
export function withTheme<T extends UiStateFlags>(state: T, theme: 'day' | 'night'): T {
  return { ...state, theme }
}
