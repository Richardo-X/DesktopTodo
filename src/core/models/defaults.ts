import type { AppData, AppSettings, UiState } from './types'

/** 设置默认值（PRD §5.7：上限 10 / 24 小时制 / 中号字体 / 不自启 / 回收站永不清理 / 正序） */
export function defaultSettings(): AppSettings {
  return {
    maxItems: 10,
    hour12: false,
    fontScale: 'medium',
    autoStart: false,
    recycleKeep: 'never',
    doneSort: 'asc'
  }
}

/** 界面记忆项默认值（首次启动：面板全开、白天主题、不置顶、不锁缩进） */
export function defaultUiState(): UiState {
  return {
    pos: null,
    clusterScale: 1,
    childScales: {},
    quickVisible: true,
    doneVisible: true,
    theme: 'day',
    topMost: false,
    tuckLock: false,
    lastSettleDate: null
  }
}

/** 首次启动空数据（PRD §7.4：空列表，不带演示数据） */
export function defaultAppData(): AppData {
  return {
    v: 1,
    todos: [],
    completed: [],
    archive: {},
    templates: [],
    recycleBin: [],
    settings: defaultSettings(),
    uiState: defaultUiState()
  }
}

const FONT_SCALES = ['small', 'medium', 'large'] as const
const DONE_SORTS = ['asc', 'desc'] as const
const RECYCLE_KEEPS = [7, 30, 'never'] as const

/** 设置归一化：旧档缺字段补默认、非法枚举回退默认 */
export function normalizeSettings(raw: Partial<AppSettings> | undefined | null): AppSettings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  return {
    maxItems:
      typeof raw.maxItems === 'number' && Number.isInteger(raw.maxItems)
        ? Math.min(10, Math.max(1, raw.maxItems))
        : d.maxItems,
    hour12: typeof raw.hour12 === 'boolean' ? raw.hour12 : d.hour12,
    fontScale: FONT_SCALES.includes(raw.fontScale as never) ? (raw.fontScale as AppSettings['fontScale']) : d.fontScale,
    autoStart: typeof raw.autoStart === 'boolean' ? raw.autoStart : d.autoStart,
    recycleKeep: RECYCLE_KEEPS.includes(raw.recycleKeep as never)
      ? (raw.recycleKeep as AppSettings['recycleKeep'])
      : d.recycleKeep,
    doneSort: DONE_SORTS.includes(raw.doneSort as never) ? (raw.doneSort as AppSettings['doneSort']) : d.doneSort
  }
}

/** uiState 归一化（旧档补齐，G4） */
export function normalizeUiState(raw: Partial<UiState> | undefined | null): UiState {
  const d = defaultUiState()
  if (!raw || typeof raw !== 'object') return d
  return {
    pos:
      raw.pos && typeof raw.pos.x === 'number' && typeof raw.pos.y === 'number'
        ? { x: raw.pos.x, y: raw.pos.y }
        : d.pos,
    clusterScale: typeof raw.clusterScale === 'number' && raw.clusterScale > 0 ? raw.clusterScale : d.clusterScale,
    childScales:
      raw.childScales && typeof raw.childScales === 'object'
        ? Object.fromEntries(
            Object.entries(raw.childScales).filter(([, v]) => typeof v === 'number' && v > 0)
          )
        : d.childScales,
    quickVisible: typeof raw.quickVisible === 'boolean' ? raw.quickVisible : d.quickVisible,
    doneVisible: typeof raw.doneVisible === 'boolean' ? raw.doneVisible : d.doneVisible,
    theme: raw.theme === 'night' ? 'night' : raw.theme === 'day' ? 'day' : d.theme,
    topMost: typeof raw.topMost === 'boolean' ? raw.topMost : d.topMost,
    tuckLock: typeof raw.tuckLock === 'boolean' ? raw.tuckLock : d.tuckLock,
    lastSettleDate:
      typeof raw.lastSettleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastSettleDate)
        ? raw.lastSettleDate
        : d.lastSettleDate
  }
}

/** 整档归一化：损坏容错由仓储层处理，这里只负责缺字段补齐（G4） */
export function normalizeAppData(raw: unknown): AppData {
  const d = defaultAppData()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<AppData>
  return {
    v: 1,
    todos: Array.isArray(r.todos) ? r.todos : d.todos,
    completed: Array.isArray(r.completed) ? r.completed : d.completed,
    archive:
      r.archive && typeof r.archive === 'object' && !Array.isArray(r.archive)
        ? (r.archive as AppData['archive'])
        : d.archive,
    templates: Array.isArray(r.templates) ? r.templates : d.templates,
    recycleBin: Array.isArray(r.recycleBin) ? r.recycleBin : d.recycleBin,
    settings: normalizeSettings(r.settings),
    uiState: normalizeUiState(r.uiState)
  }
}
