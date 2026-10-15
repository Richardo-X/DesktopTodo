import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { launchApp } from './helpers'
import { createTodoItem } from '../../src/core/models'

const ELECTRON_EXE = resolve('node_modules/electron/dist/electron.exe')
const APP_MAIN = resolve('out/main/index.js')

function doneItems(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const item = createTodoItem({ content: `已完成${i + 1}`, now: new Date(), id: `d${i}` })
    return { ...item, completedAt: new Date().toISOString() }
  })
}

/** 二轮反馈：滚动条=系统悬浮式（不占行宽）+ 9px 简约样式——溢出时可滚动、行宽零形变 */
test('已完成窗滚动条：溢出可滚动、行宽零形变、自绘滑块按需出现', async () => {
  const measure = async (n: number): Promise<{ scrollH: number; clientH: number; gutter: number; rowW: number; thumbShown: boolean | null; rowRight: number; thumbLeft: number }> => {
    const h = await launchApp({ seed: { completed: doneItems(n) } })
    await h.done.waitForSelector('[data-testid="done-row"]', { timeout: 10_000 })
    await h.done.waitForTimeout(300) // 布局稳定
    await h.done.evaluate(() => {
      const list = document.querySelector('[data-testid="done-panel"] .scroll')
      if (!list) return
      ;(list as unknown as { __n: number }).__n = 0
      list.addEventListener('scroll', () => { (list as unknown as { __n: number }).__n++ })
    })
    const m = await h.done.evaluate(() => {
      const list = document.querySelector('[data-testid="done-panel"] .scroll')
      const row = document.querySelector('[data-testid="done-row"]')
      if (!list || !row) return null
      const thumb = document.querySelector('[data-testid="done-thumb"]')
      return {
        scrollH: list.scrollHeight,
        clientH: list.clientHeight,
        clientW: list.clientWidth,
        rowW: Math.round(row.getBoundingClientRect().width),
        rowRight: Math.round(row.getBoundingClientRect().right),
        thumbLeft: thumb ? Math.round(thumb.getBoundingClientRect().left) : -999,
        thumbShown: thumb ? getComputedStyle(thumb).display !== 'none' : false
      }
    })
    await h.close()
    if (!m) throw new Error('已完成列表缺失')
    return { ...m, gutter: m.clientW - m.rowW }
  }

  const overflow = await measure(12) // 溢出：滚动条出现
  const fit = await measure(1) // 不溢出：无滚动条

  // 自绘滑块：溢出时恒定显示（可滚动）、不溢出时隐藏
  expect(overflow.thumbShown).toBe(true)
  expect(fit.thumbShown).toBe(false)
  // 滑块位于「行右缘与窗口边框之间」的专用带，不与行重叠
  expect(overflow.thumbLeft).toBeGreaterThanOrEqual(overflow.rowRight)

  // 溢出状态确实可滚动；不溢出状态不出现滚动
  expect(overflow.scrollH).toBeGreaterThan(overflow.clientH)
  expect(fit.scrollH).toBeLessThanOrEqual(fit.clientH)
  // 原生滚动条已隐藏：行宽恒定，不受滚动影响
  expect(overflow.gutter).toBe(fit.gutter)
})


/** B5（决策#7/#24）：resizeSelf 真窗口双向缩放——放大与缩小都必须改变 OS 窗口尺寸 */
test('resizeSelf 双向缩放：设置窗 460 → 300 → 440 → 360', async () => {
  const h = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-max"]')

  // 设置窗识别：按 URL（三窗架构下侧窗宽 310 会干扰宽度启发式）
  const settingsBounds = async (): Promise<{ w: number; h: number } | undefined> => {
    const list = await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('win=settings'))
        .map((w) => ({ w: w.getBounds().width, h: w.getBounds().height, vis: w.isVisible() }))
    )
    return list.find((b) => b.vis)
  }

  await expect
    .poll(async () => (await settingsBounds())?.w, { timeout: 10_000 })
    .toBeLessThanOrEqual(465) // OS 对初建窗 bounds 有 ±N 调整（三窗下实测 465）

  // 缩小 400 → 300
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 300, height: 280 })
  })
  await expect
    .poll(async () => (await settingsBounds())?.w, { timeout: 5_000 })
    .toBeLessThanOrEqual(303) // OS ±N 调整容差

  // 放大 300 → 440（高度 480 ≤ 半屏）
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 440, height: 480 })
  })
  await expect
    .poll(async () => (await settingsBounds())?.w, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(437) // OS ±N 调整容差

  // 再缩回 440 → 360
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 360, height: 400 })
  })
  await expect
    .poll(async () => (await settingsBounds())?.w, { timeout: 5_000 })
    .toBeLessThanOrEqual(363) // OS ±N 调整容差

  await h.close()
})

/** B4（决策#9）：托盘隐藏=组件整体隐藏（含全部二级窗口）；显示同步恢复 */
test('托盘隐藏同步隐藏全部子窗口，单实例唤起同步恢复', async () => {
  const h = await launchApp()
  const main = h.main

  // 打开设置子窗口
  const setPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="tb-settings"]')
  const settings = await setPromise
  await settings.waitForSelector('[data-testid="set-max"]')

  // OS 级可见性有异步延迟 → 轮询断言；getAllWindows 顺序不保证 → 排序后比较
  const visiblesSorted = async (): Promise<boolean[]> =>
    (await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed())
        .map((w) => w.isVisible() && w.getOpacity() > 0)
    )).sort()

  // 初始：三窗 + 设置窗均可见
  await expect.poll(visiblesSorted, { timeout: 10_000 }).toEqual([true, true, true, true])

  // ×（tb-minimize）→ 组件整体隐藏（三窗+子窗口）
  await main.click('[data-testid="tb-minimize"]')
  await expect.poll(visiblesSorted, { timeout: 10_000 }).toEqual([false, false, false, false])

  // 恢复：单实例二次唤起（等价托盘"显示"路径）→ 全部同步恢复
  const second = spawn(ELECTRON_EXE, [APP_MAIN], {
    env: { ...process.env, DTODO_USER_DATA: h.userData, DTODO_TEST: '1' },
    stdio: 'ignore'
  })
  await expect.poll(visiblesSorted, { timeout: 20_000 }).toEqual([true, true, true, true])
  second.kill()
  await h.close()
})

/** 8.2-6 迭代（用户 2026-10-15）：提交按钮并入字数行——行尾右对齐（与编辑窗删除键同款），footer 移除 */
test('新建窗提交按钮=字数行行尾右对齐（footer 已移除）', async () => {
  const h = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="op-new"]')
  const child = await sp
  await child.waitForSelector('[data-testid="new-input"]')

  const m = await child.evaluate(() => {
    const meta = document.querySelector('.child-window .meta') as Element
    const btn = document.querySelector('[data-testid="new-submit"]') as Element
    const metaBox = meta.getBoundingClientRect()
    const btnBox = btn.getBoundingClientRect()
    return { noFooter: !document.querySelector('.child-window .footer'), rightGap: metaBox.right - btnBox.right }
  })
  expect(m.noFooter).toBe(true)
  // 提交按钮贴行尾：按钮右缘与 meta 行内容右缘对齐（body 内边距量级）
  expect(m.rightGap).toBeGreaterThanOrEqual(-1)
  expect(m.rightGap).toBeLessThanOrEqual(20)
  await h.close()
})

/** 批次 C-2（用户验收 38）：二级窗打开时主窗显示灰色半透明蒙层（computed 背景断言） */
test('C-2：模态锁定时主窗显示灰色半透明蒙层，关闭后消失', async () => {
  const h = await launchApp()
  h.main.on('console', (m) => console.log('PAGE:', m.text().slice(0, 120)))
  await h.main.waitForSelector('[data-testid="home-panel"]')

  const veilBg = (): Promise<string | null> =>
    h.main.evaluate(() => {
      const v = document.querySelector('[data-testid="modal-veil"]') as HTMLElement | null
      return v ? getComputedStyle(v).backgroundColor : null
    })

  expect(await veilBg()).toBeNull() // 无二级窗：无蒙层

  const wp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await wp
  await settings.waitForSelector('[data-testid="set-max"]').catch(() => {})
  await h.main.waitForTimeout(400)
  expect(await veilBg()).toBe('rgba(20, 20, 25, 0.2)') // 蒙层（原型 .blocked::before 同色）

  await settings.close()
  await h.main.waitForTimeout(500)
  expect(await veilBg()).toBeNull()
  await h.close()
})

/** 二级窗 420 宽系（用户 2026-10-14 晚迭代）：新建/编辑待办+新建/编辑模板 4 窗宽 420、
 * 高=内容适配（464/464/492/468，4:3 输入框填满窗体消灭底部空白）；输入框 aspect-ratio 4:3；
 * 字数行=计数器+清空/还原按钮左邻排布（12px 间距）；组缩放时文字跟随（ChildHost zoom） */
test('二级窗 420 宽系：内容适配高度、输入框 4:3、按钮邻计数器', async () => {
  const h = await launchApp({
    seed: {
      todos: [createTodoItem({ content: '待办甲', now: new Date(), id: 't1' })],
      templates: [createTodoItem({ content: '模板甲', now: new Date(), id: 'tp1' })]
    }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.quick.waitForSelector('[data-testid="quick-panel"]')
  await h.main.waitForTimeout(300)

  const EXPECT_H: Record<string, number> = { 'todo-new': 400, 'todo-edit': 388, 'template-new': 428, 'template-edit': 392 }

  const boundsOf = (kind: string) =>
    h.app.evaluate(({ BrowserWindow }, k) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes(`win=${k}`))
      return w ? w.getBounds() : null
    }, kind)

  const cases: Array<{ label: string; open: () => Promise<void>; kind: string }> = [
    { label: '新建待办', open: () => h.main.click('[data-testid="op-new"]'), kind: 'todo-new' },
    { label: '新建模板', open: () => h.quick.click('[data-testid="quick-new"]'), kind: 'template-new' },
    { label: '编辑待办', open: () => h.main.locator('[data-testid="todo-row"]').dblclick(), kind: 'todo-edit' },
    { label: '编辑模板', open: () => h.quick.locator('[data-testid="tpl-row"]').dblclick(), kind: 'template-edit' }
  ]

  for (const c of cases) {
    const wp = h.app.waitForEvent('window')
    await c.open()
    const page = await wp
    await page.waitForSelector('.child-window', { timeout: 10_000 })
    await page.waitForTimeout(200)

    const b = await boundsOf(c.kind)
    expect(b, `${c.label} 窗口未找到`).not.toBeNull()
    // Windows 对无边框窗宽度轴有 +4~5px 统一膨胀（实测在案）——容差断言
    expect(Math.abs(b!.width - 420), `${c.label} 宽=${b!.width}`).toBeLessThanOrEqual(6)
    expect(Math.abs(b!.height - EXPECT_H[c.kind]), `${c.label} 高=${b!.height} 期望 ${EXPECT_H[c.kind]}`).toBeLessThanOrEqual(6)

    // 输入框 4:3（rect 含 1px 描边，box-sizing: border-box 下比率恒 4/3≈1.333）
    const m = await page.evaluate(() => {
      const input = document.querySelector('.child-window .input') as HTMLElement | null
      const count = document.querySelector('.child-window .meta .count') as HTMLElement | null
      const btn = document.querySelector('.child-window .meta .b') as HTMLElement | null
      const ir = input!.getBoundingClientRect()
      const cr = count!.getBoundingClientRect()
      const br = btn!.getBoundingClientRect()
      return { ratio: ir.width / ir.height, btnGap: br.left - cr.right, countW: cr.width }
    })
    // 新建窗=4:3(1.333)；编辑窗=固定高 254px（4:3 基准收两行，用户 2026-10-15）→ 392/254≈1.54
    const [lo, hi] = c.kind.endsWith('new') ? [1.25, 1.42] : [1.46, 1.62]
    expect(m.ratio, `${c.label} 输入框宽高比=${m.ratio.toFixed(2)}`).toBeGreaterThan(lo)
    expect(m.ratio, `${c.label} 输入框宽高比=${m.ratio.toFixed(2)}`).toBeLessThan(hi)
    // 按钮紧跟计数器右侧：12px 设计间距（Windows 取整 ±2）；计数器固定宽 52px——
    // 字数增减按钮位置钉死不随位数左右移动（用户 2026-10-15）
    expect(Math.abs(m.btnGap - 12), `${c.label} 按钮与计数器间距=${m.btnGap.toFixed(1)}`).toBeLessThanOrEqual(2)
    expect(Math.abs(m.countW - 52), `${c.label} 计数器宽=${m.countW}`).toBeLessThanOrEqual(1)

    // 缩放角标：贴卡片右下内角（设计值内缩 2px）、主题灰、随缩放等比（弧度/尺寸与卡片圆角同心）
    const grip = await page.evaluate(() => {
      const g = document.querySelector('.child-grip') as HTMLElement | null
      if (!g) return null
      const r = g.getBoundingClientRect()
      return {
        right: r.right,
        bottom: r.bottom,
        w: r.width,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        color: getComputedStyle(g, '::before').borderRightColor,
        stroke: Number.parseFloat(getComputedStyle(g, '::before').borderRightWidth)
      }
    })
    expect(grip, `${c.label} 缩放角标缺失`).not.toBeNull()
    // zoom=min(两轴反推)（两轴均有 OS 膨胀，min 保证根元素不溢出窗口=圆角不被裁）；
    // 角标=卡面坐标系右下内缩 1px → 视口位置=(设计值)×zoom
    const zoomK = Math.min(grip!.innerW / 420, grip!.innerH / EXPECT_H[c.kind])
    expect(Math.abs(grip!.right - 419 * zoomK), `${c.label} 角标右缘=${grip!.right}`).toBeLessThanOrEqual(1.5)
    expect(Math.abs(grip!.bottom - (EXPECT_H[c.kind] - 1) * zoomK), `${c.label} 角标底缘=${grip!.bottom}`).toBeLessThanOrEqual(1.5)
    expect(Math.abs(grip!.w - 16 * zoomK), `${c.label} 角标宽=${grip!.w}`).toBeLessThanOrEqual(0.8)
    expect(grip!.color, `${c.label} 角标颜色=${grip!.color}`).toBe('rgb(93, 97, 107)')
    // 描边恒 ~2px 物理宽（设计描边=2/k，渲染回来≈2）：Chromium 对边框做整数设备像素取整（±1 设备 px 噪声）
    expect(Math.abs(grip!.stroke * zoomK - 2), `${c.label} 描边物理宽=${(grip!.stroke * zoomK).toFixed(2)}`).toBeLessThanOrEqual(0.5)

    await page.evaluate(() =>
      (window as unknown as { desktopTodo: { closeSelf(): Promise<void> } }).desktopTodo.closeSelf()
    ).catch(() => {})
    await h.main.waitForTimeout(300)
  }

  await h.close()
})
