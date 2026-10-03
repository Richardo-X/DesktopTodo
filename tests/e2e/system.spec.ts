import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { launchApp, type AppHandle } from './helpers'
import { defaultAppData } from '../../src/core/models'

/** T51 系统级验收（验收 4/39/44 的自动化部分） */

const ELECTRON_EXE = resolve('node_modules/electron/dist/electron.exe')
const APP_MAIN = resolve('out/main/index.js')

test('验收4：单实例运行——二次启动只调出现有窗口并自行退出', async () => {
  const h: AppHandle = await launchApp()
  // 用同一 userData 再启动一个实例：应立即退出
  const second = spawn(ELECTRON_EXE, [APP_MAIN], {
    env: { ...process.env, DTODO_USER_DATA: h.userData, DTODO_TEST: '1' },
    stdio: 'ignore'
  })
  const exited = await Promise.race([
    new Promise<string>((r) => second.on('exit', (code) => r(`exit:${code}`))),
    new Promise<string>((r) => setTimeout(() => r('timeout'), 15_000))
  ])
  expect(exited).not.toBe('timeout')
  expect(second.exitCode).toBe(0)
  // 原实例仍在运行
  expect(h.app.process()?.exitCode).toBeNull()
  await h.close()
})

test('验收39：置顶开关生效（isAlwaysOnTop）', async () => {
  const h: AppHandle = await launchApp()
  const before = await h.app.evaluate((electron) => electron.BrowserWindow.getAllWindows()[0].isAlwaysOnTop())
  expect(before).toBe(false)

  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)
  const after = await h.app.evaluate((electron) => electron.BrowserWindow.getAllWindows()[0].isAlwaysOnTop())
  expect(after).toBe(true)

  // 还原（避免污染系统设置）
  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)
  await h.close()
})

test('验收44（C-3 修订）：开发版自启开关不写系统登录项（防护生效）', async () => {
  const h: AppHandle = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-autostart-btn"]')

  await settings.click('[data-testid="set-autostart-btn"]')
  await settings.waitForTimeout(500)
  // C-3：E2E=开发版（未打包），setAutoStart 被防护拦截——注册表必须保持未写入
  const enabled = await h.app.evaluate((electron) => electron.app.getLoginItemSettings().openAtLogin)
  expect(enabled).toBe(false)

  // 关闭还原
  await settings.click('[data-testid="set-autostart-btn"]')
  await settings.waitForTimeout(500)
  const disabled = await h.app.evaluate((electron) => electron.app.getLoginItemSettings().openAtLogin)
  expect(disabled).toBe(false)
  await h.close()
})

/** 8.2-2：置顶=整个组件（含二级窗口）——主窗置顶时打开子窗口必须同层级，否则被模态锁定假死 */
test('8.2-2：置顶时打开的子窗口同步置顶', async () => {
  const h = await launchApp()
  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)

  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-max"]')
  await h.main.waitForTimeout(300)

  const flags = await h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed())
      .map((w) => w.isAlwaysOnTop())
      .sort()
  )
  expect(flags).toEqual([true, true, true, true]) // 三窗 + 设置子窗
  await h.close()
})

/** 置顶语义（用户定稿 2026-10-02 修订）：未置顶=不可激活挂件（被其他窗口遮挡，
 * 重叠时点击组件不激活、不浮上来）；开置顶=三窗最上层且可激活；缩进→弹出保持 */
test('置顶语义：默认不可激活挂件（点击不浮上来）；置顶=最上层；缩进弹出保持', async () => {
  const h = await launchApp()
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const readState = (): Promise<{ atop: boolean[]; focusable: boolean[] }> =>
    h.app.evaluate(({ BrowserWindow }) => {
      const ws = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
      return {
        atop: ws.map((w) => w.isAlwaysOnTop()).sort(),
        focusable: ws.map((w) => w.isFocusable()).sort()
      }
    })

  // 默认（uiState.topMost=false）：三窗挂件态——非置顶+不可激活（点击不浮上来）
  expect(await readState()).toEqual({ atop: [false, false, false], focusable: [false, false, false] })

  // 开置顶 → 三窗同层最上且可激活
  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)
  expect(await readState()).toEqual({ atop: [true, true, true], focusable: [true, true, true] })

  // 缩进 → 弹出：置顶态保持（弹出路径不强制置顶、不改激活性）
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(true)
  )
  await h.main.waitForTimeout(600)
  await h.main.evaluate(() =>
    (window as unknown as { desktopTodo: { setTucked(v: boolean): Promise<void> } }).desktopTodo.setTucked(false)
  )
  await h.main.waitForTimeout(600)
  expect(await readState()).toEqual({ atop: [true, true, true], focusable: [true, true, true] })

  // 关置顶 → 恢复挂件态
  await h.main.click('[data-testid="tb-topmost"]')
  await h.main.waitForTimeout(400)
  expect(await readState()).toEqual({ atop: [false, false, false], focusable: [false, false, false] })
  await h.close()
})

/** 8.2-2：重启后置顶保持——seed topMost=true 启动后主窗必须仍是置顶 */
test('8.2-2：重启后置顶状态保持', async () => {
  const seeded = defaultAppData()
  seeded.uiState.topMost = true
  const h = await launchApp({ seed: seeded })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.waitForTimeout(400)

  const flag = await h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).every((w) => w.isAlwaysOnTop())
  )
  expect(flag).toBe(true)
  await h.close()
})

/** 8.2-2：托盘隐藏→恢复后置顶保持（Windows 上 hide/show 可能重置 z-order，用户报"重启后丢失"的最可能路径） */
test('8.2-2：托盘隐藏再恢复后置顶保持', async () => {
  const seeded = defaultAppData()
  seeded.uiState.topMost = true
  const h = await launchApp({ seed: seeded })
  await h.main.waitForSelector('[data-testid="home-panel"]')

  await h.main.click('[data-testid="tb-minimize"]')
  const visibles = async (): Promise<boolean[]> =>
    (await h.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => w.isVisible())
    )).sort()
  await expect.poll(visibles, { timeout: 10_000 }).toEqual([false, false, false])

  // 单实例二次唤起（等价托盘"显示"路径）
  const second = spawn(ELECTRON_EXE, [APP_MAIN], {
    env: { ...process.env, DTODO_USER_DATA: h.userData, DTODO_TEST: '1' },
    stdio: 'ignore'
  })
  await expect.poll(visibles, { timeout: 20_000 }).toEqual([true, true, true])
  second.kill()
  await h.main.waitForTimeout(400)

  const flag = await h.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).every((w) => w.isAlwaysOnTop())
  )
  expect(flag).toBe(true)
  await h.close()
})
