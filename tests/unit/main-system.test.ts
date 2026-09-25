import { describe, it, expect, vi, beforeEach } from 'vitest'
import { acquireSingleInstanceLock } from '../../electron/main/single-instance'
import { setAutoStart, getAutoStart, loginItemSettingsFor } from '../../electron/main/auto-start'
import { applyTopMost, applyTopMostAll, withTopMost, withTuckLock, withTheme } from '../../electron/main/window-state'

/** T16 单实例锁 */
vi.mock('electron', () => {
  const handlers = new Map<string, () => void>()
  return {
    app: {
      requestSingleInstanceLock: vi.fn(() => true),
      on: vi.fn((ev: string, cb: () => void) => handlers.set(ev, cb)),
      getPath: vi.fn(() => 'C:\\Program Files\\Desktop Todo\\桌面待办.exe'),
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn()
    }
  }
})

import { app } from 'electron'

describe('T16 acquireSingleInstanceLock', () => {
  beforeEach(() => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValue(true)
    vi.mocked(app.on).mockClear()
  })

  it('获得锁：注册 second-instance 回调并返回 true', () => {
    const onSecond = vi.fn()
    const got = acquireSingleInstanceLock(onSecond)
    expect(got).toBe(true)
    expect(app.on).toHaveBeenCalledWith('second-instance', onSecond)
  })

  it('未获得锁（已有实例）：返回 false，不注册', () => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValue(false)
    const got = acquireSingleInstanceLock(vi.fn())
    expect(got).toBe(false)
    expect(app.on).not.toHaveBeenCalled()
  })
})

/** T18 开机自启（风险 9：自启路径含空格；附录速查 #2：自启后直接显示窗口） */
describe('T18 开机自启', () => {
  beforeEach(() => {
    vi.mocked(app.setLoginItemSettings).mockClear()
  })

  it('loginItemSettingsFor(true)：openAtLogin=true 且显式 exe 路径（含空格安全）', () => {
    const s = loginItemSettingsFor(true)
    expect(s.openAtLogin).toBe(true)
    expect(s.path).toBe('C:\\Program Files\\Desktop Todo\\桌面待办.exe')
  })

  it('setAutoStart(true/false) 透传', () => {
    setAutoStart(true)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: true }))
    setAutoStart(false)
    expect(app.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: false }))
  })

  it('getAutoStart 读取当前状态', () => {
    vi.mocked(app.getLoginItemSettings).mockReturnValue({ openAtLogin: true } as never)
    expect(getAutoStart()).toBe(true)
  })
})

/** T17 置顶/缩进锁/主题的窗口状态应用（记录到 uiState 由仓库持久化） */
describe('T17 window-state 应用', () => {
  it('applyTopMost：置顶层级 screen-saver', () => {
    const win = { setAlwaysOnTop: vi.fn() }
    applyTopMost(win as never, true)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    applyTopMost(win as never, false)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false, 'screen-saver')
  })

  it('applyTopMostAll（8.2-2）：置顶=整个组件，主窗与全部二级窗口同层级', () => {
    const a = { setAlwaysOnTop: vi.fn() }
    const b = { setAlwaysOnTop: vi.fn() }
    applyTopMostAll([a as never, b as never], true)
    expect(a.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(b.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    applyTopMostAll([a as never, b as never], false)
    expect(a.setAlwaysOnTop).toHaveBeenCalledWith(false, 'screen-saver')
    expect(b.setAlwaysOnTop).toHaveBeenCalledWith(false, 'screen-saver')
  })

  it('uiState 反映置顶/缩进锁/主题变更', () => {
    const s = { topMost: false, tuckLock: false, theme: 'day' as const }
    expect(withTopMost(s, true)).toMatchObject({ topMost: true })
    expect(withTuckLock(s, true)).toMatchObject({ tuckLock: true })
    expect(withTheme(s, 'night')).toMatchObject({ theme: 'night' })
    // 原对象不变
    expect(s.topMost).toBe(false)
  })
})
