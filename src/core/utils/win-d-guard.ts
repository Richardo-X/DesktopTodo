/**
 * Win+D 抢跑守卫（C-1 路线 C）纯判定逻辑。
 *
 * 实验定论（2026-10-04，第七轮）：Win11 build 26200 的 Show Desktop 在按键
 * 处理路径内同步对「豁免集」做快照——toggle 时刻已在 TOPMOST 带的窗口幸存，
 * 其余被 DWM 合成层隐藏（零事件/零状态/零 cloak，事后补救全部无效）。
 * 唯一可行的应用层对策 = LL 键盘钩子回调（先于 shell 热键处理）内抢设
 * 临时置顶，第二次 Win+D 时只撤销自己抢设的那次。
 *
 * 本模块只承载可单测的判定状态机；Win32 钩子与 Electron 调用在
 * electron/main/win-d-hook.ts 接线。
 */

/** 按键节流窗口：D 键按住会自动重复（约 30ms/次），此窗口内的重复不算新按 */
export const WIN_D_DEBOUNCE_MS = 300

export interface WinDGuardState {
  /** 抢设的临时置顶是否生效中（只由 force/unforce 动作与外部复位改写） */
  forced: boolean
  /** 上一次有效按键时间戳（防抖基准） */
  lastPressAt: number
}

export type WinDAction = 'none' | 'force' | 'unforce'

export interface WinDGuardContext {
  /** 组件真实置顶语义（用户手动开关的结果；本判定绝不改写它） */
  topMost: boolean
  /** 组件整体可见（托盘隐藏=false：合法隐藏不抢跑） */
  visible: boolean
}

export function initialWinDGuardState(): WinDGuardState {
  return { forced: false, lastPressAt: 0 }
}

/** 判定一次 Win+D 按键的动作（纯函数；钩子回调内每按调用一次） */
export function classifyWinDPress(
  state: WinDGuardState,
  now: number,
  ctx: WinDGuardContext
): { action: WinDAction; next: WinDGuardState } {
  const next: WinDGuardState = { forced: state.forced, lastPressAt: now }
  // 防抖：自动重复不算新按，状态保持
  if (state.lastPressAt !== 0 && now - state.lastPressAt < WIN_D_DEBOUNCE_MS) {
    return { action: 'none', next }
  }
  // 托盘隐藏=合法隐藏，不抢跑（forced 保持，由接线层在显隐/置顶切换时复位）
  if (!ctx.visible) return { action: 'none', next }
  // 已抢设中：本次=还原桌面，撤销自己的抢设
  if (state.forced) return { action: 'unforce', next: { ...next, forced: false } }
  // 本就置顶=已豁免，不碰用户的置顶（用户定稿关切：绝不误关手动置顶）
  if (ctx.topMost) return { action: 'none', next }
  // 挂件态：抢设临时置顶（快照前入 TOPMOST 带幸存）
  return { action: 'force', next: { ...next, forced: true } }
}

/** 外部复位：接线层重申真实置顶语义（托盘显隐/置顶切换）后，抢设标志作废 */
export function resetWinDGuardForced(state: WinDGuardState): WinDGuardState {
  return { ...state, forced: false }
}
