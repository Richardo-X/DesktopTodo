/** 窗口状态应用（置顶/缩进锁/主题）：Electron 调用薄壳 + uiState 归约（T17） */

interface AlwaysOnTopWindow {
  setAlwaysOnTop(flag: boolean, level: 'screen-saver'): void
}

/** 置顶开关应用到窗口（screen-saver 层级：浮在其他软件窗口之上） */
export function applyTopMost(win: AlwaysOnTopWindow, enabled: boolean): void {
  win.setAlwaysOnTop(enabled, 'screen-saver')
}

/** 三窗置顶语义（用户定稿 2026-10-02）：
 * enabled=true  → 浮最上层（screen-saver 层）且可激活（键盘输入可用）
 * enabled=false → 桌面挂件态：普通 z 序 + 不可激活（WS_EX_NOACTIVATE 等价）——
 *                 与其他窗口重叠时点击组件不激活、不浮上来，保持被覆盖
 * 每次重申 skipTaskbar：样式变更（SetWindowLong）会触发 shell 重新评估窗口，
 * 把构造时 skipTaskbar 删掉的任务栏 tab 又加回来（用户实测任务栏出现组件窗口） */
export interface ClusterTopMostWindow extends AlwaysOnTopWindow {
  isDestroyed(): boolean
  setSkipTaskbar(skip: boolean): void
}

/** 置顶语义（2026-10-06 定稿）：仅切换层级；NOACTIVATE/挂件态已删除
 * （未置顶=普通窗口：可激活、可被覆盖、不沉底） */
export function applyClusterTopMost(win: ClusterTopMostWindow, enabled: boolean): void {
  win.setAlwaysOnTop(enabled, 'screen-saver')
}

/** 置顶=整个组件（8.2-2）：主窗与全部二级窗口同层级应用 */
export function applyTopMostAll(wins: Iterable<AlwaysOnTopWindow>, enabled: boolean): void {
  for (const w of wins) w.setAlwaysOnTop(enabled, 'screen-saver')
}

interface FocusableChildWindow {
  isDestroyed(): boolean
  moveTop(): void
  focus(): void
}

/** 系统文件对话框以主窗为 parent，关闭后焦点归还主窗、子窗口掉到其后（8.2-4）：
 * 抬升全部子窗口；发起对话框的窗口（如设置窗）拿回焦点 */
export function refocusChildWindows(wins: Iterable<FocusableChildWindow>, preferred?: FocusableChildWindow): void {
  for (const w of wins) {
    if (w.isDestroyed()) continue
    w.moveTop()
  }
  if (preferred && !preferred.isDestroyed()) preferred.focus()
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
