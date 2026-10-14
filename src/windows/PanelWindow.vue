<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { useUiStore } from '../stores/ui'
import { TUCK_BAR_HEIGHT, TUCK_BAR_WIDTH } from '../core/constants'
import { BASE_PANEL } from '../core/utils/cluster-layout'
import { getApi } from '../services/api'
import HomePanel from '../panels/HomePanel.vue'
import QuickPanel from '../panels/QuickPanel.vue'
import DonePanel from '../panels/DonePanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { cancelBubble } from '../components/content-bubble'

/**
 * 三窗分离架构（v1.1.0 批次 B-1）：每个 OS 窗口的渲染根。
 * 一个窗口 = stage（设计令牌+主题）+ zoom 容器（尺寸=基准÷缩放，zoom×尺寸=真窗口，决策#7）+
 * 对应面板。缩进胶囊仅存在于待办主窗（形态 B：侧窗由主进程整体隐藏）。
 * 标题栏手写拖动：document 捕获段监听 .titlebar 命中（排除按钮区）→ 主进程光标轮询整体拖动；
 * 三个面板组件的模板无需感知窗口化（仅移除 app-region CSS）。
 */
const props = defineProps<{ panel: 'quick' | 'main' | 'done' }>()

const store = useAppStore()
const ui = useUiStore()
/** 白条弹出驱动（C7 用户方案 2026-10-10）：mouseenter = 系统真实命中——鼠标物理碰到白条
 * （主窗白条元素）才触发；被其他窗口遮挡时主窗收不到鼠标事件=天然不弹（无需任何遮挡检测）；
 * 判定范围=白条元素边界（垂直 12px/水平 160px 精确，无窗口透明区误差）。
 * 点击作为附加途径保留（CDP/特殊场景）。 */
function onTuckBarEnter(): void {
  ui.dispatchTuck({ type: 'mouse-enter', now: Date.now() })
}
function onTuckBarClick(): void {
  ui.dispatchTuck({ type: 'mouse-enter', now: Date.now() })
}

const tucked = computed(() => ui.tuck.tucked)
/** DOM 形态跟随的 tucked：主进程窗口几何调整完成后才切换（先几何后 DOM，消弹出呼吸/闪烁） */
const domTucked = ref(false)
/** 批次 C-2（用户定稿 2026-10-03）：二级窗打开时三个一级窗口都显示蒙层（示意不可操作）。
 * 由前置信号驱动（打开入口广播，先于二级窗创建），与二级窗同步出现 */
const veilVisible = ref(false)

const baseWidth = computed(() => (props.panel === 'main' ? BASE_PANEL.main : BASE_PANEL.quick))

/**
 * 缩放抖动根治（批次 B 验收#2）：侧窗卡片缩放不再等跨进程广播——
 * 窗口 resize 事件与 OS 尺寸变化同帧，从 innerHeight/640 反推缩放（±0.5px 精度），
 * 卡片与窗口边缘同帧到位，缝隙不再先撑大后回缩。store 值作初值与回同步基准。
 * 【快捷窗例外（画布方案，方案《移植Electron版》§2-步骤1）】：画布窗尺寸恒定，
 * 视口恒等于上限 ⇒ 反推语义失效——缩放值单一来源=广播的 uiState.clusterScale
 * （主进程 commit 先广播后 setBounds，手势中每个节流提交都会到达）。
 */
const zoomValue = ref<number>(window.innerHeight / BASE_PANEL.height)

function syncZoomFromViewport(): void {
  if (isQuick.value) return // 画布窗视口恒定，反推已死（见上）
  const s = window.innerHeight / BASE_PANEL.height
  if (Number.isFinite(s) && s > 0.1 && s <= 3) zoomValue.value = s
}

/** 快捷窗卡面缩放值：URL 播种初值（主进程创建时经 query 传入，store 异步加载前防首帧跳变），
 * 之后随广播 uiState.clusterScale 更新（唯一权威） */
const isQuick = computed(() => props.panel === 'quick')
const urlScale = Number(new URLSearchParams(window.location.search).get('scale'))
const quickScale = ref<number>(
  Number.isFinite(urlScale) && urlScale > 0.1 && urlScale <= 3 ? urlScale : store.uiState.clusterScale
)
watch(
  () => store.uiState.clusterScale,
  (v) => {
    if (isQuick.value && Number.isFinite(v) && v > 0.1 && v <= 3) quickScale.value = v
  }
)

/** 缩放呈现 v3.3（用户定稿）：缩放中两侧窗内容以底色代替（窗壳边框实时缩放），
 * 松手恢复渲染——消灭侧窗"内容重绘晚于窗框"的拖影；待办主窗不参与（保持原样缩放）。
 * zoom 在隐藏期间照常反推（解冻瞬间即就位，无需重排等待） */
const sideFrozen = ref(false)

function onResizeFreeze(frozen: boolean): void {
  if (props.panel === 'main') return
  sideFrozen.value = frozen
  if (!frozen) syncZoomFromViewport()
}

function onWinResize(): void {
  // 单一缩放源：窗口 resize 与 OS 尺寸变化同帧——卡片与窗口边缘同帧到位。
  // 不得混用广播值：双源每次 commit 触发两次重排（值有推导差）= 呼吸式抖动（用户实测）
  syncZoomFromViewport()
}

const holderZoom = computed(() => zoomValue.value)

/** zoom 容器尺寸=面板基准÷缩放（窗口=基准×缩放，二者 1:1 且可反推）。
 * 快捷窗（画布方案）：卡面固定设计尺寸，transform 缩放——不进布局、不重排，
 * 右上角对齐画布右上角（transform-origin: top right），窗口恒定 ⇒ 卡片右缘=画布右缘恒定 */
const holderStyle = computed(() => {
  if (isQuick.value) {
    return {
      width: `${baseWidth.value}px`,
      height: `${BASE_PANEL.height}px`,
      transform: `scale(${quickScale.value})`,
      transformOrigin: 'top right'
    }
  }
  const s = holderZoom.value
  return {
    zoom: String(s),
    width: `calc(${baseWidth.value}px / ${s})`,
    height: `calc(${BASE_PANEL.height}px / ${s})`
  }
})

function isTitlebarHit(e: PointerEvent): boolean {
  const t = e.target as HTMLElement
  if (!t.closest('.titlebar')) return false
  if (t.closest('.win-actions, .wbtn, button')) return false
  return true
}

function onDocPointerDown(e: PointerEvent): void {
  if (!isTitlebarHit(e)) return
  // 指针捕获：拖动中光标快速移出窗口/跨屏时 pointerup 仍必达本窗
  // （否则主进程轮询永不停止，组件永久跟随光标——用户实测卡死）
  try {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* 部分目标元素不可捕获（如 SVG 内部节点），忽略 */
  }
  void getApi().clusterDragStart()
}

function onDocPointerUp(): void {
  void getApi().clusterDragEnd()
}

function onWindowBlur(): void {
  // 双保险：窗口失焦=拖动必然已结束（Alt+Tab/点别的窗口都会丢 pointerup）
  void getApi().clusterDragEnd()
  // 气泡卡死修复（用户 2026-10-05）：聚焦切走时气泡不得残留（含排队中的定时器）
  cancelBubble()
}

watch(tucked, async (v) => {
  // 时序定稿（2026-10-08 回退实验）：窗口几何先行、DOM 后切——DOM 先切的中间态
  // （展开尺寸+白条视图）可交互滞留（真机：标题栏方块可拖动），实验判定失败
  await getApi().setTucked(v).catch(() => {})
  domTucked.value = v
})

onMounted(() => {
  void store.init().then(() => {
    ui.initTuckLockFromState(store.uiState.tuckLock)
  })
  ui.initSystemEvents()
  // 批次 B-5：批量模式跨窗同步（其余窗口收到广播后冻结/解冻）
  ui.registerBatchSync()
  // 用户验收#5：二级窗打开/关闭跨窗同步缩进禁用
  ui.registerChildCountSync()
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('pointerup', onDocPointerUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('resize', onWinResize)
  getApi().onResizeFreeze(onResizeFreeze)
  getApi().onVeil((v) => {
    veilVisible.value = v
    // 气泡卡死修复（用户 2026-10-05）：二级窗打开→三窗禁用收不到 mouseleave，
    // 悬停中的气泡会滞留——veil 开启即隐藏
    if (v) cancelBubble()
  })
  syncZoomFromViewport()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('pointerup', onDocPointerUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('resize', onWinResize)
})
</script>

<template>
  <div class="stage" :class="{ 'side-frozen': sideFrozen }" :data-theme="store.uiState.theme">
    <!-- 批次 C-2：模态锁定蒙层（三窗统一；示意一级窗口不可操作，纯视觉） -->
    <div v-if="veilVisible" class="modal-veil" data-testid="modal-veil" />
    <!-- 待办主窗：缩进态切换为胶囊（形态 B；侧窗由主进程隐藏） -->
    <template v-if="props.panel === 'main'">
      <!-- 用户验收：弹出/缩进同步无呼吸——面板常驻挂载（不销毁 DOM），缩进=透明度翻转
           （display 切换会重排重建=慢半拍；opacity 翻转=合成器直完成） -->
      <div
        class="cluster"
        :class="{ 'cluster-veiled': domTucked }"
        :style="holderStyle"
        data-testid="cluster-holder"
      >
        <HomePanel />
      </div>
      <div
        v-show="domTucked"
        class="tuck-bar"
        :style="{ height: TUCK_BAR_HEIGHT + 'px', width: TUCK_BAR_WIDTH + 'px' }"
        title="鼠标移入弹出组件（点击亦可）"
        @mouseenter="onTuckBarEnter"
        @click="onTuckBarClick"
      />
    </template>
    <template v-else>
      <div
        class="cluster"
        :class="{ 'cluster-frozen': sideFrozen, 'cluster-quick-card': isQuick }"
        :style="holderStyle"
        data-testid="cluster-holder"
      >
        <QuickPanel v-if="props.panel === 'quick'" data-testid="quick-panel" />
        <DonePanel v-else data-testid="done-panel" />
      </div>
    </template>
    <ConfirmDialog />
  </div>
</template>

<style scoped>
/* ===== 设计令牌（原型 v3.1.2 :root；三窗后每窗渲染树独立持有） ===== */
.stage {
  --accent: #0a63b8;
  --accent-hover: #0d6fc9;
  --accent-fg: #ffffff;
  --win-bg: rgba(243, 246, 251, 0.94);
  --card: rgba(255, 255, 255, 0.7);
  --card-border: rgba(0, 0, 0, 0.09);
  --field: rgba(255, 255, 255, 0.9);
  --text: #1a1c20;
  --muted: #5d616b;
  --faint: #8b8f99;
  --hover: rgba(0, 0, 0, 0.05);
  --active: rgba(0, 0, 0, 0.09);
  --btn: rgba(255, 255, 255, 0.75);
  --btn-border: rgba(0, 0, 0, 0.13);
  --btn-hover: #ffffff;
  --bubble-bg: #ffffff;
  --bubble-fg: #222;
  --danger: #c42b1c;
  --overdue: #d13438;
  --cb-border: #8a8a8a;
  --dialog-bg: #ffffff;
  --dialog-fg: #2a2f3a;

  color: var(--text);
  font-family: 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.stage[data-theme='night'] {
  --accent: #4cc2ff;
  --accent-hover: #6fcdff;
  --accent-fg: #06131c;
  --win-bg: rgba(30, 30, 33, 0.96);
  --card: rgba(255, 255, 255, 0.055);
  --card-border: rgba(255, 255, 255, 0.11);
  --field: rgba(255, 255, 255, 0.07);
  --text: #f2f3f5;
  --muted: #abafb8;
  --faint: #7d818c;
  --hover: rgba(255, 255, 255, 0.06);
  --active: rgba(255, 255, 255, 0.12);
  --btn: rgba(255, 255, 255, 0.08);
  --btn-border: rgba(255, 255, 255, 0.15);
  --btn-hover: rgba(255, 255, 255, 0.16);
  --bubble-bg: #3a3a3c;
  --bubble-fg: #f0f0f0;
  --cb-border: #9a9a9a;
  --dialog-bg: #262a34;
  --dialog-fg: #e8eaf0;
}

/* ===== 批次 C-2：模态锁定蒙层（三窗统一；示意一级窗口不可操作，纯视觉） ===== */
.modal-veil {
  position: absolute;
  inset: 0;
  background: rgba(20, 20, 25, 0.2);
  z-index: 50; /* 高于内容层，低于二级窗口（独立 OS 窗口天然在上） */
  pointer-events: none;
}


/* ===== 面板外观与基准尺寸（原 AppShell :deep 规则迁入；窗口 bounds=面板基准×缩放） ===== */
/* 缩放呈现 v3.3（用户定稿）：两侧窗冻结=窗壳观感。窗壳挂 stage（尺寸恒等于
 * 窗口，圆角天然落在窗口四角）——挂 zoom 容器时容器渲染尺寸恒为基准、超出
 * 窗口的部分被窗口边界裁切，实测出现"只有左上角圆角、其余三角直角"的畸变。
 * 主窗不参与冻结（onResizeFreeze 对 main 直接返回） */
.stage.side-frozen {
  background: var(--win-bg);
  border-radius: 10px;
}

.stage.side-frozen .cluster > * {
  visibility: hidden;
}

.stage :deep(.panel) {
  background: var(--win-bg);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  color: var(--text);
  overflow: hidden;
}

.stage :deep(.home-panel) {
  width: 470px;
  height: 640px;
  flex: none;
}

.stage :deep(.side-panel) {
  width: 310px;
  height: 640px;
  flex: none;
}

/* zoom 容器（+2px 透明余量防取整裁切圆角；尺寸由 holderStyle 内联绑定） */
.cluster {
  display: flex;
  align-items: flex-start;
}

/* 快捷窗画布方案：卡面钉画布右上角（窗口=画布，恒定），缩放走 transform 不进布局 */
.cluster-quick-card {
  position: absolute;
  top: 0;
  right: 0;
}

/* 缩进态：面板蒙纱隐藏（保挂载、零重排；pointer-events 交还胶囊） */
.cluster-veiled {
  opacity: 0;
  pointer-events: none;
}

/* ===== 缩进胶囊（160×12 热区含 6px 可见条；悬停弹出由主进程光标轮询判定） ===== */
.tuck-bar {
  /* 绝对定位脱文档流：胶囊态 zoom 容器恒 640px 高占位（常驻挂载+zoom 恒等式），
     文档流白条会被挤到 y≈643——窗口只剩 38px 高，白条在可视区外（真机"白条消失"真因） */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  border-radius: 99px;
  cursor: pointer;
}

.tuck-bar::after {
  content: '';
  display: block;
  height: 6px;
  margin-top: 3px;
  border-radius: 99px;
  background: var(--tuck-bar-bg, rgba(255, 255, 255, 0.55));
  transition: background 0.15s;
}

.tuck-bar:hover::after {
  background: var(--tuck-bar-hover, rgba(255, 255, 255, 0.85));
}

.stage[data-theme='night'] .tuck-bar {
  --tuck-bar-bg: rgba(255, 255, 255, 0.28);
  --tuck-bar-hover: rgba(255, 255, 255, 0.5);
}
</style>
