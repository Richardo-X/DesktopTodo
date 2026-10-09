import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChildKind } from '../ipc/contract'
import { getApi } from '../services/api'
import { initialTuckState, reduceTuck, type TuckEvent, type TuckState } from '../core/utils/tuck'

/** 界面状态：批量删除模式（按目标列表隔离）、确认框与子窗口打开 */
export type BatchTarget = 'todos' | 'templates' | 'history'

export const useUiStore = defineStore('ui', () => {
  const batchTarget = ref<BatchTarget | null>(null)
  const selectedIds = ref<string[]>([])
  const confirmState = ref<{ message: string; resolve: (v: boolean) => void } | null>(null)

  // —— 贴边缩进状态机（§5-I，纯归约 + 宿主 tick） ——
  const tuck = ref<TuckState>(initialTuckState())
  let tickTimer: ReturnType<typeof setInterval> | null = null
  // 四轮：指针最后在窗内活动的时刻——弹出/窗口尺寸变化会引发伪 mouse-leave，
  // 缩回前校验：伪离开后指针仍在窗内活动 → 取消缩回（修闪烁与提前缩回）
  let lastPointerInsideAt = 0
  // 四轮5：主进程光标轮询的最后判定（解锁补发离开用）
  let lastCursorInside = true

  function dispatchTuck(e: TuckEvent): void {
    let event = e
    // 四轮3：批量删除进行中（选择阶段）不自动缩回——tick 被吞掉，批量结束后由后续 tick 恢复
    if (e.type === 'tick' && batchTarget.value !== null) return
    if (e.type === 'tick' && tuck.value.leaveAt !== null && lastPointerInsideAt >= tuck.value.leaveAt) {
      // 指针在伪离开后仍在窗内活动 → 视为在组件上，取消这次缩回
      event = { type: 'mouse-enter', now: e.now }
    }
    const prevTucked = tuck.value.tucked
    tuck.value = reduceTuck(tuck.value, event)
    // 四轮5：解锁时光标已在窗外 → 锁应用后补发离开（顺序不能反：锁定未解除时离开会被吞）
    if (event.type === 'lock' && !event.on && !lastCursorInside) {
      tuck.value = reduceTuck(tuck.value, { type: 'mouse-leave', now: Date.now() })
    }
    // 仅在 tucked 实际变化时同步主进程：事件乱序时旧状态不得回弹窗口（CI 反馈环根因）
    if (tuck.value.tucked !== prevTucked) void getApi().setTucked(tuck.value.tucked)
    if (tuck.value.leaveAt !== null && tickTimer === null) {
      tickTimer = setInterval(() => {
        dispatchTuck({ type: 'tick', now: Date.now() })
        if (tuck.value.leaveAt === null && tickTimer !== null) {
          clearInterval(tickTimer)
          tickTimer = null
        }
      }, 100)
    }
  }

  /** 装配系统事件（吸附变化/子窗口关闭/指针活动记录） */
  function initSystemEvents(): void {
    getApi().onSnapChanged((snapped) => dispatchTuck({ type: snapped ? 'snap' : 'unsnap' }))
    getApi().onForceTuck(() => dispatchTuck({ type: 'force-tuck' }))
    getApi().onChildClosed(() => dispatchTuck({ type: 'child-closed' }))
    // 三轮8.2-1：主进程窗口移动事件 → moving 抑制（修拖动中伪 leave 误缩回）
    getApi().onWindowMoving((now) => dispatchTuck({ type: 'window-move', now }))
    // 四轮：记录指针在窗内的最后活动时刻（缩回前校验用）
    window.addEventListener('pointermove', () => {
      lastPointerInsideAt = Date.now()
    })
    // 四轮二修：缩进判定改主进程光标轮询权威驱动——DOM mouseenter/leave 不再驱动缩进
    getApi().onCursorInside((inside) => {
      lastCursorInside = inside
      dispatchTuck({ type: inside ? 'mouse-enter' : 'mouse-leave', now: Date.now() })
    })
  }

  /** 批次 B-5：接收批量模式跨窗广播（每个组件窗口在挂载时注册一次） */
  function registerBatchSync(): void {
    getApi().onBatchState((target) => applyRemoteBatch(target))
  }

  /** 用户验收#5：子窗口数量跨窗同步——任一窗打开/关闭二级窗都驱动三窗状态机 childOpen 门 */
  function registerChildCountSync(): void {
    getApi().onChildCount((n) => {
      dispatchTuck({ type: n > 0 ? 'child-open' : 'child-closed' })
    })
  }

  function mouseLeave(): void {
    dispatchTuck({ type: 'mouse-leave', now: Date.now() })
  }

  function mouseEnter(): void {
    dispatchTuck({ type: 'mouse-enter', now: Date.now() })
  }

  /** 是否处于批量模式（任意列表） */
  const batchMode = computed(() => batchTarget.value !== null)

  /** 应用内确认框（替代原生 confirm）；resolve(true)=确定 */
  function confirm(message: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirmState.value = { message, resolve }
    })
  }

  function answerConfirm(v: boolean): void {
    const c = confirmState.value
    confirmState.value = null
    c?.resolve(v)
  }

  function enterBatch(target: BatchTarget): void {
    batchTarget.value = target
    selectedIds.value = []
    // 批次 B-5：跨窗同步——发起窗上报主进程，广播其余组件窗口（瞬态状态不经持久化）
    void getApi().setBatchState(target)
  }

  function exitBatch(): void {
    batchTarget.value = null
    selectedIds.value = []
    void getApi().setBatchState(null)
  }

  /** 广播接收端：应用其他窗口同步来的批量状态（不再上报，防环路） */
  function applyRemoteBatch(target: BatchTarget | null): void {
    batchTarget.value = target
    selectedIds.value = []
  }

  function toggleSelect(id: string): void {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  function selectAll(ids: string[]): void {
    selectedIds.value = [...ids]
  }

  /** 四轮5：启动按存档 tuckLock 初始化状态机锁定 */
  function initTuckLockFromState(initial: boolean): void {
    if (initial) dispatchTuck({ type: 'lock', on: true })
  }

  async function openChild(kind: ChildKind, id?: string): Promise<void> {
  // 批次 C-2：蒙层前置广播（蒙层与二级窗同步出现，不等窗口创建+childCount 往返）
  void getApi().setVeil(true)
    // 缩进状态机：打开子窗口立即弹出（I4）
    dispatchTuck({ type: 'child-open' })
    await getApi().openChild({ kind, id })
  }

  return {
    tuck,
    dispatchTuck,
    initSystemEvents,
    registerBatchSync,
    registerChildCountSync,
    initTuckLockFromState,
    mouseLeave,
    mouseEnter,
    batchTarget,
    batchMode,
    selectedIds,
    confirmState,
    confirm,
    answerConfirm,
    applyRemoteBatch,
    enterBatch,
    exitBatch,
    toggleSelect,
    selectAll,
    openChild
  }
})
