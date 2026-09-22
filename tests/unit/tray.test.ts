import { describe, it, expect } from 'vitest'
import { buildTrayContextMenu, exitConfirmMessage } from '../../electron/main/tray-menu'
import { drawIconRgba, encodePng } from '../../electron/main/icon'

/** T15 托盘（PRD §2.2：双击显隐、右键菜单「显示/隐藏」「退出」、退出确认唯一途径） */
describe('buildTrayContextMenu 托盘右键菜单', () => {
  it('恰好两项：显示/隐藏 + 退出', () => {
    const items = buildTrayContextMenu({ visible: true })
    expect(items.map((i) => i.id)).toEqual(['toggle-visibility', 'exit'])
    expect(items[0].label).toBe('隐藏')
    expect(items[1].label).toBe('退出')
  })

  it('隐藏状态标签切换为「显示」', () => {
    expect(buildTrayContextMenu({ visible: false })[0].label).toBe('显示')
  })

  it('退出项：需确认框，且是唯一退出途径', () => {
    const exit = buildTrayContextMenu({ visible: true })[1]
    expect(exit.requiresConfirm).toBe(true)
    expect(exit.onlyExitPath).toBe(true)
  })
})

describe('exitConfirmMessage 退出确认文案（速查 #3）', () => {
  it('无未保存输入 → 基础确认文案', () => {
    expect(exitConfirmMessage(false)).toBe('确定要退出桌面待办吗？退出后组件将从桌面消失，可再次打开。')
  })

  it('有未保存编辑输入 → 一并提示', () => {
    const msg = exitConfirmMessage(true)
    expect(msg).toContain('未保存')
    expect(msg).toContain('退出')
  })
})

/** B1 占位图标：运行时生成蓝底白勾 PNG（无外部素材依赖） */
describe('tray 图标生成', () => {
  it('drawIconRgba：角落透明、中心蓝、勾折点白', () => {
    const rgba = drawIconRgba(32)
    // 角落（圆角外）→ alpha 0
    expect(rgba[0]).toBe(0) // (0,0) R
    expect(rgba[3]).toBe(0) // (0,0) A
    // 中心 → 蓝底 (#2f6fed)
    const c = (16 * 32 + 16) * 4
    expect(rgba[c]).toBe(0x2f)
    expect(rgba[c + 1]).toBe(0x6f)
    expect(rgba[c + 2]).toBe(0xed)
    expect(rgba[c + 3]).toBe(255)
    // 勾的折点附近 → 白
    const k = (21 * 32 + 14) * 4
    expect(rgba[k]).toBe(255)
    expect(rgba[k + 1]).toBe(255)
    expect(rgba[k + 2]).toBe(255)
  })

  it('encodePng：合法 PNG 结构（签名/IHDR 尺寸/IDAT/IEND）', () => {
    const png = encodePng(32, 32, drawIconRgba(32))
    // PNG 签名
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // IHDR 宽高（大端）
    expect(png.readUInt32BE(16)).toBe(32)
    expect(png.readUInt32BE(20)).toBe(32)
    // 颜色类型 6（RGBA）、位深 8
    expect(png[25]).toBe(8)
    expect(png[26]).toBe(6)
    const text = png.toString('latin1')
    expect(text).toContain('IDAT')
    expect(text).toContain('IEND')
  })
})
