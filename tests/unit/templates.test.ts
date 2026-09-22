import { describe, it, expect } from 'vitest'
import {
  createTemplate,
  updateTemplate,
  addToTodoFromTemplate,
  findDuplicateTemplate,
  TEMPLATE_LIMIT
} from '../../src/core/services/templates'
import { defaultAppData, createTodoItem, createTemplateItem, type AppData, type TemplateItem, type TodoItem } from '../../src/core/models'

const NOW = new Date(2026, 8, 21, 9, 0, 0)

function seedTemplates(count: number): TemplateItem[] {
  return Array.from({ length: count }, (_, i) => createTemplateItem({ content: `模板${i}`, now: NOW, id: `tpl${i}` }))
}

function seedTodos(count: number): TodoItem[] {
  return Array.from({ length: count }, (_, i) => createTodoItem({ content: `待办${i}`, now: NOW, id: `t${i}` }))
}

function data(p: Partial<AppData>): AppData {
  return { ...defaultAppData(), ...p }
}

/** T09 模板服务（开发计划 §5-D；PRD §5.3：上限 10、trim 查重、一键添加保留模板进末尾） */
describe('D 模板服务 TemplateService', () => {
  it('D1 已有 10 个模板 → 再新建拒绝（上限提示）', () => {
    const d = data({ templates: seedTemplates(10) })
    const r = createTemplate(d, '新模板', NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('limit-reached')
    expect(TEMPLATE_LIMIT).toBe(10)
  })

  it('D2 trim 后查重：" 喝水 " 与已有 "喝水" → 拒绝"已存在相同内容"', () => {
    const d = data({ templates: seedTemplates(1).map((t) => ({ ...t, content: '喝水' })) })
    const r = createTemplate(d, '  喝水  ', NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('duplicate')
  })

  it('D3 一键添加：待办末尾新增、createdAt=now、overdue=false、模板保留；受待办上限约束', () => {
    const tpl = createTemplateItem({ content: '喝水', now: NOW, id: 'tpl-x' })
    const todos = seedTodos(2)
    const d = data({ todos, templates: [tpl] })
    const r = addToTodoFromTemplate(d, 'tpl-x', NOW)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.todos).toHaveLength(3)
      expect(r.data.todos[2].content).toBe('喝水') // 末尾
      expect(r.data.todos[2].createdAt).toBe(NOW.toISOString())
      expect(r.data.todos[2].overdue).toBe(false)
      expect(r.data.templates).toEqual([tpl]) // 模板保留
    }

    // 待办满上限 → 拒绝
    const full = data({ todos: seedTodos(10), templates: [tpl], settings: { ...defaultAppData().settings, maxItems: 10 } })
    const blocked = addToTodoFromTemplate(full, 'tpl-x', NOW)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toBe('limit-reached')
  })

  it('D4 待办已有相同内容 → 新建待办允许（查重只针对模板）', () => {
    const d = data({ todos: seedTodos(1).map((t) => ({ ...t, content: '喝水' })) })
    const r = createTemplate(d, '喝水', NOW)
    // 模板与待办查重无关：待办里已有"喝水"不影响模板创建
    expect(r.ok).toBe(true)
  })

  it('正常路径：创建成功追加末尾；重复内容待办可重复创建', () => {
    let d = data({ templates: seedTemplates(2) })
    const r1 = createTemplate(d, '整理邮箱', NOW)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.data.templates).toHaveLength(3)
      expect(r1.data.templates[2].content).toBe('整理邮箱')
      d = r1.data
    }
    // 待办允许相同内容重复（对比：模板重复被拒）
    const dup = createTemplate(d, '整理邮箱', NOW)
    expect(dup.ok).toBe(false)
  })

  it('编辑模板：trim 查重排除自身；内容校验生效', () => {
    const t1 = createTemplateItem({ content: '喝水', now: NOW, id: 'tpl-a' })
    const t2 = createTemplateItem({ content: '运动', now: NOW, id: 'tpl-b' })
    let d = data({ templates: [t1, t2] })

    // 改成与 t1 相同 → 拒绝
    const dupSelf = updateTemplate(d, 'tpl-b', ' 喝水 ')
    expect(dupSelf.ok).toBe(false)
    if (!dupSelf.ok) expect(dupSelf.reason).toBe('duplicate')

    // 改回自己的内容（未变）→ 允许
    const same = updateTemplate(d, 'tpl-b', '运动')
    expect(same.ok).toBe(true)

    // 正常改名
    const ok = updateTemplate(d, 'tpl-b', '散步')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data.templates[1].content).toBe('散步')

    // 空内容 → 拒绝
    const empty = updateTemplate(d, 'tpl-b', '  ')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.reason).toBe('empty-content')
  })

  it('findDuplicateTemplate：支持排除自身', () => {
    const t1 = createTemplateItem({ content: '喝水', now: NOW, id: 'tpl-a' })
    const d = data({ templates: [t1] })
    expect(findDuplicateTemplate(d, '喝水')?.id).toBe('tpl-a')
    expect(findDuplicateTemplate(d, '喝水', 'tpl-a')).toBeUndefined()
    expect(findDuplicateTemplate(d, ' 喝水 ')).toBeDefined() // trim 后比较
  })
})
