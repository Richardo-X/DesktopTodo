import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultAppData, type AppData } from '../../src/core/models'

export interface AppHandle {
  app: ElectronApplication
  /** 待办主窗页面（panel=main） */
  main: Page
  /** 快捷添加窗页面（panel=quick） */
  quick: Page
  /** 已完成窗页面（panel=done） */
  done: Page
  /** 缩进白条独立窗页面（win=bar；2026-10-17 §11.K 步1） */
  bar: Page
  userData: string
  close(): Promise<void>
}

export interface LaunchOptions {
  /** 复用已有数据目录（重启恢复场景） */
  userData?: string
  /** 预置 data.json（启动前写入） */
  seed?: Partial<AppData>
  /** 主进程时钟偏移（小时，模拟跨天） */
  clockOffsetHours?: number
  /** 测试模式导出目录（另存为旁路） */
  exportDir?: string
  /** 测试模式导入文件（文件选择旁路） */
  importFile?: string
}

/** T44：启动 Electron 应用（临时 userData、时钟偏移、测试钩子；批次 B-1 起默认三窗） */
export async function launchApp(opts: LaunchOptions = {}): Promise<AppHandle> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'dtodo-e2e-'))
  if (opts.seed) {
    mkdirSync(userData, { recursive: true })
    writeFileSync(join(userData, 'data.json'), JSON.stringify({ ...defaultAppData(), ...opts.seed }))
  }

  const env: Record<string, string> = { ...process.env, DTODO_TEST: '1', DTODO_USER_DATA: userData }
  if (opts.clockOffsetHours) env.DTODO_CLOCK_OFFSET_H = String(opts.clockOffsetHours)
  if (opts.exportDir) env.DTODO_TEST_EXPORT_DIR = opts.exportDir
  if (opts.importFile) env.DTODO_TEST_IMPORT_FILE = opts.importFile

  const app: ElectronApplication = await electron.launch({
    args: ['out/main/index.js'],
    cwd: process.cwd(),
    env
  })

  // 三窗架构：等待 quick/main/done 三个组件窗口就绪（firstWindow 可能是任意一个）
  const deadline = Date.now() + 30_000
  let pages: Page[] = []
  while (Date.now() < deadline) {
    pages = app.windows().filter((w) => w.url().includes('win=cluster'))
    if (pages.length >= 3) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (pages.length < 3) throw new Error(`cluster windows incomplete: ${pages.length}/3`)
  const main = pages.find((w) => w.url().includes('panel=main'))
  if (!main) throw new Error('cluster main page missing')
  await main.waitForLoadState('domcontentloaded')
  await main.locator('[data-testid="home-panel"]').waitFor({ state: 'visible', timeout: 30_000 })

  // 等 OS 层三窗真正 show（ready-to-show 与页面加载无先后保证；系统繁忙时明显滞后）。
  // DOM 可见≠窗口已 show——不等这里会导致 setBounds 落位竞态（批次 B-1 实测）
  const allVisible = (): Promise<boolean> =>
    app.evaluate(({ BrowserWindow }) => {
      const urls = ['panel=quick', 'panel=main', 'panel=done']
      return urls.every((p) => {
        const w = BrowserWindow.getAllWindows().find(
          (x) => !x.isDestroyed() && x.webContents.getURL().includes(p)
        )
        return w ? w.isVisible() : false
      })
    })
  await expect.poll(allVisible, { timeout: 30_000 }).toBe(true)

  const quick = pages.find((w) => w.url().includes('panel=quick'))!
  const done = pages.find((w) => w.url().includes('panel=done'))!
  // 步1：白条独立窗（win=bar）页面就绪——四窗架构（白条窗常驻透明，展开态 opacity 0）
  let bar = app.windows().find((w) => w.url().includes('win=bar'))
  {
    const barDeadline = Date.now() + 30_000
    while (!bar && Date.now() < barDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      bar = app.windows().find((w) => w.url().includes('win=bar'))
    }
  }
  if (!bar) throw new Error('bar window page missing')
  await Promise.all([
    quick.waitForLoadState('domcontentloaded'),
    done.waitForLoadState('domcontentloaded'),
    bar.waitForLoadState('domcontentloaded')
  ])

  let closed = false
  return {
    app,
    main,
    quick,
    done,
    bar,
    userData,
    async close() {
      if (closed) return
      closed = true
      await app.close()
    }
  }
}

/** 以本地日期分量构造 ISO 串（时区无关夹具） */
export function localIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  return new Date(y, mo - 1, d, h, mi).toISOString()
}

/** 相对"今天"的日期键 */
export function dateKeyOffset(days: number): string {
  const t = new Date()
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + days)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export { tmpdir, join, mkdirSync, writeFileSync }
