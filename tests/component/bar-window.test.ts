import { describe, it, expect, beforeEach } from 'vitest'
import BarWindow from '../../src/windows/BarWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH } from '../../src/core/constants'

/**
 * 缩进白条独立窗（2026-10-17 §11.K 步1）：窗口=热区请求（160×6），白条元素钉客户端底缘，
 * 命中=元素 mouseenter/click → 上报 barHit（经主进程中继到主窗状态机）。
 */
describe('BarWindow 白条独立窗', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('白条元素尺寸=热区口径（160×6），主题令牌随 store 主题', async () => {
    const { wrapper } = await mountWithStore(BarWindow as never)
    const bar = wrapper.find('.tuck-bar')
    expect(bar.exists()).toBe(true)
    const style = bar.attributes('style') ?? ''
    expect(style).toContain(`height: ${TUCK_BAR_HEIGHT}px`)
    expect(style).toContain(`width: ${TUCK_BAR_WIDTH}px`)
    expect(wrapper.find('.stage').attributes('data-theme')).toBe('day')
  })

  it('mouseenter 与 click 均上报 barHit（命中链：白条窗→主进程→主窗状态机）', async () => {
    const { wrapper, api } = await mountWithStore(BarWindow as never)
    const bar = wrapper.find('.tuck-bar')
    await bar.trigger('mouseenter')
    expect(api.barHitCalls.length).toBe(1)
    await bar.trigger('click')
    expect(api.barHitCalls.length).toBe(2)
  })
})
