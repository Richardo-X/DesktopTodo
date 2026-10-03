import { describe, it, expect } from 'vitest'
import {
  validateContent,
  createTodoItem,
  createTemplateItem,
  defaultAppData,
  normalizeAppData,
  defaultSettings,
  defaultUiState
} from '../../src/core/models'
import { newId } from '../../src/core/utils/id'
import { localDateKey, parseLocalDateTime, fmtLocalDateTime, fmtDateCN } from '../../src/core/utils/date'

/** T04 数据模型 + 校验（开发计划 §4-T04、§2.3 数据结构） */
describe('content 校验（300 字上限，trim）', () => {
  it('空字符串与纯空白 → empty-content', () => {
    expect(validateContent('')).toEqual({ ok: false, reason: 'empty-content' })
    expect(validateContent('   ')).toEqual({ ok: false, reason: 'empty-content' })
  })

  it('恰好 300 字 → 通过', () => {
    expect(validateContent('a'.repeat(300))).toEqual({ ok: true })
  })

  it('301 字 → too-long', () => {
    expect(validateContent('a'.repeat(301))).toEqual({ ok: false, reason: 'too-long' })
  })

  it('trim 后 300 字（原 302）→ 通过且截取 trim 结果', () => {
    const r = validateContent('  ' + 'a'.repeat(300) + ' ')
    expect(r).toEqual({ ok: true })
  })
})

describe('createTodoItem', () => {
  const now = new Date(2026, 8, 21, 10, 30, 0)

  it('创建待办：trim 内容、createdAt=now、completedAt=null、overdue=false', () => {
    const item = createTodoItem({ content: '  喝水  ', now, id: 't1' })
    expect(item).toEqual({
      id: 't1',
      content: '喝水',
      createdAt: now.toISOString(),
      completedAt: null,
      overdue: false
    })
  })

  it('未传 id 时自动生成且全局唯一', () => {
    const a = createTodoItem({ content: 'a', now })
    const b = createTodoItem({ content: 'b', now })
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })

  it('空内容抛错、超长抛错', () => {
    expect(() => createTodoItem({ content: '  ', now })).toThrow()
    expect(() => createTodoItem({ content: 'a'.repeat(301), now })).toThrow()
  })
})

describe('createTemplateItem', () => {
  it('创建模板：trim、createdAt=now', () => {
    const now = new Date(2026, 8, 21, 9, 0, 0)
    const t = createTemplateItem({ content: '整理邮箱', now, id: 'tpl1' })
    expect(t.content).toBe('整理邮箱')
    expect(t.createdAt).toBe(now.toISOString())
  })

  it('空/超长抛错', () => {
    const now = new Date(2026, 8, 21, 9, 0, 0)
    expect(() => createTemplateItem({ content: '', now })).toThrow()
    expect(() => createTemplateItem({ content: 'x'.repeat(301), now })).toThrow()
  })
})

describe('默认值与归一化（首次空列表 / 旧档补齐）', () => {
  it('defaultSettings：上限 10、24 小时制、不自启、完成排序正序；无字体/回收站字段（决策#3/#21）', () => {
    expect(defaultSettings()).toEqual({
      maxItems: 10,
      hour12: false,
      autoStart: false,
      doneSort: 'asc'
    })
    expect('recycleKeep' in defaultSettings()).toBe(false)
    expect('fontScale' in defaultSettings()).toBe(false)
  })

  it('defaultUiState：面板全开、白天主题、不置顶、不锁缩进、未结算过、缩放 1', () => {
    expect(defaultUiState()).toEqual({
      pos: null,
      posIsTodoAnchor: true,
      clusterScale: 1,
      childScales: {},
      quickVisible: true,
      doneVisible: true,
      theme: 'day',
      topMost: false,
      tuckLock: false,
      lastSettleDate: null
    })
  })

  it('defaultAppData：v1、五类数据全空；无 recycleBin 字段（B1.5）', () => {
    const d = defaultAppData()
    expect(d.v).toBe(1)
    expect(d.todos).toEqual([])
    expect(d.completed).toEqual([])
    expect(d.archive).toEqual({})
    expect(d.templates).toEqual([])
    expect('recycleBin' in d).toBe(false)
  })

  it('normalizeAppData：旧档缺字段补齐默认值，已有字段保留', () => {
    const now = new Date(2026, 8, 20, 8, 0, 0)
    const todo = createTodoItem({ content: '遗留', now, id: 'old1' })
    const raw = {
      todos: [todo],
      settings: { maxItems: 5, hour12: true }
      // 缺 completed/archive/templates/settings 一半字段/uiState
    }
    const d = normalizeAppData(raw)
    expect(d.v).toBe(1)
    expect(d.todos).toEqual([todo])
    expect(d.completed).toEqual([])
    expect(d.templates).toEqual([])
    expect(d.settings.maxItems).toBe(5)
    expect(d.settings.hour12).toBe(true)
    expect(d.settings.doneSort).toBe('asc')
    expect(d.uiState.theme).toBe('day')
  })

  it('normalizeAppData：旧档遗留 recycleBin/recycleKeep/fontScale → 直接丢弃（B1.5/B3）', () => {
    const d = normalizeAppData({
      recycleBin: [{ id: 'r1', type: 'todo', payload: {}, deletedAt: '2026-01-01T00:00:00Z' }],
      settings: { recycleKeep: 7, fontScale: 'large' }
    })
    expect('recycleBin' in d).toBe(false)
    expect('recycleKeep' in d.settings).toBe(false)
    expect('fontScale' in d.settings).toBe(false)
  })

  it('normalizeAppData：null/undefined → 全默认（首次启动态）', () => {
    const d = normalizeAppData(null)
    expect(d).toEqual(defaultAppData())
  })
})

describe('newId', () => {
  it('生成不重复字符串 id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
  })
})

describe('date 工具（本地时区口径）', () => {
  it('localDateKey 按本地日期输出 YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 8, 21, 23, 59, 59))).toBe('2026-09-21')
    expect(localDateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01')
  })

  it('parseLocalDateTime("YYYY-MM-DD HH:mm:ss") → 本地 Date，与 localDateKey 互逆', () => {
    const d = parseLocalDateTime('2026-09-21 09:05:30')
    expect(d).not.toBeNull()
    if (!d) return
    expect(localDateKey(d)).toBe('2026-09-21')
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(5)
    expect(d.getSeconds()).toBe(30)
  })

  it('fmtLocalDateTime 输出 "YYYY-MM-DD HH:mm:ss"', () => {
    expect(fmtLocalDateTime(new Date(2026, 8, 5, 7, 8, 9))).toBe('2026-09-05 07:08:09')
  })

  it('fmtDateCN 输出 "2026年9月21日 星期一"', () => {
    expect(fmtDateCN(new Date(2026, 8, 21, 12, 0, 0))).toBe('2026年9月21日 星期一')
  })
})

/** 四轮定稿 B：pos 语义迁移——旧档 pos=窗口左上角 → 新档 pos=待办左上角锚点（一次性、幂等） */
describe('pos 锚点语义迁移（动态窗口）', () => {
  it('旧档（无标记）：快捷可见时 pos.x 右移快捷偏移，打上锚点标记', () => {
    const raw = {
      v: 1,
      todos: [],
      completed: [],
      archive: {},
      templates: [],
      settings: defaultSettings(),
      uiState: { pos: { x: 100, y: 50 }, clusterScale: 0.8, quickVisible: true, doneVisible: true }
    }
    const d = normalizeAppData(raw)
    expect(d.uiState.pos).toEqual({ x: 100 + Math.round(314 * 0.8), y: 50 })
    expect(d.uiState.posIsTodoAnchor).toBe(true)
  })

  it('旧档快捷隐藏：pos.x 不偏移', () => {
    const raw = {
      v: 1,
      todos: [],
      completed: [],
      archive: {},
      templates: [],
      settings: defaultSettings(),
      uiState: { pos: { x: 100, y: 50 }, clusterScale: 1, quickVisible: false, doneVisible: true }
    }
    const d = normalizeAppData(raw)
    expect(d.uiState.pos).toEqual({ x: 100, y: 50 })
  })

  it('幂等：已带锚点标记的档案二次归一不变', () => {
    const raw = {
      v: 1,
      todos: [],
      completed: [],
      archive: {},
      templates: [],
      settings: defaultSettings(),
      uiState: { pos: { x: 353, y: 50 }, clusterScale: 0.8, quickVisible: true, doneVisible: true, posIsTodoAnchor: true }
    }
    const d1 = normalizeAppData(raw)
    expect(d1.uiState.pos).toEqual({ x: 353, y: 50 })
  })

  it('首次启动默认：pos 为 null、锚点标记为 true', () => {
    expect(defaultAppData().uiState.posIsTodoAnchor).toBe(true)
  })
})
