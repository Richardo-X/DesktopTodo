import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultAppData, type AppData } from '../../src/core/models'

export interface AppHandle {
  app: ElectronApplication
  main: Page
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

/** T44：启动 Electron 应用（临时 userData、时钟偏移、测试钩子） */
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
  const main = await app.firstWindow()
  await main.waitForLoadState('domcontentloaded')
  await main.locator('[data-testid="home-panel"]').waitFor({ state: 'visible', timeout: 15_000 })

  let closed = false
  return {
    app,
    main,
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
