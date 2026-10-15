import { test, expect } from '@playwright/test'
import { launchApp, type AppHandle } from './helpers'
import { createTodoItem } from '../../src/core/models'

/** T45 主流程（验收 6/7/8/10/12/14/19/28/29） */
let h: AppHandle

async function createTodo(main: import('@playwright/test').Page, text: string): Promise<void> {
  const winPromise = h.app.waitForEvent('window')
  await main.click('[data-testid="op-new"]')
  const child = await winPromise
  await child.waitForSelector('[data-testid="new-input"]')
  await child.fill('[data-testid="new-input"]', text)
  await child.click('[data-testid="new-submit"]')
  await child.waitForEvent('close', { timeout: 5000 }).catch(() => {})
}

test.beforeEach(async () => {
  h = await launchApp()
})

test.afterEach(async () => {
  await h.close()
})

test('布局：待办面板精确充满窗口视口，无裁切（批次 B-1 三窗口径）', async () => {
  const g = await h.main.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) }
    }
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      home: r('[data-testid="home-panel"]')
    }
  })
  if (!g?.home) throw new Error('面板缺失')
  // 视口=470×有效缩放（CI 小屏会钳到 0.7 下限）→ 面板实测宽=基准×缩放（±1 取整）
  const s = g.vw / 470
  const near = (actual: number, base: number): void => {
    expect(Math.abs(actual - Math.round(base * s))).toBeLessThanOrEqual(1)
  }
  near(g.home.width, 470)
  near(g.vh, 640)
  // 无裁切：面板右缘 == 视口宽（±1 取整）
  expect(Math.abs(g.home.right - g.vw)).toBeLessThanOrEqual(1)
})

/** L1.5 对齐（用户 2026-10-10 反馈）：操作区按钮/批量条与列表行左右端同边。 */
test('布局：操作区按钮与待办行左右端对齐（±0.5px）', async () => {
  await createTodo(h.main, '对齐用')
  await h.main.waitForSelector('[data-testid="todo-row"]')
  await h.main.waitForTimeout(200)
  const m = await h.main.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { l: b.left, r: b.right }
    }
    return {
      row: r('[data-testid="todo-row"]'),
      bolt: r('[data-testid="op-quick-toggle"]'),
      done: r('[data-testid="op-done-toggle"]'),
      plus: r('[data-testid="op-new"]')
    }
  })
  expect(m.row).not.toBeNull()
  const near = (a: number | undefined, b: number | undefined): void => {
    expect(Math.abs((a ?? 0) - (b ?? 0))).toBeLessThanOrEqual(0.5)
  }
  near(m.bolt?.l, m.row?.l) // 左端：⚡ 左缘 = 列表行左缘
  near(m.done?.r, m.row?.r) // 右端：☑ 右缘 = 列表行右缘
  near(m.plus?.r, m.row?.r) // 右端：＋ 右缘（同排按钮）
  // 批量条同边
  await h.main.click('[data-testid="op-batch"]')
  await h.main.waitForTimeout(250)
  const b = await h.main.evaluate(() => {
    const r = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      const bb = el.getBoundingClientRect()
      return { l: bb.left, r: bb.right }
    }
    return { bar: r('[data-testid="batch-bar"]') }
  })
  expect(Math.abs((b.bar?.l ?? 0) - (m.row?.l ?? 0))).toBeLessThanOrEqual(0.5)
  expect(Math.abs((b.bar?.r ?? 0) - (m.row?.r ?? 0))).toBeLessThanOrEqual(0.5)
})

test('验收7：首次启动空列表并显示引导文案', async () => {
  await expect(h.main.locator('[data-testid="empty-state"]')).toContainText('今日做点什么好呢')
})

test('批次 B-4（#36）：10 项满载溢出→缝隙自绘滑块，行宽零挤压', async () => {
  const todos = Array.from({ length: 10 }, (_, i) =>
    createTodoItem({ content: `事项${i + 1}`, now: new Date(), id: `t${i}` })
  )
  const h2 = await launchApp({ seed: { todos } })
  const m = await h2.main.evaluate(() => {
    const list = document.querySelector('[data-testid="home-panel"] .scroll') as HTMLElement | null
    const row = document.querySelector('[data-testid="todo-row"]') as HTMLElement | null
    const thumb = document.querySelector('[data-testid="todo-thumb"]') as HTMLElement | null
    if (!list || !row || !thumb) return null
    // 行宽用 offsetWidth（布局空间）——与 clientWidth 同空间；
    // getBoundingClientRect 是视觉空间（CSS zoom 下两者差 scale 倍，混用即假缝隙）
    return {
      scrollH: list.scrollHeight,
      clientH: list.clientHeight,
      clientW: list.clientWidth,
      rowW: row.offsetWidth,
      thumbShown: getComputedStyle(thumb).display !== 'none'
    }
  })
  if (!m) throw new Error('待办列表缺失')
  console.log('SLIDER-DIAG:', JSON.stringify(m))
  await h2.close()
  // 撤销「10 项满载无滚动」旧规则：满载即溢出，滑块显示于缝隙带
  // 行宽零挤压（布局空间断言）：gutter = clientW - rowOffsetW = .scroll 内边距 2+2 = 4（设计值）
  // （clientWidth/offsetWidth 同为布局空间，尺度无关；getBoundingClientRect 是视觉空间，
  //   CSS zoom 下与布局空间差 scale 倍——混用产生假缝隙，CI 0.7 缩放下实测 135px 假差）
  expect(m.scrollH).toBeGreaterThan(m.clientH)
  expect(m.thumbShown).toBe(true)
  const gutter = m.clientW - m.rowW
  expect(gutter).toBeGreaterThanOrEqual(2)
  expect(gutter).toBeLessThanOrEqual(14)
})

test('主流程：新建→编辑→完成→反选→批量删除（B1.5：直接删除，无回收站）', async ({ }) => {
  const main = h.main
  const done = h.done // 三窗架构：完成行/反选在已完成窗口页

  // 新建（末尾插入）
  await createTodo(main, 'E2E 事项一')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)

  // 双击编辑 → 保存
  const editPromise = h.app.waitForEvent('window')
  await main.locator('[data-testid="todo-row"]').first().dblclick()
  const edit = await editPromise
  await edit.waitForSelector('[data-testid="edit-input"]')
  await edit.fill('[data-testid="edit-input"]', 'E2E 事项一（改）')
  await edit.click('[data-testid="edit-save"]')
  await edit.waitForEvent('close', { timeout: 5000 }).catch(() => {})
  await expect(main.locator('[data-testid="row-content"]').first()).toContainText('（改）')

  // 再建两条
  await createTodo(main, 'E2E 事项二')
  await createTodo(main, 'E2E 事项三')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(3)

  // 勾选完成 → 已完成窗口（三窗架构；跨窗广播经 stateUpdated）
  await main.locator('[data-testid="row-checkbox"]').first().click()
  await expect(done.locator('[data-testid="done-row"]')).toHaveCount(1, { timeout: 5000 })
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(2)

  // 反选退回（回到末尾）
  await done.locator('[data-testid="done-check"]').first().click()
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(3)
  await expect(done.locator('[data-testid="done-row"]')).toHaveCount(0)

  // 批量删除两条 → 确认（提示不可恢复）→ 直接消失，无回收站恢复入口
  await main.click('[data-testid="op-batch"]')
  const rows = main.locator('[data-testid="todo-row"]')
  await rows.nth(0).click()
  await rows.nth(1).click()
  await expect(main.locator('[data-testid="batch-count"]')).toHaveText('已选 2 项')
  await main.click('[data-testid="batch-delete"]')
  await expect(main.locator('[data-testid="confirm-message"]')).toContainText('无法恢复')
  await main.click('[data-testid="confirm-ok"]')
  await expect(rows).toHaveCount(1)
})

test('验收6：退出重启后事项与界面状态恢复', async () => {
  const main = h.main
  await createTodo(main, '持久化事项')
  await expect(main.locator('[data-testid="todo-row"]')).toHaveCount(1)

  // 改主题（记忆项）；等待子窗口完全关闭后再操作
  await main.waitForTimeout(400)
  await main.click('[data-testid="tb-theme"]')
  await expect(main.locator('.stage')).toHaveAttribute('data-theme', 'night', { timeout: 15_000 })

  const userData = h.userData
  await h.close()

  const h2 = await launchApp({ userData })
  await expect(h2.main.locator('[data-testid="todo-row"]')).toHaveCount(1)
  await expect(h2.main.locator('[data-testid="row-content"]')).toContainText('持久化事项')
  await expect(h2.main.locator('.stage')).toHaveAttribute('data-theme', 'night')
  await h2.close()
})

/** 批量条按钮顺序（用户 2026-10-15：返回与全选对调）——返回 → 全选 → 删除所选（四窗共用组件） */
test('批量条按钮顺序：返回 → 全选 → 删除所选', async () => {
  const h = await launchApp({
    seed: { todos: [createTodoItem({ content: '待办甲', now: new Date(), id: 't1' })] }
  })
  await h.main.waitForSelector('[data-testid="home-panel"]')
  await h.main.click('[data-testid="op-batch"]')
  await h.main.waitForSelector('[data-testid="batch-bar"]')

  const xs = await h.main.evaluate(() => {
    const x = (sel: string): number => (document.querySelector(sel) as HTMLElement).getBoundingClientRect().left
    return {
      cancel: x('[data-testid="batch-cancel"]'),
      all: x('[data-testid="batch-select-all"]'),
      del: x('[data-testid="batch-delete"]')
    }
  })
  expect(xs.cancel, `返回(${xs.cancel}) 应在 全选(${xs.all}) 左侧`).toBeLessThan(xs.all)
  expect(xs.all, `全选(${xs.all}) 应在 删除所选(${xs.del}) 左侧`).toBeLessThan(xs.del)

  await h.close()
})
