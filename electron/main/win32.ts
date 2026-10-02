import koffi from 'koffi'

/** Win32 窗口 z 序调用（koffi 预编译原生绑定；仅 Windows 主进程使用）。
 * Electron 无"沉底"API——setAlwaysOnTop(false) 只降回普通层顶端（仍浮在
 * 未激活窗口之上，需点击其他窗口才被覆盖）；用户定稿"切换为非置顶时组件
 * 整体立即下降到桌面层"必须走 SetWindowPos(HWND_BOTTOM)。 */
const user32 = koffi.load('user32.dll')
const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int x, int y, int cx, int cy, uint32 uFlags)'
)

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
