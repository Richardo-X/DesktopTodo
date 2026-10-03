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
        .map((w) => w.isVisible())
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

/** 8.2-6：表单类子窗口底部提交按钮右对齐（.footer justify-content:flex-end，B3 样式精简时丢失） */
test('表单类子窗口提交按钮右对齐', async () => {
  const h = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="op-new"]')
  const child = await sp
  await child.waitForSelector('[data-testid="new-input"]')

  const jc = await child.evaluate(
    () => getComputedStyle(document.querySelector('.child-window .footer') as Element).justifyContent
  )
  expect(jc).toBe('flex-end')

  // 提交按钮贴右侧：按钮右缘与 footer 内容右缘对齐（留 footer 内边距）
  const gap = await child.evaluate(() => {
    const footer = document.querySelector('.child-window .footer') as Element
    const btn = document.querySelector('[data-testid="new-submit"]') as Element
    return Math.round(footer.getBoundingClientRect().right - btn.getBoundingClientRect().right)
  })
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(20) // 仅 footer 内边距量级，非贴左
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
