# HANDOFF · 开发交接文档

> **2026-10-17 更新：v1.1.6 已发布**（缩进系统改造 WPF 方式：白条独立窗+整组离屏；缩进锁定×托盘修复；白条点击移除；快捷窗命中修复；换屏缩放修复）。应用当前状态=三窗+白条独立窗架构 + L1/L2 视觉语言；当前版本号 1.1.6。详见 §11.K（v1.1.5 见 §11.J）。

> **缩进系统改造（WPF 方式，无过渡动画+集合不变）已完成并随 v1.1.6 发布**（说明书 docs/缩进改造-WPF方式-体验说明书.md；用户裁定：白条位置=现状口径〔主窗上缘中心、不算侧窗〕）。后续可选：在这套位移结构上接 0.18s 过渡动画（不再动语义）。见 §11.K。

> **2026-10-19 安装形态已统一**：用户选定“升级安装版到 1.1.6”——安装版已从 v1.1.4 覆盖升级至 v1.1.6（`%LOCALAPPDATA%\Programs\desktop-todo`），便携版已正常退出；今后以安装版为唯一运行形态。便携版 exe 仍保留作应急，但与安装版共用单实例锁与 `%APPDATA%\桌面待办\data.json`（不能同时运行）。**自 2026-10-19 起新版本不再产出便携版**（package.json 已移除 portable target；现存 v1.1.6 便携版 exe 作为历史产物保留在 `dist-v1.1.6`）。升级前备份与数据核验见 §11.M。

> **2026-10-19 原型已同步至 v3.5-L2.1**：v1.1.3~v1.1.6 的二级窗/批量条/白条/缩进改造 + §11.E 7 项 + 设置窗旧漂移均已镜像；行为类修复只标注。新基准=`docs/交互原型-v3.5-L2.1.html`（`v3.5-L2` 保留为 pre-sync 对照）。详见 §11.N。

> **2026-10-19 三处提示已全部通过并落地源码**：设置页版本号（getVersion）、设置页边界提示、快捷窗模板满额提示已实现；单测 397/397、E2E 87/87、typecheck/build 全绿；安装版 v1.1.6 未升级/未发版。唯一实现偏差：设置页顶部留白 36→34px 消除 2px 溢出（提示仍在 38px、水平居中；版本行贴底）。见 §11.U。

> **2026-10-16 待验收一轮（未发版）**：缩进白条减半（热区 12→6、可见条 6→3）+ 缩进期间屏内可见区=热区本身（系统最小窗高撑出的余高挂屏幕上方，白条以外不吞鼠标）——见 §11.J。

> 本文档供新开发会话使用。阅读顺序：**本文件 → PRD.md → 需求文档.md → 开发计划.md**，UI 与交互以 **docs/交互原型-v3.5-L2.1.html（= 应用 v1.1.6 实施同步；v3.5-L2 为 pre-sync 对照，v3.4-L1 为上一级）** 为基准（v3.3 为纯净基线，勿动）。冲突裁决顺序：用户当次指示 > PRD/需求文档 > 原型 > 本文件。

---

## 1. 项目概况

- **产品**：桌面待办（DesktopTodo）——Windows 桌面待办悬浮小组件。本地优先、免登录、不联网、数据存 `%APPDATA%\桌面待办\data.json`
- **技术栈**：Electron 44 + TypeScript(strict) + Vue 3 + Pinia；Vitest + @vue/test-utils（单元/组件）；Playwright `_electron`（E2E）；electron-vite + electron-builder
- **仓库**：github.com/Richardo-X/DesktopTodo（私有），远程 `origin/main`，CI=GitHub Actions（windows-latest，typecheck+test+build+e2e）
- **质量基线**：单元/组件 282 用例 + E2E 14 用例全绿；core 层行覆盖 96.8%（门槛 90%，vitest.config thresholds）
- **角色与纪律**：你是开发者。严格 TDD（红→绿→重构，禁止先实现后补测试）；测试与实现分笔提交；格式 `test(v1.0.1-B#): …` / `feat(v1.0.1-B#): …` / `fix(v1.0.1-B#): …`；每批全量测试绿后提交推送，CI 必须绿；**PRD 未覆盖的细节停下来问用户，不要自行发挥**
- **问题记录文件（docs/问题记录.md，2026-10-06）**：用户反馈分类日志，每轮反馈分类追加（基于当轮记忆追加，不重读全文）；**不进默认阅读链——仅用户明确要求时才读取**
- **方案冲突规则（2026-10-06，纪律级）**：新方案与旧方案/既有定稿冲突时，必须停下向用户报告——冲突是什么、影响有哪些、牵连哪些功能（尽量详细不遗漏），由用户决策，**不得代做决定**
- **体验说明书纪律（2026-10-07 用户采纳）**：每批开发前先交一页「体验说明书」（纯用户视角：会看到什么变化、怎么操作、什么算通过），用户批准后才动代码
- **架构定论（D6，2026-10-07）**：用户对比单窗对照版（v1.0.8 快照，C:/Users/qq463/AppData/Local/Temp/dtodo-sw-app/）与三窗版后裁定**维持三窗架构**；方案 C 单窗关闭。对照版与工作区（F:/AI/VBcode/worktrees/ToDoList-sw，v1.0.8+改名）保留待用户处理；托盘名临时区分「桌面待办三窗版/单窗版」
- **置顶语义最终版（2026-10-07）**：未置顶=普通窗口层级（不沉底、NOACTIVATE 已删、点击浮上来获焦点）；置顶=最上层。挂件态机制（setFocusable(false)/enterWidgetMode/失焦沉底/pendingSinkOnBlur）已全套删除；窗口断言必须用真实样式位（test:exstyle 钩子）——Electron isFocusable() 与 NOACTIVATE 位脱节（实测）

## 2. 当前状态（⚠️ 本节为历史快照——最新状态与待办见 §10.4/§10.6，2026-10-08）

- **v1.0.8 已发布**（tag/Release，黑块真因修复+三项确定性修复，详见验收报告 v1.0.7/v1.0.8 章节）
- **第五轮真机验证结论（用户确认）**：黑块 ✓ 解决；缩进闪烁/提前缩回 ✓ 解决；批量禁缩进 ✓；缩进锁定 ✓；批量条按钮 ✓；**缩放抖动不可接受 → 已批准启动三窗分离架构重构**
- **新工作流纪律（用户裁定，最高优先级）**：改动大的开发先**升版交互原型（v3.1 → v3.2）交用户确认 UI/交互，确认后才对应实施**；后续 UI 样式/排列类优化一律「原型先行」
- **新需求（用户提出）**：待办列表布局放宽——撤销「10 项满载无滚动」规则、事项块加大排列放松、超范围引入滚动条、滚动条放列表与窗口边缘之间缝隙（复用 DonePanel 的 useOverlayThumb 自绘滑块机制）
- **连带待决（原型对比后用户定）**：操作区图标按钮现 30×30（当初因满载规则回退），规则撤销后是否恢复 36×36
- **质量基线**：331 单元/组件 + 30 E2E 全绿 + 覆盖率门槛
- **新会话第一任务**：见 §9（原型 v3.2 → 批次 A/B/C → 发版 v1.1.0）

## 3. 已确认决策清单（实现时必须遵守）

| # | 决策 | 来源 |
|---|------|------|
| 1 | **点击穿透彻底移除**（含 IPC/preload/命中检测代码与测试；缝隙不响应桌面操作，不再是验收项） | 用户裁定（验收反馈#5"不重要"） |
| 2 | **时钟显示精确到分钟**（HH:mm / h:mm AM/PM；内部仍每秒刷新） | 验收反馈#7 + PRD v1.1 #2 |
| 3 | **移除"字体大小"设置项**：文字随窗口缩放同步等比变化（无独立字体系数；删 settings 第 3 项与 --fs 档位机制） | 原型评审确认 + PRD v1.1 #8 |
| 4 | **面板尺寸基准（原型 v3）**：主窗 470×640、快捷添加 310×640、已完成 272×640，顶边对齐、间隙 12px | 验收反馈#4 + 原型提取 |
| 5 | **二级窗口尺寸基准**：新增待办 360×360、编辑待办 360×400、新建模板 360×360、编辑模板 360×380、详情 360×400、历史 560×540、设置 400×470、~~回收站 420×480~~（回收站一项随 #21 移除，最终 7 项；编辑待办/详情尺寸后经 #14 校准）；按类别组共享缩放（事项/模板/设置/历史） | PRD v1.1 #5 + 原型 |
| 6 | **二级窗口关闭规范**：表单类（新增/编辑事项、新建/编辑模板、设置）＝标题栏左「←」返回（无×，编辑类标题栏右「保存」）；浏览类（详情/历史）＝标题栏右「×」 | 验收反馈#6 + 原型 openChild |
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
| 20 | **窗口缝隙 12px → 6px**（簇基准宽相应 -12） | 原型 v3.1.1 评审（缝隙反馈） |
| 15 | **历史记录只显示已结算归档的记录**（不合并当天已完成；当天项在"已完成"窗口，跨天结算后进历史）；历史行正常模式**不渲染勾选框**（仅批量模式出现）；导出 CSV 口径不变（仍含今天已完成，PRD F1） | 原型 v3.1.1 评审（历史口径反馈，对齐 PRD §六） |
| 21 | **回收站机制彻底移除**（2026-09-24 用户指示）：删除（单条/批量/清空）确认后直接永久删除、不可恢复，无任何恢复入口；设置页回收站区块（清理时限＋入口）删除→设置页 4 项；RecycleWindow/回收站服务/数据字段/自动清理/相关测试全删；删除确认框文案＝「删除后无法恢复」类；PRD/需求文档已同步升 v1.2 | 用户当次指示 |
| 22 | **危险按钮 hover 修正**：通用 `.btn:hover` 白底会盖掉 danger 红底（hover 时白底白字不可见）；修正＝danger 按钮 hover 深红 `#a9271c`；原型 HTML 已同步修，实现照抄 | 用户报告（批量删除「删除所选」/确认框红色「删除」hover 变白） |
| 23 | **初始缩放按半屏钳制**：启动/恢复时 `clusterScale = min(存值, 半屏高/基准高640, 屏宽/簇基准宽)`（复用 clampClusterScale 语义，纯函数+单测）；1080p 等矮屏首启约 0.81 | 用户裁定（PRD §8.1「高度≤半屏」与基准高 640 在矮屏上的冲突处理） |
| 24 | **子窗口缩放内容适配＝内容按基准尺寸渲染 + zoom=组缩放 + 真窗口 resize 到 base×scale**：文字随窗口等比缩放、内容恰好填满真窗口（决策#3/#7 落实）；B3 原文「移除 CSS zoom」指移除旧「只 zoom 不改真窗口」机制 | 用户裁定（2026-09-24，原 B3 文字与决策#3 冲突） |
| 25 | **批量删除选中示意**（2026-09-24 用户确认「这版效果可以，确定修改」）：批量模式**不引入独立选择圈**——右端控件位显示与完成勾选框**同款**的方框勾选框，仅作「是否选中」示意（选中＝蓝底白勾＋整行 `selrow` 高亮，点击行或勾选框均可切换）；批量模式下**拖拽禁用**（拖拽柄置灰保留、不可拖）且**完成功能禁用**；模板列表批量时右端「＋」换为同款勾选框；历史列表批量时行尾出现同款勾选框（正常模式仍无勾选框，#15 不变）；圆形选择圈（.selbox）方案已否决并从原型移除 | 用户确认（原型 v3.1.2 评审） |

## 4. v1.0.1 待实施工作分解（按序执行）

> 每批完成 = 新测试绿 + 全量回归绿 + 提交推送 + CI 绿。粗估总计 2~3 天。

### B0 环境恢复（如新机器/新目录）
`npm ci`（若 electron.exe 缺失：npm 11 会拦截 install-scripts，先 `npm install-scripts approve electron esbuild` 或手动 `node node_modules/electron/install.js`）→ `npm run verify`

### B1 移除点击穿透（决策#1）
- 删 `src/core/utils/hit-test.ts`、`tests/unit/hit-test.test.ts`
- 删 `src/ipc/contract.ts` 的 `IPC.setIgnoreMouseEvents` 通道与 API 声明
- 删 `electron/preload/index.ts` 桥接、`electron/main/index.ts` handler、`tests/helpers/api.ts` mock
- （渲染层本就无人调用，纯删除）

### B1.5 移除回收站（决策#21，2026-09-24 新增；文档已先行落库）
- 删 `src/windows/RecycleWindow.vue`、`src/core/services/recycle.ts`、`tests/unit/recycle.test.ts`、`tests/component/recycle-window.test.ts`
- models 删 recycle 数据字段（normalize 丢弃遗留数据）；settlement/context 移除 purgeExpired 自动清理调用；stores 删恢复/清空 action
- SettingsWindow 删回收站区块（set-recycle-*）；ChildHost 路由/`ChildKind`/`CHILD_SIZES`/`GROUP_OF` 删 recycle
- 删除确认框文案统一为「删除后无法恢复」类
- E2E main-flow 批量删除段改「直接消失」；完成后全仓 grep recycle 应清零
- 提交 `test(v1.0.1-B1.5)` → `feat(v1.0.1-B1.5)`

### B2 布局基准 + 主簇重构（决策#4/#7/#8/#12，原型样式落位）
- 新建 `src/core/utils/cluster-layout.ts`：`BASE_PANEL={quick:310,done:310,main:470,height:640}`（**done=310，决策#18**）、`BASE_GAP=6`（决策#20）、`clusterBaseWidth/clusterBounds`（主进程与渲染层单一来源）
- `electron/main/layout.ts` 改为 re-export 该来源（`defaultWindowOptions/initialPos/MIN_SCALE=0.7` 保留）
- `src/panels/AppShell.vue` 重构：stage+cluster 结构；cluster 固定基准尺寸、`zoom: clusterScale`；设计令牌（日 `--accent:#0a63b8` / 夜 `#4cc2ff`、win/card/btn/seg 等全套，来源 docs/交互原型-v3.1.html 的 :root 与 .win/.titlebar/.wbtn/.resize-grip/.btn/.scroll 样式，可直接照抄）
- HomePanel（470 宽）：标题栏拖动区+五按钮（wbtn）、时钟居中分钟制、两行 actions 网格（⚡快捷添加｜☑已完成 / 计数chip｜批量删除｜＋accent）、卡片式事项行（.todo-row 卡片+边框 hover）、右下 resize-grip→`updateUiState({clusterScale})`（主进程 commit 后 syncMainBounds 已按 clusterBounds 改窗口尺寸，二者天然 1:1）
- 拖拽排序（`src/components/useDragSort.ts`）：改为**相邻增量交换**（决策#13）——替换现"越过中线才换位"的 idx 统计算法；注意 src/components/useDragSort.ts 的 handleMove 目前移动不取消（符合），但换位阈值需从中线改为触碰相邻 4px；模板列表同步
- **批量模式行渲染（决策#25）**：右端勾选框原位作「是否选中」示意（与完成勾选框同款样式，选中＝蓝底白勾＋`selrow` 高亮，点击行或勾选框切换）；拖拽柄置灰禁用；完成功能批量下禁用；QuickPanel/模板与历史列表同理
- QuickPanel（310）/DonePanel（310）：原型标题栏（批量删除/＋/×关闭面板、排序/×）、卡片行、底注/历史按钮
- **阴影分档（决策#19）**：主窗 `.win` 保持大阴影（`0 18px 60px rgba(5,15,35,.5)`）；快捷添加/已完成两侧面板覆盖为小阴影（`0 4px 12px rgba(5,15,35,.22)`），避免投射到主窗
- **初始缩放钳制（决策#23）**：启动/恢复时 `clusterScale = clampClusterScale(存值, 基准簇尺寸, 工作区)`（纯函数已存在，补单测）；1080p 首启约 0.81
- **同时更新测试**：`tests/unit/main-layout.test.ts`（尺寸期望 1102×640 等，全开簇=470+310+310+间隙6×2）、`home-panel.test.ts`（时钟正则 `^\d{2}:\d{2}$`）、`app-shell.test.ts`（主题断言改查 `.cluster`）
- 提交 `feat(v1.0.1-B2)`

### B3 二级窗口（决策#5/#6/#7/#14/#16/#17/#24，工作量最大）
- `electron/main/child-windows.ts`：CHILD_SIZES 改 **7 项**（回收站随 #21 移除），其中**编辑待办 400×430、详情 360×430**（决策#14 校准）；`childWindowOptions(kind, wa, openIndex, groupScale)` 增组缩放参数；`GROUP_OF` 组映射导出（todo-new/todo-edit/detail→todo；template-*→template；history→history；settings→settings）；各窗口 win-body 底部内边距 24px；缩放角组件为圆角同弧度弧线（决策#16）
- main `openChildWindow`：从 `ctx.current().uiState.childScales[group]` 取缩放
- 新增 IPC `resizeSelf({width,height})`：主进程对 `BrowserWindow.fromWebContents(e.sender).setSize`（钳制屏宽/半屏高）
- `ChildHost.vue`：移除 CSS zoom；保留组映射与 grip（grip→`setChildScale`+`api.resizeSelf`）；`--fs` 机制删除（决策#3）
- 七个页面按原型重制：根 `.win.child`、36px 标题栏（← / 标题 / 保存或×）、win-body 内滚动；**保留全部现有 data-testid**（各页清单见 tests/component/ 对应文件），新增仅 `set-back`、`hist-close`
- **详情窗口例外（决策#17）**：以 PRD 速查#13 为准——只渲染四项信息＋「关闭」，无「添加到模板」、无括号注释文字（原型 v3.1.1 已同步移除）
  - 设置页按原型 form-row/divider/seg/stepper/switch 重排，**4 项齐全（上限/时制/导入/自启）**——字体项随决策#3 删、回收站项随决策#21 删
- 测试：`tests/unit/child-windows.test.ts` 更新尺寸+组缩放用例；settings 增返回用例；其余组件测试保持绿
- 提交 `feat(v1.0.1-B3)`

### B4 托盘隐藏同步子窗口（决策#9）
- main `hideToTray()`：遍历 `childWindows` 逐一 hide；`showWindow()`：逐一 show
- 新增 E2E（system.spec 或新 child.spec）：打开设置子窗口 → `tb-minimize` → evaluate 子窗口 `visible===false` → 恢复 → `true`
- 提交 `fix(v1.0.1-B4)`

### B5 回归与收尾
- 全量 vue-tsc + vitest + playwright；修补失败（只许改选择器/期望到新行为，禁止删测试降标准）
- 确认 fmtTime 分钟制（已在 B2 落地：`src/core/utils/date.ts` 改 HH:mm / h:mm AM/PM + m1-exit/home-panel 测试期望，此处仅回归确认）
- 历史口径（决策#15）：真实应用 HistoryWindow 目前合并当天已完成（`getDoneForDate` 等价逻辑），需改为仅 archive；历史行去除勾选框（保留批量 selbox）；导出 collectRange 保持含今天已完成（PRD F1 不变）

### B6 交付 v1.0.1
- `npm run dist` → tag `v1.0.1` → push → CI 绿 → `gh release create v1.0.1`（**资产必须 ASCII 名**：DesktopTodo-Setup-1.0.1.exe / DesktopTodo-Portable-1.0.1.exe，中文名上传会 404）
- 更新 `docs/验收报告.md`：v1.0.1 修复记录 + 人工重验清单（拖动、主簇/二级窗口缩放、滚动条、对齐缝隙、返回按钮、分钟时钟、托盘同步隐藏、危险按钮 hover、删除即永久删除[回收站已移除]）

## 5. 关键文件地图

```
electron/main/    index.ts(接线/托盘/IPC/广播) · context.ts(AppContext 启动结算/提交/flush)
                  · layout.ts · child-windows.ts · clock.ts(OffsetClock E2E)
                  · single-instance/auto-start/window-state/tray-menu/icon
electron/preload/ index.ts（typed API 桥接）
src/core/         models(factories/defaults) · services(overdue/settlement/limits/
                  templates/csv/settings) · utils(date/cluster-layout/hit-test*
                  /screen-clamp/tuck/scale) · constants
src/panels/       AppShell(簇布局+令牌) · HomePanel · QuickPanel · DonePanel
src/windows/      ChildHost(路由+组缩放) + 7 个窗口页
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
11. **打版与冒烟（必须）**：用户已设 Defender 排除项，`npm run dist` 正常一次通过；**若在项目 dist 目录报 EPERM rename win-unpacked.tmp（第三方杀软/目录监控占用，2026-09-26 实测连续复现）——备用方案：`npx electron-builder -c.directories.output=C:/Users/qq463/AppData/Local/Temp/dtodo-dist` 输出到工作区外再复制回 dist（冒烟脚本直接指向临时 win-unpacked 即可）**；**严禁**再启用 electronDist 打包配置（会产生 GPU/渲染进程崩溃的坏包：进程活着但窗口永不显示）；**每次打版后必须冒烟**——启动 `dist/win-unpacked/桌面待办.exe`（DTODO_USER_DATA 指向临时目录），10 秒后 `MainWindowHandle` 非零才算交付；开发调试用 `DTODO_USER_DATA=<临时目录> npm run dev`（先 taskkill electron.exe 清单实例锁，避免被单实例顶掉）

## 7. 人工验收状态（第一轮）

| 项 | 状态 |
|----|------|
| 1 托盘显隐 / 2 托盘退出 | ✅ 通过 |
| 3 缝隙点击桌面 | ⚪ 用户豁免（功能已按决策#1 移除） |
| 8 托盘隐藏时二级窗口不隐藏 | 🔧 v1.0.1 B4 修复 |
| 9 真实重启自启 | ⏳ 后置（登录项写入已由 E2E 断言） |
| 拖动/缩放/样式/对齐/返回按钮/分钟/滚动条 | 🔧 v1.0.1 本轮全部实施（原型已确认） |

## 8. 第二轮人工验收反馈记录（2026-09-25，v1.0.1 成品；用户逐项汇报）

> 原型恢复（3143ff5）后用户以成品 exe 重验。约定：本轮只优先修「组件/子窗口外滚动条」，其余问题记录后统一汇总讨论。

### 8.1 重验清单结果（12 项）

| # | 项 | 结果 | 备注 |
|---|-----|------|------|
| 1 组件拖动 | ✅ 通过 | |
| 2 主簇缩放 | ⚠️ 基本通过 | 窗口样式仍有问题（用户后述）→ 与 #3 同根因，本轮已修 |
| 3 二级窗口缩放 | ❌ 不通过 | 整体样式与原型不同；缩放角标不在窗口上；「像窗口被套在隐形窗口里」→ 本轮已修（根因见 8.3） |
| 4 滚动条 | ⚠️ 算通过 | 窗口外框无滚动条，但组件整体/二级窗口外仍有页面滚动条 → 本轮已修 |
| 5 布局对齐 | ✅ 通过 | |
| 6 返回/关闭按钮 | ❌ 不通过 | 详情窗口未见标题栏「×」（B3 漏做，决策#6 浏览类应有）；另有按钮位置问题（见 8.2-6） |
| 7 分钟时钟 | ✅ 暂时通过 | 时钟样式暂定，待定事项延后 |
| 8 托盘同步显隐 | ✅ 暂时通过 | 待窗口缩放修复后复验 |
| 9 删除即永久删除 | ✅ 通过 | |
| 10 危险按钮 hover | ✅ 通过 | 附带问题见 8.2-5 |
| 11 设置页 4 项 | ✅ 通过 | |
| 12 历史口径 | ❌→✅ 已澄清并实施 | 用户裁定：历史窗口**默认定位当天的前一天**（不显示今天；前一天为空就显示空）；仅显示已归档记录不变；导出仍含今天已完成（PRD F1）。已实施并回归 |

### 8.2 用户另报问题（待汇总讨论优化方案，尚未实施）

| # | 问题 | 初步定位 |
|---|------|----------|
| 1 | **置顶只作用于三个一级窗口**：置顶状态打开二级窗口被压在一身后且模态锁定 → 表现为卡死；且要求「整个组件置顶」；重启后置顶状态丢失 | 子窗口创建未带 alwaysOnTop；重启丢失需查 applyTopMost 时序（show 前 setAlwaysOnTop 可能被覆盖） |
| 2 | 快速连点模板行「＋」会触发行双击→弹出编辑模板窗口 | 行 dblclick 未被 plusbox 阻断（click.stop 不拦 dblclick），plusbox 需 @dblclick.stop |
| 3 | 批量删除进行中其他组件仍可操作 | 需求：批量模式下禁用其余组件操作（范围待讨论） |
| 4 | 导入/导出系统文件对话框关闭后，设置等二级窗口落到一级窗口之后 | 对话框焦点归还后子窗口需重新置顶/聚焦 |
| 5 | 未选择事项点「删除所选」也弹确认框 | 期望：不弹确认，提示「没有选择要删除的事项」 |
| 6 | 表单类子窗口底部提交按钮（新建事项/新建模板）在左下角，应在右侧 | B3 样式精简时丢失 .footer justify-content:flex-end（截图 3/4 证实） |
| 7 | **Win+D「显示桌面」会把组件一起最小化（消失）**（2026-09-25 补报）：用户期望组件隐藏仅限三种途径——双击托盘图标、托盘右键菜单显隐、主窗右上角 ×；Win+D 不应影响组件。根因：组件是普通 BrowserWindow，skipTaskbar 不豁免 Win+D 的系统级全部最小化。未来可选方案：监听 minimize 事件立即恢复，或改用工具窗口样式（WS_EX_TOOLWINDOW）。**用户指示：记录备查，暂不开发优化** | 用户报告（2026-09-25） |

### 8.3 待办清单（2026-09-25 已全部完成——#1~#7 随 v1.0.2 发布，#8 记录备查，#9 发版完成）

| # | 项 | 状态与要点 |
|---|-----|-----------|
| 1 | **二级窗口初始尺寸加大** | ✅ 已按 +15% 方案随 v1.0.2 发布（todo-new 410×410、todo-edit 460×490、template-new 410×410、template-edit 410×435、detail 415×490、history 645×620、settings 460×540）；**用户指示：待其对最新版成品验证后再定是否调整**（改 CHILD_SIZES + tests/unit/child-windows.test.ts + PRD 附录三处） |
| 2 | **置顶改为「整个组件含二级窗口」** | ✅ 子窗口创建/ready-to-show 带 alwaysOnTop（与主窗同 screen-saver 层级）；开关同步主窗+全部子窗；托盘恢复/单实例唤起后重应用；主窗构造期+show 后双点应用。「重启丢失」在本机 E2E 未复现（可能为用户环境时序），已做防御性修复并以三条 E2E 覆盖（置顶时子窗同步置顶/重启保持/托盘恢复保持）；假死根因（子窗无置顶被模态锁定压身+后）已修 |
| 3 | **批量删除进行中禁用其他组件操作** | ✅ **用户已确认「全禁」**：批量期间仅当前批量列表行点选+批量条可操作；主窗标题栏 5 按钮+操作区 4 按钮冻结、另两面板整面板冻结、历史翻页/日期/导出区冻结（`.frozen`：pointer-events:none + 45% 透明，src/styles/global.css） |
| 4 | **导入/导出文件对话框关闭后，二级窗口掉到一级窗口之后** | ✅ `refocusChildWindows`（window-state.ts）：saveCsv/openCsv handler finally 中 moveTop 全部子窗+focus 发起窗口 |
| 5 | **模板「＋」快速连点误触编辑** | ✅ plusbox 加 `@dblclick.stop` |
| 6 | **未选中事项点「删除所选」也弹确认框** | ✅ **用户已定稿「按钮禁用」方案（v1.0.3）**：一行未选时「删除所选」disabled 置灰不可点，至少选中一项才可点击；BatchBar `:disabled="ui.selectedIds.length===0"`（取代 v1.0.2 短暂采用的红字提示方案）；PRD §5.2/需求文档 §三已同步 |
| 7 | **表单类子窗口提交按钮在左下角** | ✅ child-window.css `.footer` 补 `justify-content:flex-end` |
| 8 | Win+D 显示桌面最小化组件 | 记录备查、暂不优化（§8.2-7） |
| 9 | **v1.0.2 收尾发版** | ✅ 升版 1.0.2 → `npm run dist` → 冒烟通过（scripts/smoke.ps1）→ tag v1.0.2 → CI 绿 → Release 发布（ASCII 资产名）→ docs/验收报告.md v1.0.2 章节 |

- **根因一（全局）**：渲染层从无 body 复位（src/styles/ 为空、index.html 无样式），浏览器默认 body margin 8px 使 100vw/100vh 页面溢出 16px → 主簇与所有子窗口出现页面滚动条（v1.0.0 验收反馈#2/决策#12 的遗留欠账）。修复＝新增 `src/styles/global.css`（html,body margin:0/overflow:hidden）并在 main.ts 导入。
- **根因二（缩放，用户感知的「隐形窗口」）**：`.cluster`/`.child-root` 采用「100vw/100vh 尺寸 + zoom」——CSS zoom 会把按视口计算的尺寸**再乘一次缩放**：scale>1 时内容渲染为视口的 scale 倍（巨大窗口+滚动条）；scale<1 时内容只占窗口一角、缩放角标贴在真窗口角上脱离可见卡片。修复＝zoom 容器尺寸改为 `calc(100vw/scale)×calc(100vh/scale)`（zoom×尺寸=视口，任意缩放恰好填满真窗口）。
- **关于用户提议「暂时取消缩放上下限」**：诊断结论为与上下限无关（上限是 PRD 速查#7 硬性要求+决策#23 用户已确认；取消只能让默认 scale=1 时掩盖问题，拖动后仍复现）。故保留上下限，直接修尺寸公式。
- 回归：280 单元/组件用例 + 15 E2E + 覆盖率门槛全绿。

### 8.4 本轮已实施修复续（8.3 插入前的记录，均已完成并 CI 绿）

- **滚动条三阶段演化（最终=自绘悬浮）**：①9px 简约样式（用户指出仍覆盖行）→ ②14px 预留带（用户指出改变列表样式，回退）→ ③`overflow-y:scroll` 恒定槽位（用户否决：不溢出也显示）→ **终案：自绘悬浮滑块**——`src/components/useOverlayThumb.ts`（组合函数：thumbGeometry 纯函数+滑块拖拽+ResizeObserver 跟随；reactive 状态防 Vue 模板不解包坑），仅接 **已完成面板 DonePanel.vue + 历史窗口 HistoryWindow.vue**（待办/模板上限 10 条永不溢出，保持原生 auto）；`.hide-native-bar` 隐藏原生滚动条、`.list-wrap`+`.list-thumb` 滑块绘制于**行右缘与窗口边框之间**（right:-11px 落在 win-body 14px 内边距带），行宽恒定（E2E 断言：溢出/不溢出行宽一致+滑块左缘≥行右缘）
- **主窗锚定→恒定槽位**：先做过 anchoredMainX（面板开关反移窗口），用户仍见残影 → 终案=恒定三段槽位（快捷 -316/主窗 0/已完成 +476，面板 visibility:hidden 占位显隐，窗口几何与主窗位置永不变）
- **三根因修复**：全局 `*{box-sizing:border-box}`（面板 312>310 被裁）、面板 visibility 占位（display:none 塌陷挤动主窗）、child-root 高度链（子窗口内容 296<窗口 360 显示不全）
- **原型组缩放重做**：`clampChildGroupScale`（上限 1.6/屏幕-24/下限 0.7/步进 0.05），childWindowOptions 同口径；resizeSelf 主进程临时解除 resizable 修复 Windows「缩小不生效」；ChildHost 无 zoom（内容流式）
- **其他**：主窗列表垂直压缩（10 项满载无滚动条，E2E 断言）、排序按钮原型 SVG 图标、历史窗口默认定位当天的前一天（用户裁定）、E2E 布局断言按有效缩放动态推导（CI 小屏钳 0.7 兼容）
- 最终回归：**282 单元/组件 + 19 E2E + 覆盖率门槛全绿**；打版+冒烟验证通过，用户确认显示与滚动条通过

---

## 8.5 第三轮人工验收反馈记录（2026-09-26，v1.0.3 成品；8 项全部实施）

| # | 反馈 | 定稿/实施 | 关键点 |
|---|------|-----------|--------|
| 1 | 缩进触发间距 | ✅ SNAP_THRESHOLD 26→0；吸附时贴齐 wa.y | detectSnap 内 flush，setPosition 触发 moved 重入有守卫 |
| 2 | 缩进白条丑+感应范围大 | ✅ 胶囊 160×6（TUCK_BAR_WIDTH=160）；缩进时窗口 setBounds 收窄为 tuckBarBounds（cluster-layout 纯函数）；mouseenter 移绑胶囊元素 | Windows 系统最小高度 ~39px 钳制（setMinimumSize 不豁免），E2E 按 ≤40 断言 |
| 3 | 弹出后拖动变白条 | ✅ tuck 状态机加 moving/moveAt + window-move 事件；主进程 win.on('move') 150ms 节流→IPC.windowMoving→dispatchTuck；tick 中空闲 TUCK_MOVE_IDLE_MS(500) 解除 | 根因：原生拖动开始时渲染层伪 mouse-leave+仍吸附→400ms 自动缩回；移动中 mouse-leave 记录 leaveAt 但 canTuck 阻止生效 |
| 4 | 连点勾选框误开窗 | ✅ createDblClickGuard(450ms)（src/components/useDblClickGuard.ts）；TodoRow.onCheckboxClick/onCheckboxClick mark、onDblClick blocked；DonePanel 同 | 已有 @dblclick.stop 只挡直接命中，挡不住第二击偏出落到行上 |
| 5 | 悬停气泡 | ✅ 照原型 #gbubble 重做：content-bubble.ts（isTruncatedWider/placeBubbleLeft 纯函数+全局单例 reactive）；AppShell Teleport 到 body（zoom 外）+global.css 样式；仅截断弹（inline-block .tt-in 测量）；行左侧定位（用户定稿，不遮列表+屏内钳制）；QuickPanel 模板行补齐 | 块级元素 scrollWidth 恒等于容器宽——必须 inline-block 内层；气泡元素须在 zoom 容器外否则坐标二次缩放 |
| 6 | 窗口阴影去除 | ✅ AppShell 删 --shadow-main/--shadow-side 与 .panel/.tuck-bar box-shadow | 决策#19（阴影分档）随用户新指示作废 |
| 7 | 夜晚黑色长方形 | ✅ 移除 .panel backdrop-filter + #6 去投影消除间隙深色填充 | 两根因叠加；透明窗口合成问题本地无法截图自证，需真机复验 |
| 8 | 主窗标题栏 | ✅ 照原型：tb-left（tb-brand 勾图标+tb-title）+ 单组 .win-actions 五按钮（moon/sun、gear、tuckLock、pin、x SVG 原文 path），42px，tb-theme data-icon=moon|sun | 图标 path 见原型 L1757-1775 |
| 9 | 开机自启未启动 | ✅ syncAutoStartOnBoot（启动时按 settings.autoStart 重写登录项）+ setAutoStart 写后回读返回真实状态 + SettingsWindow set-autostart-error 提示 | 安装版+开关开+完全没启动：疑路径失效或被禁用；代码链路 E2E 本就正确 |

---

## 9. 第五轮反馈与 v1.1.0 三窗分离计划（2026-09-27 定稿；新会话第一任务）

### 9.1 第五轮验证结论
- 黑块 ✓ 解决（v1.0.8 诊断链+修复）、缩进稳定性 ✓（光标轮询后无闪烁/无提前缩回）、批量禁缩进 ✓、缩进锁定 ✓、批量条按钮 ✓
- 缩放抖动不可接受 → **批准三窗分离**：快捷添加/待办/已完成 = 三个独立 BrowserWindow + 行为绑定
- 附带新需求：待办列表布局放宽（见 9.4）
- **新工作流纪律**：UI/交互改动一律「原型先行」（用户确认后才实施），本条与 TDD 同级

### 9.2 三窗分离定稿行为（用户逐条确认，不得擅改）
- A. 拖动绑定：拖任一标题栏 = 三窗整体移动，不存在单窗拖动
- B. 缩进形态：快捷/已完成两窗隐藏 + 待办窗收缩为胶囊（视觉与现状一致）；胶囊水平位置 = 整个组件可见宽度中心（现状规则）
- C. 缝隙穿透：三窗间 6px 缝隙不属于任何窗口，点击直达桌面（用户认可此行为变化）
- D. 层级绑定：任一窗激活 → 三窗同时抬升（防其他软件插入组件中间造成层级交错）
- 缩放：定稿不变（锚点=待办左上角、等比、隐藏不占位）——分离后待办窗自身缩放时不动，抖动结构性根除

### 9.3 质量标准（E/F，用户原话级要求）
- 在**不改变已确定的拖拽逻辑与缩放逻辑**的前提下：移动流畅、**无拖影、无抖动**
- 批次 A 技术验证若达不到 → 立即停下汇报止损，不得硬上

### 9.4 待办列表放宽（新需求，随批次 B 实施）
- 撤销「10 项满载无滚动」规则及其全部间距压缩（时钟/操作区/行距/块高恢复宽松，具体数值以原型 v3.2 为准）
- 事项块加大；待办超出列表可视范围 → 引入滚动条
- 滚动条不挤压列表：放列表与窗口边缘之间的缝隙——**复用 DonePanel 已有的 useOverlayThumb 自绘滑块机制**（hide-native-bar + list-wrap + list-thumb）
- 连带决策：30×30 图标按钮是否恢复 36×36（当初回退原因是满载规则，规则已撤销）——原型对比后用户定
- 连带测试：「10 项满载无滚动」E2E 删除，替换为滚动条行为断言（溢出出现滑块、位置在缝隙、不挤压行宽）

### 9.5 实施批次（每批红→绿→全量→CI）
- **批次 A（技术验证，最先做）**：①手写整体拖动——弃用 app-region 原生拖动，主进程光标轮询（~60fps）三窗同帧 setBounds；②z-order 绑定——任一窗 focus/click → 三窗 moveTop 同升。**跑不通立即汇报止损**
- **批次 B**：三窗几何迁移——anchor/可见性/缩放/吸附/钳制从单窗计算改为逐窗 bounds（quick: 右缘钉锚点、done: 左缘钉待办右缘）；原型确认的列表放宽同步实施
- **批次 C**：缩进胶囊窗化（隐藏快捷/完成+待办窗缩胶囊）、托盘/置顶/模态/批量冻结遍历三窗改造、收尾发版 **v1.1.0**（架构级变更升次版本号）
- 测试影响预估：缩进/锚点/布局类 E2E（tuck-capsule/anchor/main-flow 布局）大面积重写；业务层单测不动

### 9.6 本会话教训与坑（新会话必读）
- **禁止 :global() 与后代选择器混用**——Vue 编译器会丢弃后代限定符（黑块根因：编译出裸 [data-theme=night]{background:#262a34} 涂满主题根）。主题差异一律走 CSS 令牌
- 透明窗黑块排查工具链：capturePage 位图像素采样（BGRA）→ elementsFromPoint 枚举 → 规则穷举（el.matches × 全样式表）→ 构建产物核对（grep out/renderer/assets/*.css）；diag spec 模式见 git 历史（v1.0.8 前后提交）
- 缩进判定 = 主进程光标轮询权威驱动（startCursorPoll 200ms + IPC.cursorInside），DOM mouseenter/leave 禁止参与缩进
- 源码验证一律用 Read 工具，禁止凭记忆拼补丁脚本（本会话曾因此损坏测试文件与误提交，均当场修复）
- CI 屏 1024×768：种子锚点须屏幕无关（两阶段观察→存档→断言）、isVisible 晚于 DOM ready（需 poll）、zoom 亚像素容差 ±0.5、计算值断言勿依赖像素精确
- 本地项目 dist 目录打包会 EPERM（杀软/监控占用）：`npx electron-builder -c.directories.output=<临时目录>` 再复制回 dist
- 已知限制（用户已接受记录）：Win+D 会最小化组件（未来可做 minimize 恢复或 WS_EX_TOOLWINDOW）

### 9.7 原型 v3.2 定稿记录（2026-09-28 全部确认，实施唯一依据）

> 原型文件：`docs/交互原型-v3.2.html`（内含"定稿要点"面板 ①~⑧ 与演示控制台，可直接复现全部定稿形态）。新增决策接续 §3 的 #25 编号。

| # | 决策 | 备注 |
|---|------|------|
| 26 | **缝隙穿透降级**：三窗分离天然达成（6px 缝隙=真实桌面），无需单独开发与验收 | 用户裁定 |
| 27 | **模态锁定图层修复**：基础窗建立层叠上下文（z-index:1），锁定蒙层困于本窗内——修"二级窗口被夹在主窗与蒙层之间"三明治（v3.2 评审发现，Vue/单页同理） | 实施映射批次 C |
| 28 | **模态锁定样式=置灰蒙层维持**（20% 深色）；"只禁点不置灰"经对比**不采纳**。注意：真实成品当前 `setEnabled(false)` 无视觉蒙层，与 PRD 验收 38"蒙层不可点"有差距——批次 C 模态改造时渲染层需配合画蒙层 | 用户裁定 |
| 29 | **批量删除冻结=维持置灰**（45%，`.frozen` 原样）；"只禁点不置灰"同样不采纳 | 用户裁定 |
| 30 | **原型批量条对齐真实成品**：已选 N 项｜全选（全选时变「取消」）｜返回｜删除所选（未选置灰）；永久删除**无撤销**（原型移除回收站时代"5 秒撤销"遗留）；**单目标批量互斥**（同时刻只有一个列表可进批量） | 8.2-3/8.2-6 原有定稿，原型补齐 |
| 31 | **拖动边界=OS 窗口行为**：左右边缘不阻挡、侧窗可悬挂屏外、拖动/点击都不自动移回屏内；仅要求主窗保留 ≥90px 可见（防整簇丢失）；页面级滚动兜底禁止（会诱发点击时自动回移） | 用户裁定（v3.2 评审反馈） |
| 32 | **重启恢复=记忆位置原样恢复**：关闭前悬挂在屏外，重启后仍悬挂原处，不拉回 | 用户裁定 |
| 33 | **分辨率变化/拔显示器**：按「主窗可见」拉回主屏可见范围（侧窗允许悬在屏外） | 用户裁定 |
| 34 | **贴边缩进仅上边缘**（对齐 PRD §8.1）：v3.1 遗留的底部吸附/缩进从原型移除 | 原型对齐既有定稿 |
| 35 | **方形图标按钮全部 32×32**：主窗操作区 + 快捷添加/已完成面板全部方形按钮统一（取代 30/36 之争） | 用户裁定 |
| 36 | **待办列表放宽定稿**：win-body 顶内边距 10px、时钟下间距 10px、操作区下间距 10px、行间隙 8px、事项块内边距 11×12px（行高约 44px）；撤销「10 项满载无滚动」；溢出→**缝隙自绘滑块**（5px 圆角条、位于行右缘与窗框间 -11px 空隙带、可拖拽，复用 useOverlayThumb） | §9.4 数值定稿 |
| 37 | **时钟样式定稿**：时钟+日期**整块行内**——时间+日期一组贴操作区行顶居中于 ⚡ 与 ☑ 之间，**⚡/☑ 上边缘与日期上边缘水平对齐**（行高按 JS 实测日期 offsetTop+32 精确设定）、时钟 38px/日期 15px、**整体不移动**；第一轮"时钟样式暂定"就此闭环 | 用户裁定（多轮对比后） |
| 38 | **Win+D 不影响组件**（8.2-7 旧"记录备查"结论**作废**，用户要求实现）：显示桌面后缩进保持缩进（短条仍显示）、弹出保持弹出、二级窗口不受影响；批次 C 实现，方案=WS_EX_TOOLWINDOW（组件本就 skipTaskbar 无损失），备份=监听 minimize 立即恢复并保持缩进状态；验收=真机 | 用户裁定（2026-09-28） |
| 39 | 历史窗口默认定位当天的前一天（原型对齐二轮验收既有定稿） | 原型补齐 |
| — | **开机自启真机重启测试**：随 v1.1.0 新版成品人工验收（代码链路已有 E2E 覆盖，从 v1.0.1 后置至今） | 验收清单 |

**实施映射**：#29/#30/#35/#36/#37/#39 → 批次 B（列表放宽+几何迁移一并）；#31/#32/#33 → 批次 B 几何（钳制规则重写）；#27/#28 → 批次 C（模态/托盘/置顶遍历三窗）；#38 → 批次 C。批次 A 完成技术验证后才进入上述实施。

### 9.8 批次 A 结论与批次 B 任务分解（2026-09-28）

**批次 A 结论（用户真机验证通过，无止损）**：
- 定稿实现＝主进程 **8ms 光标轮询 + 每帧 setBounds 重申逻辑尺寸** + 三窗同帧定位（`threeWindowBoundsForAnchor` 纯函数）+ 任一窗 focus 三窗 moveTop 同升
- 跨 DPI 双屏（#40 新增决策）：Windows 对移入不同缩放比屏幕的窗口按"建议矩形"改写尺寸，拖动中逐帧复利放大——**每帧重申逻辑尺寸压制**（setPosition 只改位置会复现该问题，已实测）；跨屏瞬态两侧尺寸不一致可接受，批次 B 每窗按所在屏 DPI 定位尽量减小；CI 虚拟屏 OS 对初建窗 bounds 有 ±2 调整（E2E 容差 ±3）
- 提交链：4f068ba(test)→b9c726a(feat 纯函数)→7f3a96e(test)→8d2770d(feat spike)→6586540(CI 容差)→b51b736(8ms 流畅度)→020c26a(DPI 修复)；CI 绿

**批次 B 任务分解（每片红→绿→全量→CI；工作量最大）**：
- **B-1 三窗真实化骨架**：三个 BrowserWindow 常驻渲染真实面板（QuickPanel/HomePanel/DonePanel 迁出单窗）；每窗独立 stage+**设计令牌逐窗应用**（data-theme 目前在 AppShell .stage 上，三窗后每窗渲染树都要有）；主进程 ClusterWindowManager 替代 spike（拖动轮询/同帧定位转正）；入口 main.ts 按 ?panel 分流；移除 DTODO_CLUSTER_SPIKE 开关（三窗为默认路径，回滚靠 git）
- **B-2 跨窗状态同步（最大架构点）**：三窗=三个渲染进程、**Pinia 各自独立**——复用 stateUpdated 广播（数据/主题/计数）；批量模式等瞬态状态需新增广播通道；确认框在发起窗内渲染
- **B-3 几何迁移**：锚点/可见性（隐藏窗 hide 不占位）/缩放（grip→三窗同帧）/吸附（主窗顶边）/钳制（#31 左右不阻挡主窗≥90px、#32 重启原样恢复、#33 分辨率按主窗可见）；**恢复/钳制按窗口实际所在屏 workArea 而非 primary**（双屏修正）；pos 回写（Win+方向键等外部移动经 moved 事件换算锚点）；跨 DPI 每窗处理
- **B-4 渲染层 v3.2 定稿**：列表放宽（#36 间距/行高 44px/缝隙自绘滑块 useOverlayThumb）；时钟整块行内 38px/日期 15px（#37）；方形按钮 32×32（#35）
- **B-5 E2E 重写**：窗口数 1→3（tuck/anchor/main-flow 布局类大面积重写）；删「10 项满载无滚动」改滚动条断言（溢出出现滑块/位置在缝隙/不挤压行宽）；spike spec 转正
- **批次 C（B 后）**：缩进胶囊窗化（两侧窗 hide+主窗收缩胶囊）、托盘/置顶/模态/批量冻结遍历三窗（含 #27 蒙层渲染、#38 Win+D TOOLWINDOW）、收尾发版 v1.1.0

### 9.9 批次 B 完成记录（2026-09-29；§9.5 B-1~B-5 全部落地，CI 绿）

**架构事实（已实现，未提交）**：
- 渲染根 `src/windows/PanelWindow.vue`：每窗=stage(令牌+data-theme 逐窗)+zoom 容器（470/310×640 ÷ scale）+面板；缩进胶囊仅待办窗；`?win=cluster&panel=quick|main|done` 路由；手写拖动=document capture 段 `.titlebar` 命中（排除 button）→ `getApi().clusterDragStart()`，window pointerup → clusterDragEnd
- 主进程 `electron/main/cluster-windows.ts`（生产重写）：createClusterWindows/syncClusterBounds(commit 后单一入口，**不含 tucked**——运行时状态仅 setClusterTucked)/applyClusterBounds（**隐藏窗跳过 setBounds 并登记 pendingBounds，显示时 showSidePanel 先落位**——Windows 对隐藏窗 setBounds 会将其显示，用户实测点击隐藏又弹回）/ready-to-show 按 shouldShowPanel 决定显示（**迟到的 ready-to-show 不得复活已隐藏窗**——同为此实测 bug）/startClusterDrag 8ms 轮询/raiseClusterAll/detectSnap/startTuckCursorPoll(200ms 三窗并集)/hideCluster/showCluster/applyTopMostToCluster/repositionClusterToDisplays/getMainWindow/getClusterAnchor
- index.ts：单窗 createWindow 已删，全部经 cluster-windows；commit→ctx.commit(data,anchor)+syncClusterBounds(data.uiState)+广播全窗口；settle/force-settle 广播全窗口；before-quit 用 getClusterAnchor 落盘；activate 重建三窗；lockNonChildWindows 用 setEnabled（三窗自动覆盖）
- AppShell.vue/ClusterSpikePanel.vue 已删（git rm）；三面板 app-region CSS 已移除（拖动全走光标轮询）；preload 钩子=desktopTodoTest.clusterDragDelta → test:cluster-drag-delta
- 测试：app-shell.test.ts→panel-window.test.ts（tuck 状态机/标题栏/令牌断言迁移，拖动接线用增量断言）；batch.test 跨面板用例改 ui.enterBatch 直派（跨窗同步属 B-2）；quick-panel.test 批量用例挂 quick 窗

**E2E 适配状态（tests/e2e/）**：
- helpers.launchApp：等待 win=cluster 三窗就绪，main=panel=main 页；AppHandle 待补 quick/done Page 字段
- 已重写：anchor.spec（开关面板=侧窗整窗显隐+待办窗不动；重启恢复按主窗 bounds）、tuck-capsule.spec（胶囊+侧窗隐藏+还原）、cluster.spec（替代 spike：几何/同帧位移/focus）、main-flow 布局测试（视口=470×scale）
- system.spec：置顶数组 [true,true,true,true]、托盘可见性 [false×3]/[true×3]；child-window.spec：设置窗按 URL 识别、可见性 4 元素；bubble.spec：mainX/moveMainTo 用 panel=main
- **待修失败（根因已定位）**：主流程/子窗滚动条/import-export/limits 的跨窗交互——完成行、历史按钮、模板＋按钮现在分别在 done/quick 窗口页，spec 需取对应 Page（helpers 补 quick/done 字段）；cross-day/shadow 待查
- **focus 测试**：Windows 前台锁——调用方无前台时 focus() 被拒；已改为先点主窗获前台再断言（待验证）
- 调试遗留：tests/e2e/debug-toggle.spec.ts（临时，提交前删除）；cluster-windows.ts 的 DTODO_TEST 日志已全部移除

**批次 B 完成状态（提交链：54fab22→7cddd3f(test)→ed7993d(feat B-1)→392049b(B-3)→2478af3(B-4)；全量 348 单测 + 37 E2E + CI 绿）**：
- B-1 ✓ 三窗真实化（PanelWindow/cluster-windows 生产重写/AppShell 退场/DTODO_CLUSTER_SPIKE 开关移除）
- B-2 ✓ 数据跨窗同步 E2E（勾选完成→已完成窗行/计数实时更新；主题三窗一致——sync.spec）
- B-3 ✓ 几何迁移（clampAnchorForEdges 幂等钳制 #31/#32/#33；吸附/光标轮询按主窗所在屏 workArea——双屏修正；启动/恢复/分辨率变化共用）
- B-4 ✓ 渲染层定稿（时钟整块行内 38px、按钮 32×32、列表放宽+缝隙滑块；「10 项满载无滚动」E2E 已替换为滑块断言）
- B-5 ✓ 批量模式跨窗广播（uiBatchState IPC；enterBatch/exitBatch 上报、applyRemoteBatch 接收防环路；E2E：快捷进批量→主/已完成窗冻结）

**批次 B 真机验收清单（用户执行）**：
1. 拖动三窗整体（含快速甩动/跨 DPI 双屏往返——回归 §9.8 已修的复利放大）
2. 缩放：拖待办窗右下角 grip → 三窗等比、待办窗自身不动；放大至半屏上限停
3. 吸附：拖到屏幕顶 → 吸附+缩进（侧窗消失、胶囊居中）；划过弹出
4. 边界：左右拖——侧窗悬挂屏外、不回弹；主窗≥90px 可见
5. 开关面板：⚡/☑ → 侧窗整窗显隐，待办窗不动
6. 数据同步：新建/完成/主题切换 → 侧窗实时一致
7. 批量：快捷窗进批量 → 主/已完成窗置灰冻结；返回解冻
8. 列表放宽：10 条满载出滚动条（滑块在缝隙带、不挤压行）；时钟 38px 整块行内；按钮 32×32
9. 托盘：显隐含全部窗口；置顶含全部窗口

## 10. 第六轮会话交接（2026-10-03；批次 B 真机反馈修复轮 + 批次 C + 缩放拖影定论；新会话从这里继续）

### 10.1 本会话完成内容（提交链 6692c28..HEAD，全量 358 单测 + 48 E2E 绿）

**缩放呈现 v3.3（用户多轮回退后定稿形态）**：
- 白条消失真因（E2E DOM 采样定论）：胶囊窗 160×38，文档流白条被常驻 640px zoom 容器挤出窗外（rect.y=643）——修复=白条绝对定位钉窗口顶（89b43a5 前身）+ 胶囊 UI 几何驱动（33ad361 链路中 stage/窗壳多次迭代，最终=窗壳挂 stage 层、冻结时 stage.side-frozen 承载背景+圆角）
- 灵敏度 1:1（f8a4849）：grip 换算分母从可见簇宽（1090，稀释 2.3 倍）改主窗宽（470×scale）——拖动距离=主窗边缘位移
- 呈现行为：缩放拖动中两侧窗内容隐藏、窗壳（底色+圆角）实时缩放；主窗照常；松手内容恢复

**置顶判定（三轮迭代后定稿）**：
- 未置顶=挂件态：setFocusable(false)（WS_EX_NOACTIVATE）+ showInactive 显示路径 + 失焦沉底（pendingSinkOnBlur → 全失焦 → enterWidgetMode：三窗 AlwaysOnTop(false)+Focusable(false)+HWND_BOTTOM 沉底，120/400ms 双次沉底压样式重排）
- 置顶=true：screen-saver 层+可激活
- 关键实现顺序：焦点判定先于 focusable 变更（改 focusable 会杀焦点）；blur 后 60ms 判定全失焦（事件时焦点状态未更新）

**Win+D（三轮后定论 TOOLWINDOW 方案，9eb65e7）**：
- 实测定论：Win+D 隐藏组件无任何事件（minimize/hide/close 日志零记录）、非 cloak（轮询未命中）→ 不可拦截，只能系统级豁免
- 终案：三窗 WS_EX_TOOLWINDOW（koffi SetWindowLongW GWL_EXSTYLE）——Win+D/显示桌面跳过工具窗口；副作用=不进任务栏/Alt+Tab（均为期望）
- **待用户真机验收（新会话第一件事）**：按 Win+D 组件应保持显示
- 附：cloak 轮询反制（300ms DWMWA_CLOAKED 检测+SW_SHOWNA 解除）+ cloak/hide 诊断日志仍在线

**批次 C 功能**：
- C-1 Win+D：见上（minimizable:false+minimize restore 兜底仍保留作第一道防线）
- C-2 模态蒙层（7181c9e→三窗化→前置同步 4b6251f）：childOpen 驱动改 veil 前置信号（openChild 入口 setVeil(true) 广播三窗，先于二级窗创建=蒙层与窗口同步出现；closed 广播解除）；三窗统一（用户纠正：非仅主窗）；蒙层 rgba(20,20,25,.2)
- C-3 自启防护（9f77214）：app.isPackaged=false 时 setAutoStart 不写注册表（开发版 electron.exe 曾污染 HKCU Run 键=用户开机 Electron 空窗口事故）；设置窗文案补开发版说明

**其他修复**：
- 缝隙 2px→4px（9601903，用户定稿；BASE_GAP 单一来源+原型 v3.3 同步+几何断言批量更新 314/474/1098）
- 气泡角标根因（9601903）：气泡路由经 ChildHost，其模板对所有 kind 无条件渲染二级窗缩放角标——bubble kind 不再渲染（用户推测"照搬窗口样式"证实）
- history 测试日期助手相对偏移（月初时间炸弹，多轮回退期间保留）

### 10.2 缩放拖影——最终定论（不再尝试应用层方案）

**视频双影铁证定论**：拖影=DWM 对透明窗口矩形变化的旧帧残留（旧矩形旧画面+新矩形新画面并存，整幅双影）。发生在系统合成器层——应用层一切手段（内容冻结/窗壳静止/提交顺序/节流/重建窗壳）已穷尽且无效（本会话多轮实测+用户视频证实）。
- 决策 #7（禁止透明框内内容缩放）经原型 v3.4 验证被用户否决（dd36e2f 已 revert）——**决策 #7 维持原判**
- 当前形态=维持 v3.3（两侧窗底色代替，有轻微拖影属系统限制）
- 剩余路径仅方案 C 单窗架构（未试；代价=双屏侧窗悬挂能力）——用户未选

### 10.3 二级窗打开卡顿——已定论（待专项）

用户对比测试（批次 C 版 vs 回退版）：**两版都卡** → 与批次 C 无关，为二级窗创建+页面加载固有开销（~400ms）。
- 已排专项（未开工）：**隐藏复用架构**——二级窗关闭时隐藏不销毁，打开时显示+刷新数据（预计 400ms→50ms）；涉及表单状态重置设计，需先出设计评审
- 用户验收 38 原话确认"卡顿非蒙层引入"

### 10.4 新会话待办（✅ 全部完成并于 2026-10-10 发布 v1.1.0——见 §11.B 收口；本节保留为历史记录）
1. ~~气泡"闪一下才显示"修复~~ **✅ 已完成（2026-10-08 第十轮，提交 f396a22/916d879）**。根因比原记录深两层：① 渲染层测量从未真化——`.gbubble` 100%×100% 恒量得整窗 320×160（「量完收缩」从未发生）；② Windows 上 resizable=false 窗 setBounds 收缩不生效（index.ts resizeSelf 先例同款），resizeBubble 是空操作。实际修复=测量真化（fit-content+min/max 与主进程钳制同限，max-width=原型 BUBBLE_MAX_W 300）+收缩前临时解除 resizable+量完贴合才 showInactive（100ms 兜底防渲染层失联）+隐藏清挂起防迟到回包复活。单测 8 例（显示门控全语义）+E2E 贴合断言（宽≈300<320、高<160；125% DPI 回读有 ±几 px 取整斜差，断言用容忍带）。
2. **缩进+二级窗：隐藏→显示真机验收（modalChildOpen 守卫已实施；E2E 已修复并首次真正跑到断言=绿，真机未验）**：缩进→开设置二级窗→双击隐藏→双击显示 → 应保持弹出+取消 3 秒会话；关闭二级窗 → 保持展开。若复现异常读 C:/tmp/geo.log。
3. ~~偶发三窗 4×38@(0,0) 塌缩~~ **✅ 已破案（2026-10-08 第十轮，提交 ba9ca27/8a161ee/314c6b2）**：根因=tray-tuck E2E「二级窗开着」用例把 clusterDragDelta 按对象单参误调（preload 签名是双数字），payload 被 dx 吸收 → NaN 锚点 → Electron 把 NaN 定位退化为 0 尺寸 SetWindowPos → Windows 钳塌到最小窗 (0,0,4×38) 且后续 setBounds 全失效。此即「偶发」（哪个测试跑到该坏调用哪个塌）+「applyClusterBounds 零调用」假象（有调用但日志里的 targetMainW=423 与锚点无关、看着健康）。产品侧加固：applyAnchor 非有限锚点整体忽略+SETBOUNDS-REJECTED 探针（>2px 拒绝即记 geoLog）；clusterDragDeltaBy 内联 detectSnap（位移测试可构造吸附态）。**附带重大发现：CI 自 0f90276 起连红 4 轮**——上会话 0f90276/d8e3c4f 两笔推送的 E2E 从出生就红（塌缩+测试从未吸附致会话不武装），「§11 测试终态 CI 绿」记录不实；两测试已修复（真实吸附构造+正确签名），本地全量 59 E2E 绿。
4. **诊断日志清理（发版前）**：geoLog（cluster-windows，现含 SETBOUNDS-REJECTED/applyAnchor IGNORED 探针）/cursor-diag（两个编辑窗 diag+app:cursor-diag IPC+preload diagnosticLog）/[geo-log-err]——问题全关闭后移除。
5. **C-4 发版 v1.1.0**：升版 1.0.8→1.1.0 → 打安装包 → 冒烟（含本批全部新语义）→ **开机自启真机重启测试** → tag/Release → 验收报告更新。
6. 单窗对照版已清理（用户裁定；架构定论三窗）。托盘悬停名「桌面待办三窗版」为临时区分，发版前可改回「桌面待办」。

### 10.4.1 真机验收清单（上批已实施待验）
① 应用级聚焦：点击待办主窗后开侧窗/二级窗，跟随应用层面（侧窗同层、二级窗最上）② 显示时整体置顶（仅隐藏→显示）：其他窗口盖住组件位→托盘隐藏→托盘显示→应用整体在最上 ③ 气泡 0.5s 弹出+开二级窗瞬间气泡消失（含正要弹出的）④ 编辑光标原生行为（输入时常亮停手闪烁——solid-caret 已按裁定移除）⑤ 标题栏顺序：主题/图钉/缩进锁/齿轮/×；侧窗无 × 按钮 ⑥ 缩进+二级窗隐藏→显示（modalChildOpen 语义）⑦ 托盘/置顶/Alt+F4 退出/滑块回归 ⑧ **（本轮新增）气泡直接以内容贴合尺寸出现**：不再先全尺寸闪一下再缩；悬停截断行 0.5s 后气泡即为最终大小（约 300 宽内、按文本高度）；同一行反复悬停无跳变

### 10.5 本会话教训（新增）
- **改渲染层代码后跑 E2E 必须先 npm run build**（E2E 跑 out/ 产物——本轮白条/蒙层两度因旧产物误判）
- koffi Win32 三坑：Win32 BOOL 用 'int32'（'bool' 1 字节致 IsWindowVisible 恒 false）；GetTopWindow 后用 GW_HWNDNEXT(2) 遍历（PREV 在链顶返回 0）；koffi.struct 必须先于引用它的 func 声明（否则运行时崩溃弹窗）
- 经典 z 序枚举/命中测试（GetTopWindow/GetWindow/WindowFromPoint）对 Electron 透明合成窗口为盲区（25 点全穿透/枚举不见窗口）——z 序验证只能用户真机
- SetWindowPos(HWND_BOTTOM) 返回成功但对透明窗可能不生效（与样式重排竞争）——需 120/400ms 双次沉底
- setFocusable(false) 会杀焦点——焦点判定必须先于它；且其样式变更异步重排 z 序（沉底需在其落地后）
- 用户共享桌面环境会干扰 E2E 截图/z 序断言（其他应用窗口弹入）——断言用状态语义（atop/focusable/bounds）而非像素
- **CSS zoom 下测量空间分裂（2026-10-07）**：clientWidth/offsetWidth=布局空间，getBoundingClientRect=视觉空间（差 scale 倍）——两者混用产生假缝隙/假位移（CI 0.7 缩放假差 135px 实锤）；断言/测量必须同空间（offsetWidth 配 clientWidth）
- **Playwright 虚拟鼠标不移动系统光标（2026-10-07）**：GetCursorScreenPoint 类判定在 E2E 不可判定——须 fake 光标注入钩子（test:set-fake-cursor）
- **异步渲染窗体的 onMounted 查询不可靠（2026-10-08）**：元素由异步数据驱动渲染时，onMounted 里 querySelector 返回 null——元素接线用模板 ref+watch
- **koffi：GetPixel 属 gdi32.dll 非 user32.dll（2026-10-07）**——加载错库报"Cannot find function in shared library"
- **优雅降级日志须可见（2026-10-08）**：try/catch 吞错误的诊断日志会静默失效且难察觉——诊断日志的 catch 至少 console.error
- **E2E 自造 window-cast 类型必须逐字核对 preload 签名（2026-10-08 第十轮）**：测试里 `(window as unknown as {...})` 的自定义类型声明会掩盖真实签名不匹配——「二级窗开着」用例按对象单参调 clusterDragDelta 而 preload 是双数字参，payload 被 dx 吸收 → NaN 锚点 → Windows 钳塌三窗 4×38@(0,0) 且后续 setBounds 全失效（Electron 对 NaN 定位退化为 0 尺寸 SetWindowPos）；排查代价整整一轮会话
- **NaN 几何中毒的识别特征（2026-10-08）**：多窗同时 (0,0)+最小尺寸=典型的 0/NaN 入参被 OS 钳制；applyClusterBounds 日志的 targetMainW 等宽度字段与锚点无关，看着健康不代表 x/y 不是 NaN——几何日志要打全字段
- **`npm run verify` 不含 build（2026-10-08 复证）**：E2E 跑 out/ 产物，改过主进程/渲染层后必须先 `npm run build` 再 verify，否则拿旧产物误判（§10.5 既有教训的 verify 变体）
- **主进程对象跨 app.evaluate 序列化的坑（2026-10-08）**：Electron Rectangle 在主进程侧 `{...spread}` 得空对象（属性在原型 getter 上）；直接读 b.x/模板串拼接正常，Playwright 顶层返回也能带出——但嵌套 spread 会静默丢字段


---

## 11.A 第十轮会话记录（2026-10-08~09；C4.4 禁动画→C5 屏外悬挂实验→C6 遮挡判定实验——三轮尝试均已撤销，经验存档）

> 提交链：f396a22..580195d。**当前应用状态=回滚至 9e900a0（C4.4）+C6 托盘统一真隐藏+白条点击弹出+hitProbe 诊断工具入库。**

### 11.A.1 已交付并验收的（除特别标注外，均随 v1.1.0 发布）
- **气泡透明常驻**（C3.2）：用户确认复现不出闪动，保留 ✓
- **二级窗输入框等比**（C6.4，2224f5d）：新增待办输入框 aspect-ratio 3:1，高度随宽度联动 ✓
- **原型 v3.3 同步应用现状**（6d72d61）：缩进直上直下/3 秒停留/托盘真隐藏/输入框 3:1/二级窗 3:4 全部补入原型 ✓
- **taste-skill 安装**（13 skills 至 .agents/skills/，未入 git，去留待用户定）✓

### 11.A.2 实验与撤销（全部已回滚，经验存档）
- **C4.4 禁 DWM 过渡动画**（DWMWA_TRANSITIONS_FORCEDISABLED，属性只写需缓存验证）：用户实测弹动无变化——动画非弹动根源。保留无害，已入库
- **C5 屏外悬挂**（缩进侧窗滑出屏外，6632f0e~81abea4）：实施后引发已确认需求回归（3 秒停留缩进失效/标题条重现），**用户裁定整体撤销**——教训：屏外悬挂需要动 3 秒缩进执行结构，连带改动范围失控；实施大方案时必须逐条对照已确认需求回归
- **C6.4 遮挡判定实验**（hitProbe WindowFromPoint 判白条是否被遮挡）：**结论=白条贴顶（屏幕最顶部 0-38px）是 Windows 命中测试异常区**——hitProbe 返回穿透/空与遮挡状态无关，判定不可行，已撤销（纯几何判定恢复）。工具 hitProbe 留档（580195d）
- **C6.4b 托盘去抖/force-tuck**：曾实施又撤销（用户指出"连点图标"非其场景且未授权取消划过弹出）——**教训：方案与既有交互冲突时必须先询问（用户重申纪律）**

### 11.A.3 未决问题（移交后续）
- **未置顶且白条被遮挡时的划过误触**：遮挡无法检测（透明窗命中盲区+白条贴顶为命中异常区），方案选项已给用户（悬停延迟 300ms/保持现状）——✅ 已关闭（2026-10-14 用户确认"解决了"，未改代码）
- **侧窗透明常驻下的"拖动二级窗被侧窗盖住"**：已修（模态期间禁 moveTop，6c1006a）待用户复验
- **v3.4-L1 原型**（原名 v3.4-taste）：L1 精修+二级窗 3:4 已覆盖（562d793+59e215a），待用户浏览器预览反馈

---

## 11. 第七~九轮会话记录（2026-10-04~08；显隐语义定稿+Win+D 攻防+二级窗/气泡修复）

> 提交链：a36bc4e..045b676（含全程 TDD 红绿分笔）；测试终态 373 单测 + 56 E2E + CI 绿（045b676）。
> **⚠️ 第十轮更正（2026-10-08）**：上句「CI 绿」不实——0f90276 起两笔新增 E2E（每次显示都重置/二级窗开着）从出生就红，CI 连红 4 轮至 0e64205；第十轮已修复（§10.4-3），终态 381 单测 + 59 E2E 全绿。

### 11.1 需求语义定稿（全部用户裁定，已写入需求文档 v1.3 章节）
- **显隐三途径唯一化**：待办窗 × 按钮 / 托盘双击 / 托盘右键菜单；侧窗 × 隐藏按钮删除（D7，非原型元素——实施期多余发挥，教训见 §10.5）
- **Win+D / Win+M 回归系统默认**：未置顶=普通窗口行为（可被隐藏/最小化，再按恢复）；置顶=免疫（置顶层常驻天然豁免 + minimizable 声明 + 最小化即恢复兜底）
- **Alt+F4 = 强制退出整个应用**（无确认框；before-quit 落盘照走；二级窗 ×/← 仅关自己——closeSelf 意图标记区分）
- **TOOLWINDOW/skipTaskbar 保留**（不进任务栏/Alt+Tab；用户确认）
- **置顶语义最终版**：未置顶=普通窗口层级（挂件态/NOACTIVATE/失焦沉底全套删除）；置顶=最上层
- **应用级聚焦**：聚焦面向整个应用——点击待办主窗后开侧窗（moveTop 同层）/二级窗（最上）；显示时整体置顶（仅隐藏→显示）
- **模态唤醒**：二级窗开着时点击锁定的组件窗任意可见处 → 聚焦二级窗、应用整体浮前（50ms 轮询：左键按下边缘+光标在组件窗内；禁用窗不产生点击事件故需轮询）
- **架构定论（D6）**：维持三窗（用户对比单窗对照版实测后裁定；方案 C 单窗关闭）
- **光标定论**：原生光标即所需（输入时常亮停手闪烁）；solid-caret 干预撤销（40ms 交替重绘实测高频快闪）

### 11.2 Win+D/Show Desktop 机制定论（实验存档，防重蹈）
- Win11 26200 的 Show Desktop = **DWM 合成层隐藏**：零事件/零状态变化/零 cloak；豁免集=toggle 时刻已在**置顶层**或 **shell 拥有**的窗口
- 事后补救全部无效：重设 TOPMOST（Chromium 否决外部带变更）、hide+show、改 owner、0~400ms 竞态、LL 钩子内 SetWindowPos（同被否决）
- 抢跑钩子路线（WH_KEYBOARD_LL 回调内 Electron setAlwaysOnTop）整包实施又整包拆除——用户最终裁定 **Win+D 回归系统默认不做干预**
- 实验方法论存档：外部 koffi 探针（样式位/MinimizeAll/GetPixel 截屏对照/SendInput Win+D 替代失效的 COM ToggleDesktop）

### 11.3 关键修复与实现
- **悬空会话清除**（缩进托盘恢复闪退根因）：3 秒自动弹出会话跨隐藏/重缩进未清除，下次显示时过期会话立即缩回——hideCluster/重缩进清 autoExpandUntil
- **缩进托盘恢复自动弹出 3 秒**（用户需求）：showCluster tucked/else(snapped) 分支武装会话+pendingBounds 显式落位（修 showInactive 旧胶囊边界）
- **气泡定时器竞态**：veil/失焦改调 cancelBubble（清排队定时器+抑制标志）；气泡延迟 1s→0.5s
- **应用级聚焦**：showSidePanel moveTop；**模态唤醒轮询**：shouldWakeModalFocus 纯判定+50ms 轮询
- **滑块断言尺度无关化**：CSS zoom 下 clientWidth（布局）≠ getBoundingClientRect（视觉，差 scale 倍）——断言改同空间（offsetWidth）；**E2E 光标判定改 fake 光标注入**（虚拟鼠标不移动系统光标）
- **侧窗 × 按钮删除**（非原型元素，教训见 §10.5）

### 11.4 未解决/进行中（移交新会话；2026-10-08 第十轮收口更新）
- ~~气泡"闪一下才显示"~~ ✅ 第十轮已修（根因两层深于本节原记录：测量 CSS 从未真化+resizable=false 收缩失效；详见 §10.4-1）
- **缩进+二级窗隐藏→显示**（modalChildOpen 守卫）：E2E 已修复（原用例塌缩在坏调用上从未跑到断言）并全绿、**真机未验收**
- ~~偶发三窗 4×38@(0,0) 塌缩~~ ✅ 第十轮破案：E2E 用例签名误调→NaN 锚点（详见 §10.4-3）；产品侧已加非有限锚点防御；**纠正：上会话两笔推送 CI 连红 4 轮未察觉**（0f90276/d8e3c4f 的 E2E 从出生就红），第十轮修复后本地 59 E2E 全绿
- **诊断日志清理**（发版前）：geoLog/cursor-diag（编辑窗 diag+IPC+preload）/[geo-log-err]/[win-d-dbg]
- **单窗对照版已清理**（用户裁定）；托盘悬停名「三窗版/单窗版」临时区分，发版前单窗名可去除



---

# 11.B 第十一轮（收尾发版）记录（2026-10-10）

> 提交链：dfc215f..（v1.1.0 tag）。测试终态 382 单测 + 62 E2E + CI 绿。

## 交付内容
- **白条弹出定稿（C7，用户方案）**：渲染层白条 mouseenter 驱动弹出——系统真实命中分发（被遮挡天然不弹、范围=白条本体 12px×160px）；主进程缩进态自算判定（几何+hitProbe）全部移除；setClusterTucked 切换重置 inside 记忆保证缩回链完整；轮询仅保留弹出态→缩进与会话收尾
- **开机自启加固**：清除 Windows StartupApproved 启动项禁用标记（reg.exe，零依赖）——修复"开关开着却不启动"；**真机重启实测成功**
- **残留清理**：用户机注册表历史残留 `electron.app.Electron`（开发版事故，开机弹空 electron 窗口）已删除
- **诊断日志全清理**：geoLog/bubbleLog/hitProbe/cursor-diag 全链移除（Release 构建无诊断代码）
- **升版 1.1.0**：打版（EPERM 备用方案）+冒烟通过；ASCII 资产；tag/Release v1.1.0
- 托盘悬停名改回"桌面待办"（三窗区分使命完成）

## 关键教训（新增）
- **build 不做类型检查**：typecheck 报错被忽略曾致主进程 ReferenceError 崩溃进产物（提交前 typecheck 必须看输出——C6.7 事故）
- **CI 上主进程每 tick 原生调用（koffi）会拖垮慢机器**：必须短路降频（仅光标在候选区才查询）
- **hitProbe（WindowFromPoint）在白条贴屏幕顶缘不可靠**（返回屏缘他窗/空与遮挡状态无关）——最终方案回归系统事件分发（mouseenter），彻底移除采样查询
- **测试环境（ZCode 终端等）会覆盖屏幕顶部**：涉及贴顶窗口的判定用例必须环境自适应（hitProbe 判定分支）或转真机
- **老事故残留**：开发版曾写注册表的项需手动清理（C-3 防护只防新写）；用户报"开机多出 electron 窗口"=此残留

## 当前状态
- **v1.1.0 已发布**：github.com/Richardo-X/DesktopTodo/releases/tag/v1.1.0（Setup/Portable ASCII 资产）
- 应用开发版=生产版（三窗）；全部用户确认需求实现并经真机验收
- 遗留（低优先级，未排期）：Win+D 实测行为复查（§10.4.1 ⑦，本轮真机未复报问题）

---

# 11.C v1.1.1 / L1 视觉精修轮（跨会话决策固化，2026-10-10 用户拍板）

> **新会话主任务**：按 `docs/交互原型-v3.4-L1.html` 把 L1 视觉精修落地到应用。（本节为 2026-10-10 历史记录：彼时文件名 v3.4-taste，已于 §11.E 改名——内容一致。）

## 决策（用户已拍板，不得再问）

1. **实施依据**：`docs/交互原型-v3.4-L1.html`（L1 版，≈30 处 CSS 精修，diff 35+/29-；2026-10-10 时名为 v3.4-taste）。**v3.3 保留为纯净基线**——不得删除、不得再修改 v3.3。
2. **授权边界**：颜色/圆角/阴影/动效曲线等"纯视觉参数"按 3.4 **直接落地**（含按钮圆角 5→6px 这类已验收数值的微调）；**布局结构/交互逻辑/功能一律不动**。
3. **覆盖范围**：令牌级精修**全应用统一套用**——含原型未画全的界面（批量条中间态、各二级窗细节、气泡等），保证全局一致。
4. **发版节奏**：L1 验收通过即**发 v1.1.1**（升版→打包→冒烟→tag/Release，同 v1.1.0 流程 + 验收报告 §十二）。
5. **L2 推进**：L1 验收后**停下**——用户择机另开会话推进 L2（不连做长会话）。

## L1 精修清单（11 类）与应用侧入口

1. 文字对比度令牌（日 `#666→#5d616b` 族/夜同步）——入口：`src/panels/*.vue` 令牌区 + `src/windows/child-window.css`（`--text/--muted/--faint`）+ 各处 `var(--muted,#666)` 回退值
2. 阴影色调化（纯黑→蓝黑 6 处）——各面板/对话框 box-shadow
3. 圆角统一 5→6px（应用侧 ≥8 处：QuickPanel/DonePanel/BatchBar/HomePanel/TodoRow…）
4. 时钟等宽数字（tabular-nums + Display 字体）——HomePanel 时钟
5. 对话框（420px/圆角 10/双层柔和阴影）——ConfirmDialog
6. 待办行 hover 过渡——TodoRow
7. 按钮/勾选框按压反馈（scale 0.96）
8. 键盘焦点描边（focus-visible）
9. 全局过渡缓出曲线（--ease-out）
10. prefers-reduced-motion 支持
11. 托盘/时钟微调

## 受影响 E2E（更新期望到新行为，禁止删测试降标准）

- `tests/e2e/shadow.spec.ts`（颜色/底色断言）、`tests/e2e/child-window.spec.ts`（元素尺寸/样式）
- 实施前先跑全量确认基线，实施后全量+CI 绿

## 原型对照

- `docs/交互原型-v3.3.html` = 当前应用形态（纯净基线）
- `docs/交互原型-v3.4-L1.html` = 基线 + L1（实施靶子；已回补 L1.5 定稿，见 §11.E）
- 两文件 diff 即实施清单：`git diff --no-index docs/交互原型-v3.3.html docs/交互原型-v3.4-L1.html`

---

# 11.D 第十二轮（L1 视觉精修落地 + v1.1.1 发版）记录（2026-10-10~11）

> 提交链：70ee63a → cb4c04c（体验说明书）→ ffc4c4d（L1 实现）→ 82d24c6（L1 测试）→ …（六轮验收反馈）… → 1bcc84e（升版 1.1.1）→ tag v1.1.1
> 测试终态：382 单测 + 71 E2E + CI 全绿；打版冒烟通过（窗口句柄非零）。

## 交付内容

- **L1 视觉精修落地**（v3.4 原型 diff 逐条直落，12 文件）：对比度令牌/阴影色调化/圆角 6px/时钟等宽/对话框规格/行过渡/按压反馈/focus-visible/缓出曲线/reduced-motion
- **六轮用户验收反馈闭环**：
  1. ⚡ 字符（彩色 emoji）→ 原型线性 SVG 闪电；2. 已完成窗空列表文案垂直居中（`.list-wrap` 补 flex 列上下文）；
  2'. ⚡/☑ 光学配平（墨迹同高）；3. **图标系统统一（L1.5）**——勾选框与品牌勾同源 `I.check`、＋/←/×/🕘/trash/undo/bolt 全量对齐原型 SVG、字形与 emoji 清零（用户三项选择：全量对齐 / 步进器与拖拽柄保持原型现状 / 勾统一 I.check）；
  4. **按钮规格统一**——图标按钮 32 / 主按钮 30 / 小按钮 26 / 步进器 28 / 勾选框 20，修 4 处跨窗孤例；5. **列表左右端对齐**——操作区按钮/批量条/已完成窗底部按钮与列表行同边（修原型继承的 2px 偏移）
- 新增锁定断言：l1-visual.spec L1-①~⑫（对比度/时钟/圆角/对话框/按压/焦点/reduced-motion/图标统一/光学配平/空文案居中）+ icon-buttons 跨窗同规格 + main-flow 对齐（±0.5px）
- 升版 1.1.1 + tag/Release（ASCII 资产 DesktopTodo-Setup/Portable-1.1.1.exe）

## 关键教训（新增）

- **三杀软实时扫描会死锁打包器**：本机同时启用腾讯电脑管家+火绒+Defender 时，`npm run dist` 在 win-unpacked 改名/写产品 exe 环节 100% 失败（EPERM/EBUSY/UNKNOWN），残留目录甚至无法删除、单次尝试可卡死 70+ 分钟（内核级阻塞，CPU≈0）。
  **处置配方**：① 换**全新输出目录**（避开被死锁的残留文件，rm 步骤不触发）；② 给 electron-builder 打**机器本地重试补丁**（`app-builder-lib/out/util/electronGet.js` 的 extractArchive rm/rename 退避重试 + `out/electron/electronWin.js` 的 asar integrity 读写重试；**不入库**，node_modules 重装后失效）；③ 一劳永逸=给三杀软加项目目录信任区（需用户操作）。
- **用户真机看到"没修好"时，先核对实例身份**：本轮出现过一次"修复无效"误判——用户截图上的是**已安装 v1.1.0**（白天主题/其正式数据/旧空文案位置），而验收实例是夜主题/隔离数据。判定方法：数据文件比对（`%APPDATA%\桌面待办\data.json` vs 验收目录）+ 主题/文案差异；**开发实例缩进态时只是屏幕顶端一条淡胶囊，极易被忽略**（建议验收前先弹出）。
- **子窗无缩放、簇窗有 zoom**：跨窗尺寸断言必须折算设计像素（本轮对齐/规格用例均按此实现）。

## 未决与移交（新会话/后续）

1. ~~**拖动看门狗加固（待用户拍板）**~~ → ✅ 已关闭（2026-10-14 用户裁定：粘连是 ZCode 卡顿问题、非应用逻辑，无需修复）。主进程拖动轮询（8ms）目前无自发结束条件（依赖渲染层 pointerup/blur）——保留为已知风险记录，若将来真机复报"永久跟随光标"再按 GetAsyncKeyState 方案实施。
2. **L2 推进**：用户择机另开会话（§11.C 决策）。分级表（本会话重建，待用户确认）：L1 表面精修（已完成）/ L1.5 图标系统统一（已完成）/ L2 排版与节奏（字号阶梯/行距/间距密度）/ L3 结构与层级 / L4 交互与动效深化。
3. ~~用户机器上的安装版仍是 v1.1.0~~ → **已完成**（2026-10-11 静默安装 v1.1.1 并核实 FileVersion；数据目录已回归标准 `%APPDATA%\桌面待办`，详见 §11.D 及问题记录 F2）
4. Win+D 实测行为复查（§10.4.1 ⑦，低优先级）；安装器策略可选增强（整机唯一 perMachine / 降级拦截，建议 L2 之后议）。

---

# 11.E v3.4-L1 原型改名与对齐应用（2026-10-12）

> 用户指示：3.4-taste 改名为 3.4-L1，并与最新落地应用（v1.1.1）对齐。

## 改名
- `docs/交互原型-v3.4-taste.html` → `docs/交互原型-v3.4-L1.html`（"taste" 为工作名，"L1" 表达层级归属）。**v3.3 未动**（纯净基线约束不破）。
- 同步修正文件内 `<title>`（原误写 v3.3，随 v3.4 拷贝遗留）与页内水印版本号；全部文档引用同步（本文件 / 需求文档 v1.5 / L1 体验说明书 / 验收报告 / `l1-visual.spec.ts` 注释）。

## 本轮回补（v1.1.1 落地时应用侧领先原型的三处，逐值对齐）
1. **主窗 ⚡ 光学配平**：原型原路径外包 `g` 0.8 等比缩放（墨迹与 ☑ 同高）；`I.bolt` 本身不动（二级窗「添加到模板」保持原始比例，与应用一致）。
2. **列表左右端对齐 2px**：`.actions` / `.foot-btn` / `.batch-bar` 左右收 2px（对齐 `.scroll` 的 2px 内边距——应用第六轮反馈定稿，原型原继承 2px 偏移）。
3. **`.btn.sm` 间隙 5px**：26px 小按钮带图标口径（同应用 `.btn.sm`/`.b`；30px 大按钮保持 `.btn` 基础 6px）。

## 已知非 L1 差异（本轮未动——v3.3 与 v3.4-L1 两侧一致，不动以保全 A/B 对照的纯净性）
> 早于 L1 轮的既存"原型↔应用"漂移；如需完全镜像，须逐项先定"以哪侧为准"再单独一轮处理。审计范围：主窗/快捷窗/已完成窗/二级窗共用骨架/历史窗/设置窗；新建·编辑·详情窗内部细节未逐条穷尽。
1. **图标按钮底纹**：应用 `.icon-btn` 浅底+描边（v1.0.1-B2 决策#4 起：主窗 ⚡/☑、已完成排序），原型为透明无边（hover 才显底色）；`.on` 态两侧均为主题色描边。
2. **二级窗动作按钮尺寸**：原型 `.btn` 30px（还原/添加到模板/删除/选择文件…），应用 `.b` 26px（L1.5 前既如此；L1.5 是把主窗 30px 孤例收敛到 26px，方向与原型相反）。
3. **历史窗**：原型 ◀日期▶ 图标导航 + 计数在导航行 + 列表描边框 + 加粗「导出完成记录」行；应用为文字按钮（前一天/后一天/回到今天/批量删除）+ meta 行（日期标签+条数）+ 无框列表 + 「导出」小标签。
4. **已完成列表滚动**：原型纯 `.scroll`（溢出显示原生滚动条），应用 `.list-wrap` + 自绘滑块（同主窗待办列表）。
5. **勾选框勾选动画**：原型有 stroke-dash 绘制动画（250ms），应用瞬时呈现（无动画）。
6. **拖拽柄**：原型 `I.grip` SVG 六点，应用 CSS 点阵（观感等效，用户第四轮已裁定保持）。
7. **快捷窗空态文案**：原型「还没有模板，点击右上角 ＋ 新建」，应用「点右上角」（M3 起）。

---

# 11.F 第十三轮（L2 排版与节奏落地）记录（2026-10-12）

> 用户指示：L2 开工（依据 `docs/v1.1.2-L2-体验说明书.md`——2026-10-11 提交 378b233 待批，2026-10-12 批准执行）。
> 测试终态：382 单测 + 75 E2E（71 旧 + 4 新 l2-typography）+ typecheck 全绿。

## 交付内容

- **字号六档收敛（全应用零离群）**：38 / 15 / 13.5 / 12 / 11 / 10——12 种散乱字号（38/17/16/15/14/13.5/13/12.5/12/11.5/11/10）全量归档；面板标题 13→15、空态 17/16→15、历史行/设置标签 13→13.5、12.5 族→12、11.5 族→11（含 26px 小按钮文字）
- **节奏 4px 栅格化**：内容行 padding 统一 11×12（模板/已完成/历史三类行归一，行高 ≈44px，与主窗行一致）；列表 gap 6→8（三窗+历史）；win-body 顶距三窗统一 8px；`.actions`/`.panel-head` gap 与底距 8；全宽块 `.meta-line` 8×12（+2px 对齐补偿）；设置表单 gap 12 / padding 8；正文行高统一 1.5
- **14 个源文件直落**（TodoRow 无需改动）：Home/Quick/Done 三面板、History/Settings/TodoEdit/TemplateEdit/Detail/Bubble 五窗、child-window.css、BatchBar、ConfirmDialog、App.vue
- **原型镜像**：新增 `docs/交互原型-v3.5-L2.html`（= v3.4-L1 + L2 全值；浏览器渲染逐值核验：panel-title 15 / 行 padding 11×12 / gap 8 / win-body 顶 8 / meta-line 8×12）
- **自动化**：`tests/e2e/l2-typography.spec.ts` 4 条（字号零离群收集断言 / 六档抽样锚点 / 行与列表节奏 / 空态与输入域）
- **文档**：L2 说明书补 §七「实施定稿」（逐项落点表 + 组件几何不动清单 + 11.5 归属定稿行）

## 关键决策/取舍（实施时对说明书模糊处的定稿）

1. **11.5 一律归 caption 11**（含 26px 小按钮文字）；「按钮文字=label 12」仅指原 12.5 的 30px 大按钮——说明书 §三.1 原有一句自问自答草稿，已在实施定稿中固化为定稿行
2. **面板标题 13→15**：说明书 §三 用途列写明 heading 15（变化列漏记，已补）
3. **控件内部微观边距保持不动**（textarea 9×11、日期框 0 5、seg 5×10、cap-chip 3×10、气泡 9×12 等）——L2 只管块级节奏；主窗行 padding 与 2px 对齐补偿按 §五 保留
4. **主窗 win-body 顶距 10→8**：4px 栅格化同时给列表 +2px（不损"10 项满载"布局）

## 未决与移交

1. **L2 真机验收**：dev 构建 `start-accept.cmd`（隔离数据）；对照物 = 浏览器打开 v3.5-L2 原型；验收通过后升版 v1.1.2 打包发布（同 v1.1.1 流程）
2. **L3/L4**：分级表待用户推进（L3 结构与层级 / L4 交互与动效深化）
3. F3 偶发（app-close）观察中；原型的 7 项既存差异（§11.E）仍待逐项定"以哪侧为准"

---

# 11.G 第十四轮（L2 验收 + 快捷窗缩放修复 + v1.1.2 发布）记录（2026-10-12~15）

> 提交链：8e51929（L2）→ 23d92e1..02063c9（缩放修复 7 笔）→ 5639f91/2a6bb58（气泡主题/蒙层）→ 2754728（已完成窗解冻）→ 10a1171（二级窗 3:4）→ e7aa59e（升版）→ tag v1.1.2。
> 测试终态：单测 40 文件/390 条（串行）+ E2E 81 条 + typecheck/build 全绿。

## 交付内容

1. **L2 排版与节奏**（§11.F）：验收=用户转入缩放任务未提异议，随 v1.1.2 一并验收。
2. **快捷窗缩放修复**（方案文档《技术手册-快捷窗缩放修复-移植Electron版》，分 4 笔独立可回退）：
   - 固定画布窗（quickCanvasBoundsForAnchor/quickCanvasMaxScale，key 比对防手势中重算）+ 卡面 transform（URL 播种初值 + 广播 uiState 单一来源）
   - 删快捷窗"缩放中变底色"；已完成窗解冻（用户 2026-10-14 指示，内容冻结全面停用、广播链路保留）
   - 透明余量命中穿透（setIgnoreMouseEvents forward 基态 + 渲染层卡面 hit-test + veil 即时穿透）
   - 快速缩放取证（quick-canvas-sweep：max↔min 快速往返，画布零位移/缝隙极差 0px）——用户指定手法
3. **气泡主题同步**（C8）+ **蒙层罩卡面**（C9）：用户截图报告，当日修复当日验收通过。
4. **二级窗 3:4 统一**（4 窗 420×560 + 输入框 3:1 共享）：记录核查发现"原型已画、应用从未落地"，用户裁定范围（4 窗）与时机（随 v1.1.2）。
5. **结案**（用户结论）：C1 气泡闪/拖动看门狗（=ZCode 问题）/白条误触/G7 二级窗被盖——详见问题记录。

## 关键教训（新增）

- **验收先核对实例身份**（L1 轮同款坑二次发生）：用户报"依旧抖动"时跑的是未含新代码的安装版；开发版改动不打包就永远不存在于安装实例。
- **vitest 并行 worker 段错误（0xC0000005）**：杀软滤镜干扰 fork（F1/F2 同族），worker 崩溃=其名下测试文件被静默跳过（每轮文件数不一）。门禁以 `--no-file-parallelism` 串行为准。
- **electron-builder 输出目录覆盖**：`-c.directories.output=xxx`（根级无 `output` 选项；`--config output=x` 会被当文件路径）。
- **E2E 与开发实例并发**：同机跑 E2E 前先退干净开发实例（旋转式偶发失败、单跑即过）。
- **Windows 对无边框窗宽度轴 +4~5px 统一膨胀**（高度精确）——跨窗尺寸断言用容差，四窗一致性断言不受影响。

## 未决与移交

1. **安装版升级**：用户机器安装版=v1.1.1，需下载 v1.1.2 Setup 覆盖安装（数据保留）。
2. **缩放修复步骤 4（可选）**：松手 settle 锐化——真机看静止态文字发糊再做，单独一笔。
3. F3 家族（CI app-close 启动竞态 + vitest worker 段错误）观察中，均重跑即过。
4. §11.E 原型 7 项既存差异仍待逐项定夺；L3/L4 未开始；perMachine 安装器策略建议下版议。

---

# 11.H 第十五轮（v1.1.3 二级窗体验打磨）记录（2026-10-15）

> 提交链：b837173（四窗布局迭代）→ 7bd0871..04b4755（迭代 2~6：footer 移除/手感/角标三修/计数器/详情窗/禁选）→ ea33f01（升版）→ tag v1.1.3。
> 测试终态：单测 40/390（串行@本机，并行 vitest worker 段错误为环境问题）+ E2E 83 + typecheck/build 绿。

## 交付内容

见验收报告 §十四（8 项）；过程为高频真机迭代（每项当日闭环）。

## 关键教训（新增）

- **角标"恒像素"与"同心"互斥**：反向 zoom 保 16px 会破坏与卡片圆角（10×k）的同心关系——设计意图是"贴在卡面上的贴纸"（全随缩放）还是"屏幕级恒定控件"，必须先定语义再实现；最终取贴纸语义（位置/弧度/尺寸随缩放同心，仅描边反向计算保持 2px 物理粗）。
- **zoom 反推必须两轴 min**：Windows 对无边框窗两轴都有 +4px 量级膨胀（早期只观察到宽度轴），单轴反推会让另一轴溢出窗口=圆角被裁平。
- **初始同步不是 resize 监听的问题**：ChildHost/主窗同款坑——窗口创建期 resize 事件先于渲染层监听器挂载，初始值必须显式同步一次。
- **热路径免落盘要覆盖所有缩放入口**：主窗缩放当年已改 transient，子窗缩放漏改致 I/O 卡顿（"拖拽突然卡一下"）——凡新增缩放/拖动入口，必须对照 isClusterDragging/childScaleTransientUntil 检查。
- **多实例并存时别改错对象**：单实例锁按 userData 隔离，安装版与开发实例可并存（另：后台链重启会被锁静默拦截——重启后必须核实 PID/窗口真的换了新构建）。

## 未决与移交

1. **安装版升级**：用户机器安装版=v1.1.2，需下载 v1.1.3 Setup 覆盖安装（数据保留）。
2. 原型同步：v3.5-L2 未含本版二级窗布局迭代（表单窗比例/高度/按钮行）——如需原型镜像另开一笔。（已于 2026-10-19 随 v3.5-L2.1 完成，见 §11.N）
3. F3 家族（CI app-close/vitest worker 段错误）观察中；§11.E 原型 7 项既存差异仍待定夺；L3/L4 未开始。

---

# 11.I 第十六轮（v1.1.4 批量操作交互打磨）记录（2026-10-15）

> 提交链：779a219（顺序对调）→ 61ccb9e（透明度 0.7）→ bb470ea（返回迁移+历史窗逐控件冻结）→ 21e2782（升版）→ tag v1.1.4。
> 测试终态：单测 40/390（串行）+ E2E 84 + typecheck/build 绿。

## 交付内容

见验收报告 §十五（4 项）；高频真机迭代，每项当日闭环。

## 关键教训（新增）

- **「返回」按钮的归位**：批量退出通道从批量条迁至入口旁（返回=批量删除左邻）——语义上"从哪进就从哪退"，同时消除底部批量条与顶部入口的跨窗往返视线；三窗统一实现靠 BatchBar 与各窗入口两处联动。
- **逐控件冻结替代整容器冻结**：容器整体 frozen 会把必须保持可点的控件（如退出通道）一并冻死——冻结粒度下沉到控件。

## 未决与移交

1. **安装版升级**：用户机器安装版=v1.1.2，直接下载 v1.1.4 Setup 覆盖安装（跳过 1.1.3，数据保留）。
2. 原型同步：批量条顺序/返回迁移未画入原型（如需原型镜像另开一笔）。（已于 2026-10-19 随 v3.5-L2.1 完成，见 §11.N）
3. F3 家族观察中；§11.E 原型既存差异、L3/L4 未开始。

---

# 11.J 第十七轮（缩进白条减半 + 白条以外不吞鼠标）记录（2026-10-16）

> 待用户真机验收（未发版）。提交链见下（实现 / 测试适配 / 文档 分笔）。

## 用户诉求（2026-10-16 一次给出）

1. 边缘缩进的白条厚度再缩小一半；
2. 白条下方出现一段"鼠标不可穿透但不弹出"的死区——缩进期间要求：白条以外的区域不得影响其他电脑交互。

## 定稿与实施

- **厚度减半**：可见条 6px→3px；热区（屏内可见区/感应区）12px→6px（等比减半；`TUCK_BAR_HEIGHT`）。热区必须含屏顶贴边行（鼠标推到屏幕最顶仍能弹出），故只等比减半不减到"仅可见条"。
- **死区根因（探针实测）**：缩进时请求的胶囊窗高（原 12px）被 **Windows 系统最小窗高钳制到 ~37-40px**（随 DPI 变化；`setMinimumSize` 不豁免），多出的 ~25px 留在屏内=不可穿透且不弹的死区（mouseenter 元素只有 12px）。
- **修法（零新机制，C7 语义原样保留）**：缩进态 OS 窗仍按胶囊请求；主进程摆完读**客户端实测**校正（≤3 次测量-校正循环，对最小窗高钳制/首摆尺寸展开 +4~5px/取整三种偏差自愈）——系统撑出的余高整体**挂到屏幕上方**（屏外不可命中），屏内可见区=热区本身。渲染层白条元素由钉窗口顶改为**钉客户端底缘**（`bottom:0`；containing block=视口）。
- **为什么不用 ignore+forward hit-test**（快捷窗画布同款机制）：缩进态弹出靠 mouseenter 的系统真实命中分发（C7：被遮挡天然不弹）——forward 转发会绕开遮挡语义，可能重现"划过误触"；且 6px 热区在 forward 下还有"静止光标+点击第一击被吞"的窗口期。挂屏外方案零新机制、语义完全不变。
- **残留代价（记录在案）**：顶部任务栏/主屏上方另有显示器时，挂出屏外的余高会落在任务栏或上方屏的 160×~30px 区域（不可见但吞点击）；当前环境（底部任务栏、无上方屏）无此问题。将来若需覆盖，回评估 forward 方案或窗口区域收窄。

## 证据

- 探针实测（本机 1235×2195@175%）：`160×12` 请求→实际 `164×40`（首摆展开+钳制）；`160×60 @ y=-54` 屏外摆放生效且系统不回拉；客户端区=请求尺寸（窗口 rect 含 ~1px 不可见边框）。
- 单测 40 文件/390 条（常量与 tuckBarBounds 断言更新为 6px）；E2E tuck-capsule 断言升级（客户端底边=锚点+热区高、白条元素钉页底、screenY 映射=贴顶）+ tray-tuck 注释对齐；全量 E2E 84 全绿。
- **本机存量失败适配**（非本轮引入；`git stash` 对照实证 HEAD 同样红）：① cluster.spec 快捷窗期望改对**画布纯函数**（v1.1.2 画布制式；CI 上限≈当档故一直"意外绿"，175% 竖屏上限 1.125>当档 1.0 才暴露）；② quick-canvas 主窗宽 ±1 容差→±2（高 DPI 首摆展开实测 +2）。

## 收口（2026-10-17）

- **用户真机验收通过**（厚度/贴顶/悬停/白条以外不吞鼠标）→ 按"验收即发"节奏发布：tag `v1.1.5`、Release（Setup/Portable-1.1.5）；验收报告 §十六。
- 安装版升级：用户机器安装版=v1.1.2，装 v1.1.5 Setup 覆盖即可（数据保留）。
- 原型（v3.5-L2）未镜像本轮白条几何（如需另开一笔）。（已于 2026-10-19 随 v3.5-L2.1 完成，见 §11.N）

---

# 11.K 第十八轮（缩进系统改造·WPF 方式）记录（2026-10-17 进行中）

> 依据：WPF 版 R1「缩进/弹出重设计」（已逐行对照其 `TuckStateMachine`/`TuckBarWindow`/`ClusterController`）；方案说明书=docs/缩进改造-WPF方式-体验说明书.md（已提交并获用户批准）。
> 用户裁定（2026-10-17）：**不做过渡动画（先不需要）**；**集合不变**（缩进不改变窗口集合）；**白条水平位置保持现状**（主窗上缘中心、不算侧窗——不采用 WPF 的"整组中心"口径）。

## 步 1（白条独立窗）——✅ 已实现（2026-10-17，待用户真机确认）

- 提交：3761058（feat）+ d727f06（test）；单测 41 文件/392 条 + E2E 84/84 + typecheck/build 绿。
- 落地形态：新窗 `win=bar`（BarWindow.vue；160×热区、贴工作区顶、水平=主窗上缘中心=现状口径）；常驻透明
  （缩进态亮起+可命中，展开态 opacity 0+穿鼠标）；余高沿用 v1.1.5 客户端实测校正（挂屏上/屏外不可命中）。
  命中链=白条元素 mouseenter/click → 主进程 relayBarHit（仅白条窗可上报）→ 主窗渲染层状态机 mouse-enter。
  setClusterTucked：缩进=侧窗透明待机+主窗透明待机（veilMainWindow，几何不动）+白条亮起；弹出=白条收+主窗回亮+侧窗恢复。
  白条窗接入 getAllClusterWindows（托盘真隐藏/置顶三窗同升）、DWM 禁动画、tool window；debug state 增 mainOpacity/barVis/barBounds。
- 观感与 v1.1.5 一致（主窗缩进态由"收胶囊"改为"整窗透明待机"，普通桌面用户不可分辨）；能力验证点=
  四窗架构（E2E 窗口计数/可见性数组/DWM 断言已适配）、hover 白条跨窗中继弹出、余高屏外校正（保持"白条以外不吞鼠标"）。

## 用户报告修复（2026-10-17 当日）：锁定 × 托盘恢复被强制缩进（P1/P2 已修）

- 现象：开缩进锁 → 贴边 → 托盘隐藏/显示 → 原位置出现 3 秒后被强制缩进（逻辑错误）；此后白条悬停不弹
  （主进程已缩进但渲染层认为展开=状态分裂后果，无需单独修）。
- 根因：900ms 负载兜底绕过渲染层 locked 门直调 setClusterTucked(true)——旧假设"无二级窗=渲染层门必然放行"
  不成立（锁定/批量/拖动/未吸附都会让渲染层拒缩）；该缺陷 v1.1.4/v1.1.5 既有（git diff 实证），
  此前无"锁定×托盘恢复"交叉用例故未暴露。
- 修复提交：ad25255（P1 补 tuckLocked=commit 路径镜像 / batchActive=uiBatchState 广播点镜像 + 兜底门槛补全
  + P2 锁定时不武装 3 秒会话〔showCluster 两处；setTuckLocked(on) 同时清挂起会话〕）+ c9045ae（回归用例：
  开锁→吸附→托盘隐藏/显示→跨 3 秒会话+900ms 兜底窗口→断言保持展开/几何未变/白条不亮；修复前必红）。
- 附带：既有"缩进态托盘最小化"用例补真实吸附前置（旧用例依赖兜底为未吸附态代劳=同族缺陷的测试侧体现）。
- **P3（已实施，2026-10-17 用户裁定"全做"）**：900ms 兜底从"自己动手收"改为**只再喊两声**——重发同一
  `cursorInside(false)` 信号（900/1800ms，守卫=渲染层当前认知仍为"光标在外"，弹出/回窗后自动停喊）；
  缩进执行权**始终只在渲染层状态机**（单一权威：锁定/批量/拖动/缩放/未吸附等门由它统一判定）——
  "主进程绕过门槛"这一整类分裂从结构上消失。因直调移除，P1 补的 `batchActive` 镜像随之删除
  （`tuckLocked` 保留，供 P2 的会话门使用）。代价=失去"渲染层真卡死时代劳收尾"的窄场景
  （该场景罕见，且代劳会留分裂残局）。
- **P4（已实施）**：白条点击弹出途径移除——`@click` 与提示文案"（点击亦可）"删除，白条只认"碰"
  （组件测试同步：click 不再计入 barHit 上报）。
- **P3/P4 验证与测试侧教训**：全量 E2E 85/85 两轮；期间排查出一个**测试环境敏感点**——渲染层
  "指针活动守卫"（lastPointerInsideAt，四轮加：伪离开后指针仍在窗内活动则取消缩回）由**真机真光标**
  驱动：E2E 期间用户真光标若停在 E2E 窗口上会持续刷新它，把 fresh 离开信号后的自动缩回取消掉
  （表现为用例间歇性红）。对策=新用例统一走仓库既有"**确定性两段式**"（fake 光标 组件内→外触发全新
  离开信号），不用"依赖既有 inside=false"的单段式。另：focus-level（像素级 z 序断言）在共享桌面上
  偶发红（单跑必过、CI 必过）——既有已知脆弱类，非本轮引入。

## 用户报告修复（2026-10-17 第二例）：快捷窗"缩进→弹出后不可交互"

- 现象：展开快捷添加窗时缩进再弹出，快捷窗卡面无法交互（点不动）；隐藏再打开面板才恢复。
- 根因（含复现实证）：快捷窗穿透三态（forward 全穿透基态 ⇄ 卡面命中 ⇄ 隐藏全穿透）由**主进程**在
  显隐/缩进路径上重置基态，但**渲染层 hit-test 记忆（cardHitInside）不随之失效**——光标快速离开
  窗口（未产生"离开卡面"的最后一帧 move）时记忆停在"命中"，弹出后所有卡面内 move 都因"记忆=命中"
  被短路 → 卡面持续穿透不可交互（假象：需开关面板重置记忆）。
- **引入时间：v1.1.2 画布命中（787bb5c，2026-10-14）**——git 考古定界，且用 v1.1.5 worktree 实测同样
  复现（A 流程 ignore 停在 true），**非步 1 引入**；v1.1.1 及更早无命中机制故无此缺陷。
- 修复：主进程每次重置快捷窗穿透基态（applyQuickMouseIgnoreBase 创建/显示、hideSideWindow 隐藏）
  下发 `IPC.quickHitReset` → 渲染层清空命中记忆，下一次真实 move 重新断言（reset-only，不做"陈旧
  坐标直接断言"以规避误命中；弹出触发源在白条/轮询=光标必不在卡面，随后必有一次移动）。
- 回归用例：quick-canvas 新增"缩进→弹出后卡面命中恢复"（负向验证：临时禁用通知→用例红）。
- 遗留说明：命中记忆失效后依赖"下一次 move"，静止光标下"先点后移"的首击窗口与 §4-5 既有记载一致。

## 用户报告修复（2026-10-17 第三例）：分辨率/横竖屏/跨屏后整簇档位不重钳 → 超屏 + 快捷窗卡面被裁

- 现象（用户截图）：横屏上整簇仍是竖屏拉大的档位（约 1.4×，超"半屏高"规则）；快捷添加窗卡面
  比画布宽 → 左侧被裁（计数等文字缺一截）。
- 根因（两处叠加，均为**生效缩放不随工作区重钳**）：
  1. **主进程**：整簇缩放只在 commit（syncClusterBounds）时按当前工作区钳制；换分辨率/横竖屏
     （repositionClusterToDisplays→applyAnchor）与跨屏拖动（applyAnchor）**只重算画布上限与锚点、
     不重钳整簇档位** → 竖屏可达的大档（如 1.125+）原样带到横屏（上限 0.9）→ 窗口超半屏高；
  2. **渲染层（快捷窗）**：卡面缩放取"存储档"（广播 uiState.clusterScale），而画布尺寸随工作区
     变小 → 卡面 > 画布 → 溢出被画布边缘裁切（计数等缺一截）。主/已完成窗用视口反推故不受影响。
- 修复：
  1. 主进程镜像用户存储档（`setStoredClusterScale`，启动+每次 commit 同步），`applyAnchor` 内
     按当前工作区重钳**生效档**（`reclampScaleForWorkArea`）——跨屏拖动/换分辨率/横竖屏全部覆盖；
     只改生效值、不动存储档（回到大屏自动恢复用户档位）；repositionClusterToDisplays 位置不变但
     档位需重钳时也会重摆。
  2. 快捷窗渲染层"画布自适配"：卡面实际呈现档 = min(存储档, 画布宽/基准宽, 画布高/基准高)，
     窗口 resize 与 OS 同帧重算——卡面永不溢出画布。
- 测试：组件测试 ×2（存储档 > 画布档 → 按画布档呈现；≤ → 保持存储档）；工作区变化路径无 E2E
  钩子（需真实显示器切换）→ 真机验收（用户场景：小→大→回、横→竖→回、竖屏拉满→拖回横屏）。
- 与既有定稿关系：仍遵守"半屏高上限"（PRD 速查 #7）——本次是让该规则在工作区变化时真正生效。

## 步 2（整组三窗瞬间移出屏幕顶外）——✅ 已验收（2026-10-17，随 v1.1.6 发布）

- 落地：`applyClusterBounds` 缩进分支 → `placeTuckedOffscreen`——三窗**几何不变**、只把 y 移到
  "锚点所在屏顶边 − 8 − 窗高"（整组相对排布保留）；**不 Hide、不改透明度**（集合不变，WPF R1 语义）；
  白条（步1 独立窗）摆放不变。缩进=纯位移；弹出=白条收 + 侧窗基态恢复（命中记忆重置）+ 整组同一次落位；
  托盘隐藏期间不摆位（对隐藏窗 setBounds 会将其显示）。步1 的 veilMainWindow（主窗透明待机）随之移除。
- **关键坑（E2E 实锤）**：停放基准**不能用"全显示器最顶边"**——全屏组最顶边可能靠近另一块不同 DPI 的
  显示器，Windows 会切换窗口的 DPI 上下文 → DWM 按 DPI 比值改写窗口尺寸（424×576→303×413；拖回原屏
  又按比值复利成 593×807）。改为**锚点所在屏的顶边**：最近屏=自家屏，DPI 上下文与尺寸零改写（同屏
  跨 DPI 的老问题 #40 的现场复现，教训存档）。
- 测试：tuck-capsule 重写（整组离屏 y 断言/集合不变/几何不变/白条零变化/弹出精确还原）；tray-tuck
  缩进信号改主进程 tucked（侧窗"隐藏"断言改"屏外待机"）；quick-canvas 命中恢复用例同步。
- 残留（记录在案）：显示器直接挂在自家屏正上方且 x 范围重叠时，屏外停放的窗口可能在那块屏可见
  （Windows 无逐窗口吸附区控制；用户当前布局副屏在右上、x 不重叠，无此问题）。

## 步 1 历史设计记录

- 目标：白条从"主窗内元素"搬进**独立小窗**（第 4 窗；`win=bar`），接入托盘/置顶/显隐/命中/跨屏；主窗缩进态改为**与侧窗同款的透明待机**（opacity 0 + 穿鼠标），不再收胶囊、不再自己画白条。**用户可见观感与 v1.1.5 完全一致**（本步只换白条宿主，单独验新窗口风险）。
- 关键设计：白条窗=常驻透明（防 show/hide 表面重建闪动）、请求 6px 高被系统最小窗高钳制 → 沿用 v1.1.5 的"客户端实测校正+余高挂屏外"（helper 复用）；命中=窗内元素 mouseenter（真实命中，遮挡天然不弹）→ IPC 中继到主窗渲染层状态机（ui.dispatchTuck mouse-enter）；白条水平位置=现状口径 `tuckBarBounds(anchor, round(470*scale))` 原式不变。
- 步 2（后续）：缩进执行改"整组三窗瞬间移出屏幕顶边之外"（主窗不再收胶囊；弹回=三窗同一次落位）；"移出"目标取全部显示器最顶边之上（防串屏）。

## 未决与移交

1. 步 2 未开工；**步 1 + P1/P2 修复已完成，等用户真机复验后再进**（复验点：①锁定+托盘恢复不再被缩进；
   ②缩进/弹出/悬停/托盘/3 秒停留与 v1.1.5 一致；③桌面点击不受影响）。P3/P4 等用户裁定。
2. 完成步 2 后：需求文档 §二 缩进口径同步（形态 B → WPF 方式）。

---

# 11.L v1.1.5 + v1.1.6 会话收口（2026-10-16~17）——工作记录与移交

> 本会话跨越两个已发布版本：**v1.1.5**（白条厚度/穿透精修）与 **v1.1.6**（缩进系统改造 WPF 方式 + 三处稳定性修复）。以下为会话级记录；实现细节见 §11.J（v1.1.5）与 §11.K（缩进改造/各项修复）。

## 一、交付（均已发布并经用户真机验收）

1. **v1.1.5**（tag `v1.1.5`）：白条厚度减半（可见 6→3px、热区 12→6px）；缩进态"白条以外不吞鼠标"——系统最小窗高（~37-40，随 DPI）撑出的余高整体挂屏幕上方（屏外不可命中）；顺带适配 3 项本机存量几何断言（画布纯函数期望、高 DPI 边框余量）。
2. **v1.1.6**（tag `v1.1.6`）：
   - **缩进系统改造（WPF R1 语义，无过渡动画）**：白条=独立第 4 窗（`win=bar`）；缩进=当前打开的一级窗口**整组瞬间移出屏幕顶边之外**（不隐藏/不改透明度=集合不变）；弹出=白条收+整组同一次落位回位（无尺寸跳变）；白条点击弹出途径与"（点击亦可）"文案移除（只认"碰"）。
   - **修复：缩进锁定 × 托盘恢复被强制缩进**（900ms 负载兜底绕过渲染层锁定门；兜底改为"只重发 cursorInside(false)"=缩进执行单一权威）。
   - **修复：快捷添加窗"缩进弹出后不可交互"**（v1.1.2 画布命中起旧缺陷：命中记忆与主进程穿透基态失同步；主进程重置基态时下发 `quickHitReset`）。
   - **修复：换分辨率/横竖屏/跨屏后整簇档位不重钳**（主进程镜像存储档+按工作区重钳生效档；快捷窗卡面自适配画布不再被裁）。

## 二、本会话技术要点

- **白条独立窗**：常驻透明（防 show/hide 表面重建闪动）+ 元素 mouseenter 真实命中 → IPC 中继回主窗渲染层状态机；窗口请求 6px 被系统最小窗高钳制 → 沿用"客户端实测校正+余高挂屏外"。
- **缩进执行层**：整组离屏（三窗几何不变，y=锚点所在屏顶−8−窗高；不 Hide/不改透明度）；**停放基准必须=锚点所在屏**（"全显示器最顶边"会靠近异 DPI 显示器 → Windows 切窗口 DPI 上下文 → DWM 改写尺寸，实测 1.4× 复利）。
- **穿透基态同步**：主进程每次重置快捷窗基态（隐藏/显示/缩进）下发 `quickHitReset` → 渲染层清空命中记忆，下次 move 重断言。
- **换屏缩放**：`setStoredClusterScale` 镜像存储档（启动+每次 commit）+ `applyAnchor` 按工作区重钳生效档；快捷窗卡面实际档 = min(存储档, 画布宽/基准宽, 画布高/基准高)（窗口 resize 同帧重算）。
- **兜底语义**：900ms 兜底不再直调缩进，改为 900/1800ms 重发 `cursorInside(false)`（守卫=渲染层认知仍"在外"）。

## 三、问题→解决对照（本会话用户报告）

| 报告 | 根因 | 修复 | 引入时间 |
|---|---|---|---|
| 锁定 + 托盘恢复被强制缩进 | 900ms 兜底绕过渲染层 locked 门（旧假设"无二级窗=门必放行"不成立）；锁定时仍武装 3 秒会话 | P1 兜底门槛补全 → P3 收敛为"只重发信号"；P2 锁定不武装会话 | 兜底设计自 v1.1.0 起存在 |
| 缩进弹出后快捷窗不可交互 | 渲染层命中记忆与主进程穿透基态失同步（光标快速离开未产生"离开卡面"move） | quickHitReset 通知 + 回归用例（含负向验证） | **v1.1.2（787bb5c）**；v1.1.5 worktree 实测复现 |
| 换屏/横竖屏后整簇超屏、快捷窗被裁 | 生效档只在 commit 时重钳；换屏/跨屏只重算画布与锚点；卡面用存储档 | 镜像存储档+重钳生效档；卡面自适配画布 | v1.1.2 起的缩放/换屏路径 |
| 步 2 首版离屏尺寸被改写（开发中自抓） | 按"全显示器最顶边"停放 → 靠近异 DPI 显示器 → DWM 按比值改写尺寸 | 改用锚点所在屏顶边 | 本会话新增代码的坑 |

## 四、测试与质量

- 单测 **41 文件 / 394 条**；E2E **86 条**；typecheck/build/CI 全绿（v1.1.5、v1.1.6 各走完整发布流水：升版→打包→冒烟→tag→Release）。
- 新增回归用例：锁定×托盘恢复（跨 3 秒会话+900ms 兜底窗口）、缩进→弹出后卡面命中恢复（负向验证：禁用通知必红）、快捷窗卡面自适配 ×2；重写 tuck-capsule（整组离屏/集合不变/几何零变化/弹出精确还原）。

## 五、未解决 / 已知残留

1. **离屏停放边界**：显示器直接挂在自家屏正上方且横向重叠时，屏外停放的窗口可能在那块屏可见（Windows 无逐窗口吸附区控制；用户当前布局副屏在右上、x 不重叠，无此问题）。
2. **F3 家族观察中**：CI `app-close` 启动竞态、vitest worker 段错误（用 `--no-file-parallelism` 规避）。
3. **L3 结构与层级 / L4 交互与动效深化**未开始；**0.18s 过渡动画**为可选后续（位移结构已就绪，接过渡即可，不动语义）。
4. ✅ **原型同步（2026-10-19 已完成）**：新文件 `docs/交互原型-v3.5-L2.1.html` 已镜像 v1.1.3~v1.1.6 的二级窗布局、批量条顺序/返回迁移、白条几何、缩进改造；§11.E 7 项全部以成品为准；设置窗旧漂移一并同步。详见 §11.N。
5. **快捷窗命中**的"静止光标+先点后移"首击窗口与方案 §4-5 记载一致（未扩大）。
6. **观感类环境敏感用例**：focus-level 的像素级 z 序断言在共享桌面偶发红（单跑/CI 必过），属已知脆弱类。

## 六、待用户决定（新会话开始前/时确认）

1. ✅ **安装形态 / 版本 / 数据统一（2026-10-19 已解决）**：用户选定“升级安装版到 1.1.6”。已完成：备份 data.json → 便携版正常退出 → 安装包静默覆盖 1.1.4 → 版本/单实例/数据/快捷方式核验。今后以安装版为唯一运行形态；便携版 exe 保留作应急（共用单实例锁与数据目录，不能同时运行）。详见 §11.M。
   补充：便携版≠数据随身带——它的数据也在 `%APPDATA%\桌面待办`（不随 exe 走）。
2. ✅ **原型同步（2026-10-19 已解决）**：用户拍板“以最新版应用 v1.1.6 为准”；§11.E 7 项全部对齐成品，设置窗旧漂移一并同步；版本名 v3.5-L2.1。详见 §11.N。
3. 离屏停放边界（上方显示器场景）是否要加防护（停放方向自适应/遮挡检测）?
4. 下一轮方向：L3 / L4 / 0.18s 过渡动画 / 其他?
5. 本地构建目录：已清 v1.1.2~v1.1.5 与临时产物，保留 `dist-v1.1.6`（约 600MB）——是否连它一起删（只留 GitHub 资产）?
6. 开发实例：桌面上的 1.1.6 开发实例（`%TEMP%\dtodo-accept`）当前保留运行，是否关掉?

## 七、新会话起手

- 阅读：本文件（状态行 + §11.N + §11.M + §11.L + §11.K）→ 需求文档.md → 开发计划.md；原型基准 `docs/交互原型-v3.5-L2.1.html`（= 应用 v1.1.6；`v3.5-L2` 为 pre-sync 对照）。
- 已定不再重开：缩进=无过渡动画、集合不变、白条位置=现状口径（主窗上缘中心、不算侧窗）。
- 纪律：体验说明书先批后改；测试与实现分笔提交；vitest+E2E+构建全绿才提交；观感以用户真机为准；外部仓库 todo-wpf 只读；杀软/系统拦截直接报告不绕过；不确定先问不擅自假设。

---

# 11.M 第十九轮（安装形态与版本统一 + 数据归属）记录（2026-10-19）

## 用户选定路线

升级安装版到 v1.1.6（不卸载、不做双形态隔离）。

## 执行步骤

1. **备份**：`%APPDATA%\桌面待办\data.json` → `C:\Users\qq463\Documents\桌面待办-数据备份\data-20261019-144915.json`；源/备份 SHA256 均为 `C6439403302C8327311A06A3A889C854EC5AB553E6FFD6DDBA5EC04928D0BBB7`，大小 14982 字节。
2. **退出便携版**：对主进程（`%TEMP%\3KoJVJrf8W0BRhPrviAgbNqkSdX\桌面待办.exe`，PID 25964）发 WM_CLOSE；`before-quit` 落盘流程生效，进程正常退出，data.json 于 14:50:12 重写（哈希 `14BDD31229EEB431B1C537B4B59D02118D590F1CBA787FCA227B52E980CFC237`）。
3. **升级安装版**：`dist-v1.1.6\桌面待办-安装包-1.1.6.exe /S /currentuser /D=C:\Users\qq463\AppData\Local\Programs\desktop-todo`，退出码 0；安装目录 exe 1.1.6 / 1.1.6.0；卸载注册表 `DisplayVersion=1.1.6`（仅一条）。安装器为本地构建、未签名（Authenticode NotSigned）；静默安装未被拦截。
4. **启动与核验**：从安装目录启动，主进程 PID 1644；四窗（主/快捷/已完成/白条）正常；主窗离屏抓图（PrintWindow）显示两条待办“整理ai学习对标账号”“ai账号小红书第一篇发布”，计数 2/10。
5. **清理**：便携版自解包临时目录 `%TEMP%\3KoJVJrf8W0BRhPrviAgbNqkSdX`（384.4 MB）已删除；便携版 exe 保留在 `dist-v1.1.6`。

## 数据完整性核验

- 稳定内容指纹（todos/completed/archive/templates/settings + uiState 去除 pos）与升级前备份**完全一致**：`251492de92b1a1af4912ba758a79ef842bea7cf5e1464b8e4eaebdb0f439b4e5`。
- 唯一差异：`uiState.pos.x` 904 → 902（退出时锚点落盘，正常位置记忆）。
- 计数：todos 2 / completed 0 / archive 6 / templates 1 / settings 4 / uiState 10；data.json 14982 字节。
- 安装版渲染进程 `--user-data-dir=C:\Users\qq463\AppData\Roaming\桌面待办`，数据归属未变。

## 单实例与快捷方式

- 再次启动安装版：第二个主进程 5 秒内退出，常驻主进程仍只有 1 个（PID 1644）→ 单实例锁生效。
- 桌面快捷方式与开始菜单快捷方式均指向 `%LOCALAPPDATA%\Programs\desktop-todo\桌面待办.exe`（工作目录同名）。

## 开机自启

- 用户设置 `settings.autoStart=true`；安装版启动时 `syncAutoStartOnBoot` 已将 HKCU Run 的 `electron.app.桌面待办` 重写为 `%LOCALAPPDATA%\Programs\desktop-todo\桌面待办.exe`，无 `%TEMP%` 便携路径残留。
- `StartupApproved\Run` 无该值的禁用标记 → 开机自启视为启用。

## 残留 / 后续可选

- 便携版 exe（约 113.6 MB）仍在 `dist-v1.1.6`，可留作应急；运行前需退出安装版。
- `dist-v1.1.6` 整体（约 600 MB）与开发实例 `%TEMP%\dtodo-accept` 的去留仍待用户决定（§11.L 六.5/6）。
- 本轮未改任何代码，无需跑 vitest/E2E；仅文档更新。

---

# 11.N 第二十轮（原型同步 v3.5-L2 → v3.5-L2.1）记录（2026-10-19）

> 用户拍板：以最新版应用 v1.1.6 为准；§11.E 7 项全部对齐成品；设置窗旧漂移一并同步；版本名 v3.5-L2.1；行为类修复只标注不模拟。

## 交付

- **新文件** `docs/交互原型-v3.5-L2.1.html`（保留 `v3.5-L2` 作为 pre-sync 对照）；标题/水印/说明面板/控制台文案同步为 v1.1.6 口径。
- **v1.1.3 二级窗**：尺寸 420×400 / 420×388 / 420×428 / 420×392 / 详情 415×245 / 历史 645×620 / 设置 460×540；输入框 4:3（编辑 254px）；计数器 52px；meta 行（清空/还原邻计数器、提交/删除行尾）；详情属性块+右下关闭；标题栏关闭 34px；body 顶距 12px；缩放角弧度 9px；任意角度连续缩放（垂直折算、无 0.05 量化、30ms 节流），子窗内容随缩放同帧（内层 zoom）。
- **v1.1.4 批量**：批量条＝已选 N 项｜全选/取消｜删除所选（无返回）；返回迁至各窗「批量删除」左邻 8px；非目标窗口冻结 0.7、窗内控件 0.45；历史导航逐控件冻结。
- **v1.1.5/v1.1.6 缩进**：白条热区 160×6、可见条 3px、贴顶；缩进＝整组三窗瞬间离屏（geometry 不变、display 不变=集合不变）；弹出＝白条收+整组一次回位；白条水平=主窗上缘中心；只认“碰”，无点击弹出。
- **§11.E 7 项**：E1 图标按钮浅底+描边；E2 二级窗小按钮 26px（主按钮 30px）；E3 历史窗文字导航+meta 行+紧凑导出区；E4 已完成/历史自绘悬浮滑块；E5 勾选瞬时（无 stroke-dash 动画）；E6 拖拽柄改成品 CSS 点阵；E7 快捷空态「点右上角」。
- **额外旧漂移**：设置窗改为覆盖导入/合并导入（覆盖前确认）、上限受当前待办数约束、文案/错误提示对齐；子窗 body 顶距/标题栏关闭钮/批量条内边距等微差同步。

## 验证

- Playwright（Edge，本地 HTTP）逐项实测：初始 10 待办/2 已完成/3 模板；主窗 470×640；批量条无返回、返回在入口左邻 8px、非目标窗 0.7/控件 0.45；quick 批量同款；新增窗 420×400、输入 4:3、主按钮「新建事项」30px、小按钮 26px、计数器 52px；编辑窗 420×388/状态「进行中」/输入 254px；模板新建 428、模板编辑 392；详情 415×245/属性块/右下关闭；历史 645×620/文字导航/meta/自绘滑块/导出区；设置 460×540/两导入按钮/待办 10 时上限减号禁用+提示/覆盖确认框；缩进白条 160×6、可见 3px、三窗 display:flex、整组 translateY(-648px)，碰白条回位。
- 子窗缩放实测：拖动 420×388 → 582×537，内层 zoom 1.3848，标题栏视觉高 49.8（36×1.3848）——内容与窗框同帧。
- 控制台除 favicon 404 外无 JS 错误；脚本 `node --check` 通过。
- 仅 HTML 文档变更，未跑 vitest/E2E。

## 残留

- 行为类修复（锁定×托盘、快捷窗命中重置、换屏缩放、白条以外不吞鼠标）只在说明面板标注，单页原型未模拟；真机对照仍以安装版 v1.1.6 为准。
- 设置窗导入仅验证 UI/确认框/文件选择入口；未在浏览器内做真实 CSV 导入回归（应用侧已有单元/E2E 覆盖）。

---

# 11.O 第二十一轮（停发便携版 + 安装/数据路径口径）记录（2026-10-19）

> 用户指令：不再产出便携版。版本号仍 1.1.6；此配置从下一次打包/发版起生效。

## 构建变更

- `package.json`：`build.win.target` 仅保留 `nsis`；删除 `build.portable` 配置。
- `README.md` / `开发计划.md`：当前构建说明改为 NSIS 安装包；历史验收报告中的便携版产物记录保留，不改写历史。
- 现存的 `dist-v1.1.6\桌面待办-便携版-1.1.6.exe` 作为历史产物保留，不再随新版本产出；是否删除该历史产物仍待定（§11.L 六.5）。

## 验证

- `npm run typecheck` 通过；`vitest run --no-file-parallelism` 41 文件/**394** 条通过；`npm run test:e2e` **86/86** 通过；`npm run build` 通过。
- `electron-builder 26.15.3` 以临时输出目录打包：仅生成 `桌面待办-安装包-1.1.6.exe` + blockmap + `win-unpacked`，**无便携版产物**；临时目录已清理。

## 安装/数据路径口径（回答用户 2026-10-19 问题）

- **数据路径与安装路径无关**：数据固定 `%APPDATA%\桌面待办\data.json`（Electron `userData`，由产品名决定）；安装目录 `%LOCALAPPDATA%\Programs\desktop-todo` 只放程序文件。卸载不删数据（除非用户手动删除）。
- **同 appId 的 NSIS 升级**：检测到已有安装时，electron-builder 的目录页会被 `skipPageIfUpdated` 跳过，默认沿用旧安装路径；安装前静默卸载旧版本（`/KEEP_APP_DATA` + `--updated`），再装新版本 → 正常双击安装不会出现两个版本并存。
- **想换安装路径**：交互式向导不会提供改路径页；需先卸载旧版本再安装（卸载保留数据），或使用命令行 `/D=<新路径>`（安装前仍会先卸载旧版本）。不建议保留两个版本：单实例锁与数据目录共用，旧版本再运行可能把新版本的 `uiState` 字段写丢。
- **数据如何转移/同步**：同一台电脑换安装路径不需要转移——新旧安装都读同一个 `%APPDATA%\桌面待办\data.json`；换机时退出应用后复制 `data.json`（或整个目录）到新机同路径即可。若想要两套独立数据，当前应用不支持，需要改 appId/userData（属于新功能）。
- **当天未结算数据与历史数据**：都在同一个 `data.json` 里；`todos`=待办，`completed`=当天已完成、尚未跨天结算，`archive`=按完成日（`YYYY-MM-DD`）归档的历史，另有 `templates`/`settings`/`uiState`（含 `lastSettleDate`）。跨天结算把非今天的 `completed` 移入 `archive`，今天的完成项留在 `completed`；没有按日分文件或独立数据库。

---

# 11.P 第二十二轮（设置页底部版本号原型演示·待验收）记录（2026-10-19）

> 用户要求：设置页最下方显示「当前版本：<具体版本号>」，居中、不贴边、文字弱化；先在原型演示。

## 交付

- 新文件 `docs/交互原型-v3.5-L2.2.html`（保留 v3.5-L2.1；L2.2 只新增设置页版本号，不改其他交互）。
- 设置窗 `.win-body` 末尾新增 `.version-line`：
  - 文案：`当前版本：1.1.6`（原型硬编码；正式版应取 `app.getVersion()` 动态注入）。
  - 样式：居中、10px、`var(--faint)` 灰色、`margin-top:auto` 推到底部；实测距窗底约 35px（body 底部留白 24px + 行内留白）。
- 说明面板/标题/水印更新为 v3.5-L2.2，并标注「原型演示，待验收」。

## 验证

- Playwright（Edge）：设置窗 460×540；版本行文本正确、`text-align:center`、`font-size:10px`、颜色 `rgb(139,143,153)`；距窗底 35px；无 JS 错误（仅 favicon 404）。
- 原型已用 Edge 打开供用户查看；应用代码未改。

## 待办

- 用户验收原型观感（间距/字号/颜色）。批准后再改应用设置窗，并确定版本号来源（`app.getVersion()` 经 preload/IPC 或构建注入）。

---

# 11.Q 第二十三轮（设置页边界浮现提示原型演示·待验收）记录（2026-10-19）

> 用户要求：把行内红字「不可低于当前待办数量」改为设置窗上方居中浮现，提示后自动消失，每次点击重置；先原型演示并评估应用实现难度。

## 交付

- 新文件 `docs/交互原型-v3.5-L2.3.html`（保留 v3.5-L2.2）。
- 设置窗：
  - 移除行内红字 `#maxNote`。
  - 减号在“到达下限”时保留置灰外观（`.is-disabled`），但仍可点击触发提示；真正减到下限以下时调用 `showLimitHint('不可低于当前待办数量')`。
  - `#limitHint` 独立浮层：`position:fixed`、`z-index:1300`、`pointer-events:none`；显示在设置窗上方 `10px`、水平居中、左右至少 `12px` 安全边距；1.8s 自动淡出；每次点击清除旧计时器并重新弹出。
  - 设置窗关闭或拖动时隐藏提示。
  - 保留 v3.5-L2.2 的版本号行。
- 说明面板/标题/水印更新为 v3.5-L2.3。

## 验证

- Playwright（Edge）：设置窗 460×540；点击减号后提示文本「不可低于当前待办数量」、`display:block`、距窗顶约 9.5px、与窗中心偏差 0px；重复点击后 1.1s 仍显示（计时重置）；2.2s 后 `display:none`；行内 `#maxNote` 数量为 0；仅 favicon 404。
- 演示已用 Edge 打开；应用代码未改。

## 应用实现难度评估（仅评估，未实施）

- **总体：中等偏低，约 0.5~1 天**（含组件/E2E/真机验收），不涉及数据模型。
- 主要工作：
  1. **独立提示窗**：设置窗是独立 BrowserWindow，提示必须在其上方单独开一个小透明窗（`focusable:false`、`skipTaskbar`、`showInactive`、`setIgnoreMouseEvents(true)`），可复用现有 bubble/bar 窗口模式；按设置窗 bounds + 10px 居中定位，按工作区钳制；设置窗 move/close 时隐藏或跟随。
  2. **边界触发语义**：当前减号在到达下限时是 `disabled`，HTML 禁用按钮不触发 click；需改为“外观置灰但可点击”的按钮（class/aria 语义）或在按钮外包一层命中区；现有断言 disabled 的组件/E2E 用例需同步更新。这是本轮最主要的行为改动。
  3. **计时与重置**：设置页渲染层通过 preload/IPC 通知主进程显示提示；主进程管理提示窗和 1.8s 计时，每次通知清除旧计时器并重新显示；主题广播复用现有机制。
  4. **测试**：组件测试覆盖触发/重置/自动隐藏；E2E 覆盖提示窗位置在设置窗上方居中、自动消失、重复点击重置；真机确认多显示器/缩放。
- **版本号行**：若一并落地，正式版用 `app.getVersion()` 经 preload/IPC 注入，工作量很小。
- 风险点：提示窗的层级/焦点/点击穿透生命周期，以及减号从 disabled 改为可点击后的语义与测试适配；不涉及架构重构。

---

# 11.R 第二十四轮（设置页边界提示位置修正 + 版本行贴底 1px）记录（2026-10-19）

> 用户修正：提示要放在设置窗内部、标题栏下方空白区（蓝圈位置），仍水平居中；版本号距窗口下边缘 1px。

## 交付

- 新文件 `docs/交互原型-v3.5-L2.4.html`（保留 v3.5-L2.3）。
- 设置窗 `.win-body` 顶部预留 36px 提示区；`#limitHint` 改为定位在设置窗内部（`r.top + 38×zoom`，即标题栏下 2px），水平居中；1.8s 自动消失、每次点击重置、关闭/拖动隐藏不变。
- 版本行：`margin:auto 0 0; line-height:1;`；`#settingsWin .win-body` 底部 padding 置 0 → 实测版本行底部距窗口外底 **1px**（含窗口 1px 边框）。
- 行内红字「不可低于当前待办数量」保持移除；版本号行保留。

## 验证

- Playwright（Edge）：设置窗 460×540；点击减号后提示文本正确，`insideTop=38px`（窗口 top=132、提示 y=170）、`centerDiff=0`、提示底部到第一个标签约 **5.6px**；1.8s 后 `display:none`；重复点击重置；版本行 `bottomGap=1px`；行内 `#maxNote` 数量 0；仅 favicon 404。

## 应用实现难度（修正）

- **总体：低，约 0.25~0.5 天**（含组件/E2E/真机验收）。比“窗口外提示”方案简单很多：不再需要独立提示窗，也不需要处理主进程 z-order/焦点/点击穿透/DPI。
- 主要工作：
  1. 设置窗渲染层顶部预留提示区（本原型 36px），提示居中显示/隐藏；随设置窗缩放/移动自然跟随。
  2. 减号从 `disabled` 改为“置灰但仍可点击”的控件（class/data 语义，点击触发提示）；同步更新现有断言 `disabled` 的组件/E2E 用例。
  3. 1.8s 计时、每次点击重置；关闭设置窗时清理计时。
  4. 版本行：`app.getVersion()` 经 preload/IPC 注入；距底 1px 的 CSS。
  5. 测试：组件覆盖提示显示/重置/隐藏；E2E 覆盖窗内位置/居中/版本号；真机确认。
- 风险点：顶部提示区会占用 36px，设置内容整体下移（本原型已下移）；如果不想占位，可改为绝对定位覆盖（不改变布局）。减号可点击语义和测试适配是主要工作量。无架构级风险。

---

# 11.S 第二十五轮（模板满额锚定提示原型演示·待验收）记录（2026-10-19）

> 用户：原型有「先完成手头上的事吧」，成品提示不同；改成原型文案，浮现后消失，位置由我按设计 skill 范式选择。用户已通过 v3.5-L2.2 版本号行与 v3.5-L2.4 设置页边界提示。

## 交付

- 新文件 `docs/交互原型-v3.5-L2.5.html`（保留 v3.5-L2.4）。
- 模板行「＋」在待办 10/10 时：
  - 不再使用底部 toast；
  - 在点击的「＋」旁显示暗色 tooltip「先完成手头上的事吧」，右对齐该按钮、带向下箭头；上方优先，空间不足翻到下方；
  - 1.8s 自动淡出，每次点击重新弹出并重置计时；
  - 快捷列表滚动、拖动组件、关闭快捷窗时隐藏；不改变布局。
- 设计依据（design-taste-frontend）：反馈贴近触发点、单行 11px 高对比 tooltip、仅 transform/opacity 动画、reduced-motion 全局禁用过渡、无布局位移。

## 验证

- Playwright（Edge）：＋ 按钮 `x=682,y=163`；tooltip `x=583,y=128`、`119×27.4`，右缘与 ＋ 右缘对齐（702），位于上方（`below=false`），距 ＋ 顶部约 7.7px；文本正确；底部 toast 未出现；1.8s 后 `display:none`；重复点击后 1.1s 仍显示；仅 favicon 404。

## 应用实现难度

- **总体：低，约 0.25~0.5 天**（含组件/E2E/真机验收）。不需要新窗口，也不需要主进程改动。
- 主要工作：
  1. `QuickPanel.vue` 把 `limit-reached` 从现有行内 `error`（「待办数量已达上限」）中分离：其他错误仍 inline；上限点击改为 transient row hint。
  2. 在快捷面板内加 tooltip 覆盖层，锚定到被点击的「＋」：右对齐、箭头、上方优先/下方翻转；注意快捷窗画布有 transform/zoom，锚点用 `getBoundingClientRect` 或面板坐标换算。
  3. 1.8s 计时、每次点击重置；滚动/隐藏面板/窗口移动时清除计时。
  4. 文案改为「先完成手头上的事吧」；`tests/component/quick-panel.test.ts:53` 目前断言 `quick-error` 含「上限」，需同步改为 tooltip 断言；新增显示/重置/自动隐藏用例；E2E 可选。
- 风险：快捷窗 canvas/zoom 下的锚定坐标、滚动时隐藏；测试适配。无架构级风险。

---

# 11.T 第二十六轮（模板满额提示位置修正）记录（2026-10-19）

> 用户修正：提示改到快捷添加窗口内部上方空白处，水平居中（参考设置页提示的位置）；不再锚定「＋」。

## 交付

- 新文件 `docs/交互原型-v3.5-L2.6.html`（保留 v3.5-L2.5）。
- `#quickWin .win-body` 顶部预留 36px 提示区；`#actionHint` 改为快捷窗内部顶部居中：
  - `top = quickWin.top + 38×zoom`（标题栏下 2px）；
  - 水平居中；无箭头、无锚点翻转；
  - 暗色 11px 提示条，1.8s 自动消失、每次点击重置；
  - 滚动/拖动/关闭快捷窗隐藏不变。

## 验证

- Playwright（Edge）：快捷窗 310×640，位于 `(422,64)`；提示 `119×27.4`，位于 `(518,102)`；与窗中心偏差 **0.5px**；`insideTop=38px`；距面板标题行 **7.6px**；`::after` 无箭头；底部 toast 未出现；1.8s 后隐藏，重复点击重置；仅 favicon 404。

## 应用实现难度（修正）

- **总体：很低，约 0.25 天**（含组件/E2E/真机验收）。不再需要锚定「＋」的坐标换算、上下翻转或箭头。
- 主要工作：
  1. `QuickPanel.vue` 顶部加提示区（本原型预留 36px），提示水平居中；快捷窗内容整体下移 24px。
  2. 把 `limit-reached` 从现有行内 `error`（「待办数量已达上限」）中分离；其他错误仍 inline；上限点击改为 transient hint。
  3. 1.8s 计时/重置；滚动/隐藏面板/窗口移动时清除。
  4. 文案改「先完成手头上的事吧」；`tests/component/quick-panel.test.ts:53` 现有 `quick-error` 断言需同步改；新增显示/重置/自动隐藏用例。
- 风险：快捷窗 canvas/zoom 下提示随面板缩放；顶部 36px 留白会让内容下移。无架构风险。

---

# 11.U 第二十七轮（三处原型落地应用）记录（2026-10-19）

> 用户：三个原型全部通过，落地应用；不要多余修改，出现冲突先停。

## 交付

- **版本号 API**：`IPC.getVersion`（contract/preload/main）；设置页底部「当前版本：x.y.z」由 `app.getVersion()` 动态注入。
- **设置页**：移除行内「不可低于当前待办数量」；减号在下限保持置灰外观但可点击，点击在设置窗内部顶部浮现提示（1.8s、每次点击重置）；版本行贴底。组件/E2E 用例同步。
- **快捷窗**：模板→已满待办不再显示行内「待办数量已达上限」；在快捷窗内部顶部空白区水平居中浮现「先完成手头上的事吧」（1.8s、每次点击重置；滚动/批量/卸载清理）。组件/E2E 用例同步。

## 唯一实现偏差（已处理，未扩大改动）

- 定向 E2E 发现设置页 body 有 2px 溢出/滚动条，使提示中心偏 4.7px、版本行贴不到底。最小改动：
  - 提示移到设置窗根层（不受 body 滚动条影响），仍在窗顶 38px、水平居中；
  - 设置页顶部留白 36→34px，消除 2px 溢出；表单内容比原型高 2px，其余视觉不变；
  - 版本行仍贴底（E2E versionGap ≤3px）。
- 快捷窗保持 L2-③「win-body 顶距 8px」：用 28px 提示 lane + 提示绝对定位在 38px，内容仍在 72px；未改既有排版断言。

## 验证

- `npm run typecheck` 通过；vitest **397/397**；E2E **87/87**；`npm run build` 通过。
- 定向 E2E：设置提示在表单上方、水平居中（容差 3px）、版本行贴底；快捷提示在窗内顶部（<80px）、水平居中、1.8s 自动消失。
- 开发验收实例已用 `%TEMP%\dtodo-accept` 启动；安装版 v1.1.6 与生产数据未动；未升版、未打包、未发布。

## 备注

- 本轮提交按「测试 / 实现」分笔；测试提交先红、实现提交后全绿。
- 若要严格恢复原型 36px 留白，需要再调设置窗高或压缩内容；当前 34px 是为消除 2px 滚动条的最小实现偏差，视觉位置不变。
