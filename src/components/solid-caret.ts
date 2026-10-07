/** 光标常显（用户 2026-10-07）：编辑操作（输入/删除/移动插入点）期间
 * 光标停止闪烁保持常显——激活期以 40ms 间隔交替重绘 caretColor
 * （透明/主题色交替，视觉=常显），0.7s 无操作后清除内联样式恢复系统闪烁。
 * 接入点：编辑窗 textarea（TemplateEditWindow/TodoEditWindow）。 */

const IDLE_MS = 700
const PAINT_INTERVAL_MS = 40

export function attachSolidCaret(el: HTMLTextAreaElement | HTMLInputElement): () => void {
  let active = false
  let interval: ReturnType<typeof setInterval> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let toggle = false

  const paint = (): void => {
    toggle = !toggle
    // 透明/不透明快速交替 → 视觉常显（ duty 50%、周期 80ms，不可辨闪烁）
    el.style.caretColor = toggle ? 'transparent' : 'currentColor'
  }

  const stop = (): void => {
    active = false
    if (interval !== null) {
      clearInterval(interval)
      interval = null
    }
    el.style.caretColor = '' // 恢复系统闪烁
  }

  const bump = (): void => {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = setTimeout(stop, IDLE_MS)
    if (active) return
    active = true
    paint()
    interval = setInterval(paint, PAINT_INTERVAL_MS)
  }

  el.addEventListener('keydown', bump)
  el.addEventListener('input', bump)
  el.addEventListener('click', bump)
  el.addEventListener('keyup', bump)

  return (): void => {
    el.removeEventListener('keydown', bump)
    el.removeEventListener('input', bump)
    el.removeEventListener('click', bump)
    el.removeEventListener('keyup', bump)
    if (idleTimer !== null) clearTimeout(idleTimer)
    if (interval !== null) clearInterval(interval)
    el.style.caretColor = ''
  }
}
