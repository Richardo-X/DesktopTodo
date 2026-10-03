import koffi from 'koffi'

/** Win32 窗口 z 序调用（koffi 预编译原生绑定；仅 Windows 主进程使用）。
 * Electron 无"沉底"API——setAlwaysOnTop(false) 只降回普通层顶端（仍浮在
 * 未激活窗口之上，需点击其他窗口才被覆盖）；用户定稿"取消置顶后失焦时
 * 组件整体下降到桌面层"必须走 SetWindowPos(HWND_BOTTOM)。
 * 注意：SetWindowPos 的返回值/经典 z 序枚举（GetTopWindow/GetWindow/
 * WindowFromPoint）对 Electron 透明合成窗口不可靠（实测枚举为盲区），
 * 沉底效果以真机视觉为准。 */

const user32 = koffi.load('user32.dll')

// 结构体声明必须先于引用它的 func 声明（否则运行时 "Unknown type name" 崩溃）
koffi.struct('POINT', { x: 'long', y: 'long' })

// Win32 BOOL 是 4 字节 int——koffi 'bool' 是 1 字节 C99 bool，混用会导致
// IsWindowVisible 恒 false 等假象（实测教训），一律 'int32'
const SetWindowPos = user32.func(
  'int32 __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int x, int y, int cx, int cy, uint32 uFlags)'
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
