import type { AppData, TodoItem } from '../models/types'
import { newId } from '../utils/id'
import { localDateKey } from '../utils/date'
import { isCompletedOverdue } from './overdue'

/** CSV 表头（PRD §5.5 五列，附录速查 #5） */
export const CSV_HEADER = ['完成日期', '完成时间', '事项内容', '创建时间', '完成时间'] as const

/** 导出行（序列化前的中间结构；时间列为本地 "YYYY-MM-DD HH:mm:ss"） */
export interface CsvExportRow {
  completedDate: string
  completedTime: string
  content: string
  createdAt: string
  completedAt: string
}

export type ExportResult =
  | { ok: true; rows: CsvExportRow[]; fileName: string; content: string }
  | { ok: false; reason: 'invalid-range' | 'no-records' }

export interface ImportedRecord {
  content: string
  createdAt: Date
  completedAt: Date
}

export type ParseResult =
  | { ok: true; records: ImportedRecord[]; skipped: number }
  | { ok: false; reason: 'format-error' }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtFull(d: Date): string {
  return `${localDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtTimeOnly(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** RFC 4180 字段转义：含逗号/引号/换行时加引号并把引号翻倍 */
function escapeField(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** 序列化：UTF-8 BOM + 表头 + \r\n 行尾 */
export function serializeCsv(rows: CsvExportRow[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const r of rows) {
    lines.push([r.completedDate, r.completedTime, r.content, r.createdAt, r.completedAt].map(escapeField).join(','))
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

/** 导出文件名（PRD §5.5） */
export function csvFileName(from: string, to: string): string {
  return `待办完成记录_${from}_${to}.csv`
}

/**
 * 导出历史（PRD §5.5，F1/F4/F5）：
 * 收集 archive[from..to] ∪（to 为今天时的 completed），按完成时间升序；
 * from>to 或区间无记录 → 错误供 UI 提示。
 */
export function exportHistoryCsv(data: AppData, from: string, to: string, todayKey: string): ExportResult {
  if (from > to) return { ok: false, reason: 'invalid-range' }

  const collected: TodoItem[] = []
  for (const [key, items] of Object.entries(data.archive)) {
    if (key >= from && key <= to) collected.push(...items)
  }
  if (to === todayKey) collected.push(...data.completed)

  if (collected.length === 0) return { ok: false, reason: 'no-records' }

  collected.sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))

  const rows: CsvExportRow[] = collected.flatMap((t) => {
    if (t.completedAt === null) return []
    const d = new Date(t.completedAt)
    return [
      {
        completedDate: localDateKey(d),
        completedTime: fmtTimeOnly(d),
        content: t.content,
        createdAt: fmtFull(new Date(t.createdAt)),
        completedAt: fmtFull(d)
      }
    ]
  })

  const content = serializeCsv(rows)
  return { ok: true, rows, fileName: csvFileName(from, to), content }
}

/** RFC 4180 解析：处理引号包裹、引号转义、字段内逗号与换行 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const s = text.replace(/^\uFEFF/, '')

  while (i < s.length) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      if (s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FULL_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/

function parseFull(s: string): Date | null {
  const m = FULL_RE.exec(s.trim())
  if (!m) return null
  const [y, mo, d, h, mi, se] = [m[1].slice(0, 4), m[1].slice(5, 7), m[1].slice(8, 10), m[2], m[3], m[4]].map(Number)
  const date = new Date(y, mo - 1, d, h, mi, se)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

function combineDateAndTime(dateKey: string, h: number, mi: number, se: number): Date {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return new Date(y, mo - 1, d, h, mi, se)
}

/**
 * 解析导入 CSV（F6/F7/F11，附录 A9）：
 * - 表头必须为本软件格式，否则 format-error（"只接受本软件导出格式"）
 * - 完成日期非法/内容为空/时间格式非法 → 该行跳过
 * - 完成时间缺省 → 完成日期 00:00:00；创建时间缺省 → = 完成时间
 * - 完成日期在未来 → 跳过
 */
export function parseCsv(text: string, todayKey: string): ParseResult {
  const rows = parseCsvText(text)
  if (rows.length === 0) return { ok: false, reason: 'format-error' }

  const header = rows[0].map((c) => c.trim())
  if (header.length !== CSV_HEADER.length || !CSV_HEADER.every((h, i) => h === header[i])) {
    return { ok: false, reason: 'format-error' }
  }

  const records: ImportedRecord[] = []
  let skipped = 0

  for (const cells of rows.slice(1)) {
    // 空行（长度 1 且空）直接忽略
    if (cells.length === 1 && cells[0].trim() === '') continue
    if (cells.length !== CSV_HEADER.length) {
      skipped++
      continue
    }
    const [dateCell, timeCell, contentCell, createdCell, completedCell] = cells
    const dateKey = dateCell.trim()
    if (!DATE_RE.test(dateKey)) {
      skipped++
      continue
    }

    // 完成时间：优先第 5 列完整时间；否则第 2 列时刻与日期组合；否则 00:00:00
    let completedAt: Date | null = completedCell.trim() === '' ? null : parseFull(completedCell)
    if (completedAt === null && completedCell.trim() === '') {
      const t = TIME_RE.exec(timeCell.trim())
      completedAt = t ? combineDateAndTime(dateKey, Number(t[1]), Number(t[2]), Number(t[3])) : combineDateAndTime(dateKey, 0, 0, 0)
    }
    if (completedAt === null) {
      skipped++
      continue
    }

    const content = contentCell.trim()
    if (content === '') {
      skipped++
      continue
    }

    const createdAt = createdCell.trim() === '' ? completedAt : parseFull(createdCell)
    if (createdAt === null) {
      skipped++
      continue
    }

    if (localDateKey(completedAt) > todayKey) {
      skipped++
      continue
    }

    records.push({ content, createdAt, completedAt })
  }

  return { ok: true, records, skipped }
}

function toItem(record: ImportedRecord): TodoItem {
  const completedAtIso = record.completedAt.toISOString()
  return {
    id: newId(),
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    completedAt: completedAtIso,
    overdue: isCompletedOverdue({ id: '', content: record.content, createdAt: record.createdAt.toISOString(), completedAt: completedAtIso, overdue: false })
  }
}

function recordKey(r: ImportedRecord): string {
  return `${r.content}\u0000${r.createdAt.toISOString()}\u0000${r.completedAt.toISOString()}`
}

function itemKey(t: TodoItem): string {
  return `${t.content}\u0000${t.createdAt}\u0000${t.completedAt}`
}

/** 按完成日落位（F10）：今天 → completed；更早 → archive[该日] */
function placeByCompletion(data: AppData, item: TodoItem, todayKey: string): AppData {
  const dateKey = item.completedAt === null ? todayKey : localDateKey(new Date(item.completedAt))
  if (dateKey === todayKey) {
    return { ...data, completed: [...data.completed, item] }
  }
  return { ...data, archive: { ...data.archive, [dateKey]: [...(data.archive[dateKey] ?? []), item] } }
}

/**
 * 合并导入（F8）：导入记录与现有（completed+archive）内容/创建时间/完成时间
 * 三元组完全相同的只保留当前那条，其余合入并落位。
 */
export function mergeImport(
  data: AppData,
  records: ImportedRecord[],
  todayKey: string
): { data: AppData; addedCount: number; duplicateCount: number } {
  const existing = new Set<string>()
  for (const t of [...data.completed, ...Object.values(data.archive).flat()]) existing.add(itemKey(t))

  let next = data
  let addedCount = 0
  let duplicateCount = 0

  for (const record of records) {
    const key = recordKey(record)
    if (existing.has(key)) {
      duplicateCount++
      continue
    }
    existing.add(key)
    next = placeByCompletion(next, toItem(record), todayKey)
    addedCount++
  }

  return { data: next, addedCount, duplicateCount }
}

/**
 * 覆盖导入（F9，附录 A1）：清空 completed + archive 全部（含当天已完成）后按落位导入；
 * 被清掉的数据直接消失，不进回收站（导入前 UI 已有确认框）。
 */
export function coverImport(
  data: AppData,
  records: ImportedRecord[],
  todayKey: string
): { data: AppData; importedCount: number } {
  let next: AppData = { ...data, completed: [], archive: {} }
  const seen = new Set<string>()
  let importedCount = 0

  for (const record of records) {
    const key = recordKey(record)
    if (seen.has(key)) continue
    seen.add(key)
    next = placeByCompletion(next, toItem(record), todayKey)
    importedCount++
  }

  return { data: next, importedCount }
}
