/**
 * 领域数据模型（PRD §5.1 / 开发计划 §2.3）。
 * 时间戳统一存 ISO 8601 UTC 字符串；本地日期键（YYYY-MM-DD）由 utils/date 派生。
 */

/** 待办 / 已完成 / 历史记录共用结构：有 completedAt = 已完成 */
export interface TodoItem {
  id: string
  content: string
  /** ISO 8601 UTC */
  createdAt: string
  /** ISO 8601 UTC；null = 待办（不设独立"完成状态"字段） */
  completedAt: string | null
  /** 逾期标记：待办跨天结算时置位；退回待办时重算（口径见 services/overdue） */
  overdue: boolean
}

/** 模板（常用事项单条文字） */
export interface TemplateItem {
  id: string
  content: string
  /** ISO 8601 UTC */
  createdAt: string
}

/** 已完成/历史页排序（默认正序，两页共用） */
export type DoneSort = 'asc' | 'desc'

export interface AppSettings {
  /** 待办数量上限 1~10，默认 10；不可低于当前待办数量 */
  maxItems: number
  hour12: boolean
  autoStart: boolean
  doneSort: DoneSort
}

export type Theme = 'day' | 'night'

/** 窗口/界面记忆项（开发计划 §2.3 uiState） */
export interface UiState {
  /** 组件簇位置（DIP 逻辑坐标）；null = 首次启动默认位置（屏幕右侧偏上） */
  pos: { x: number; y: number } | null
  /** 三面板簇整体等比缩放 */
  clusterScale: number
  /** 子窗口按类别分组缩放：事项类/模板类/设置/历史 */
  childScales: Record<string, number>
  /** 快捷添加面板开关（记忆） */
  quickVisible: boolean
  /** 已完成面板开关（记忆） */
  doneVisible: boolean
  theme: Theme
  /** 窗口置顶（记忆） */
  topMost: boolean
  /** 贴边缩进锁定 */
  tuckLock: boolean
  /** 最近一次跨天结算的本地日期键；null = 从未结算 */
  lastSettleDate: string | null
}

/** 本地单文件数据（data.json） */
export interface AppData {
  v: 1
  todos: TodoItem[]
  /** 当天完成（跨天结算归档进 archive 后清空） */
  completed: TodoItem[]
  /** 历史记录：按完成日（本地日期键）归档 */
  archive: Record<string, TodoItem[]>
  templates: TemplateItem[]
  settings: AppSettings
  uiState: UiState
}
