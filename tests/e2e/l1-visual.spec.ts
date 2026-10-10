import { test, expect } from '@playwright/test'
import { launchApp } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** L1 视觉精修（原型 v3.4-taste）自动化锁定：
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
