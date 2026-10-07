import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachSolidCaret } from '../../src/components/solid-caret'

/** 光标常显优化（用户 2026-10-07）：
 * 编辑操作（输入/删除/移动插入点）期间光标停止闪烁保持常显——
 * 实现=激活期以 40ms 间隔交替重绘 caretColor（视觉常显），
 * 0.7s 无操作后清除内联样式恢复系统闪烁。 */

const el = (): HTMLTextAreaElement => {
  const el = document.createElement('textarea')
  document.body.appendChild(el)
  return el
}

describe('attachSolidCaret 编辑期光标常显', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('编辑事件激活：caretColor 被交替重绘（非空样式）', () => {
    vi.useFakeTimers()
    const ta = el()
    attachSolidCaret(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown'))
    vi.advanceTimersByTime(120) // 跨 3 个重绘间隔
    expect(ta.style.caretColor).not.toBe('')
  })

  it('持续编辑期间保持激活（样式持续刷新）', () => {
    vi.useFakeTimers()
    const ta = el()
    attachSolidCaret(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown'))
    const v1 = ta.style.caretColor
    vi.advanceTimersByTime(40)
    ta.dispatchEvent(new KeyboardEvent('input'))
    vi.advanceTimersByTime(120)
    expect(ta.style.caretColor).not.toBe('')
    void v1
  })

  it('0.7s 无操作 → 恢复系统闪烁（清除内联样式）', () => {
    vi.useFakeTimers()
    const ta = el()
    attachSolidCaret(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown'))
    vi.advanceTimersByTime(120)
    expect(ta.style.caretColor).not.toBe('')
    vi.advanceTimersByTime(800)
    expect(ta.style.caretColor).toBe('')
  })

  it('点击（移动插入点）同样激活常显', () => {
    vi.useFakeTimers()
    const ta = el()
    attachSolidCaret(ta)
    ta.dispatchEvent(new MouseEvent('click'))
    vi.advanceTimersByTime(120)
    expect(ta.style.caretColor).not.toBe('')
  })
})
