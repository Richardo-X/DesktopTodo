import { describe, it, expect } from 'vitest'
import { shouldWakeModalFocus } from '../../src/core/utils/modal-wake'

/** 模态唤醒（用户 2026-10-07 新需求）：
 * 二级窗开着（模态锁定）时，点击锁定的组件窗任意可见处 → 应用整体浮到最上
 * （聚焦二级窗），锁定保持不变。
 * 背景：禁用窗口连点击事件都不产生（Windows 不向禁用窗投递鼠标）——
 * 常规点击激活不可用，需轮询「左键按下边缘 + 光标在组件窗内」判定。 */
describe('shouldWakeModalFocus 模态唤醒判定', () => {
  const base = { pressed: true, prevPressed: false, cursorInside: true, childOpen: true }

  it('按下边缘 + 光标在组件内 + 二级窗开着 → 唤醒', () => {
    expect(shouldWakeModalFocus(base)).toBe(true)
  })

  it('按键保持按住（非按下边缘）→ 不重复唤醒', () => {
    expect(shouldWakeModalFocus({ ...base, prevPressed: true })).toBe(false)
  })

  it('光标不在组件窗内（点的是应用外）→ 不唤醒', () => {
    expect(shouldWakeModalFocus({ ...base, cursorInside: false })).toBe(false)
  })

  it('无二级窗（应用未锁定）→ 不唤醒（常规点击激活已由 OS 处理）', () => {
    expect(shouldWakeModalFocus({ ...base, childOpen: false })).toBe(false)
  })

  it('未按下（光标仅悬停）→ 不唤醒', () => {
    expect(shouldWakeModalFocus({ ...base, pressed: false })).toBe(false)
  })
})
