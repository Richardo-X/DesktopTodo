import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, dateKeyOffset, type AppHandle } from './helpers'
import { createTodoItem, defaultAppData, type AppData } from '../../src/core/models'
import { serializeCsv } from '../../src/core/services/csv'

/** T47 导入导出（验收 24 生成部分/25/26/27） */

function baseSeed(): Partial<AppData> {
  const t = new Date()
  const yesterday = dateKeyOffset(-1)
  const hist = {
    ...createTodoItem({ content: '历史一', now: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 2, 8), id: 'h1' }),
    completedAt: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 9).toISOString()
  }
  return { archive: { [yesterday]: [hist] }, completed: [] }
}

test('验收24（生成部分）：导出 CSV 文件名与内容正确', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'dtodo-exp-'))
  const h: AppHandle = await launchApp({ seed: baseSeed(), exportDir })
  const main = h.main

  const histPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="done-history"]')
  const hist = await histPromise
  await hist.waitForSelector('[data-testid="hist-export-from"]')

  const from = dateKeyOffset(-5)
  const to = dateKeyOffset(0)
  await hist.fill('[data-testid="hist-export-from"]', from)
  await hist.fill('[data-testid="hist-export-to"]', to)
  await hist.click('[data-testid="hist-export"]')
  await expect(hist.locator('[data-testid="hist-export-error"]')).toHaveCount(0, { timeout: 5000 })

  const file = join(exportDir, `待办完成记录_${from}_${to}.csv`)
  const content = readFileSync(file, 'utf8')
  expect(content.charCodeAt(0)).toBe(0xfeff)
  expect(content).toContain('完成日期,完成时间,事项内容,创建时间,完成时间')
  expect(content).toContain('历史一')
  await h.close()
})

test('验收25：覆盖导入完全替换且不进回收站', async () => {
  // 构造导入 CSV：一条"两天前完成"的记录
  const csv = serializeCsv([
    {
      completedDate: dateKeyOffset(-2),
      completedTime: '10:00:00',
      content: '导入的记录',
      createdAt: `${dateKeyOffset(-3)} 08:00:00`,
      completedAt: `${dateKeyOffset(-2)} 10:00:00`
    }
  ])
  const importDir = mkdtempSync(join(tmpdir(), 'dtodo-imp-'))
  mkdirSync(importDir, { recursive: true })
  const importFile = join(importDir, 'import.csv')

  const userData = mkdtempSync(join(tmpdir(), 'dtodo-e2e-'))
  // 预置现有历史 + 回收站一条（验证回收站不受影响）
  const seed: Partial<AppData> = {
    ...baseSeed(),
    recycleBin: [
      {
        id: 'r1',
        type: 'todo',
        payload: createTodoItem({ content: '回收站原有', now: new Date(), id: 'x1' }),
        deletedAt: new Date().toISOString()
      }
    ]
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(importFile, csv, 'utf8')

  const h = await launchApp({ userData, seed, importFile })
  const main = h.main

  const setPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="tb-settings"]')
  const settings = await setPromise
  await settings.waitForSelector('[data-testid="set-import-cover"]')
  await settings.click('[data-testid="set-import-cover"]')
  await settings.click('[data-testid="confirm-ok"]')
  await settings.waitForTimeout(300)

  // 原历史被替换：历史窗口只显示导入的一条
  const histPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="done-history"]')
  const hist = await histPromise
  await hist.waitForSelector('[data-testid="hist-count"]')
  await expect(hist.locator('[data-testid="hist-row"]')).toHaveCount(1)
  await expect(hist.locator('[data-testid="hist-row"]')).toContainText('导入的记录')

  // 回收站仍只有原有那条（覆盖导入清掉的不进回收站）
  const recyclePromise = h.app.waitForEvent('window')
  await settings.click('[data-testid="set-recycle-open"]')
  const recycle = await recyclePromise
  await expect(recycle.locator('[data-testid^="recycle-entry-"]')).toHaveCount(1)
  await h.close()
  void defaultAppData
})

test('验收26/27：合并导入三元组去重并按完成日落位', async () => {
  const t = new Date()
  const past = dateKeyOffset(-1)
  // 现有：与导入完全相同的一条（三元组一致）
  const existing = {
    ...createTodoItem({ content: '重复记录', now: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 2, 8), id: 'keep1' }),
    completedAt: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 10).toISOString()
  }
  const csv = serializeCsv([
    {
      completedDate: past,
      completedTime: '10:00:00',
      content: '重复记录',
      createdAt: `${dateKeyOffset(-2)} 08:00:00`,
      completedAt: `${past} 10:00:00`
    },
    {
      completedDate: past,
      completedTime: '11:30:00',
      content: '新增记录',
      createdAt: `${dateKeyOffset(-2)} 09:00:00`,
      completedAt: `${past} 11:30:00`
    }
  ])
  const importDir = mkdtempSync(join(tmpdir(), 'dtodo-imp2-'))
  mkdirSync(importDir, { recursive: true })
  const importFile = join(importDir, 'import.csv')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(importFile, csv, 'utf8')

  const h = await launchApp({ seed: { archive: { [past]: [existing] } }, importFile })
  const main = h.main

  const setPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="tb-settings"]')
  const settings = await setPromise
  await settings.waitForSelector('[data-testid="set-import-merge"]')
  await settings.click('[data-testid="set-import-merge"]')
  await settings.waitForTimeout(300)

  // 历史页：重复的只保留当前一条 + 新增一条 = 2 条
  const histPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="done-history"]')
  const hist = await histPromise
  await hist.waitForSelector('[data-testid="hist-count"]')
  await expect(hist.locator('[data-testid="hist-count"]')).toHaveText('2 条')
  await expect(hist.locator('[data-testid="hist-row"]')).toContainText('新增记录')
  await h.close()
})
