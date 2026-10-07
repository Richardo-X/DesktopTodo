import { getApi } from '../services/api'

/** 悬停气泡（三轮 8.2-4 提出 / 四轮定稿：独立小窗口承载）：
 * 只有内容确实被截断才触发；默认显示在鼠标所在行的左侧（屏幕坐标，可越出主窗口），
 * 会碰到屏幕左缘时改在行右侧弹出（允许遮挡列表）；垂直方向居中对齐行，不做下边缘特殊处理。 */

export interface BubbleGeometry {
  x: number
  y: number
  side: 'left' | 'right'
}

export interface ScreenRow {
  left: number
  top: number
  right: number
  bottom: number
}

/** 截断判定（原型 measureTrunc 口径）：文本真实宽度 > 可见宽度 - 一个字宽 */
export function isTruncatedWider(innerW: number, visibleW: number, reserve: number): boolean {
  return innerW > visibleW - reserve
}

/** 屏幕坐标定位（气泡窗宽 bubbleW）：左缘放得下（≥8px）在行左侧，否则翻转到行右侧（允许遮列表）；
 * 垂直=行中心对齐（下边缘不做特殊处理——四轮用户定稿） */
export function placeBubbleScreen(row: ScreenRow, bubbleW: number): BubbleGeometry {
  const M = 8
  const cy = (row.top + row.bottom) / 2
  const y = Math.round(cy - BUBBLE_H / 2)
  const leftX = row.left - 14 - bubbleW
  if (leftX >= M) return { x: leftX, y, side: 'left' }
  return { x: row.right + 14, y, side: 'right' }
}

/** 气泡小窗的暂定高度（页面量得实际内容高后经 bubbleResize 修正） */
export const BUBBLE_H = 160
/** 气泡内容最大宽（原型 #gbubble 规格） */
export const BUBBLE_MAX_W = 300

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let currentContent: HTMLElement | null = null
let currentRow: HTMLElement | null = null
/** 抑制标志：二级窗打开（veil）/失焦时置位——禁用窗口收不到 mouseleave，
 * 排队中的显示定时器到点会照弹（竞态根因），抑制标志兜底拦截 */
let suppressed = false

function measureTruncated(content: HTMLElement): boolean {
  const inn = content.querySelector<HTMLElement>('.tt-in')
  if (!inn) return false
  // 块级容器 scrollWidth 恒等于自身宽度（原型踩坑注记）——必须用 inline-block 内层的 offsetWidth
  const reserve = parseFloat(getComputedStyle(content).fontSize) || 13
  return isTruncatedWider(inn.offsetWidth, content.clientWidth, reserve)
}

export function hideBubble(): void {
  void getApi().bubbleHide()
}

/** 取消挂起中的气泡（清定时器+状态）并隐藏——veil 开启/窗口失焦时调用 */
export function cancelBubble(): void {
  suppressed = true
  currentContent = null
  currentRow = null
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  hideBubble()
}

export function bubbleContentEnter(content: HTMLElement, row: HTMLElement): void {
  suppressed = false
  currentContent = content
  currentRow = row
  if (!measureTruncated(content)) return
  if (hoverTimer !== null) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoverTimer = null
    if (suppressed) return // veil/失焦抑制期（禁用窗口收不到 mouseleave）
    if (currentContent === null || currentRow === null) return // 已移开
    if (!measureTruncated(currentContent)) return
    showNow()
  }, 500) // 用户 2026-10-07 裁定：延迟 1s→0.5s
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

function showNow(): void {
  const inn = currentContent?.querySelector<HTMLElement>('.tt-in')
  const row = currentRow
  if (!row) return
  const r = row.getBoundingClientRect()
  const theme = document.querySelector('.stage')?.getAttribute('data-theme') === 'night' ? 'night' : 'day'
  void getApi().bubbleShow({
    text: inn?.textContent ?? '',
    theme: theme as 'day' | 'night',
    row: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
}
