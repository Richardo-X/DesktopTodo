import { describe, it, expect } from 'vitest'
import {
  exportHistoryCsv,
  serializeCsv,
  parseCsv,
  mergeImport,
  coverImport,
  csvFileName,
  CSV_HEADER
} from '../../src/core/services/csv'
import {
  defaultAppData,
  createTodoItem,
  type AppData,
  type TodoItem
} from '../../src/core/models'

const TODAY = '2026-09-21'
const NOW = new Date(2026, 8, 21, 12, 0, 0)

/** 以本地日期时间分量构造 ISO 串 */
function localIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  return new Date(y, mo - 1, d, h, mi, s).toISOString()
}

function done(id: string, createdLocal: string, completedLocal: string, content = `内容${id}`): TodoItem {
  return {
    id,
    content,
    createdAt: createdLocal,
    completedAt: completedLocal,
    overdue: false
  }
}

function data(p: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(), ...p }
}

/** T11 CSV 导入导出（开发计划 §5-F；PRD §5.5/§5.7-4，附录 A9 容错） */
describe('F1/F4/F5 导出', () => {
  // archive: 09-01 ~ 09-10 每天一条；08-31 与 09-11 各一条（区间外）
  function seeded(): AppData {
    const archive: Record<string, TodoItem[]> = {}
    for (let d = 1; d <= 10; d++) {
      const key = `2026-09-${String(d).padStart(2, '0')}`
      archive[key] = [done(`a${d}`, localIso(2026, 9, d, 8), localIso(2026, 9, d, 9, d))]
    }
    archive['2026-08-31'] = [done('out1', localIso(2026, 8, 31, 8), localIso(2026, 8, 31, 9))]
    archive['2026-10-01'] = [done('out2', localIso(2026, 10, 1, 8), localIso(2026, 10, 1, 9))]
    return data({
      archive,
      completed: [done('today', localIso(2026, 9, 21, 7), localIso(2026, 9, 21, 8, 30))]
    })
  }

  it('F1 区间收集：archive[from..to] + 今天 completed，按完成时间升序', () => {
    const r = exportHistoryCsv(seeded(), '2026-09-05', TODAY, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 09-05..09-10（6 条）+ 今天 1 条 = 7 条
    expect(r.rows).toHaveLength(7)
    // 升序：按完成时间
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].completedAt >= r.rows[i - 1].completedAt).toBe(true)
    }
    // 区间外不出现
    expect(r.rows.some((row) => row.completedAt.startsWith('2026-08-31'))).toBe(false)
    expect(r.rows.some((row) => row.completedAt.startsWith('2026-10-01'))).toBe(false)
    // 今天完成包含
    expect(r.rows.some((row) => row.content === '内容today')).toBe(true)
  })

  it('F4 from>to / 区间无记录 → 返回错误供提示', () => {
    const d = seeded()
    expect(exportHistoryCsv(d, '2026-09-10', '2026-09-01', TODAY)).toEqual({ ok: false, reason: 'invalid-range' })
    expect(exportHistoryCsv(d, '2026-07-01', '2026-07-02', TODAY)).toEqual({ ok: false, reason: 'no-records' })
  })

  it('F5 文件名：待办完成记录_{from}_{to}.csv', () => {
    expect(csvFileName('2026-09-01', '2026-09-21')).toBe('待办完成记录_2026-09-01_2026-09-21.csv')
  })
})

describe('F2/F3 序列化', () => {
  it('F3 表头（去 BOM 后首行）', () => {
    const csv = serializeCsv([])
    const first = csv.replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(first).toBe(CSV_HEADER.join(','))
    expect(CSV_HEADER).toEqual(['完成日期', '完成时间', '事项内容', '创建时间', '完成时间'])
  })

  it('F2 逗号/引号/换行正确转义；UTF-8 BOM；\\r\\n 行尾', () => {
    const csv = serializeCsv([
      {
        completedDate: '2026-09-21',
        completedTime: '09:00:00',
        content: '他说"你好", 然后换行\n第二行',
        createdAt: '2026-09-21 08:00:00',
        completedAt: '2026-09-21 09:00:00'
      }
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.includes('\r\n')).toBe(true)
    const line = csv.replace(/^\uFEFF/, '').split('\r\n')[1]
    expect(line).toBe('2026-09-21,09:00:00,"他说""你好"", 然后换行\n第二行",2026-09-21 08:00:00,2026-09-21 09:00:00')
  })

  it('序列化→解析往返一致', () => {
    const csv = serializeCsv([
      {
        completedDate: '2026-09-20',
        completedTime: '23:59:59',
        content: '带,逗号',
        createdAt: '2026-09-19 10:00:00',
        completedAt: '2026-09-20 23:59:59'
      }
    ])
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toBe(0)
    expect(r.records).toHaveLength(1)
    const rec = r.records[0]
    expect(rec.content).toBe('带,逗号')
    expect(rec.completedAt.getTime()).toBe(new Date(2026, 8, 20, 23, 59, 59).getTime())
    expect(rec.createdAt.getTime()).toBe(new Date(2026, 8, 19, 10, 0, 0).getTime())
  })
})

describe('F6/F7/F11 解析容错', () => {
  const HEADER = '\uFEFF完成日期,完成时间,事项内容,创建时间,完成时间\r\n'

  it('F6 带表头+BOM 的合法 CSV：表头跳过、字段正确还原', () => {
    const csv = HEADER + '2026-09-20,09:30:00,喝水,2026-09-19 08:00:00,2026-09-20 09:30:00\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records).toHaveLength(1)
    expect(r.records[0].content).toBe('喝水')
  })

  it('表头不符 → format-error（只接受本软件导出格式）', () => {
    const r = parseCsv('a,b,c,d,e\r\n1,2,3,4,5\r\n', TODAY)
    expect(r).toEqual({ ok: false, reason: 'format-error' })
  })

  it('F7 非法行跳过：完成日期格式错', () => {
    const csv =
      HEADER +
      '2026-09-20,09:30:00,好行,2026-09-19 08:00:00,2026-09-20 09:30:00\r\n' +
      '2026-9-20,09:30:00,坏行,2026-09-19 08:00:00,2026-09-20 09:30:00\r\n' +
      'not-a-date,09:30:00,坏行2,2026-09-19 08:00:00,2026-09-20 09:30:00\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records.map((x) => x.content)).toEqual(['好行'])
    expect(r.skipped).toBe(2)
  })

  it('F7 缺完成时间（第2、5列空）→ 完成时间缺省为完成日期 00:00:00', () => {
    const csv = HEADER + '2026-09-20,,无时间行,2026-09-19 08:00:00,\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records[0].completedAt.getTime()).toBe(new Date(2026, 8, 20, 0, 0, 0).getTime())
  })

  it('F7 缺创建时间 → 创建时间=完成时间；内容为空 → 跳过', () => {
    const csv =
      HEADER +
      '2026-09-20,09:30:00,缺创建时间,,\r\n' +
      '2026-09-20,09:30:00,   ,2026-09-19 08:00:00,2026-09-20 09:30:00\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records).toHaveLength(1)
    expect(r.records[0].createdAt.getTime()).toBe(r.records[0].completedAt.getTime())
    expect(r.skipped).toBe(1)
  })

  it('F11 完成日期在未来 → 跳过（附录 A9）', () => {
    const csv = HEADER + '2026-09-22,09:30:00,未来行,2026-09-19 08:00:00,2026-09-22 09:30:00\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('带引号字段内含 CRLF 与逗号的行正确解析', () => {
    const csv = HEADER + '2026-09-20,09:30:00,"多行\r\n内容,含逗号",2026-09-19 08:00:00,2026-09-20 09:30:00\r\n'
    const r = parseCsv(csv, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.records[0].content).toBe('多行\r\n内容,含逗号')
  })
})

describe('F8 合并导入：三元组完全相同只保留当前那条', () => {
  it('重复丢弃导入侧，其余合入并按落位', () => {
    const existingB = done('B', localIso(2026, 9, 19, 8), localIso(2026, 9, 20, 9), '历史B')
    const existingA = done('A', localIso(2026, 9, 21, 7), localIso(2026, 9, 21, 8), '今天A')
    const d0 = data({ completed: [existingA], archive: { '2026-09-20': [existingB] } })

    const parsed = parseCsv(
      serializeCsv([
        { completedDate: '2026-09-20', completedTime: '09:00:00', content: '历史B', createdAt: fmtTs(localIso(2026, 9, 19, 8)), completedAt: fmtTs(localIso(2026, 9, 20, 9)) },
        { completedDate: '2026-09-21', completedTime: '10:00:00', content: '今天A', createdAt: fmtTs(localIso(2026, 9, 21, 7)), completedAt: fmtTs(localIso(2026, 9, 21, 8)) },
        { completedDate: '2026-09-18', completedTime: '12:00:00', content: '全新C', createdAt: fmtTs(localIso(2026, 9, 18, 8)), completedAt: fmtTs(localIso(2026, 9, 18, 12)) }
      ]),
      TODAY
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const r = mergeImport(d0, parsed.records, TODAY)
    expect(r.addedCount).toBe(1)
    expect(r.duplicateCount).toBe(2)

    // 历史B 只保留当前那条（id=B）
    const bRows = r.data.archive['2026-09-20'].filter((t) => t.content === '历史B')
    expect(bRows.map((t) => t.id)).toEqual(['B'])
    // 全新C 落位 archive[09-18]
    expect(r.data.archive['2026-09-18'].map((t) => t.content)).toEqual(['全新C'])
    // 今天A 保留原条
    expect(r.data.completed.map((t) => t.id)).toEqual(['A'])
  })
})

describe('F9 覆盖导入：清空 completed+archive 后落位；旧数据不进回收站', () => {
  it('A1 覆盖范围含当天已完成；回收站原样', () => {
    const existingA = done('A', localIso(2026, 9, 21, 7), localIso(2026, 9, 21, 8), '今天A')
    const existingB = done('B', localIso(2026, 9, 19, 8), localIso(2026, 9, 20, 9), '历史B')
    const binEntry = {
      id: 'r1',
      type: 'todo' as const,
      payload: createTodoItem({ content: '回收站原有', now: NOW }),
      deletedAt: NOW.toISOString()
    }
    const d0 = data({
      completed: [existingA],
      archive: { '2026-09-20': [existingB] },
      recycleBin: [binEntry]
    })

    const parsed = parseCsv(
      serializeCsv([
        { completedDate: '2026-09-21', completedTime: '10:00:00', content: '导入今天D', createdAt: fmtTs(localIso(2026, 9, 21, 9)), completedAt: fmtTs(localIso(2026, 9, 21, 10)) },
        { completedDate: '2026-09-15', completedTime: '11:00:00', content: '导入历史C', createdAt: fmtTs(localIso(2026, 9, 15, 8)), completedAt: fmtTs(localIso(2026, 9, 15, 11)) }
      ]),
      TODAY
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const r = coverImport(d0, parsed.records, TODAY)
    // 旧数据完全消失
    expect(r.data.completed.map((t) => t.content)).toEqual(['导入今天D']) // F10 落位今天
    expect(r.data.archive['2026-09-20']).toBeUndefined()
    expect(r.data.archive['2026-09-15'].map((t) => t.content)).toEqual(['导入历史C'])
    // 不进回收站（E6/F9）
    expect(r.data.recycleBin).toEqual([binEntry])
  })

  it('F10 落位：完成日=今天 → completed；更早 → archive[该日]；逾期标记按口径推算', () => {
    const parsed = parseCsv(
      serializeCsv([
        { completedDate: '2026-09-21', completedTime: '10:00:00', content: '今天未逾期', createdAt: fmtTs(localIso(2026, 9, 21, 9)), completedAt: fmtTs(localIso(2026, 9, 21, 10)) },
        { completedDate: '2026-09-20', completedTime: '10:00:00', content: '跨日已逾期', createdAt: fmtTs(localIso(2026, 9, 19, 9)), completedAt: fmtTs(localIso(2026, 9, 20, 10)) }
      ]),
      TODAY
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const r = coverImport(data(), parsed.records, TODAY)
    expect(r.data.completed[0].content).toBe('今天未逾期')
    expect(r.data.completed[0].overdue).toBe(false)
    expect(r.data.archive['2026-09-20'][0].content).toBe('跨日已逾期')
    expect(r.data.archive['2026-09-20'][0].overdue).toBe(true)
  })
})

/** ISO → "YYYY-MM-DD HH:mm:ss"（测试辅助） */
function fmtTs(iso: string): string {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
