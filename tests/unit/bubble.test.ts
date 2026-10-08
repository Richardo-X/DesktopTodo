import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** 气泡「闪一下才显示」修复（HANDOFF §10.4-1，2026-10-08）：
 * 量完尺寸、贴合同窗口大小后再显示——showBubble 不再立即 showInactive（全尺寸闪现根因），
 * 等渲染层量得内容尺寸回包（bubbleResize）贴合落位后才显示；
 * payload 发出 100ms 无回包按全尺寸几何兜底强制显示（防渲染层失联）；
 * 隐藏清挂起回包，迟到的 resize 不复活气泡（隐藏窗 setBounds 在 Windows 会将窗口显示——§9.9）。
 * 另：Windows 上 resizable=false 时收缩不生效——收缩前临时解除（同 index.ts resizeSelf 先例）。 */

interface MockWin {
  visible: boolean
  setIgnoreMouseEvents: ReturnType<typeof vi.fn>
  setAlwaysOnTop: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  setResizable: ReturnType<typeof vi.fn>
  isResizable: ReturnType<typeof vi.fn>
  showInactive: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  isVisible: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  webContents: { on: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }
}

const h = vi.hoisted(() => ({ windows: [] as MockWin[] }))

vi.mock('electron', () => {
  class MockWebContents {
    on = vi.fn()
    send = vi.fn()
  }
  class MockBrowserWindow {
    visible = false
    webContents = new MockWebContents()
    setIgnoreMouseEvents = vi.fn()
    setAlwaysOnTop = vi.fn()
    setBounds = vi.fn()
    setResizable = vi.fn()
    isResizable = vi.fn(() => false)
    showInactive = vi.fn(() => {
      ;(this as unknown as MockWin).visible = true
    })
    hide = vi.fn(() => {
      ;(this as unknown as MockWin).visible = false
    })
    isDestroyed = vi.fn(() => false)
    isVisible = vi.fn(function (this: MockWin) {
      return this.visible
    })
    loadFile = vi.fn(() => Promise.resolve())
    constructor() {
      h.windows.push(this as unknown as MockWin)
    }
  }
  return { BrowserWindow: MockBrowserWindow }
})

type BubbleApi = typeof import('../../electron/main/bubble')

let api: BubbleApi

const SENDER = { x: 500, y: 300, width: 470, height: 640 }
const PAYLOAD = {
  text: '一段会被截断的长待办内容',
  theme: 'day' as const,
  row: { left: 10, top: 120, right: 400, bottom: 156 }
}
// 屏幕行 = (510,420)-(900,456)：行中心 y=438；左侧放得下（510-14-320=176 ≥ 8）→ side=left
// 贴合 245×52 → x=510-14-245=251，y=round(438-26)=412；兜底全尺寸 → (176,358) 320×160

/** 模拟气泡页加载完成（触发 did-finish-load 回调：重发 payload + 武装兜底） */
function finishLoad(win: MockWin): void {
  const cb = win.webContents.on.mock.calls.find((c) => c[0] === 'did-finish-load')?.[1] as () => void
  cb()
}

/** 已加载页面的标准显示请求（创建→加载完成→请求显示） */
function requestShow(): MockWin {
  api.showBubble(SENDER, PAYLOAD)
  const win = h.windows[0]
  finishLoad(win)
  api.showBubble(SENDER, PAYLOAD)
  return win
}

beforeEach(async () => {
  vi.useFakeTimers()
  h.windows.length = 0
  ;(globalThis as Record<string, unknown>).__dirname = 'C:/fake/app'
  vi.resetModules()
  api = await import('../../electron/main/bubble')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('气泡显示门控（量完贴合再显示）', () => {
  it('showBubble 不立即显示；量得内容尺寸回包后贴合落位并显示', () => {
    const win = requestShow()
    expect(win.showInactive).not.toHaveBeenCalled() // 全尺寸闪现根因：不再立即显示
    expect(win.webContents.send).toHaveBeenCalledWith('bubble:payload', {
      text: PAYLOAD.text,
      theme: 'day',
      side: 'left'
    })

    api.resizeBubble({ w: 245, h: 52 })
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 251, y: 412, width: 245, height: 52 })
  })

  it('收缩前临时解除 resizable（Windows：resizable=false 时收缩不生效），完成后恢复', () => {
    const win = requestShow()
    api.resizeBubble({ w: 120, h: 40 })
    expect(win.setResizable.mock.calls).toEqual([[true], [false]])
    const [lift] = win.setResizable.mock.invocationCallOrder
    const settle = win.setBounds.mock.invocationCallOrder.at(-1)!
    const [restore] = win.setResizable.mock.invocationCallOrder.slice(1)
    expect(lift).toBeLessThan(settle)
    expect(settle).toBeLessThan(restore)
  })

  it('300ms 兜底：渲染层失联（无 resize 回包）按全尺寸几何强制显示；299ms 内不抢先', () => {
    const win = requestShow()
    vi.advanceTimersByTime(299)
    expect(win.showInactive).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 176, y: 358, width: 320, height: 160 })
  })

  it('兜底显示后迟到的回包：窗口已可见 → 仍贴合尺寸、不重复显示', () => {
    const win = requestShow()
    vi.advanceTimersByTime(300) // 兜底已显示
    api.resizeBubble({ w: 200, h: 60 })
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 296, y: 408, width: 200, height: 60 })
  })

  it('慢回包 82ms（真机 p99 实测）不触发兜底：回包直接贴合显示', () => {
    const win = requestShow()
    vi.advanceTimersByTime(82)
    api.resizeBubble({ w: 245, h: 52 })
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 251, y: 412, width: 245, height: 52 })
  })

  it('隐藏清挂起：移开后迟到的 resize 回包不复活气泡、不动隐藏窗几何', () => {
    const win = requestShow()
    api.hideBubble()
    expect(win.hide).toHaveBeenCalledTimes(1)
    win.setBounds.mockClear()
    api.resizeBubble({ w: 245, h: 52 })
    vi.advanceTimersByTime(1000)
    expect(win.showInactive).not.toHaveBeenCalled()
    expect(win.setBounds).not.toHaveBeenCalled() // 隐藏窗 setBounds 会将其显示（§9.9）——必须整个跳过
  })

  it('冷启动：页面未加载完不显示也不武装兜底；did-finish-load 重发后才走量完显示', () => {
    api.showBubble(SENDER, PAYLOAD) // 创建即请求（页面尚未加载完成）
    const win = h.windows[0]
    vi.advanceTimersByTime(5000)
    expect(win.showInactive).not.toHaveBeenCalled() // 未武装兜底——不提前显示

    finishLoad(win) // 加载完成：重发 payload + 武装兜底
    expect(win.webContents.send).toHaveBeenLastCalledWith('bubble:payload', {
      text: PAYLOAD.text,
      theme: 'day',
      side: 'left'
    })
    vi.advanceTimersByTime(299)
    expect(win.showInactive).not.toHaveBeenCalled()
    api.resizeBubble({ w: 245, h: 52 })
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 251, y: 412, width: 245, height: 52 })
  })

  it('测量值钳制：w<80→80、h>160→160（位置按钳后尺寸重排）', () => {
    const win = requestShow()
    api.resizeBubble({ w: 10, h: 999 })
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 416, y: 358, width: 80, height: 160 })
  })

  it('右侧翻转（行贴近屏幕左缘）：贴合后锚定行右缘 +14', () => {
    api.showBubble({ x: 8, y: 300, width: 470, height: 640 }, PAYLOAD)
    const win = h.windows[0]
    finishLoad(win)
    api.showBubble({ x: 8, y: 300, width: 470, height: 640 }, PAYLOAD)
    api.resizeBubble({ w: 100, h: 40 })
    expect(win.setBounds).toHaveBeenLastCalledWith({ x: 422, y: 418, width: 100, height: 40 })
  })
})
