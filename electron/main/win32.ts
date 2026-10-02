import koffi from 'koffi'

/** Win32 窗口 z 序调用（koffi 预编译原生绑定；仅 Windows 主进程使用）。
 * Electron 无"沉底"API——setAlwaysOnTop(false) 只降回普通层顶端（仍浮在
 * 未激活窗口之上，需点击其他窗口才被覆盖）；用户定稿"切换为非置顶时组件
 * 整体下降到桌面层"必须走 SetWindowPos(HWND_BOTTOM)。 */

const user32 = koffi.load('user32.dll')

// 结构体与函数声明顺序：struct 必须先于引用它的 func 声明（否则运行时 "Unknown type name" 崩溃）
koffi.struct('POINT', { x: 'long', y: 'long' })

// Win32 BOOL 是 4 字节 int——koffi 'bool' 是 1 字节 C99 bool，混用会导致
// IsWindowVisible 恒 false、SetWindowPos 返回值误读（实测教训），一律 'int32'
const SetWindowPos = user32.func(
  'int32 __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int x, int y, int cx, int cy, uint32 uFlags)'
)
const IsWindowVisible = user32.func('int32 __stdcall IsWindowVisible(intptr hWnd)')
const FindWindowW = user32.func('intptr __stdcall FindWindowW(str16 cls, str16 title)')
const GetTopWindow = user32.func('intptr __stdcall GetTopWindow(intptr hWnd)')
const GetWindow = user32.func('intptr __stdcall GetWindow(intptr hWnd, uint32 cmd)')
const GW_HWNDNEXT = 2 // GetTopWindow 返回链顶——向下遍历用 NEXT（PREV 在链顶返回 0，实测坑）

const HWND_BOTTOM = 1n
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0004
const SWP_NOACTIVATE = 0x0010
const SWP_NOOWNERZORDER = 0x0200

/** 把窗口压到 z 序最底（桌面之上、所有普通窗口之下），不移动不缩放不激活 */
export function sendWindowToBottom(nativeHandle: Buffer): void {
  try {
    if (process.platform !== 'win32' || nativeHandle.length < 8) return
    const hwnd = nativeHandle.readBigUInt64LE(0)
    SetWindowPos(
      hwnd,
      HWND_BOTTOM,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER
    )
  } catch {
    /* 原生调用失败不致命：窗口停留在普通层顶端（OS 默认行为），下次切换可再试 */
  }
}

/** 诊断（临时）：从任务栏沿 GW_HWNDNEXT 走链，输出其后 N 个可见窗口（含标题） */
export function zAfterTray(hops: number = 8): string[] {
  const tray = FindWindowW('Shell_TrayWnd', null)
  if (!tray) return ['no-tray']
  const out: string[] = []
  let hwnd = tray
  for (let i = 0; i < 60 && out.length < hops; i++) {
    hwnd = GetWindow(hwnd, GW_HWNDNEXT)
    if (!hwnd) break
    try {
      if (IsWindowVisible(hwnd)) out.push('0x' + hwnd.toString(16))
    } catch {
      break
    }
  }
  return out
}

/** 可见窗口 z 序链（从顶到底，hwnd hex；E2E 置顶/沉底断言用；DTODO_TEST 门控暴露）。
 * 只收集 IsWindowVisible 的窗口——跳过海量不可见系统辅助窗口 */
export function visibleZOrder(max: number = 60): string[] {
  const out: string[] = []
  let hwnd = GetTopWindow(0)
  for (let i = 0; i < 400 && out.length < max; i++) {
    if (!hwnd || hwnd === 0n) break
    try {
      if (IsWindowVisible(hwnd)) out.push('0x' + hwnd.toString(16))
    } catch {
      break
    }
    hwnd = GetWindow(hwnd, GW_HWNDNEXT)
  }
  return out
}
