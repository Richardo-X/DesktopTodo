# HANDOFF · 开发交接文档（v1.0.1 修复轮）

> 本文档供新开发会话使用。阅读顺序：**本文件 → PRD.md → 需求文档.md → 开发计划.md**，UI 与交互以 **docs/交互原型-v3.1.html（已经用户确认）** 为基准。冲突裁决顺序：用户当次指示 > PRD/需求文档 > 原型 > 本文件。

---

## 1. 项目概况

- **产品**：桌面待办（DesktopTodo）——Windows 桌面待办悬浮小组件。本地优先、免登录、不联网、数据存 `%APPDATA%\桌面待办\data.json`
- **技术栈**：Electron 44 + TypeScript(strict) + Vue 3 + Pinia；Vitest + @vue/test-utils（单元/组件）；Playwright `_electron`（E2E）；electron-vite + electron-builder
- **仓库**：github.com/Richardo-X/DesktopTodo（私有），远程 `origin/main`，CI=GitHub Actions（windows-latest，typecheck+test+build+e2e）
- **质量基线**：单元/组件 282 用例 + E2E 14 用例全绿；core 层行覆盖 96.8%（门槛 90%，vitest.config thresholds）
- **角色与纪律**：你是开发者。严格 TDD（红→绿→重构，禁止先实现后补测试）；测试与实现分笔提交；格式 `test(v1.0.1-B#): …` / `feat(v1.0.1-B#): …` / `fix(v1.0.1-B#): …`；每批全量测试绿后提交推送，CI 必须绿；**PRD 未覆盖的细节停下来问用户，不要自行发挥**

## 2. 当前状态（2026-09-27 v1.0.8 已发布；第五轮验证完毕，下一步=原型 v3.2 确认→三窗分离，本节供新会话接手）

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

### 10.4 新会话待办（按优先级）
1. **⚠️ Win+D 隐藏组件——未解决（用户三次实测确认，最高优先）**
   - 已试并失败：①minimizable:false+minimize restore 兜底（无 minimize 事件产生）②DWM cloak 轮询 300ms+解除（未检测到 cloak）③WS_EX_TOOLWINDOW（依旧隐藏）
   - 铁证：用户按 Win+D 时诊断日志**零事件**（[win-d-dbg] 无任何输出）——Win+D 的隐藏完全绕过 Win32 窗口消息层
   - 日志：dev 启动时 `npm run dev > /c/tmp/app-stdout.log 2>&1` 捕获；诊断代码 [win-d-dbg]（cluster-windows.ts makeWindow 内 dEvents 循环）与 cloak 轮询（startCloakGuard）仍在
   - 新会话方向建议：a) 查 Win+D 对"无 owner 的透明 skipTaskbar 窗口"是否有特殊 shell 处理（如浮层/UDWM）; b) 试owner/parent 关系或 SetWindowLong 其他样式; c) 考虑"检测可见性丢失即 ShowWindow"的可见性轮询（isCloaked 换 IsWindowVisible+IsIconic 组合）; d) Electron issue 检索"transparent window win+d"
   - 注意：Win+D 测试必须用 dev 重启后的实例（日志才捕获）；用户当前安装版未装（开发版无自启=用户报"开机自启失败"属预期，C-4 发版后消失）
2. **C-4 发版 v1.1.0**：package.json 1.0.8→1.1.0 → electron-builder 打安装包 → 安装版冒烟（缩放/置顶/蒙层/缝隙4px/二级窗打开/自启开关真实写入注册表——E2E 的 C-3 防护断言仅适用开发版）→ **开机自启真机重启测试** → tag v1.1.0 → Release → 本文件更新
3. 二级窗打开提速专项（隐藏复用架构：关闭时隐藏不销毁、打开显示+刷数据，400ms→50ms 预估；先设计后实装）
4. 缩放呈现已定稿 v3.3（拖影=DWM 层限制维持现状；决策 #7 维持原判；原型 v3.4 已否决删除）

### 10.5 本会话教训（新增）
- **改渲染层代码后跑 E2E 必须先 npm run build**（E2E 跑 out/ 产物——本轮白条/蒙层两度因旧产物误判）
- koffi Win32 三坑：Win32 BOOL 用 'int32'（'bool' 1 字节致 IsWindowVisible 恒 false）；GetTopWindow 后用 GW_HWNDNEXT(2) 遍历（PREV 在链顶返回 0）；koffi.struct 必须先于引用它的 func 声明（否则运行时崩溃弹窗）
- 经典 z 序枚举/命中测试（GetTopWindow/GetWindow/WindowFromPoint）对 Electron 透明合成窗口为盲区（25 点全穿透/枚举不见窗口）——z 序验证只能用户真机
- SetWindowPos(HWND_BOTTOM) 返回成功但对透明窗可能不生效（与样式重排竞争）——需 120/400ms 双次沉底
- setFocusable(false) 会杀焦点——焦点判定必须先于它；且其样式变更异步重排 z 序（沉底需在其落地后）
- 用户共享桌面环境会干扰 E2E 截图/z 序断言（其他应用窗口弹入）——断言用状态语义（atop/focusable/bounds）而非像素
