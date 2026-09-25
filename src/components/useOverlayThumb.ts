import { onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'

/** 滑块最小高度（px） */
export const THUMB_MIN_HEIGHT = 24

export interface ThumbGeometry {
  /** 滑块高度（px） */
  height: number
  /** 滑块距列表可视区顶部的偏移（px） */
  top: number
}

/** 纯函数：按滚动状态计算滑块几何（高度∝可视区占比，位置∝滚动进度） */
export function thumbGeometry(scrollH: number, clientH: number, scrollTop: number): ThumbGeometry {
  if (scrollH <= clientH + 1) return { height: 0, top: 0 }
  const height = Math.max(THUMB_MIN_HEIGHT, Math.round((clientH * clientH) / scrollH))
  const maxTop = Math.max(0, clientH - height)
  const scrollable = Math.max(1, scrollH - clientH)
  const top = Math.min(maxTop, Math.max(0, Math.round((scrollTop / scrollable) * maxTop)))
  return { height, top }
}

/**
 * 自绘悬浮滚动条（二轮反馈·用户裁定）：
 * - 原生滚动条移出布局（行宽与滚动条彻底解耦，零挤压）
 * - 滑块绘制在右缘专用带；列表可滚动期间恒定显示（细淡不干扰），不可滚动即消失
 * - 支持拖拽滑块直接滚动列表
 *
 * @param listRef 滚动容器（.scroll/.list）的模板引用
 */
export function useOverlayThumb(listRef: Ref<HTMLElement | null>) {
  // reactive 包装：模板中 thumb.visible/top/height 自动解包
  const state = reactive({ visible: false, top: 0, height: 0 })
  const dragging = ref(false)
  let ro: ResizeObserver | null = null
  let detachScroll: (() => void) | null = null

  /** 同步滑块几何与可见性（仅当列表可滚动时显示） */
  function sync(): void {
    const el = listRef.value
    if (!el) {
      state.visible = false
      return
    }
    const g = thumbGeometry(el.scrollHeight, el.clientHeight, el.scrollTop)
    state.height = g.height
    state.top = g.top
    state.visible = g.height > 0
  }

  /** 拖拽滑块：按位移比例滚动列表 */
  function onThumbPointerDown(e: PointerEvent): void {
    const el = listRef.value
    if (!el) return
    dragging.value = true
    const startY = e.clientY
    const startScrollTop = el.scrollTop
    const onMove = (ev: PointerEvent): void => {
      if (!el) return
      const scrollable = Math.max(1, el.scrollHeight - el.clientHeight)
      const maxTop = Math.max(1, el.clientHeight - state.height)
      el.scrollTop = startScrollTop + ((ev.clientY - startY) / maxTop) * scrollable
    }
    const onUp = (): void => {
      dragging.value = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function detach(): void {
    if (ro) {
      ro.disconnect()
      ro = null
    }
    if (detachScroll) {
      detachScroll()
      detachScroll = null
    }
  }

  watch(
    listRef,
    (el) => {
      detach()
      if (!el) {
        state.visible = false
        return
      }
      const onScroll = (): void => sync()
      el.addEventListener('scroll', onScroll)
      detachScroll = () => el.removeEventListener('scroll', onScroll)
      ro = new ResizeObserver(() => sync())
      ro.observe(el)
      sync()
    },
    { immediate: true, flush: 'post' }
  )

  onMounted(() => sync())
  onBeforeUnmount(detach)

  return { state, onThumbPointerDown }
}
