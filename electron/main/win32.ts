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
koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })

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
const GetForegroundWindow = user32.func('intptr __stdcall GetForegroundWindow()')
const GetClassNameA = user32.func('int32 __stdcall GetClassNameA(intptr hWnd, _Out_ void *buf, int32 maxCount)')
const FindWindowA = user32.func('intptr __stdcall FindWindowA(str cls, str title)')
const WindowFromPoint = user32.func('intptr __stdcall WindowFromPoint(POINT pt)')
const GetWindowRect = user32.func('int32 __stdcall GetWindowRect(intptr hWnd, _Out_ RECT *rect)')
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_TOPMOST = 0x00000008

/** 窗口是否带 TOPMOST 位（Win+D 抢跑守卫诊断：确认抢设是否真的落地） */
export function hasTopmostBit(nativeHandle: Buffer): boolean {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return false
  try {
    return (GetWindowLongW(nativeHandle.readBigInt64LE(0), GWL_EXSTYLE) & WS_EX_TOPMOST) !== 0
  } catch {
    return false
  }
}

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

/** 当前前台窗口句柄（0=无）。Win+D 抢跑守卫的前台轮询用 */
export function getForegroundHwnd(): bigint {
  if (process.platform !== 'win32') return 0n
  try {
    return BigInt(GetForegroundWindow())
  } catch {
    return 0n
  }
}

/** 前台窗口的类名（''=失败）。桌面层窗口存在多实例（多个 WorkerW/Progman），
 * 句柄白名单不可靠——轮询按类名判定（真机第九轮：WorkerW 变体漏判致误解除） */
export function getForegroundWindowClass(): string {
  if (process.platform !== 'win32') return ''
  try {
    const hwnd = BigInt(GetForegroundWindow())
    if (hwnd === 0n) return ''
    const buf = new ArrayBuffer(512)
    const n = GetClassNameA(hwnd, buf, 512)
    if (n <= 0) return ''
    return Buffer.from(buf, 0, n).toString('latin1')
  } catch {
    return ''
  }
}

/** 指定屏幕坐标（物理像素）处的窗口类名（''=无）。
 * Win+D 抢跑守卫用：Electron 透明窗对命中测试是盲区（HANDOFF 实测），
 * 在组件中心探测到的是"组件下方/遮挡它的窗口"——桌面态探到桌面层，
 * 普通态被应用遮挡时探到该应用 */
export function windowClassAtPoint(x: number, y: number): string {
  if (process.platform !== 'win32') return ''
  try {
    const buf = new ArrayBuffer(8)
    new DataView(buf).setInt32(0, x, true)
    new DataView(buf).setInt32(4, y, true)
    const hwnd = BigInt(WindowFromPoint(buf))
    if (hwnd === 0n) return ''
    const cbuf = new ArrayBuffer(512)
    const n = GetClassNameA(hwnd, cbuf, 512)
    if (n <= 0) return ''
    return Buffer.from(cbuf, 0, n).toString('latin1')
  } catch {
    return ''
  }
}

/** 窗口屏幕矩形（物理像素；null=失败）。主进程 DPI 感知，坐标即物理值 */
export function getWindowRect(nativeHandle: Buffer): { x: number; y: number; width: number; height: number } | null {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return null
  try {
    const rect = new ArrayBuffer(16)
    if (!GetWindowRect(nativeHandle.readBigUInt64LE(0), rect)) return null
    const v = new DataView(rect)
    const left = v.getInt32(0, true)
    const top = v.getInt32(4, true)
    const right = v.getInt32(8, true)
    const bottom = v.getInt32(12, true)
    return { x: left, y: top, width: right - left, height: bottom - top }
  } catch {
    return null
  }
}

/** shell 桌面层窗口句柄（Progman/WorkerW/任务栏）。前台轮询的"非应用窗口"白名单：
 * Show Desktop 态下前台停在桌面层（这些不算"应用抢焦点"，不解除抢设） */
export function getShellDesktopHwnds(): bigint[] {
  if (process.platform !== 'win32') return []
  try {
    const progman = BigInt(FindWindowA('Progman', null))
    const worker = BigInt(FindWindowA('WorkerW', null))
    const tray = BigInt(FindWindowA('Shell_TrayWnd', null))
    return [progman, worker, tray].filter((h) => h !== 0n)
  } catch {
    return []
  }
}
