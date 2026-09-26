import { nextTick, reactive } from 'vue'

/** 悬停气泡（三轮反馈 8.2-4，照原型 #gbubble 重做）：
 * 只有内容确实被截断才触发；位置固定在鼠标所在行的左侧（不遮待办列表），屏内钳制。 */

export interface BubbleGeometry {
  x: number
  y: number
  arrowTop: number
}

export interface RowRect {
  left: number
  top: number
  height: number
}

/** 截断判定（原型 measureTrunc 口径）：文本真实宽度 > 可见宽度 - 一个字宽 */
export function isTruncatedWider(innerW: number, visibleW: number, reserve: number): boolean {
  return innerW > visibleW - reserve
}

/** 行左侧定位：右缘距行左缘 14px、垂直居中、8px 屏边距钳制、箭头指向行中心。
 * （行左只会越出屏幕左缘，右侧天然不溢出，故无需视口宽度参数） */
export function placeBubbleLeft(row: RowRect, bw: number, bh: number, vh: number): BubbleGeometry {
  const M = 8
  const x = Math.max(M, row.left - bw - 14)
  const cy = row.top + row.height / 2
  const y = Math.max(M, Math.min(cy - bh / 2, vh - bh - M))
  const arrowTop = Math.max(8, Math.min(cy - y - 6, bh - 20))
  return { x, y, arrowTop }
}

export interface ContentBubbleState {
  visible: boolean
  shown: boolean
  text: string
  x: number
  y: number
  arrowTop: number
}

/** 全局单例状态（宿主渲染在 AppShell 的 Teleport，zoom 容器之外） */
export const contentBubble = reactive<ContentBubbleState>({
  visible: false,
  shown: false,
  text: '',
  x: -9999,
  y: -9999,
  arrowTop: 12
})

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let currentContent: HTMLElement | null = null
let currentRow: HTMLElement | null = null

function measureTruncated(content: HTMLElement): boolean {
  const inn = content.querySelector<HTMLElement>('.tt-in')
  if (!inn) return false
  // 块级容器 scrollWidth 恒等于自身宽度（原型踩坑注记）——必须用 inline-block 内层的 offsetWidth
  const reserve = parseFloat(getComputedStyle(content).fontSize) || 13
  return isTruncatedWider(inn.offsetWidth, content.clientWidth, reserve)
}

export function hideBubble(): void {
  contentBubble.visible = false
  contentBubble.shown = false
}

export function bubbleContentEnter(content: HTMLElement, row: HTMLElement): void {
  currentContent = content
  currentRow = row
  if (!measureTruncated(content)) return
  if (hoverTimer !== null) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoverTimer = null
    if (currentContent === null || currentRow === null) return // 已移开
    if (!measureTruncated(currentContent)) return
    void showNow()
  }, 1000)
}

export function bubbleContentLeave(): void {
  currentContent = null
  currentRow = null
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  hideBubble()
}

async function showNow(): Promise<void> {
  const inn = currentContent?.querySelector<HTMLElement>('.tt-in')
  contentBubble.text = inn?.textContent ?? ''
  contentBubble.visible = true
  contentBubble.shown = false
  await nextTick()
  const row = currentRow
  if (!row) return
  const el = document.querySelector<HTMLElement>('[data-testid="content-bubble"]')
  const rr = row.getBoundingClientRect()
  const g = placeBubbleLeft(
    { left: rr.left, top: rr.top, height: rr.height },
    el?.offsetWidth ?? 0,
    el?.offsetHeight ?? 0,
    window.innerHeight
  )
  contentBubble.x = g.x
  contentBubble.y = g.y
  contentBubble.arrowTop = g.arrowTop
  contentBubble.shown = true
}
