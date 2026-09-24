import { describe, it, expect } from 'vitest'
import { applySettings, validateSettingsPatch, defaultSettings } from '../../src/core/services/settings'
import { normalizeSettings } from '../../src/core/models'

/** T12 设置服务（开发计划 §4-T12：默认值、旧档补齐迁移、枚举校验） */
describe('T12 SettingsService', () => {
  it('默认值符合 PRD §5.7（设置 4 项：无字体/无回收站字段——B1.5 起 recycleKeep 移除）', () => {
    expect(defaultSettings()).toEqual({
      maxItems: 10,
      hour12: false,
      fontScale: 'medium',
      autoStart: false,
      doneSort: 'asc'
    })
    expect('recycleKeep' in defaultSettings()).toBe(false)
  })

  it('部分补丁即时生效，未提及字段保留', () => {
    const s = applySettings(defaultSettings(), { hour12: true, fontScale: 'large' })
    expect(s.hour12).toBe(true)
    expect(s.fontScale).toBe('large')
    expect(s.maxItems).toBe(10)
  })

  it('非法枚举被拒：保留当前值（fontScale/doneSort）', () => {
    const s = applySettings(defaultSettings(), {
      fontScale: 'huge' as never,
      doneSort: 'random' as never
    })
    expect(s.fontScale).toBe('medium')
    expect(s.doneSort).toBe('asc')
  })

  it('非法类型被拒：布尔项传非布尔保留当前', () => {
    const s = applySettings(defaultSettings(), { hour12: 'yes' as never, autoStart: 1 as never })
    expect(s.hour12).toBe(false)
    expect(s.autoStart).toBe(false)
  })

  it('maxItems clamp 1~10；非整数取整', () => {
    expect(applySettings(defaultSettings(), { maxItems: 0 }).maxItems).toBe(1)
    expect(applySettings(defaultSettings(), { maxItems: 11 }).maxItems).toBe(10)
    expect(applySettings(defaultSettings(), { maxItems: 5.9 }).maxItems).toBe(5)
  })

  it('validateSettingsPatch：先校验再应用（UI 提交前用）', () => {
    const r = validateSettingsPatch({ hour12: true, maxItems: 3 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.settings.hour12).toBe(true)
      expect(r.settings.maxItems).toBe(3)
    }
    const bad = validateSettingsPatch({ fontScale: 'x' as never })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.field).toBe('fontScale')
  })

  it('旧档迁移：normalizeSettings 补齐缺省（含非法枚举回退）', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings())
    expect(normalizeSettings({ maxItems: 4 } as never)).toEqual({ ...defaultSettings(), maxItems: 4 })
    expect(normalizeSettings({ fontScale: 'nope' } as never).fontScale).toBe('medium')
    expect(normalizeSettings({ maxItems: 99 } as never).maxItems).toBe(10)
  })
})
