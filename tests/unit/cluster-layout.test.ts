import { describe, it, expect } from 'vitest'
import {
  BASE_PANEL,
  BASE_GAP,
  clusterBaseWidth,
  clusterBounds,
  effectiveClusterScale,
  clampChildGroupScale,
  tuckBarBounds,
  visibleClusterWidth,
  visibleClusterBounds,
  quickOffsetPx,
  windowBoundsForAnchor,
  anchorForWindowX,
  threeWindowBoundsForAnchor,
  clampAnchorForEdges
} from '../../src/core/utils/cluster-layout'
import { MIN_SCALE } from '../../src/core/constants'

/** 1920x1080 主屏工作区（可用高 1040，半屏 520） */
const WA = { x: 0, y: 40, width: 1920, height: 1040 }

/**
 * B2 布局基准（决策#4/#18/#20 + 第二轮反馈裁定）：
 * 组件恒定三段槽位——快捷添加(-316)/待办主窗(0,0 居中锚)/已完成(+476)，
 * 面板开关只做槽位内显隐，**不再改变窗口几何**（主窗屏幕位置恒定，零残影）。
 */
describe('BASE_PANEL / BASE_GAP 基准常量', () => {
  it('主窗 470、两侧面板 310（决策#18）、簇高 640、间隙 6px（决策#20）', () => {
    expect(BASE_PANEL).toEqual({ quick: 310, done: 310, main: 470, height: 640 })
    expect(BASE_GAP).toBe(6)
  })
})

describe('clusterBaseWidth 恒定簇基准宽（不再随面板开关变化）', () => {
  it('恒为全开宽：470+310+310+6×2 = 1102（两侧槽位恒定留位）', () => {
    expect(clusterBaseWidth()).toBe(1102)
  })
})

describe('clusterBounds 恒定簇尺寸（不含面板开关维度）', () => {
  it('scale=1 → 1102×640', () => {
    expect(clusterBounds(1)).toEqual({ width: 1102, height: 640 })
  })

  it('等比缩放（四舍五入）', () => {
    expect(clusterBounds(0.8)).toEqual({
      width: Math.round(1102 * 0.8),
      height: Math.round(640 * 0.8)
    })
  })
})

describe('effectiveClusterScale 初始/有效缩放（决策#23）', () => {
  it('矮屏按半屏钳制：1080p 可用高 1040 → 半屏 520/640 ≈ 0.8125，存值 1 也被钳制', () => {
    expect(effectiveClusterScale(1, WA)).toBeCloseTo(520 / 640, 6)
  })

  it('高分辨率大屏：不放大也不缩小，原值返回', () => {
    const big = { x: 0, y: 0, width: 3840, height: 2100 }
    expect(effectiveClusterScale(1, big)).toBe(1)
  })

  it('低于 MIN_SCALE 的存值 → MIN_SCALE 兜底', () => {
    expect(effectiveClusterScale(0.2, WA)).toBe(MIN_SCALE)
    expect(MIN_SCALE).toBe(0.7)
  })

  it('宽度先触顶：窄屏按屏宽钳制', () => {
    const narrow = { x: 0, y: 0, width: 800, height: 2100 }
    expect(effectiveClusterScale(1, narrow)).toBeCloseTo(800 / 1102, 6)
  })
})

/**
 * 二级窗口组缩放（照原型 setGroupScale 一模一样的规则，第二轮反馈裁定）：
 * 上限 = min(1.6, (屏宽-24)/基准宽, (屏高-24)/基准高)；下限 0.7；步进 0.05。
 * 内容流式 reflow，无 zoom。
 */
describe('clampChildGroupScale 原型组缩放规则', () => {
  it('范围内原值返回', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(1.1, 400, 430, wa)).toBe(1.1)
  })

  it('上限 1.6 倍', () => {
    const big = { x: 0, y: 0, width: 4000, height: 3000 }
    expect(clampChildGroupScale(1.8, 400, 430, big)).toBe(1.6)
  })

  it('屏幕放不下时按 (屏-24)/基准 钳制（1.6 硬上限优先，随后 0.05 步进归整）', () => {
    // (1040-24)/430 = 2.362 > 1.6 → 1.6 硬上限生效 → 步进 1.6
    const wa = { x: 0, y: 0, width: 1000, height: 1040 }
    expect(clampChildGroupScale(2.5, 400, 430, wa)).toBe(1.6)
    // 更小屏幕：(560-24)/400 = 1.34 < 1.6 → 按屏幕钳制；步进 1.153→1.15
    const small = { x: 0, y: 0, width: 560, height: 520 }
    expect(clampChildGroupScale(2.5, 400, 430, small)).toBe(1.15)
  })

  it('下限 0.7 兜底', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(0.2, 400, 430, wa)).toBe(0.7)
  })

  it('步进 0.05（原型 round(v*20)/20）', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(clampChildGroupScale(1.132, 400, 430, wa)).toBe(1.15)
  })
})

/** 三轮8.2-1：缩进胶囊窗口 bounds——在原簇水平中心、贴顶、160×12 热区 */
describe('tuckBarBounds', () => {
  it('缩进时窗口收窄为胶囊：水平居中于原簇，y 不变（贴顶）', () => {
    const b = tuckBarBounds({ x: 500, y: 0 }, 1102)
    expect(b.width).toBe(160)
    expect(b.height).toBe(12)
    expect(b.x).toBe(500 + Math.round((1102 - 160) / 2)) // 971
    expect(b.y).toBe(0)
  })

  it('弹出时恢复：传回原簇左缘即还原全宽 bounds（restore 语义由调用方用原 pos）', () => {
    // 胶囊中心 = 簇中心：反解簇左缘 = 胶囊x - (clusterW-160)/2
    const pos = { x: 123, y: 40 }
    const b = tuckBarBounds(pos, 1102)
    expect(b.x - pos.x).toBe(Math.round((1102 - 160) / 2))
  })
})

/** 四轮定稿 B（动态窗口）：pos=待办窗口左上角锚点；隐藏面板不再占位，
 * 窗口 bounds=可见面板并集；缩放/开关面板以待办左上角为唯一不动点 */
describe('动态窗口几何（四轮：锚点=待办左上角）', () => {
  it('visibleClusterWidth：可见面板并集宽（含 6px 缝隙）', () => {
    expect(visibleClusterWidth(true, true)).toBe(1102)
    expect(visibleClusterWidth(true, false)).toBe(786)
    expect(visibleClusterWidth(false, true)).toBe(786)
    expect(visibleClusterWidth(false, false)).toBe(470)
  })

  it('visibleClusterBounds：随缩放取整', () => {
    expect(visibleClusterBounds(1, true, true)).toEqual({ width: 1102, height: 640 })
    expect(visibleClusterBounds(0.5, false, false)).toEqual({ width: 235, height: 320 })
  })

  it('quickOffsetPx：快捷可见时窗口左缘到待办左缘的偏移', () => {
    expect(quickOffsetPx(1, true)).toBe(316)
    expect(quickOffsetPx(1, false)).toBe(0)
    expect(quickOffsetPx(0.5, true)).toBe(158)
  })

  it('windowBoundsForAnchor / anchorForWindowX：往返一致（缩放锚点不变量）', () => {
    const anchor = { x: 500, y: 40 }
    for (const scale of [0.7, 1, 1.3]) {
      for (const q of [true, false]) {
        for (const d of [true, false]) {
          const wb = windowBoundsForAnchor(anchor, scale, q, d)
          expect(wb.y).toBe(anchor.y)
          expect(wb.x).toBe(anchor.x - quickOffsetPx(scale, q))
          expect(wb.width).toBe(visibleClusterBounds(scale, q, d).width)
          expect(anchorForWindowX(wb.x, scale, q)).toBe(anchor.x) // 往返
        }
      }
    }
  })

  it('缩放时锚点不动：同锚点不同 scale，windowBounds 的 x 随快捷可见性左移、待办左缘恒在锚点', () => {
    const anchor = { x: 500, y: 40 }
    const wb1 = windowBoundsForAnchor(anchor, 0.7, true, true)
    const wb2 = windowBoundsForAnchor(anchor, 1.2, true, true)
    expect(wb2.x).toBeLessThan(wb1.x) // 放大 → 窗口左缘左移（快捷向左伸展）
    expect(anchorForWindowX(wb1.x, 0.7, true)).toBe(500)
    expect(anchorForWindowX(wb2.x, 1.2, true)).toBe(500)
    expect(wb1.y).toBe(40)
    expect(wb2.y).toBe(40)
  })
})

/**
 * 批次 A（三窗分离技术验证）：三窗逐窗 bounds——
 * 定稿 §9.2：锚点=待办左上角；快捷窗右缘钉待办左缘 -6、已完成窗左缘钉待办右缘 +6；
 * 隐藏侧窗 bounds=null（独立 OS 窗口，不占位）。主进程 spike 拖动与批次 B 几何迁移共用。
 */
describe('threeWindowBoundsForAnchor 三窗逐窗 bounds（批次 A）', () => {
  const SIDE_STEP = BASE_PANEL.quick + BASE_GAP // 316
  const DONE_STEP = BASE_PANEL.main + BASE_GAP // 476

  it('scale=1 全开：快捷 -316、待办 0、已完成 +476，尺寸=基准，顶边同 y', () => {
    const b = threeWindowBoundsForAnchor({ x: 500, y: 200 }, 1, true, true)
    expect(b.main).toEqual({ x: 500, y: 200, width: 470, height: 640 })
    expect(b.quick).toEqual({ x: 500 - SIDE_STEP, y: 200, width: 310, height: 640 })
    expect(b.done).toEqual({ x: 500 + DONE_STEP, y: 200, width: 310, height: 640 })
  })

  it('缝隙恰好 6px：快捷右缘+6=待办左缘；待办右缘+6=已完成左缘', () => {
    const b = threeWindowBoundsForAnchor({ x: 500, y: 200 }, 1, true, true)
    expect(b.quick!.x + b.quick!.width + BASE_GAP).toBe(b.main.x)
    expect(b.main.x + b.main.width + BASE_GAP).toBe(b.done!.x)
  })

  it('缩放等比（0.8）：侧窗位置从主窗整数值推导（缝隙恒定，消量化相位噪声），锚点不动', () => {
    const b = threeWindowBoundsForAnchor({ x: 500, y: 200 }, 0.8, true, true)
    const mainW = Math.round(470 * 0.8) // 376
    const sideW = Math.round(310 * 0.8) // 248
    expect(b.main.x).toBe(500)
    expect(b.main).toEqual({ x: 500, y: 200, width: mainW, height: Math.round(640 * 0.8) })
    // 缝隙=固定 6px 常量（不参与缩放）：左窗右上角严格不动
    expect(b.quick).toEqual({ x: 500 - sideW - 6, y: 200, width: sideW, height: Math.round(640 * 0.8) })
    expect(b.done).toEqual({ x: 500 + mainW + 6, y: 200, width: sideW, height: Math.round(640 * 0.8) })
  })

  it('缝隙=6px 常量（不参与缩放）+ 左窗右上角严格不动：0.7~1.3 步进扫描', () => {
    for (let s = 0.7; s <= 1.301; s += 0.01) {
      const b = threeWindowBoundsForAnchor({ x: 100, y: 50 }, s, true, true)
      const gapL = b.main.x - (b.quick!.x + b.quick!.width)
      const gapR = b.done!.x - (b.main.x + b.main.width)
      expect(gapL).toBe(6)
      expect(gapR).toBe(6)
      // 左窗右上角 = (主窗左缘 - 6, 锚点 y)：缩放全程不动
      expect(b.quick!.x + b.quick!.width).toBe(94)
      expect(b.quick!.y).toBe(50)
      expect(b.quick!.height).toBe(b.main.height)
      expect(b.done!.height).toBe(b.main.height)
    }
  })

  it('侧窗隐藏 → bounds=null（隐藏不占位）；主窗恒有 bounds', () => {
    const both = threeWindowBoundsForAnchor({ x: 0, y: 0 }, 1, false, false)
    expect(both.quick).toBeNull()
    expect(both.done).toBeNull()
    expect(both.main).toEqual({ x: 0, y: 0, width: 470, height: 640 })

    const onlyQuick = threeWindowBoundsForAnchor({ x: 0, y: 0 }, 1, true, false)
    expect(onlyQuick.quick).not.toBeNull()
    expect(onlyQuick.done).toBeNull()

    const onlyDone = threeWindowBoundsForAnchor({ x: 0, y: 0 }, 1, false, true)
    expect(onlyDone.quick).toBeNull()
    expect(onlyDone.done).not.toBeNull()
  })

  it('同帧拖动不变量：锚点平移 (dx,dy) → 每个可见窗坐标同步平移（三窗同帧的几何前提）', () => {
    const a = threeWindowBoundsForAnchor({ x: 500, y: 200 }, 0.8, true, true)
    const b = threeWindowBoundsForAnchor({ x: 500 + 120, y: 200 + 60 }, 0.8, true, true)
    for (const k of ['quick', 'main', 'done'] as const) {
      expect(b[k]!.x - a[k]!.x).toBe(120)
      expect(b[k]!.y - a[k]!.y).toBe(60)
    }
  })
})

/**
 * 决策 #31/#32/#33：拖动边界=OS 窗口行为——左右边缘不阻挡（侧窗可悬挂屏外）、
 * 拖动/点击都不自动移回；仅主窗保留 ≥90px 可见；y 在工作区内（底部留 50px）。
 * 启动/恢复/分辨率变化共用本钳制（幂等=原样恢复）。
 */
describe('clampAnchorForEdges 拖动边界钳制（批次 B-3，#31/#32/#33）', () => {
  const wa = { x: 0, y: 40, width: 1920, height: 1040 }
  const mainW = 470

  it('正常位置原样返回（幂等）', () => {
    const a = { x: 800, y: 200 }
    expect(clampAnchorForEdges(a, mainW, wa)).toEqual(a)
  })

  it('侧窗悬挂屏外不阻挡：主窗右缘距屏右 ≥90 即允许（锚点可远超旧钳制）', () => {
    // 主窗右缘贴屏右-90：锚点=1920-90-470=1360；侧窗（+476）完全悬挂屏外仍允许
    const a = { x: 1360, y: 200 }
    expect(clampAnchorForEdges(a, mainW, wa)).toEqual(a)
  })

  it('主窗左缘保留 ≥90px 可见：更左则钳回', () => {
    const clamped = clampAnchorForEdges({ x: -1000, y: 200 }, mainW, wa)
    expect(clamped.x).toBe(90 - mainW)
  })

  it('主窗右缘保留 ≥90px 可见：更右则钳回', () => {
    const clamped = clampAnchorForEdges({ x: 2500, y: 200 }, mainW, wa)
    expect(clamped.x).toBe(wa.width - 90)
  })

  it('y 钳制：顶部不越工作区、底部留 50px', () => {
    expect(clampAnchorForEdges({ x: 800, y: -20 }, mainW, wa).y).toBe(wa.y)
    const low = clampAnchorForEdges({ x: 800, y: 2000 }, mainW, wa)
    expect(low.y).toBe(wa.y + wa.height - 50)
  })

  it('工作区偏移（副屏 x/y 非零）正确处理', () => {
    const off = { x: -1920, y: 0, width: 1080, height: 1000 }
    const clamped = clampAnchorForEdges({ x: -3000, y: -100 }, mainW, off)
    expect(clamped.x).toBe(off.x + 90 - mainW)
    expect(clamped.y).toBe(off.y)
  })
})
