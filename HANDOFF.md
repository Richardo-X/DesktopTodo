# HANDOFF · 开发交接文档（v1.0.1 修复轮）

> 本文档供新开发会话使用。阅读顺序：**本文件 → PRD.md → 需求文档.md → 开发计划.md**，UI 与交互以 **docs/交互原型-v3.1.html（已经用户确认）** 为基准。冲突裁决顺序：用户当次指示 > PRD/需求文档 > 原型 > 本文件。

---

## 1. 项目概况

- **产品**：桌面待办（DesktopTodo）——Windows 桌面待办悬浮小组件。本地优先、免登录、不联网、数据存 `%APPDATA%\桌面待办\data.json`
- **技术栈**：Electron 44 + TypeScript(strict) + Vue 3 + Pinia；Vitest + @vue/test-utils（单元/组件）；Playwright `_electron`（E2E）；electron-vite + electron-builder
- **仓库**：github.com/Richardo-X/DesktopTodo（私有），远程 `origin/main`，CI=GitHub Actions（windows-latest，typecheck+test+build+e2e）
- **质量基线**：单元/组件 282 用例 + E2E 14 用例全绿；core 层行覆盖 96.8%（门槛 90%，vitest.config thresholds）
- **角色与纪律**：你是开发者。严格 TDD（红→绿→重构，禁止先实现后补测试）；测试与实现分笔提交；格式 `test(v1.0.1-B#): …` / `feat(v1.0.1-B#): …` / `fix(v1.0.1-B#): …`；每批全量测试绿后提交推送，CI 必须绿；**PRD 未覆盖的细节停下来问用户，不要自行发挥**

## 2. 当前状态（2026-09-23 交接时点）

- **v1.0.0 已发布**：tag `v1.0.0` + GitHub Release（DesktopTodo-Setup/Portable-1.0.0.exe）。用户已完成第一轮人工验收
- **HEAD = 173c052** = v1.0.0 代码基线（a102ec1）+ 纯文档/原型提交：
  - 5fe9206 P0：验收反馈落入 PRD/需求文档/开发计划（v1.1 变更记录 7 条）
  - 6fe4ed3 / 173c052：原型底本 + 交互原型 v3.1（经两轮评审，用户已确认"暂时没有问题"）
- **真实 UI 代码未动**：工作区干净，等于 v1.0.0 交付代码。v1.0.1 的全部代码实施由新会话（你）执行
- 用户已确认原型的功能裁定：**设置页 6 项（PRD 功能 + 原型样式延展）**；回收站窗口为原型语言新造

## 3. 已确认决策清单（实现时必须遵守）

| # | 决策 | 来源 |
|---|------|------|
| 1 | **点击穿透彻底移除**（含 IPC/preload/命中检测代码与测试；缝隙不响应桌面操作，不再是验收项） | 用户裁定（验收反馈#5"不重要"） |
| 2 | **时钟显示精确到分钟**（HH:mm / h:mm AM/PM；内部仍每秒刷新） | 验收反馈#7 + PRD v1.1 #2 |
| 3 | **移除"字体大小"设置项**：文字随窗口缩放同步等比变化（无独立字体系数；删 settings 第 3 项与 --fs 档位机制） | 原型评审确认 + PRD v1.1 #8 |
| 4 | **面板尺寸基准（原型 v3）**：主窗 470×640、快捷添加 310×640、已完成 272×640，顶边对齐、间隙 12px | 验收反馈#4 + 原型提取 |
| 5 | **二级窗口尺寸基准**：新增待办 360×360、编辑待办 360×400、新建模板 360×360、编辑模板 360×380、详情 360×400、历史 560×540、设置 400×470、回收站 420×480；按类别组共享缩放（事项/模板/设置/历史） | PRD v1.1 #5 + 原型 |
| 6 | **二级窗口关闭规范**：表单类（新增/编辑事项、新建/编辑模板、设置）＝标题栏左「←」返回（无×，编辑类标题栏右「保存」）；浏览类（详情/历史/回收站）＝标题栏右「×」 | 验收反馈#6 + 原型 openChild |
| 7 | **缩放＝真实窗口尺寸变化**：主簇与二级窗口都不得出现"透明框内内容放大"；实现＝窗口 setBounds 与内容基准尺寸 1:1 同步 | 验收反馈#3 |
| 8 | **组件可拖动**：面板标题栏 `-webkit-app-region: drag`（按钮区 no-drag） | 验收反馈#3 |
| 9 | **托盘隐藏＝组件整体隐藏（含全部二级窗口）**；显示同步恢复 | 验收反馈#8 |
| 10 | **拖拽排序**：长按约 230~300ms 进入拖动；长按期间移动**不取消**（取消-on-move 是原型踩过的坑）；批量模式下禁用 | 原型评审修复 |
| 11 | 快捷添加窗口批量按钮文案＝「批量删除」；模板新建/编辑窗口布局对齐新建待办（清空在操作行左侧，不悬浮输入框）；提交按钮名「新建事项」「新建模板」 | 原型评审 |
| 12 | 无外框滚动条：body 不滚动，仅窗口内部/列表区滚动（细滚动条样式） | 验收反馈#2 |
| 13 | **拖拽换位＝相邻增量交换**：指针进入相邻条目区域 4px 即换位（触碰即换，无需越过中线）；长按 230ms 启动、移动不取消；带 FLIP 动画 | 原型 v3.1.1 评审（灵敏度反馈） |
| 14 | **详情窗口 360×430；编辑待办窗口 400×430**（PRD v1.1 #5 的 360×400 两轮校准——先修底部遮挡，再加宽解决"还原/添加到模板/删除"横向截断）；`.win-body` 底部内边距 24px 预留缩放角 | 原型 v3.1.1 评审（图1/图2 遮挡 + 二次反馈） |
| 16 | **缩放角视觉改为与窗口圆角同弧度的弧线**（10px 圆角弧、2px 描边、60% 透明度、悬停加亮；贴右下角内侧） | 原型 v3.1.1 评审（缩放角视觉反馈，二轮修订） |
| 17 | **详情窗口（已完成/历史）不保留任何括号演示注释**（如"（当天创建当天完成为正常）""（已结算进历史，时间锁定）"），且**不放「添加到模板」按钮**——按 PRD 速查#13 只保留四项信息＋「关闭」；注意：原型 v3.1.1 中该按钮已移除，实现时勿从旧版原型复刻 | 原型 v3.1.1 评审（详情窗口注释反馈）+ PRD 速查#13 |
| 18 | **已完成窗口与快捷添加同宽 310×640**（取代决策#4 中 272 的设定，簇基准宽相应+38）；空状态文案改为「今天也要继续加油」，统一字体 17px、字距 5px、窗口内水平垂直居中；空状态容器统一改为 flex 居中（快捷添加空态同样受益） | 原型 v3.1.1 评审（已完成窗口反馈） |
| 19 | **两侧窗口阴影调小**：快捷添加/已完成使用小阴影（`0 4px 12px rgba(5,15,35,.22)`），主窗口保持大阴影；实现时面板需分档设置阴影，避免两侧阴影盖到中间窗口 | 原型 v3.1.1 评审（阴影反馈） |
| 15 | **历史记录只显示已结算归档的记录**（不合并当天已完成；当天项在"已完成"窗口，跨天结算后进历史）；历史行正常模式**不渲染勾选框**（仅批量模式出现）；导出 CSV 口径不变（仍含今天已完成，PRD F1） | 原型 v3.1.1 评审（历史口径反馈，对齐 PRD §六） |

## 4. v1.0.1 待实施工作分解（按序执行）

> 每批完成 = 新测试绿 + 全量回归绿 + 提交推送 + CI 绿。粗估总计 2~3 天。

### B0 环境恢复（如新机器/新目录）
`npm ci`（若 electron.exe 缺失：npm 11 会拦截 install-scripts，先 `npm install-scripts approve electron esbuild` 或手动 `node node_modules/electron/install.js`）→ `npm run verify`

### B1 移除点击穿透（决策#1）
- 删 `src/core/utils/hit-test.ts`、`tests/unit/hit-test.test.ts`
- 删 `src/ipc/contract.ts` 的 `IPC.setIgnoreMouseEvents` 通道与 API 声明
- 删 `electron/preload/index.ts` 桥接、`electron/main/index.ts` handler、`tests/helpers/api.ts` mock
- （渲染层本就无人调用，纯删除）

### B2 布局基准 + 主簇重构（决策#4/#7/#8/#12，原型样式落位）
- 新建 `src/core/utils/cluster-layout.ts`：`BASE_PANEL={quick:310,done:310,main:470,height:640}`（**done=310，决策#18**）、`BASE_GAP=12`、`clusterBaseWidth/clusterBounds`（主进程与渲染层单一来源）
- `electron/main/layout.ts` 改为 re-export 该来源（`defaultWindowOptions/initialPos/MIN_SCALE=0.7` 保留）
- `src/panels/AppShell.vue` 重构：stage+cluster 结构；cluster 固定基准尺寸、`zoom: clusterScale`；设计令牌（日 `--accent:#0a63b8` / 夜 `#4cc2ff`、win/card/btn/seg 等全套，来源 docs/交互原型-v3.1.html 的 :root 与 .win/.titlebar/.wbtn/.resize-grip/.btn/.scroll 样式，可直接照抄）
- HomePanel（470 宽）：标题栏拖动区+五按钮（wbtn）、时钟居中分钟制、两行 actions 网格（⚡快捷添加｜☑已完成 / 计数chip｜批量删除｜＋accent）、卡片式事项行（.todo-row 卡片+边框 hover）、右下 resize-grip→`updateUiState({clusterScale})`（主进程 commit 后 syncMainBounds 已按 clusterBounds 改窗口尺寸，二者天然 1:1）
- 拖拽排序（`src/components/useDragSort.ts`）：改为**相邻增量交换**（决策#13）——替换现"越过中线才换位"的 idx 统计算法；注意 src/components/useDragSort.ts 的 handleMove 目前移动不取消（符合），但换位阈值需从中线改为触碰相邻 4px；模板列表同步
- QuickPanel（310）/DonePanel（272）：原型标题栏（批量删除/＋/×关闭面板、排序/×）、卡片行、底注/历史按钮
- **同时更新测试**：`tests/unit/main-layout.test.ts`（尺寸期望 1076×640 等）、`home-panel.test.ts`（时钟正则 `^\d{2}:\d{2}$`）、`app-shell.test.ts`（主题断言改查 `.cluster`）
- 提交 `feat(v1.0.1-B2)`

### B3 二级窗口（决策#5/#6/#7，工作量最大）
- `electron/main/child-windows.ts`：CHILD_SIZES 改上表 8 项，其中**编辑待办 400×430、详情 360×430**（决策#14 校准）；`childWindowOptions(kind, wa, openIndex, groupScale)` 增组缩放参数；`GROUP_OF` 组映射导出（todo-new/todo-edit/detail→todo；template-*→template；history/recycle→history；settings→settings）；各窗口 win-body 底部内边距 24px；缩放角组件为圆角同弧度弧线（决策#16）
- main `openChildWindow`：从 `ctx.current().uiState.childScales[group]` 取缩放
- 新增 IPC `resizeSelf({width,height})`：主进程对 `BrowserWindow.fromWebContents(e.sender).setSize`（钳制屏宽/半屏高）
- `ChildHost.vue`：移除 CSS zoom；保留组映射与 grip（grip→`setChildScale`+`api.resizeSelf`）；`--fs` 机制删除（决策#3）
- 八个页面按原型重制：根 `.win.child`、36px 标题栏（← / 标题 / 保存或×）、win-body 内滚动；**保留全部现有 data-testid**（各页清单见 tests/component/ 对应文件），新增仅 `set-back`、`hist-close`、`recycle-close`
- **详情窗口例外（决策#17）**：以 PRD 速查#13 为准——只渲染四项信息＋「关闭」，无「添加到模板」、无括号注释文字（原型 v3.1.1 已同步移除）
  - 设置页按原型 form-row/divider/seg/stepper/switch 重排，6 项齐全；回收站按分组行+恢复/彻底删除/清空
- 测试：`tests/unit/child-windows.test.ts` 更新尺寸+组缩放用例；settings 增返回用例；其余组件测试保持绿
- 提交 `feat(v1.0.1-B3)`

### B4 托盘隐藏同步子窗口（决策#9）
- main `hideToTray()`：遍历 `childWindows` 逐一 hide；`showWindow()`：逐一 show
- 新增 E2E（system.spec 或新 child.spec）：打开设置子窗口 → `tb-minimize` → evaluate 子窗口 `visible===false` → 恢复 → `true`
- 提交 `fix(v1.0.1-B4)`

### B5 回归与收尾
- 全量 vue-tsc + vitest + playwright；修补失败（只许改选择器/期望到新行为，禁止删测试降标准）
- 确认 fmtTime 分钟制（`src/core/utils/date.ts` 当前仍是 HH:mm:ss，需改 + m1-exit/home-panel 测试期望）
- 历史口径（决策#15）：真实应用 HistoryWindow 目前合并当天已完成（`getDoneForDate` 等价逻辑），需改为仅 archive；历史行去除勾选框（保留批量 selbox）；导出 collectRange 保持含今天已完成（PRD F1 不变）

### B6 交付 v1.0.1
- `npm run dist` → tag `v1.0.1` → push → CI 绿 → `gh release create v1.0.1`（**资产必须 ASCII 名**：DesktopTodo-Setup-1.0.1.exe / DesktopTodo-Portable-1.0.1.exe，中文名上传会 404）
- 更新 `docs/验收报告.md`：v1.0.1 修复记录 + 人工重验清单（拖动、主簇/二级窗口缩放、滚动条、对齐缝隙、返回按钮、分钟时钟、托盘同步隐藏）

## 5. 关键文件地图

```
electron/main/    index.ts(接线/托盘/IPC/广播) · context.ts(AppContext 启动结算/提交/flush)
                  · layout.ts · child-windows.ts · clock.ts(OffsetClock E2E)
                  · single-instance/auto-start/window-state/tray-menu/icon
electron/preload/ index.ts（typed API 桥接）
src/core/         models(factories/defaults) · services(overdue/settlement/limits/
                  templates/recycle/csv/settings) · utils(date/cluster-layout/hit-test*
                  /screen-clamp/tuck/scale) · constants
src/panels/       AppShell(簇布局+令牌) · HomePanel · QuickPanel · DonePanel
src/windows/      ChildHost(路由+组缩放) + 8 个窗口页
src/stores/       app(领域动作+持久化) · ui(批量/确认框/tuck 状态机/子窗口)
src/ipc/          contract.ts（typed IPC 契约）
tests/            unit / component / e2e / helpers(api.ts 内存 API·mount.ts)
```
（*hit-test.ts 随 B1 删除）

## 6. 环境与踩坑记录（本会话实测，务必阅读）

1. **Windows + Git Bash**：Windows 原生 python 不识别 `/tmp` 路径——脚本内一律用项目相对路径
2. **npm 11 install-scripts 拦截**：安装后 electron.exe 缺失时 `npm install-scripts approve electron esbuild` 或 `node node_modules/electron/install.js`
3. **E2E 断言异步副作用**：主进程异步写盘（如 CSV 导出）必须轮询等待文件就绪，CI 机器时序不同（曾致 CI 红灯）
4. **退出丢数据**：`before-quit` 必须 preventDefault → await 落盘 → 再 quit（异步 flush 会被进程退出截断，E2E 验收6 曾抓出）
5. **销毁窗口访问**：一切窗口引用经 `safeWin()` 守卫（曾致主进程原生弹窗阻塞退出）
6. **preload**：新窗口 webPreferences 必须显式传 preload 路径（主窗口曾漏装导致 API 不可用）
7. **多窗口状态**：任一窗口 commit 后向**所有**窗口广播最新 AppData（防子窗口编辑后主窗口陈旧）
8. **E2E 稳定性**：playwright timeout 已设 240s；点击前注意子窗口关闭后的 disabled 解锁时序（child `close` 事件提前解锁）
9. **发布**：Release 资产用 ASCII 文件名；gh 已登录（Richardo-X），`gh repo view` 可验
10. **恢复环境**：`npm ci` → `npm run verify`；打包 `npm run dist`

## 7. 人工验收状态（第一轮）

| 项 | 状态 |
|----|------|
| 1 托盘显隐 / 2 托盘退出 | ✅ 通过 |
| 3 缝隙点击桌面 | ⚪ 用户豁免（功能已按决策#1 移除） |
| 8 托盘隐藏时二级窗口不隐藏 | 🔧 v1.0.1 B4 修复 |
| 9 真实重启自启 | ⏳ 后置（登录项写入已由 E2E 断言） |
| 拖动/缩放/样式/对齐/返回按钮/分钟/滚动条 | 🔧 v1.0.1 本轮全部实施（原型已确认） |
