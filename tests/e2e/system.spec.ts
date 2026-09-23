import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { launchApp, type AppHandle } from './helpers'

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

test('验收44：开机自启开关写入系统登录项', async () => {
  const h: AppHandle = await launchApp()
  const sp = h.app.waitForEvent('window')
  await h.main.click('[data-testid="tb-settings"]')
  const settings = await sp
  await settings.waitForSelector('[data-testid="set-autostart-btn"]')

  await settings.click('[data-testid="set-autostart-btn"]')
  await settings.waitForTimeout(500)
  const enabled = await h.app.evaluate((electron) => electron.app.getLoginItemSettings().openAtLogin)
  expect(enabled).toBe(true)

  // 关闭还原
  await settings.click('[data-testid="set-autostart-btn"]')
  await settings.waitForTimeout(500)
  const disabled = await h.app.evaluate((electron) => electron.app.getLoginItemSettings().openAtLogin)
  expect(disabled).toBe(false)
  await h.close()
})
