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
  - 6fe4ed3 / 173c052 / c149f00 / 4827484 / 967a61a / 5bee942 / d236dfe / 44bd4e2 / b91e27a / ff7361a：原型底本 + 交互原型 v3.1（经多轮评审修订，**2026-09-24 用户确认定稿，作为 UI 参考**）
  - 原型评审全部反馈已折入：决策 #13~#20 与本文件第 4 节工作分解
- **真实 UI 代码未动**：工作区干净，等于 v1.0.0 交付代码。v1.0.1 的全部代码实施由新会话（你）执行
- 2026-09-24 更新：**回收站机制彻底移除**（决策#21，用户指示）已落文档——PRD/需求文档升 v1.2；原型 danger 按钮 hover 修正（决策#22）；新增决策 #21~#24 与 B1.5 批次。**开发未开始，待用户通知**
- 用户已确认原型的功能裁定：**设置页 4 项（上限/时制/导入/自启）**——字体项随决策#3 移除（PRD 条款留待产品经理修订）、回收站项随决策#21 移除；~~回收站窗口为原型语言新造~~（v1.2 已整体移除）

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

### 8.3 本轮已实施修复（滚动条优先项）

- **根因一（全局）**：渲染层从无 body 复位（src/styles/ 为空、index.html 无样式），浏览器默认 body margin 8px 使 100vw/100vh 页面溢出 16px → 主簇与所有子窗口出现页面滚动条（v1.0.0 验收反馈#2/决策#12 的遗留欠账）。修复＝新增 `src/styles/global.css`（html,body margin:0/overflow:hidden）并在 main.ts 导入。
- **根因二（缩放，用户感知的「隐形窗口」）**：`.cluster`/`.child-root` 采用「100vw/100vh 尺寸 + zoom」——CSS zoom 会把按视口计算的尺寸**再乘一次缩放**：scale>1 时内容渲染为视口的 scale 倍（巨大窗口+滚动条）；scale<1 时内容只占窗口一角、缩放角标贴在真窗口角上脱离可见卡片。修复＝zoom 容器尺寸改为 `calc(100vw/scale)×calc(100vh/scale)`（zoom×尺寸=视口，任意缩放恰好填满真窗口）。
- **关于用户提议「暂时取消缩放上下限」**：诊断结论为与上下限无关（上限是 PRD 速查#7 硬性要求+决策#23 用户已确认；取消只能让默认 scale=1 时掩盖问题，拖动后仍复现）。故保留上下限，直接修尺寸公式。
- 回归：280 单元/组件用例 + 15 E2E + 覆盖率门槛全绿。
