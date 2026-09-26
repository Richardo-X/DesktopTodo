import type { AppData, AppSettings, UiState } from './types'
import { BASE_PANEL, BASE_GAP } from '../utils/cluster-layout'

/** 设置默认值（PRD §5.6：上限 10 / 24 小时制 / 不自启 / 正序） */
export function defaultSettings(): AppSettings {
  return {
    maxItems: 10,
    hour12: false,
    autoStart: false,
    doneSort: 'asc'
  }
}

/** 界面记忆项默认值（首次启动：面板全开、白天主题、不置顶、不锁缩进） */
export function defaultUiState(): UiState {
  return {
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
    settings: defaultSettings(),
    uiState: defaultUiState()
  }
}

const DONE_SORTS = ['asc', 'desc'] as const

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
    autoStart: typeof raw.autoStart === 'boolean' ? raw.autoStart : d.autoStart,
    doneSort: DONE_SORTS.includes(raw.doneSort as never) ? (raw.doneSort as AppSettings['doneSort']) : d.doneSort
  }
}

/** uiState 归一化（旧档补齐，G4）。
 * 四轮定稿 B：pos 语义迁移——旧档 pos=窗口左上角 → 新档 pos=待办左上角锚点（一次性、幂等：
 * 旧档无 posIsTodoAnchor 标记时按快捷可见性右移偏移量并打标；已标记档案原样保留） */
export function normalizeUiState(raw: Partial<UiState> | undefined | null): UiState {
  const d = defaultUiState()
  if (!raw || typeof raw !== 'object') return d
  const posValid = raw.pos && typeof raw.pos.x === 'number' && typeof raw.pos.y === 'number'
  const quickVisible = typeof raw.quickVisible === 'boolean' ? raw.quickVisible : d.quickVisible
  const doneVisible = typeof raw.doneVisible === 'boolean' ? raw.doneVisible : d.doneVisible
  const clusterScale = typeof raw.clusterScale === 'number' && raw.clusterScale > 0 ? raw.clusterScale : d.clusterScale
  const posIsTodoAnchor = raw.posIsTodoAnchor === true
  let pos = posValid ? { x: raw.pos!.x, y: raw.pos!.y } : d.pos
  if (pos !== null && !posIsTodoAnchor && quickVisible) {
    // 旧档迁移：窗口左上角 → 待办左上角（快捷面板宽+缝隙，按缩放取整）
    pos = { x: pos.x + Math.round((BASE_PANEL.quick + BASE_GAP) * clusterScale), y: pos.y }
  }
  return {
    pos,
    posIsTodoAnchor: pos === null ? d.posIsTodoAnchor : true,
    clusterScale,
    childScales:
      raw.childScales && typeof raw.childScales === 'object'
        ? Object.fromEntries(
            Object.entries(raw.childScales).filter(([, v]) => typeof v === 'number' && v > 0)
          )
        : d.childScales,
    quickVisible,
    doneVisible,
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
    settings: normalizeSettings(r.settings),
    uiState: normalizeUiState(r.uiState)
  }
}
