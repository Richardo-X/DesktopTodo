import koffi from 'koffi'
import type { BrowserWindow } from 'electron'
import {
  classifyWinDPress,
  initialWinDGuardState,
  resetWinDGuardForced,
  type WinDGuardState
} from '../../src/core/utils/win-d-guard'
import { hasTopmostBit, sendWindowToBottom, windowClassAtPoint, getWindowRect } from './win32'

/**
 * Win+D 抢跑守卫（C-1 路线 C，用户定稿 2026-10-04）。
 *
 * 实验（第七轮）：Win11 26200 的 Show Desktop 在按键处理路径内同步对豁免集
 * 做快照（toggle 时刻已在 TOPMOST 带的窗口幸存），事后补救全部无效；且
 * Chromium 会否决外部进程对窗口带的修改（SetWindowPos 返回成功但不落地）。
 * 对策 = WH_KEYBOARD_LL 钩子回调（系统先调用钩子、再派发按键给 shell 热键）
 * 内调 Electron 自己的 setAlwaysOnTop（同线程、内部路径、无否决）：
 * - 挂件态第一按：抢设临时置顶 → 快照前入带 → 组件在桌面上可见
 * - 第二按：只撤销自己抢设的那次（回调内二次校验真实置顶语义，绝不误关用户置顶）
 * - 本就置顶：完全不碰（已豁免）
 * - 托盘隐藏：不抢跑
 * 桌面态中若用户打开其他应用（前台离开桌面层），前台轮询解除抢设并沉底回挂件态。
 */

const WH_KEYBOARD_LL = 13
const WM_KEYDOWN = 0x0100
const WM_SYSKEYDOWN = 0x0104
const VK_D = 0x44
const VK_LWIN = 0x5b
const VK_RWIN = 0x5c

export interface WinDGuardDeps {
  /** 组件真实置顶语义（用户手动开关的结果） */
  isTopMost(): boolean
  /** 组件整体是否可见（托盘隐藏=false） */
  isClusterVisible(): boolean
  /** 三个组件窗（抢设/沉底） */
  clusterWindows(): BrowserWindow[]
  /** 全部二级窗口（抢设/解除，不沉底） */
  childWindows(): BrowserWindow[]
}

let deps: WinDGuardDeps | null = null
let state: WinDGuardState = initialWinDGuardState()
let hookHandle: bigint | null = null
let fgPollTimer: ReturnType<typeof setInterval> | null = null
let fgOutsideTicks = 0
let uninstallFn: (() => void) | null = null

/** 前台轮询解除抢设所需的连续确认次数：Win+D 后系统有 ~0.5s 焦点过渡期
 * （前台仍停留在按键前的应用上），单次采样会误判"用户打开了应用"提前解除 */
const FG_UNFORCE_TICKS = 3
const FG_POLL_INTERVAL_MS = 300

export function isWinDForced(): boolean {
  return state.forced
}

/** 外部复位：托盘显隐/置顶切换重申真实语义后，抢设标志作废（防止误还原用户置顶） */
export function resetWinDForced(): void {
  state = resetWinDGuardForced(state)
  stopForegroundPoll()
}

function safeWindow(w: BrowserWindow | null | undefined): w is BrowserWindow {
  return !!w && !w.isDestroyed()
}

/** 被标记窗口修复：真机定论（第八轮）——输掉竞速的窗口被 shell 标记后，
 * setAlwaysOnTop 的置顶位永远落不上（跨 Show Desktop 往返、跨置顶开关均如此）。
 * hide→showInactive 重置窗口状态后重申置顶，再校验。返回是否修复成功 */
export function repairTopMostBit(w: BrowserWindow): boolean {
  for (let round = 0; round < 3; round++) {
    try {
      if (round === 1) {
        // 变体：置顶关→开重申（Electron 内部带状态同步）
        w.setAlwaysOnTop(false, 'screen-saver')
        w.setAlwaysOnTop(true, 'screen-saver')
        if (hasTopmostBit(w.getNativeWindowHandle())) return true
      }
      w.hide()
      w.showInactive()
      w.setAlwaysOnTop(true, 'screen-saver')
      if (hasTopmostBit(w.getNativeWindowHandle())) return true
    } catch {
      /* 修复失败继续下一轮 */
    }
  }
  return hasTopmostBit(w.getNativeWindowHandle())
}

/** 诊断日志（真机验收期临时开启；验收通过后移除） */
function dbg(msg: string): void {
  console.log('[win-d-guard]', new Date().toISOString().slice(11, 23), msg)
}


/** 抢设：可见组件窗+二级窗临时置顶。
 * 真机定论（第八轮）：输掉竞速被标记的窗口 setAlwaysOnTop 永远落不上置顶位
 * （4 轮重试无效）——校验失败的窗口走 hide→showInactive 修复循环。
 * 真机第十一轮：修复后置顶位已落上仍被藏——与幸存组态（用户置顶）的唯一
 * 差异=挂件态窗口 WS_EX_NOACTIVATE（focusable=false）——抢设时同步
 * setFocusable(true) 对齐完整置顶组态（解除时还原挂件态）。
 * 隐藏窗跳过：修复循环的 showInactive 会复活用户收起的侧窗 */
function applyForcedTopMost(): void {
  if (!deps) return
  const wins = [...deps.clusterWindows(), ...deps.childWindows()].filter(safeWindow).filter((w) => w.isVisible())
  for (let attempt = 1; attempt <= 4; attempt++) {
    const failed: BrowserWindow[] = []
    for (const w of wins) {
      w.setFocusable(true)
      w.setAlwaysOnTop(true, 'screen-saver')
      let ok = false
      try {
        ok = hasTopmostBit(w.getNativeWindowHandle())
      } catch {
        ok = false
      }
      if (!ok) failed.push(w)
    }
    dbg(`force attempt=${attempt} landed=${wins.length - failed.length}/${wins.length}`)
    if (failed.length === 0) break
    if (attempt === 4) {
      // 常规重试无效：被标记窗口走修复循环
      for (const w of failed) {
        const ok = repairTopMostBit(w)
        dbg(`repair id=${w.id} result=${ok ? 'ok' : 'STILL-FAIL'}`)
      }
    }
  }
  startForegroundPoll()
}

/** 解除抢设：只处理自己抢设过的场景。此处二次校验真实置顶——
 * 若期间用户打开了置顶（applyTopMostToCluster 会复位标志，这里是兜底），
 * 绝不执行 setAlwaysOnTop(false)（用户定稿关切：不误关手动置顶） */
function applyUnforce(reason: string): void {
  if (!deps) return
  stopForegroundPoll()
  dbg(`unforce reason=${reason} topMost=${deps.isTopMost()}`)
  if (deps.isTopMost()) return
  for (const w of deps.childWindows()) {
    if (safeWindow(w)) w.setAlwaysOnTop(false, 'screen-saver')
  }
  const sinkCluster = (): void => {
    // 触发时复查：延迟定时器落地前用户可能已打开置顶（真机 bug：曾拆掉用户置顶）
    if (!deps || deps.isTopMost()) return
    for (const w of deps.clusterWindows()) {
      if (!safeWindow(w)) continue
      w.setAlwaysOnTop(false, 'screen-saver')
      w.setFocusable(false) // 还原挂件态（WS_EX_NOACTIVATE；force 时曾置 true）
      w.setSkipTaskbar(true)
      sendWindowToBottom(w.getNativeWindowHandle())
    }
    // 二级窗重申抬升（真机第十轮现象3：Win+D 往返后二级窗掉到一级窗后——
    // 沉底与 shell 还原窗口的时序竞争破坏了相对层级）
    for (const w of deps.childWindows()) {
      if (safeWindow(w) && w.isVisible()) w.moveTop()
    }
  }
  // 样式变更异步重排 z 序（第七轮实测）：双次沉底压住重排
  sinkCluster()
  setTimeout(sinkCluster, 120)
  setTimeout(sinkCluster, 400)
}

/** 前台轮询已废弃（真机十轮：这个版本的 Win+D 合成隐藏后焦点不移走，
 * 前台停留在被藏的旧应用上，前台信号完全不可用）。
 * 改用物理命中探针：连续 3 次探到组件窗口中心被"非桌面层窗口"占据
 * （=普通态下有应用窗口盖在组件位置上）才解除抢设并沉底回挂件态。
 * 桌面态下其他窗口都被合成走，探到的必然是桌面层（Progman/WorkerW）。
 * 我们的透明窗对命中测试是盲区（HANDOFF 实测），探到的永远是 underneath */
const SHELL_DESKTOP_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'SHELLDLL_DefView',
  // 桌面图标列表（SHELLDLL_DefView 的子控件；真机第十轮：探到它被误判为应用遮挡致解除）
  'SysListView32'
])
function startForegroundPoll(): void {
  if (fgPollTimer !== null) return
  fgOutsideTicks = 0
  fgPollTimer = setInterval(() => {
    if (!deps || !state.forced) {
      stopForegroundPoll()
      return
    }
    const probes = deps
      .clusterWindows()
      .filter(safeWindow)
      .filter((w) => w.isVisible())
    let outside = false
    let hitClass = ''
    for (const w of probes) {
      const rect = getWindowRect(w.getNativeWindowHandle())
      if (!rect || rect.width <= 0 || rect.height <= 0) continue
      hitClass = windowClassAtPoint(rect.x + Math.floor(rect.width / 2), rect.y + Math.floor(rect.height / 2))
      if (hitClass !== '' && !SHELL_DESKTOP_CLASSES.has(hitClass)) {
        outside = true
        break
      }
    }
    if (!outside) {
      fgOutsideTicks = 0
      return
    }
    fgOutsideTicks++
    if (fgOutsideTicks >= FG_UNFORCE_TICKS) applyUnforce(`covered-by class=${hitClass}`)
  }, FG_POLL_INTERVAL_MS)
}

function stopForegroundPoll(): void {
  if (fgPollTimer !== null) {
    clearInterval(fgPollTimer)
    fgPollTimer = null
  }
  fgOutsideTicks = 0
}

/** 安装 LL 键盘钩子（仅 Windows；失败只降级为无守卫，不致命） */
export function installWinDGuard(d: WinDGuardDeps): void {
  if (process.platform !== 'win32' || uninstallFn !== null) return
  deps = d
  try {
    const user32 = koffi.load('user32.dll')
    const SetWindowsHookExW = user32.func(
      'intptr __stdcall SetWindowsHookExW(int32 id, intptr cb, intptr mod, uint32 tid)'
    )
    const UnhookWindowsHookEx = user32.func('int32 __stdcall UnhookWindowsHookEx(intptr hhk)')
    const CallNextHookEx = user32.func('intptr __stdcall CallNextHookEx(intptr hhk, int32 code, intptr wp, intptr lp)')
    const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int32 vk)')
    const proto = koffi.proto('intptr __stdcall WinDHook(int32 code, intptr wp, intptr lp)')
    const onKey = (code: number, wp: number | bigint, lp: number | bigint): number | bigint => {
      try {
        if (code >= 0 && (Number(wp) === WM_KEYDOWN || Number(wp) === WM_SYSKEYDOWN)) {
          // KBDLLHOOKSTRUCT.vkCode = 结构体首字段（uint32）
          const vk = Number(koffi.decode(lp, 0, 'uint32'))
          const winDown = GetAsyncKeyState(VK_LWIN) < 0 || GetAsyncKeyState(VK_RWIN) < 0
          if (vk === VK_D && winDown && deps) {
            dbg(`press topMost=${deps.isTopMost()} visible=${deps.isClusterVisible()} forcedBefore=${state.forced}`)
            const r = classifyWinDPress(state, Date.now(), {
              topMost: deps.isTopMost(),
              visible: deps.isClusterVisible()
            })
            state = r.next
            dbg(`action=${r.action}`)
            if (r.action === 'force') applyForcedTopMost()
            else if (r.action === 'unforce') applyUnforce('second-press')
          }
        }
      } catch {
        /* 钩子回调内异常必须吞掉（不得向系统抛出） */
      }
      return CallNextHookEx(0n, code, wp, lp)
    }
    const cb = koffi.register(onKey, koffi.pointer(proto))
    const handle = SetWindowsHookExW(WH_KEYBOARD_LL, cb, 0n, 0)
    if (!handle) {
      console.warn('[win-d-guard] LL hook install failed——守卫降级为无钩子')
      koffi.unregister(cb)
      deps = null
      return
    }
    hookHandle = BigInt(handle)
    dbg('hook installed')
    uninstallFn = (): void => {
      try {
        if (hookHandle !== null) UnhookWindowsHookEx(hookHandle)
        koffi.unregister(cb)
      } catch {
        /* 卸载失败不致命（进程退出即回收） */
      }
      hookHandle = null
    }
  } catch (err) {
    console.warn('[win-d-guard] install error（守卫降级）:', err)
    deps = null
  }
}

/** 卸载钩子（应用退出时调用；进程退出也会自动回收） */
export function uninstallWinDGuard(): void {
  stopForegroundPoll()
  if (uninstallFn) {
    uninstallFn()
    uninstallFn = null
  }
  deps = null
  state = initialWinDGuardState()
}
