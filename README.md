# 桌面待办（DesktopTodo）

Windows 桌面待办事项悬浮小组件：像贴在屏幕角落的一组智能便签，随时可见、随手可用。

> 本地优先 · 免登录 · 不联网 · 数据只存在自己电脑上

## 功能特性（v1.0）

- **组件簇**：快捷添加（模板库）＋ 待办主页 ＋ 已完成 三面板并排，可独立开关、整体拖动、等比缩放、上边缘贴边缩进
- **待办管理**：新建/编辑（300 字校验）、勾选完成（动画）、长按手柄拖拽排序、批量删除
- **模板库**：常用事项一键加入待办（模板保留），上限 10 个、内容查重
- **逾期与跨天**：统一逾期口径（创建日期 ≠ 当天/完成日期），跨 0 点静默结算归档历史
- **历史记录**：按天翻阅、CSV 导出（UTF-8 BOM 五列）、覆盖/合并导入（三元组去重）
- **回收站**：待办/模板/历史三类分组，恢复、彻底删除、7/30 天/永不自动清理
- **系统行为**：托盘常驻（右键退出为唯一关闭途径）、单实例、开机自启、日/夜主题、字体三档、分辨率变化自动回屏

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 44（无边框透明窗口/托盘/点击穿透） |
| 语言 | TypeScript（strict） |
| 前端 | Vue 3 + Pinia |
| 构建 | electron-vite + electron-builder（NSIS + 便携版） |
| 测试 | Vitest + @vue/test-utils（单元/组件）· Playwright _electron（E2E） |

## 架构

```
electron/               主进程（窗口/托盘/单实例/IPC/数据文件 IO）
  └─ main/context.ts    AppContext：启动结算、提交持久化、退出 flush
src/core/               ★ 领域逻辑层（纯 TS，零框架依赖，TDD 核心）
  ├─ models/            数据模型与校验
  ├─ services/          逾期/跨天结算/上限/模板/回收站/CSV/设置
  ├─ repositories/      内存（测试）+ 文件（生产，原子写+防抖）
  └─ utils/             日期、缩放钳制、缩进状态机、命中检测（纯函数）
src/panels/             三个常驻面板
src/windows/            子窗口页面（新增/编辑/详情/历史/设置/回收站）
tests/unit|component|e2e/
```

## 开发

```bash
npm install          # 安装依赖（首次需 node scripts/gen-icon.cjs 生成图标）
npm run dev          # 开发模式（热更新）
npm run verify       # 类型检查 + 全量单元/组件测试
npm run test:cov     # 覆盖率报告（core 层行覆盖 ≥90% 门槛）
npm run test:e2e     # E2E（Playwright 驱动真实 Electron）
npm run dist         # 打包 NSIS 安装包 + 便携版
```

## 版本管理约定

- 严格 TDD：每个任务先写失败测试（`test(M#-T##): …`）再实现（`feat(M#-T##): …`），分笔提交
- 里程碑：M0 脚手架 → M1 领域逻辑 → M2 主进程 → M3 渲染 UI → M4 窗口行为 → M5 E2E → M6 打包验收
- 交付版本打 tag（`v1.0.0`）

## 文档

- [PRD.md](PRD.md) —— 产品需求（44 条验收标准）
- [需求文档.md](需求文档.md) —— 交互细节补充
- [开发计划.md](开发计划.md) —— TDD 执行计划
- [docs/验收报告.md](docs/验收报告.md) —— 第一版验收结果
