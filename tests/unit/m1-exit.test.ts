import { describe, it, expect } from 'vitest'
import { SystemClock, type IClock } from '../../src/core/interfaces/clock'
import {
  fmtTime,
  fmtDateCN,
  shiftDateKey,
  isBeforeDateKey,
  isAfterDateKey,
  parseLocalDateTime,
  localDateKey
} from '../../src/core/utils/date'
import { MemoryRepository } from '../../src/core/repositories/memory'
import { FileRepository, type FileIo } from '../../src/core/repositories/file'
import { defaultAppData, normalizeUiState, createTodoItem } from '../../src/core/models'
import { isActiveOverdue, returnToActive } from '../../src/core/services/overdue'
import { settle } from '../../src/core/services/settlement'
import { canAddTodo, maxItemsBounds } from '../../src/core/services/limits'
import { createTemplate, addToTodoFromTemplate } from '../../src/core/services/templates'
import { applySettings, validateSettingsPatch } from '../../src/core/services/settings'
import { defaultSettings } from '../../src/core/models/defaults'
import { parseCsv } from '../../src/core/services/csv'
import type { AppData } from '../../src/core/models'

/** M1 出口补强：覆盖率补齐的边界用例（不改变已验证行为） */
describe('date 工具补充', () => {
  it('fmtTime：24 小时制与 12 小时制（决策#2：精确到分钟）', () => {
    const d = new Date(2026, 8, 21, 13, 5, 9)
    expect(fmtTime(d, false)).toBe('13:05')
    expect(fmtTime(d, true)).toBe('1:05 PM')
    expect(fmtTime(new Date(2026, 8, 21, 0, 5, 9), true)).toBe('12:05 AM')
  })

  it('shiftDateKey：跨月/跨年', () => {
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateKey('2026-09-21', 0)).toBe('2026-09-21')
  })

  it('isBefore/AfterDateKey', () => {
    expect(isBeforeDateKey('2026-09-20', '2026-09-21')).toBe(true)
    expect(isBeforeDateKey('2026-09-21', '2026-09-21')).toBe(false)
    expect(isAfterDateKey('2026-09-22', '2026-09-21')).toBe(true)
  })

  it('parseLocalDateTime 非法输入返回 null（含日期进位）', () => {
    expect(parseLocalDateTime('nope')).toBeNull()
    expect(parseLocalDateTime('2026-02-30 10:00:00')).toBeNull()
    expect(parseLocalDateTime('2026-13-01 10:00:00')).toBeNull()
  })

  it('fmtDateCN 星期', () => {
    expect(fmtDateCN(new Date(2026, 8, 20, 12, 0, 0))).toBe('2026年9月20日 星期日')
  })
})

describe('时钟与仓储补充', () => {
  class FixedClock implements IClock {
    constructor(private t: Date) {}
    now(): Date {
      return this.t
    }
  }

  it('IClock 注入：FixedClock 返回固定时间；SystemClock 返回当前时间', () => {
    const t = new Date(2026, 8, 21, 10, 0, 0)
    expect(new FixedClock(t).now()).toBe(t)
    expect(new SystemClock().now().getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('MemoryRepository.flush 可安全调用', async () => {
    const repo = new MemoryRepository<AppData>(defaultAppData())
    await expect(repo.flush()).resolves.toBeUndefined()
  })

  function makeIo(failCorruptRename: boolean): FileIo & { files: Map<string, string> } {
    const files = new Map<string, string>()
    return {
      files,
      async readFile(p) {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return files.get(p)!
      },
      async writeFile(p, data) {
        files.set(p, data)
      },
      async rename(from, to) {
        if (failCorruptRename && to.includes('.corrupt-')) throw new Error('rename blocked')
        files.set(to, files.get(from)!)
        files.delete(from)
      },
      async mkdir() {}
    }
  }

  it('FileRepository debounceMs=0 立即落盘', async () => {
    const io = makeIo(false)
    const repo = new FileRepository('mem://data.json', { io, debounceMs: 0 })
    await repo.save(defaultAppData())
    expect(io.files.has('mem://data.json')).toBe(true)
  })

  it('损坏留档 rename 失败时仍返回 null（不阻塞启动）', async () => {
    const io = makeIo(true)
    io.files.set('mem://data.json', '{broken')
    const loaded = await new FileRepository('mem://data.json', { io }).load()
    expect(loaded).toBeNull()
  })
})

describe('模型归一化补充', () => {
  it('normalizeUiState：非法 childScales 条目被过滤、非法 pos/scale 回退', () => {
    const u = normalizeUiState({
      pos: { x: 'a' as never, y: 10 },
      clusterScale: -1,
      childScales: { todo: 1.2, bad: 'x' as never },
      lastSettleDate: 'bad-date'
    })
    expect(u.pos).toBeNull()
    expect(u.clusterScale).toBe(1)
    expect(u.childScales).toEqual({ todo: 1.2 })
    expect(u.lastSettleDate).toBeNull()
  })
})

describe('服务边界补充', () => {
  const NOW = new Date(2026, 8, 21, 12, 0, 0)
  const TODAY = '2026-09-21'

  it('isActiveOverdue：已完成事项恒不按待办口径判逾期', () => {
    const item = createTodoItem({ content: 'x', now: new Date(2026, 8, 19, 8), id: 'c1' })
    const done = { ...item, completedAt: NOW.toISOString() }
    expect(isActiveOverdue(done, TODAY)).toBe(false)
  })

  it('returnToActive 对待办（completedAt=null）同样安全', () => {
    const item = createTodoItem({ content: 'x', now: new Date(2026, 8, 20, 8), id: 'c2' })
    const r = returnToActive(item, TODAY)
    expect(r.completedAt).toBeNull()
    expect(r.overdue).toBe(true)
  })

  it('settle 跳过 completedAt 为 null 的脏数据', () => {
    const d = defaultAppData()
    d.completed.push({ id: 'z', content: '脏', createdAt: NOW.toISOString(), completedAt: null, overdue: false })
    const r = settle(d, NOW)
    expect(r.archivedCount).toBe(0)
    expect(r.data.completed).toHaveLength(1)
  })

  it('limits：maxItemsBounds(10,5) 可减不可加；9/10 可加', () => {
    const b = maxItemsBounds(10, 5)
    expect(b.canDecrease).toBe(true)
    expect(b.canIncrease).toBe(false)
    expect(canAddTodo(9, 10).ok).toBe(true)
    expect(canAddTodo(10, 10).ok).toBe(false)
  })

  it('templates：空/超长内容拒绝；一键添加 not-found', () => {
    const d = defaultAppData()
    expect(createTemplate(d, '  ', NOW)).toEqual({ ok: false, reason: 'empty-content' })
    expect(createTemplate(d, 'a'.repeat(301), NOW)).toEqual({ ok: false, reason: 'too-long' })
    expect(addToTodoFromTemplate(d, 'nope', NOW)).toEqual({ ok: false, reason: 'not-found' })
  })

  it('settings：validateSettingsPatch 各字段非法均报告对应字段', () => {
    expect(validateSettingsPatch({ maxItems: 0 })).toEqual({ ok: false, field: 'maxItems' })
    expect(validateSettingsPatch({ hour12: 'x' as never })).toEqual({ ok: false, field: 'hour12' })
    expect(validateSettingsPatch({ autoStart: 'x' as never })).toEqual({ ok: false, field: 'autoStart' })
    expect(validateSettingsPatch({ doneSort: 'x' as never })).toEqual({ ok: false, field: 'doneSort' })

    const ok = validateSettingsPatch({ hour12: true, maxItems: 3, fontScale: 'small', doneSort: 'desc', autoStart: true })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.settings).toEqual({
        maxItems: 3,
        hour12: true,
        fontScale: 'small',
        autoStart: true,
        doneSort: 'desc'
      })
    }
  })

  it('settings：applySettings 非整数 maxItems 取整 clamp', () => {
    expect(applySettings(defaultSettings(), { maxItems: -3 }).maxItems).toBe(1)
  })

  it('csv：空文本/错误表头 → format-error；列数错误行跳过；时间列非法跳过', () => {
    expect(parseCsv('', TODAY)).toEqual({ ok: false, reason: 'format-error' })
    expect(parseCsv('x,y,z\r\n', TODAY)).toEqual({ ok: false, reason: 'format-error' })

    const header = '\uFEFF完成日期,完成时间,事项内容,创建时间,完成时间\r\n'
    const csv =
      header +
      '2026-09-20,09:00:00,少列\r\n' +
      '2026-09-20,badtime,坏时间,2026-09-19 08:00:00,not-a-time\r\n' +
      '2026-09-20,09:00:00,坏创建,not-a-time,2026-09-20 09:00:00\r\n' +
      '\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.records).toHaveLength(0)
      expect(r.skipped).toBe(3)
    }
  })

  it('csv：第 2 列时刻与完成日期组合（第 5 列缺省）', () => {
    const header = '\uFEFF完成日期,完成时间,事项内容,创建时间,完成时间\r\n'
    const r = parseCsv(header + '2026-09-20,09:30:00,仅时刻,2026-09-19 08:00:00,\r\n', TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.records[0].completedAt.getTime()).toBe(new Date(2026, 8, 20, 9, 30, 0).getTime())
    }
  })

  it('date：localDateKey 跨月边界（覆盖率补齐）', () => {
    expect(localDateKey(new Date(2026, 9, 1, 0, 0, 0))).toBe('2026-10-01')
  })
})
