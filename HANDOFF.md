# HANDOFF · 开发交接文档（v1.0.1 修复轮）

> 本文档供新开发会话使用。阅读顺序：**本文件 → PRD.md → 需求文档.md → 开发计划.md**，UI 与交互以 **docs/交互原型-v3.1.html（已经用户确认）** 为基准。冲突裁决顺序：用户当次指示 > PRD/需求文档 > 原型 > 本文件。

---

## 1. 项目概况

- **产品**：桌面待办（DesktopTodo）——Windows 桌面待办悬浮小组件。本地优先、免登录、不联网、数据存 `%APPDATA%\桌面待办\data.json`
- **技术栈**：Electron 44 + TypeScript(strict) + Vue 3 + Pinia；Vitest + @vue/test-utils（单元/组件）；Playwright `_electron`（E2E）；electron-vite + electron-builder
- **仓库**：github.com/Richardo-X/DesktopTodo（私有），远程 `origin/main`，CI=GitHub Actions（windows-latest，typecheck+test+build+e2e）
- **质量基线**：单元/组件 282 用例 + E2E 14 用例全绿；core 层行覆盖 96.8%（门槛 90%，vitest.config thresholds）
- **角色与纪律**：你是开发者。严格 TDD（红→绿→重构，禁止先实现后补测试）；测试与实现分笔提交；格式 `test(v1.0.1-B#): …` / `feat(v1.0.1-B#): …` / `fix(v1.0.1-B#): …`；每批全量测试绿后提交推送，CI 必须绿；**PRD 未覆盖的细节停下来问用户，不要自行发挥**

## 2. 当前状态（2026-09-26 v1.0.4 已发布，本节供新会话接手）

- **v1.0.3 已发布**（#6 删除按钮禁用定稿补丁）；v1.0.2 为第二轮验收修复发版（尺寸 +15% 七项等 7 项，用户已确认尺寸无问题）
- **v1.0.4 已于 tag/Release 发布**（DesktopTodo-Setup/Portable-1.0.4.exe；CI 绿、冒烟通过）。**第三轮验收修复已完成**（2026-09-26，8 项全部实施，详见 §8.5 与 docs/验收报告.md v1.0.4 章节）：触碰才吸附+贴齐、缩进胶囊 160×6+感应区=胶囊、拖动中抑制自动缩进（修拖动变白条）、勾选框连点 450ms 保护窗、气泡照原型重做（仅截断弹/行左侧/Teleport 单例/模板行补齐）、去窗口投影+去 backdrop-filter（夜晚黑块）、标题栏照原型重做（品牌区+单组5枚SVG图标）、开机自启加固（启动重写登录项+回读校验+未生效提示）
- **质量基线**：320 单元/组件 + 26 E2E 全绿 + 覆盖率门槛（CI 反馈两修后最终态）
- **黑块修复与自启加固需用户真机复验**（黑块为透明窗口合成问题本地无法自证；自启需重启电脑验证，若仍失效请用户查任务管理器→启动应用）
- **打包环境**：Defender 排除项已设，`npm run dist` 一次通过；**打版后必须冒烟**（`powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1`）
- 用户已确认的功能裁定（存档）：**设置页 4 项（上限/时制/导入/自启）**；二级窗口尺寸 +15% 维持；批量禁用范围=全禁；#6=按钮禁用方案；Win+D 记录备查不优化；缩进条备用样式=200×12 淡化白条（更换时提醒用户）

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
