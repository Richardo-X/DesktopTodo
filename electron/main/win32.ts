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
const dwmapi = koffi.load('dwmapi.dll')
const DwmGetWindowAttribute = dwmapi.func(
  'int32 __stdcall DwmGetWindowAttribute(intptr hWnd, int32 attr, _Out_ int32 *val, int32 cb)'
)
const ShowWindowAsync2 = user32.func('int32 __stdcall ShowWindowAsync(intptr hWnd, int32 cmd)')
const DWMWA_CLOAKED = 14
const SW_SHOWNA = 8

/** 窗口是否被 DWM cloak（Win+D 显示桌面时 shell 对窗口的隐藏方式——
 * 无 Win32 事件、窗口自身不知情，应用层事件兜底接不住；实测定论）。
 * 读取模式：ArrayBuffer 指针 + koffi.decode（node 验证 hr=0/解码正确） */
export function isCloaked(nativeHandle: Buffer): boolean {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return false
  const buf = new ArrayBuffer(4)
  const hr = DwmGetWindowAttribute(nativeHandle.readBigUInt64LE(0), DWMWA_CLOAKED, buf, 4)
  return hr === 0 && koffi.decode(buf, 0, 'int32') !== 0
}

/** 解除 cloak：无激活重新显示（show 系调用会重置 DWM cloak 状态） */
export function uncloak(nativeHandle: Buffer): void {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return
  ShowWindowAsync2(nativeHandle.readBigUInt64LE(0), SW_SHOWNA)
}

const GetWindowLongW = user32.func('int32 __stdcall GetWindowLongW(intptr hWnd, int32 idx)')
const SetWindowLongW = user32.func('int32 __stdcall SetWindowLongW(intptr hWnd, int32 idx, int32 val)')
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080

const HWND_BOTTOM = 1n
const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0004
const SWP_NOACTIVATE = 0x0010
const SWP_NOOWNERZORDER = 0x0200

/** Win32 ShowWindow 直发（E2E 系统级最小化等价物；DTODO_TEST 钩子用） */
const ShowWindowAsync = user32.func('int32 __stdcall ShowWindowAsync(intptr hWnd, int32 cmd)')

export function sysShowWindow(nativeHandle: Buffer, cmd: number): void {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return
  ShowWindowAsync(nativeHandle.readBigUInt64LE(0), cmd)
}

/** 工具窗口样式（批次 C-1）：Win+D 跳过 WS_EX_TOOLWINDOW 窗口（桌面小工具
 * 同款豁免）——组件不被"显示桌面"隐藏/最小化。副作用均为期望行为：
 * 不进任务栏、不进 Alt+Tab 列表 */
export function makeToolWindow(nativeHandle: Buffer): void {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return
  const hwnd = nativeHandle.readBigInt64LE(0)
  const style = GetWindowLongW(hwnd, GWL_EXSTYLE)
  SetWindowLongW(hwnd, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW)
}

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
