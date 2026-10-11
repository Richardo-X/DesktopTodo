import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** L1 视觉精修（原型 v3.4-L1，原名 v3.4-taste）自动化锁定：
 * 令牌对比度 / 时钟等宽 / 圆角统一 6px / 对话框 420px+10px / 投影色调化 /
 * 按压反馈 :active / 缓出曲线 / focus-visible / prefers-reduced-motion。
 * 与原型 v3.4 逐项对应，防止后续回归改回纯黑投影/5px 圆角/旧对比度。 */

test('L1-①②：文字对比度令牌（日/夜）+ 时钟等宽数字与 Display 字体', async () => {
  const h = await launchApp({ seed: { todos: [createTodoItem({ content: '甲', now: new Date(), id: 't1' })] } })
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const tokens = (): Promise<{ text: string; muted: string; faint: string }> =>
    h.main.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.stage') as Element)
      return {
        text: cs.getPropertyValue('--text').trim(),
        muted: cs.getPropertyValue('--muted').trim(),
        faint: cs.getPropertyValue('--faint').trim()
      }
    })

  // 白天：对比度提高族（#1a1c20 / #5d616b / #8b8f99）
  const day = await tokens()
  expect(day.text).toBe('#1a1c20')
  expect(day.muted).toBe('#5d616b')
  expect(day.faint).toBe('#8b8f99')
  // 生效检查：标题栏副文本实际取到新 muted 色（回退值同步更新）
  const tbColor = await h.main.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="tb-title"]') as Element).color
  )
  expect(tbColor).toBe('rgb(93, 97, 107)')

  // 夜晚：同步新族（#f2f3f5 / #abafb8 / #7d818c）
  await h.main.click('[data-testid="tb-theme"]')
  await h.main.waitForTimeout(250)
  const night = await tokens()
  expect(night.text).toBe('#f2f3f5')
  expect(night.muted).toBe('#abafb8')
  expect(night.faint).toBe('#7d818c')

  // 时钟等宽数字 + Display 字体（刷新不跳动）
  const clock = await h.main.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-testid="clock-time"]') as Element)
    return { variant: cs.fontVariantNumeric, family: cs.fontFamily }
  })
  expect(clock.variant).toContain('tabular-nums')
  expect(clock.family).toContain('Segoe UI Variable Display')

  await h.close()
})

test('L1-③⑤：圆角统一 6px + 对话框 420px/10px/双层蓝黑投影', async () => {
  const h = await launchApp({ seed: { todos: [createTodoItem({ content: '甲', now: new Date(), id: 't1' })] } })
  await h.main.waitForSelector('[data-testid="home-panel"]')

  // 行勾选框 / 标题栏品牌方块 / 批量按钮：6px（原 5px）
  const radius = (sel: string): Promise<string> =>
    h.main.evaluate((s) => getComputedStyle(document.querySelector(s) as Element).borderRadius, sel)
  expect(await radius('[data-testid="row-checkbox"]')).toBe('6px')
  expect(await radius('[data-testid="tb-brand"]')).toBe('6px')
  expect(await radius('[data-testid="op-batch"]')).toBe('6px')
  // 待办行本体保持 8px（不在 5→6 阶梯内）
  expect(await radius('[data-testid="todo-row"]')).toBe('8px')

  // 确认框：开批量 → 选中 → 删除所选 → 确认框
  await h.main.click('[data-testid="op-batch"]')
  await h.main.click('[data-testid="todo-row"]')
  await h.main.click('[data-testid="batch-delete"]')
  await h.main.waitForSelector('[data-testid="confirm-dialog"]')

  const dlg = await h.main.evaluate(() => {
    const el = document.querySelector('.dialog') as HTMLElement
    const cs = getComputedStyle(el)
    return {
      radius: cs.borderRadius,
      shadow: cs.boxShadow,
      width: el.getBoundingClientRect().width,
      innerWidth: window.innerWidth
    }
  })
  expect(dlg.radius).toBe('10px')
  // 宽度 min(420px, 88vw)：与视口比例比对（DPR/屏幕钳制缩放下绝对像素环境相关）
  expect(Math.abs(dlg.width - Math.min(420, 0.88 * dlg.innerWidth))).toBeLessThanOrEqual(1)
  // 双层蓝黑投影（纯黑已色调化）
  expect(dlg.shadow).toContain('rgba(10, 20, 40, 0.5)')
  expect(dlg.shadow).toContain('rgba(10, 20, 40, 0.25)')
  expect(dlg.shadow).not.toContain('rgba(0, 0, 0')

  // 蒙层色调化（纯黑→蓝黑 rgba(10,20,40,.46)）
  const maskBg = await h.main.evaluate(
    () => getComputedStyle(document.querySelector('.mask') as Element).backgroundColor
  )
  expect(maskBg).toBe('rgba(10, 20, 40, 0.46)')

  await h.close()
})

test('L1-⑦⑨：按压反馈 :active scale 0.96 + 全局缓出曲线', async () => {
  const h = await launchApp({ seed: { todos: [createTodoItem({ content: '甲', now: new Date(), id: 't1' })] } })
  await h.done.waitForSelector('[data-testid="done-panel"]')

  // 已完成窗排序按钮：真实鼠标按下 → :active 缩放至 0.96（过渡 0.12s，轮询到稳态）
  const btn = h.done.locator('[data-testid="done-sort"]')
  await btn.hover()
  await h.done.mouse.down()
  await expect
    .poll(
      async () =>
        h.done.evaluate(() => {
          const m = getComputedStyle(document.querySelector('[data-testid="done-sort"]') as Element).transform
          const match = /matrix\(([\d.]+)/.exec(m)
          return match ? parseFloat(match[1]) : 1
        }),
      { timeout: 2000 }
    )
    .toBeLessThan(0.97)
  await h.done.mouse.up()

  // 缓出曲线：待办行过渡使用 cubic-bezier(.22,.61,.36,1)（--ease-out 解析值）；
  // 行样式为 scoped，需查真实元素而非探针
  await h.main.waitForSelector('[data-testid="todo-row"]')
  const easing = await h.main.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="todo-row"]') as Element).transitionTimingFunction
  )
  expect(easing).toContain('cubic-bezier(0.22, 0.61, 0.36, 1)')
  // 定时器归属：行过渡 0.15s（原型 .todo-row）
  const dur = await h.main.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="todo-row"]') as Element).transitionDuration
  )
  expect(dur.split(',').some((d) => Math.abs(parseFloat(d) - 0.15) < 0.001)).toBe(true)

  await h.close()
})

test('L1-⑧：focus-visible 键盘焦点描边（accent 2px）', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  // 键盘 Tab 聚焦（键盘触发才算 focus-visible）
  await h.main.keyboard.press('Tab')
  const outline = await h.main.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    // 同父上下文参照探针：显式 2px accent 描边（与焦点元素同渲染上下文，
    // 消除 DPR 缩放 / 屏幕钳制 zoom 对绝对像素值的影响）
    const probe = document.createElement('div')
    probe.style.outline = '2px solid var(--accent)'
    probe.style.outlineOffset = '1px'
    el.parentElement!.appendChild(probe)
    const pcs = getComputedStyle(probe)
    const ecs = getComputedStyle(el)
    const out = {
      testid: el.getAttribute('data-testid'),
      style: ecs.outlineStyle,
      width: ecs.outlineWidth,
      color: ecs.outlineColor,
      offset: ecs.outlineOffset,
      refWidth: pcs.outlineWidth,
      refColor: pcs.outlineColor
    }
    probe.remove()
    return out
  })
  expect(outline).not.toBeNull()
  expect(outline!.style).toBe('solid')
  expect(outline!.width).toBe(outline!.refWidth) // = 2px（与参照同值）
  expect(outline!.color).toBe('rgb(10, 99, 184)') // accent #0a63b8
  expect(outline!.color).toBe(outline!.refColor)
  await h.close()
})

test('L1-⑩：prefers-reduced-motion 关闭过渡与动画', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')

  // 基线：待办行有过渡（0.15s）
  const readDur = (): Promise<string> =>
    h.main.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'todo-row'
      document.body.appendChild(probe)
      const v = getComputedStyle(probe).transitionDuration
      probe.remove()
      return v
    })
  const before = await readDur()
  expect(before.split(',').some((d) => parseFloat(d) > 0)).toBe(true)

  // 模拟系统减弱动效：所有过渡归零
  await h.main.emulateMedia({ reducedMotion: 'reduce' })
  const after = await readDur()
  expect(after.split(',').every((d) => parseFloat(d) === 0)).toBe(true)
  await h.main.emulateMedia({ reducedMotion: 'no-preference' })

  await h.close()
})

/** 用户验收 2026-10-10 反馈两项对齐 3.4：
 * ① 快捷添加按钮=原型线性 SVG 闪电（原 ⚡ 字符在 Windows 渲染为彩色 emoji）；
 * ② 已完成窗空列表文案垂直居中于列表区（原型 .panel-empty flex:1 居中；原 block 上下文失效贴顶）。 */
test('L1-⑪：操作区两枚图标为原型 SVG 且光学配平 + 已完成空文案垂直居中', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.done.waitForSelector('[data-testid="done-panel"]')

  // ① 两枚图标：均为原型同款单色线性 SVG（无字符内容），16px 盒（按钮 32px，比例免 zoom 影响），
  //    且渲染墨迹等高（光学配平——原 ⚡ 字符/原尺寸闪电都比 ☑ 面板图标大一档，同排观感不一致）
  const icons = await h.main.evaluate(() => {
    const box = (tid: string): { hasSvg: boolean; text: string; svgW: number; btnW: number; rects: number; paths: number; d: string; inkW: number; inkH: number } => {
      const btn = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement
      const svg = btn.querySelector('svg')
      const shapes = btn.querySelectorAll('svg path, svg rect')
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
      shapes.forEach((s) => {
        const r = s.getBoundingClientRect()
        x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top)
        x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom)
      })
      return {
        hasSvg: !!svg,
        text: (btn.textContent ?? '').trim(),
        svgW: svg ? svg.getBoundingClientRect().width : 0,
        btnW: btn.getBoundingClientRect().width,
        rects: shapes.length ? btn.querySelectorAll('svg rect').length : 0,
        paths: btn.querySelectorAll('svg path').length,
        d: btn.querySelector('svg path')?.getAttribute('d') ?? '',
        inkW: x2 - x1,
        inkH: y2 - y1
      }
    }
    return { bolt: box('op-quick-toggle'), check: box('op-done-toggle') }
  })
  // ⚡：原型 I.bolt 路径（缩放配平用外层 g transform，路径保持原样）
  expect(icons.bolt.hasSvg).toBe(true)
  expect(icons.bolt.d).toBe('M13 2L3 14h7l-1 8 10-12h-7l1-8z')
  expect(icons.bolt.text).toBe('')
  expect(Math.abs(icons.bolt.svgW / icons.bolt.btnW - 16 / 32)).toBeLessThan(0.05)
  // ☑：原型 I.panelCheck（1 rect + 2 path），无字符内容
  expect(icons.check.hasSvg).toBe(true)
  expect(icons.check.text).toBe('')
  expect(icons.check.rects).toBe(1)
  expect(icons.check.paths).toBe(2)
  expect(Math.abs(icons.check.svgW / icons.check.btnW - 16 / 32)).toBeLessThan(0.05)
  // 光学配平：两图标墨迹高度一致（±5%）
  expect(icons.bolt.inkH).toBeGreaterThan(4)
  expect(Math.abs(icons.bolt.inkH - icons.check.inkH) / icons.check.inkH).toBeLessThan(0.05)

  // ② 空文案：垂直中心 = 列表区垂直中心（±2px）
  const pos = await h.done.evaluate(() => {
    const empty = document.querySelector('[data-testid="done-empty"]') as HTMLElement
    const wrap = empty.parentElement as HTMLElement
    const er = empty.getBoundingClientRect()
    const wr = wrap.getBoundingClientRect()
    return { ec: (er.top + er.bottom) / 2, wc: (wr.top + wr.bottom) / 2, wh: wr.height }
  })
  expect(pos.wh).toBeGreaterThan(200) // 列表区非退化
  expect(Math.abs(pos.ec - pos.wc)).toBeLessThanOrEqual(2)

  await h.close()
})

/** L1.5 图标系统统一（用户 2026-10-10 决策：全量对齐原型图标集；步进器保持字形；勾统一 I.check）：
 * 同一图标跨页=同一 SVG（勾 4 页与品牌同源）；＋/←/×/🕘 字形清零；二级窗按钮补齐图标。 */
test('L1-⑫：跨页图标统一（同一图标同一套 SVG，字形/emoji 清零）', async () => {
  const CHECK = 'M5 12.5l4.5 4.5L19 7.5'
  const h = await launchApp({
    seed: {
      todos: [createTodoItem({ content: '待办甲', now: new Date(), id: 't1' })],
      completed: [{ ...createTodoItem({ content: '已完成甲', now: new Date(), id: 'd1' }), completedAt: new Date().toISOString() }],
      templates: [{ id: 'tp1', content: '模板甲', createdAt: new Date().toISOString() } as never]
    }
  })
  await h.main.waitForSelector('[data-testid="todo-row"]')
  await h.done.waitForSelector('[data-testid="done-check"]')
  await h.quick.waitForSelector('[data-testid="tpl-add"]')

  const read = (page: typeof h.main, sel: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null
      if (!el) return null
      const svg = el.querySelector('svg')
      const d = svg?.querySelector('path')?.getAttribute('d') ?? ''
      const path = svg?.querySelector('path') as SVGPathElement | null
      return {
        hasSvg: !!svg,
        d,
        stroke: path ? getComputedStyle(path).strokeWidth : null,
        text: (el.textContent ?? '').trim(),
        svgW: svg ? svg.getBoundingClientRect().width : 0,
        boxW: el.getBoundingClientRect().width
      }
    }, sel)

  // ① 勾：主窗勾选框 / 已完成勾选框 / 标题栏品牌勾 = 同一路径（原型 I.check，跨页统一核心断言）
  const mainCheck = await read(h.main, '[data-testid="row-checkbox"]')
  const doneCheck = await read(h.done, '[data-testid="done-check"]')
  const brand = await read(h.main, '[data-testid="tb-brand"]')
  expect(mainCheck!.d).toBe(CHECK)
  expect(mainCheck!.stroke).toBe('3px') // 原型 .checkbox svg 口径
  expect(doneCheck!.d).toBe(CHECK)
  expect(doneCheck!.stroke).toBe('3px')
  expect(brand!.d).toBe(CHECK) // 与勾选框同源（品牌线宽按原型 3.4）
  expect(brand!.stroke).toBe('3.4px')

  // ② 字形/emoji 清零：＋ / 批量删除 / 历史记录 / 模板＋框 = SVG + 文字（或无文字）
  const plusMain = await read(h.main, '[data-testid="op-new"]')
  expect(plusMain!.hasSvg).toBe(true)
  expect(plusMain!.text).toBe('')
  expect(Math.abs(plusMain!.svgW / plusMain!.boxW - 16 / 32)).toBeLessThan(0.05) // 16px 随 32px 按钮
  const batchMain = await read(h.main, '[data-testid="op-batch"]')
  expect(batchMain!.hasSvg).toBe(true)
  expect(batchMain!.text).toBe('批量删除')
  const batchQuick = await read(h.quick, '[data-testid="quick-batch"]')
  expect(batchQuick!.hasSvg).toBe(true)
  expect(batchQuick!.text).toBe('批量删除')
  const plusQuick = await read(h.quick, '[data-testid="quick-new"]')
  expect(plusQuick!.hasSvg).toBe(true)
  expect(plusQuick!.text).toBe('')
  const tplAdd = await read(h.quick, '[data-testid="tpl-add"]')
  expect(tplAdd!.hasSvg).toBe(true)
  expect(tplAdd!.text).toBe('')
  expect(Math.abs(tplAdd!.svgW / tplAdd!.boxW - 11 / 20)).toBeLessThan(0.05) // 原型 .plusbox svg 11px 规格
  const histBtn = await read(h.done, '[data-testid="done-history"]')
  expect(histBtn!.hasSvg).toBe(true)
  expect(histBtn!.text).toBe('历史记录') // 🕘 emoji 已移除

  // ③ 二级窗：返回/关闭 = 原型 SVG；步进器保持字形（原型本身即字形，用户决策）
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const sw = await sp
  await sw.waitForSelector('[data-testid="set-back"]')
  const back = await read(sw as never, '[data-testid="set-back"]')
  expect(back!.hasSvg).toBe(true)
  expect(back!.d).toBe('M15 18l-6-6 6-6') // 原型 I.chevL
  expect(back!.text).toBe('')
  const stepper = await sw.evaluate(() => {
    const minus = document.querySelector('[data-testid="set-max-minus"]') as HTMLElement
    const plus = document.querySelector('[data-testid="set-max-plus"]') as HTMLElement
    return { minus: minus.textContent?.trim(), minusSvg: !!minus.querySelector('svg'), plus: plus.textContent?.trim(), plusSvg: !!plus.querySelector('svg') }
  })
  expect(stepper.minus).toBe('−')
  expect(stepper.plus).toBe('＋')
  expect(stepper.minusSvg).toBe(false)
  expect(stepper.plusSvg).toBe(false)

  await h.close()
})
