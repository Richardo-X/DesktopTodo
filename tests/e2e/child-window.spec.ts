import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { launchApp } from './helpers'

const ELECTRON_EXE = resolve('node_modules/electron/dist/electron.exe')
const APP_MAIN = resolve('out/main/index.js')

/** B5（决策#7/#24）：resizeSelf 真窗口双向缩放——放大与缩小都必须改变 OS 窗口尺寸 */
test('resizeSelf 双向缩放：设置窗 400 → 300 → 440 → 360', async () => {
  const h = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-max"]')

  // 设置窗识别：可见窗口中宽 400（主窗为 1102×0.7+）
  const settingsBounds = async (): Promise<{ w: number; h: number } | undefined> => {
    const list = await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed())
        .map((w) => ({ w: w.getBounds().width, h: w.getBounds().height, vis: w.isVisible() }))
    )
    return list.find((b) => b.vis && b.w <= 460)
  }

  await expect.poll(async () => (await settingsBounds())?.w, { timeout: 10_000 }).toBe(400)

  // 缩小 400 → 300
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 300, height: 280 })
  })
  await expect.poll(async () => (await settingsBounds())?.w, { timeout: 5_000 }).toBe(300)

  // 放大 300 → 440（高度 480 ≤ 半屏）
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 440, height: 480 })
  })
  await expect.poll(async () => (await settingsBounds())?.w, { timeout: 5_000 }).toBe(440)

  // 再缩回 440 → 360
  await settings.evaluate(() => {
    const api = (window as unknown as { desktopTodo: { resizeSelf(p: { width: number; height: number }): Promise<void> } }).desktopTodo
    void api.resizeSelf({ width: 360, height: 400 })
  })
  await expect.poll(async () => (await settingsBounds())?.w, { timeout: 5_000 }).toBe(360)

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

  // 初始：主窗 + 设置窗均可见
  await expect.poll(visiblesSorted, { timeout: 10_000 }).toEqual([true, true])

  // ×（tb-minimize）→ 组件整体隐藏，子窗口同步隐藏
  await main.click('[data-testid="tb-minimize"]')
  await expect.poll(visiblesSorted, { timeout: 10_000 }).toEqual([false, false])

  // 恢复：单实例二次唤起（等价托盘"显示"路径）→ 全部同步恢复
  const second = spawn(ELECTRON_EXE, [APP_MAIN], {
    env: { ...process.env, DTODO_USER_DATA: h.userData, DTODO_TEST: '1' },
    stdio: 'ignore'
  })
  await expect.poll(visiblesSorted, { timeout: 20_000 }).toEqual([true, true])
  second.kill()
  await h.close()
})
