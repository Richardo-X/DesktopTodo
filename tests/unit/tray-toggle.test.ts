import { describe, it, expect } from 'vitest'
import { shouldAcceptTrayToggle, TRAY_TOGGLE_DEBOUNCE_MS } from '../../src/core/utils/tray-toggle'

/** 托盘切换去抖（用户 2026-10-07 裁定）：
 * 一次双击实际产生两次托盘激活（两次按压各触发一次，间隔 0.46~0.89s，
 * 超出系统双击判定窗口）——切换被翻倍执行（显示→隐藏→显示的"闪退"）。
 * 去抖=1s 内的重复激活只认第一次。 */
describe('shouldAcceptTrayToggle 托盘切换去抖', () => {
  it('首次激活（无历史）→ 放行', () => {
    expect(shouldAcceptTrayToggle(0, 1000)).toBe(true)
  })

  it(`距上次激活不足 ${TRAY_TOGGLE_DEBOUNCE_MS}ms → 拦截（双击的第二压）`, () => {
    expect(shouldAcceptTrayToggle(1000, 1000 + TRAY_TOGGLE_DEBOUNCE_MS - 1)).toBe(false)
  })

  it('实测按压间隔 461~889ms 全部命中拦截（用户日志实锤）', () => {
    for (const gap of [461, 527, 657, 718, 889]) {
      expect(shouldAcceptTrayToggle(5000, 5000 + gap)).toBe(false)
    }
  })

  it(`超过 ${TRAY_TOGGLE_DEBOUNCE_MS}ms → 放行（有意的连续操作不受影响）`, () => {
    expect(shouldAcceptTrayToggle(1000, 1000 + TRAY_TOGGLE_DEBOUNCE_MS)).toBe(true)
    expect(shouldAcceptTrayToggle(1000, 1000 + TRAY_TOGGLE_DEBOUNCE_MS + 500)).toBe(true)
  })
})
