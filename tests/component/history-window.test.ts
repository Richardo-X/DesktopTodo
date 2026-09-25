import { describe, it, expect } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import HistoryWindow from '../../src/windows/HistoryWindow.vue'
import { mountWithStore } from '../helpers/mount'
import { createTodoItem } from '../../src/core/models'

const T = new Date()
const Y = T.getFullYear()
const M = T.getMonth()
const key = (mo: number, d: number): string => `${Y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const TODAY_KEY = key(M, T.getDate())
const D10 = key(M, 10)

function done(id: string, content: string, dateKey: string, hour: number) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const item = createTodoItem({ content, now: new Date(y, mo - 1, d, 1), id })
  return { ...item, completedAt: new Date(y, mo - 1, d, hour).toISOString() }
}

function seed() {
  return {
    archive: {
      [D10]: [done('h1', '历史一', D10, 8), done('h2', '历史二', D10, 9)]
    },
    completed: [done('h9', '今天完成', TODAY_KEY, 8)]
  }
}

/** T33 历史记录窗口（PRD §七：按天翻阅/日期选择/回到今天/只读/批量删除/导出） */
describe('T33 历史记录窗口', () => {
  it('默认定位当天的前一天（历史口径：不显示今天；前一天为空就显示空）', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    const yesterdayKey = key(M, T.getDate() - 1)
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(yesterdayKey)
    expect(wrapper.find('[data-testid="hist-count"]').text()).toBe('0 条')
    expect(wrapper.find('[data-testid="hist-empty"]').text()).toBe('该日期暂无已完成事项')
  })

  it('导出口径不变：含今天已完成（PRD F1，决策#15）', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(api.savedCsv).toHaveLength(1)
    // 视图只显示归档（决策#15），但导出仍包含今天已完成
    expect(api.savedCsv[0].content).toContain('今天完成')
  })

  it('空日期显示空提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-prev"]').trigger('click')
    const label = wrapper.find('[data-testid="hist-date-label"]').text()
    expect(label).not.toContain(TODAY_KEY)
    // 前一天若无记录 → 空提示
    const { wrapper: w2 } = await mountWithStore(HistoryWindow, { archive: { [D10]: [] } })
    await w2.find('[data-testid="hist-prev"]').trigger('click')
    if (!w2.find('[data-testid="hist-empty"]').exists()) {
      // 继续翻到无记录日
      for (let i = 0; i < 40 && !w2.find('[data-testid="hist-empty"]').exists(); i++) {
        await w2.find('[data-testid="hist-prev"]').trigger('click')
      }
    }
    expect(w2.find('[data-testid="hist-empty"]').text()).toBe('该日期暂无已完成事项')
    void wrapper
  })

  it('翻到有记录的日期显示只读列表；双击行打开详情', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    // 日期选择直接到 D10
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    expect(wrapper.find('[data-testid="hist-count"]').text()).toBe('2 条')
    expect(wrapper.findAll('[data-testid="hist-row"]')).toHaveLength(2)
    // 只读：无勾选框（不在批量模式）、无退回入口
    expect(wrapper.find('[data-testid="row-checkbox"]').exists()).toBe(false)

    await wrapper.findAll('[data-testid="hist-row"]')[0].trigger('dblclick')
    expect(api.openChildCalls).toContainEqual({ kind: 'detail', id: 'h1' })
  })

  it('后一天/回到今天导航', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    await wrapper.find('[data-testid="hist-next"]').trigger('click')
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(key(M, 11))

    await wrapper.find('[data-testid="hist-today"]').trigger('click')
    expect(wrapper.find('[data-testid="hist-date-label"]').text()).toContain(TODAY_KEY)
  })

  it('批量删除：勾一条即删，确认后直接删除（B1.5）', async () => {
    const { wrapper, store } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-date-input"]').setValue(D10)
    await wrapper.find('[data-testid="hist-batch"]').trigger('click')
    expect(wrapper.find('[data-testid="batch-bar"]').exists()).toBe(true)

    await wrapper.findAll('[data-testid="hist-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="batch-delete"]').trigger('click')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(store.archive[D10]).toHaveLength(1)
    expect('recycleBin' in store.data).toBe(false) // 回收站整体退场
  })

  it('导出：选起止日期 → 系统另存为（文件名与内容表头正确）', async () => {
    const { wrapper, api } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(D10)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()

    expect(api.savedCsv).toHaveLength(1)
    expect(api.savedCsv[0].fileName).toBe(`待办完成记录_${D10}_${TODAY_KEY}.csv`)
    expect(api.savedCsv[0].content.charCodeAt(0)).toBe(0xfeff)
    expect(api.savedCsv[0].content).toContain('完成日期,完成时间,事项内容,创建时间,完成时间')
  })

  it('导出：区间无记录 → 错误提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(key(M, 1))
    await wrapper.find('[data-testid="hist-export-to"]').setValue(key(M, 2))
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="hist-export-error"]').text()).toContain('该区间暂无记录')
  })

  it('导出：from>to → 错误提示', async () => {
    const { wrapper } = await mountWithStore(HistoryWindow, seed())
    await wrapper.find('[data-testid="hist-export-from"]').setValue(TODAY_KEY)
    await wrapper.find('[data-testid="hist-export-to"]').setValue(D10)
    await wrapper.find('[data-testid="hist-export"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="hist-export-error"]').text()).toContain('起始日期不能晚于结束日期')
  })
})
