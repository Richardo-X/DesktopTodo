import koffi from 'koffi'

/** Win32 窗口 z 序调用（koffi 预编译原生绑定；仅 Windows 主进程使用）。
 * Electron 无"沉底"API——setAlwaysOnTop(false) 只降回普通层顶端（仍浮在
 * 未激活窗口之上，需点击其他窗口才被覆盖）；用户定稿"取消置顶后失焦时
 * 组件整体下降到桌面层"必须走 SetWindowPos(HWND_BOTTOM)。
 * 注意：SetWindowPos 的返回值/经典 z 序枚举（GetTopWindow/GetWindow/
 * WindowFromPoint）对 Electron 透明合成窗口不可靠（实测枚举为盲区），
 * 沉底效果以真机视觉为准。 */

const user32 = koffi.load('user32.dll')

// 结构体声明必须先于引用它的 func 声明（否则运行时 "Unknown type name" 崩溃）；
// koffi 类型注册全局唯一——模块被多次实例化（vitest resetModules 等）时跳过重复注册
try {
  koffi.struct('POINT', { x: 'long', y: 'long' })
} catch {
  /* 已注册 */
}

// Win32 BOOL 是 4 字节 int——koffi 'bool' 是 1 字节 C99 bool，混用会导致
// IsWindowVisible 恒 false 等假象（实测教训），一律 'int32'
const SetWindowPos = user32.func(
  'int32 __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int x, int y, int cx, int cy, uint32 uFlags)'
)
const PostMessageW = user32.func('int32 __stdcall PostMessageW(intptr hWnd, uint32 msg, intptr wp, intptr lp)')
const WM_CLOSE = 0x0010

/** Win32 直发 WM_CLOSE（Alt+F4 的系统等价物；E2E 关闭语义验收用） */
export function postWmClose(nativeHandle: Buffer): boolean {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return false
  try {
    return !!PostMessageW(nativeHandle.readBigUInt64LE(0), WM_CLOSE, 0n, 0n)
  } catch {
    return false
  }
}

const GetWindowLongW = user32.func('int32 __stdcall GetWindowLongW(intptr hWnd, int32 idx)')
const SetWindowLongW = user32.func('int32 __stdcall SetWindowLongW(intptr hWnd, int32 idx, int32 val)')
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_NOACTIVATE = 0x08000000
const WS_EX_TOPMOST = 0x00000008

/** 窗口真实扩展样式标志（Win32 位，非 Electron 跟踪值——E2E 断言用，
 * Electron isFocusable/isAlwaysOnTop 与真实位可能脱节，实测教训） */
export function getWindowExstyleFlags(nativeHandle: Buffer): { noactivate: boolean; tool: boolean; topmost: boolean } {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return { noactivate: false, tool: false, topmost: false }
  try {
    const ex = GetWindowLongW(nativeHandle.readBigInt64LE(0), GWL_EXSTYLE) >>> 0
    return {
      noactivate: !!(ex & WS_EX_NOACTIVATE),
      tool: !!(ex & WS_EX_TOOLWINDOW),
      topmost: !!(ex & WS_EX_TOPMOST)
    }
  } catch {
    return { noactivate: false, tool: false, topmost: false }
  }
}

const GetDC = user32.func('intptr __stdcall GetDC(intptr hWnd)')
const ReleaseDC = user32.func('int32 __stdcall ReleaseDC(intptr hWnd, intptr hdc)')
const gdi32 = koffi.load('gdi32.dll')
const GetPixel = gdi32.func('uint32 __stdcall GetPixel(intptr hdc, int x, int y)')

/** 屏幕物理像素采样（E2E 覆盖判定用）：返回 0x00BBGGRR；失败返回 -1 */
export function screenPixelAt(x: number, y: number): number {
  if (process.platform !== 'win32') return -1
  try {
    const hdc = GetDC(0n)
    const px = GetPixel(hdc, x, y)
    ReleaseDC(0n, hdc)
    return px
  } catch {
    return -1
  }
}

const WindowFromPoint = user32.func('intptr __stdcall WindowFromPoint(POINT pt)')
const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int32 vk)')

/** 命中探针：查询屏幕坐标上最顶层的窗口（句柄+矩形+可见性；无窗口返回 null）。
 * 遮挡判定（C6.4）：透明主窗的白条不透明带可被正常命中，遮挡它的普通窗口亦可——
 * 实测（2026-10-09）：白条可见时命中主窗 hwnd、被设置窗遮挡时命中设置窗 hwnd，两者可区分 */
export function hitProbe(x: number, y: number): string {
  if (process.platform !== 'win32') return ''
  try {
    const hwnd = WindowFromPoint({ x: Math.round(x), y: Math.round(y) })
    return hwnd ? String(hwnd) : ''
  } catch (err) {
    console.error('[hitProbe-err]', err)
    return ''
  }
}
const VK_LBUTTON = 0x01

/** 左键当前是否按下（模态唤醒轮询用：禁用窗口不产生点击事件，需全局按键采样） */
export function isLeftButtonPressed(): boolean {
  if (process.platform !== 'win32') return false
  try {
    return GetAsyncKeyState(VK_LBUTTON) < 0
  } catch {
    return false
  }
}

// ===== DWM 窗口过渡动画禁用（2026-10-09 用户慢放实锤：托盘/缩进显隐时系统给窗口播放
// "中心缩放+淡入淡出"过渡动画——三窗显隐弹动的共同根源，关掉即硬切） =====
const dwmapi = koffi.load('dwmapi.dll')
const DWMWA_TRANSITIONS_FORCEDISABLED = 3
const DwmSetWindowAttribute = dwmapi.func(
  'int32 __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 attr, int32 *val, uint32 cb)'
)

/** 已禁用过渡动画的窗口（E2E 验证用）——DWMWA_TRANSITIONS_FORCEDISABLED 为只写属性
 * （实测 DwmGetWindowAttribute 对其返回 0x80070009），故用 Set 返回值缓存 */
const dwmTransitionsDisabled = new Set<string>()

/** 禁用该窗口的 DWM 过渡动画（出现/消失不再播放系统缩放淡入动画，显隐为瞬间硬切）。
 * 实测验证（2026-10-09，任务栏窗口直调）：Set 返回 0=生效；Get 对此属性恒报错不可用 */
export function disableDwmTransitions(nativeHandle: Buffer): boolean {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return false
  try {
    const hwnd = nativeHandle.readBigUInt64LE(0)
    const hr = DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, [1], 4)
    const ok = hr === 0
    if (ok) dwmTransitionsDisabled.add(String(hwnd))
    return ok
  } catch {
    return false
  }
}

/** 过渡动画禁用状态（E2E 断言用；读 Set 成功缓存） */
export function getDwmTransitionsDisabled(nativeHandle: Buffer): boolean {
  if (process.platform !== 'win32' || nativeHandle.length < 8) return false
  try {
    return dwmTransitionsDisabled.has(String(nativeHandle.readBigUInt64LE(0)))
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

/** 工具窗口样式：组件不进任务栏/Alt+Tab 列表（UI 设计决策，2026-10-05 确认保留） */
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
