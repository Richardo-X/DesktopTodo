import { describe, it, expect } from 'vitest'
import {
  BASE_PANEL,
  BASE_GAP,
  clusterBounds,
  clusterBaseWidth,
  defaultWindowOptions,
  initialPos,
  MIN_SCALE,
  HALF_HEIGHT_MAX_RATIO
} from '../../electron/main/layout'

/** 1920x1080 主屏工作区 */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/** T13 主窗口配置（B2 起 layout.ts re-export src/core/utils/cluster-layout 单一来源） */
describe('layout re-export：与 cluster-layout 单一来源一致', () => {
  it('基准常量与簇尺寸同源（恒定 1102×640，面板开关不改变窗口几何）', () => {
    expect(BASE_PANEL).toEqual({ quick: 310, done: 310, main: 470, height: 640 })
    expect(BASE_GAP).toBe(6)
    expect(clusterBaseWidth()).toBe(1102)
    expect(clusterBounds(1)).toEqual({ width: 1102, height: 640 })
  })

  it('等比缩放（四舍五入）', () => {
    const b = clusterBounds(0.8)
    expect(b.width).toBe(Math.round(1102 * 0.8))
    expect(b.height).toBe(Math.round(640 * 0.8))
  })
})

describe('initialPos 首次启动默认位置', () => {
  it('屏幕右侧偏上，且不贴边（预留上边缘距离，避免触发贴边缩进）', () => {
    const b = clusterBounds(1)
    const pos = initialPos(WA, b)
    expect(pos.x).toBe(WA.x + WA.width - b.width - 24) // 右侧留 24px
    expect(pos.y).toBe(WA.y + 48) // 偏上且与上边缘保持 48px（不贴边）
    expect(pos.y).toBeGreaterThan(WA.y)
  })

  it('极小屏幕不越界', () => {
    const small = { x: 0, y: 0, width: 800, height: 500 }
    const b = clusterBounds(1)
    const pos = initialPos(small, b)
    expect(pos.x).toBeGreaterThanOrEqual(small.x)
    expect(pos.y).toBeGreaterThanOrEqual(small.y)
  })
})

describe('defaultWindowOptions 主窗口 BrowserWindow 配置', () => {
  it('无边框、透明、不占任务栏、禁止系统调整大小、不显示标题栏原生按钮', () => {
    const b = clusterBounds(1)
    const opts = defaultWindowOptions(b)
    expect(opts.frame).toBe(false)
    expect(opts.transparent).toBe(true)
    expect(opts.skipTaskbar).toBe(true)
    expect(opts.resizable).toBe(false)
    expect(opts.hasShadow).toBe(false)
    expect(opts.width).toBe(b.width)
    expect(opts.height).toBe(b.height)
    expect(opts.show).toBe(false) // ready-to-show 后再显示
  })

  it('常量：MIN_SCALE=0.7，半屏高度上限比例 0.5（附录 A8/速查 #7）', () => {
    expect(MIN_SCALE).toBe(0.7)
    expect(HALF_HEIGHT_MAX_RATIO).toBe(0.5)
  })
})
