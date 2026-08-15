# dsh-archive-viewer

DeepSeek Harness（DSH）Web GUI 的归档会话管理插件：**查看 / 恢复已归档会话**，外加右上角**一键关闭 dsh**。

> 当前版本：**3.0.0-test（测试版）**

English: [README.en.md](README.en.md) · 更新日志: [CHANGELOG.md](CHANGELOG.md)

## 功能

- **侧边栏插件栏入口「已归档会话」**（设置按钮上方）：列出全部归档会话——标题、最后活跃时间、所属工作区、运行中/空白状态
- **关键词搜索**：输入即筛（标题 / 会话 ID / 工作区，不区分大小写）；开启「内容」模式后还会逐页扫描每段会话最近的对话（每会话扫描页数可在设置中调整，扫描进度实时显示）
- **排序 + 筛选**：按最近更新 / 名称 / 会话 ID 排序，升序/降序一键切换；标签筛选收纳在「筛选」按钮菜单内，支持多选、AND / OR 模式与标签搜索，和关键词搜索叠加
- **归档会话标签**：用户可给每个归档会话添加/删除自定义标签；标签持久化在 DSH profile 目录，由 host 半区提供本地 HTTP API 读写
- **内嵌 AI 助手**：面板底部可折叠小窗口，直接调用 DSH 标准模式（默认 `standard`，可在设置改为其他 agent preset）驱动真实 agent，帮助检索会话、添加标签、整理归档；对话中的代码块/超长文本自动折叠
- **AI 助手会话自动隐藏**：AI 助手使用的会话会自动归档为内部 helper 会话，不出现在侧边栏和归档面板；「新对话」会安全删除上一个 helper 会话，不会误删用户会话
- **AI 工作区**：AI 助手会话默认在 `E:\dsh-ai-workspace` 下创建，可在设置中修改
- **隐藏临时检索标签**：agent 检索命中后自动给会话添加隐藏标签「agent检索」并切到对应筛选；该标签不显示在会话徽章上，取消勾选后自动清除
- **排列方式**：竖列列表 / 横排网格（网格下展开的对话横跨整行）
- **可关闭的介绍文本**：面板顶部说明可一键关闭，可在设置中重新开启
- **设置界面**（面板右上角齿轮）：语言、排序、排列、内容搜索、AI 模式、AI 模型与思考强度、AI 工作区、标签筛选模式、介绍文本显隐，全部即时持久化；「恢复默认」一键还原
- **中英双语**：跟随浏览器语言自动切换（设置里可手动覆盖为中文或 English）
- **查看对话**：直接读取归档会话的日志（`session.history`，冷会话走持久化检查，无需激活 Agent），支持分页加载更早
- **下载日志 ZIP**：官方 `session.export` 端点
- **恢复会话（取消归档）**：一键把会话放回原工作区分组，位置原样保留
- **右上角「关闭 dsh」按钮**：确认后优雅关机（等价于在启动终端按 Ctrl+C，5 秒宽限正确收尾）
- **皮肤全适配**：全部使用 shell 设计令牌（`--dsw-alias-*`），自动跟随任意皮肤（含半透明/深色侧边栏类皮肤）；面板 Portal 到 `document.body`，避开皮肤侧边栏作用域的令牌覆盖

## 依赖：DSH 核心补丁（必读）

「恢复会话」与「关闭 dsh」依赖 DSH 核心新增的两个 RPC（截至 2026-08 官方尚未包含）：

- `workspace.unarchiveSession` —— 注册表级取消归档
- `host.shutdown` —— 经 CLI 启动器的 `appExit` 触发优雅关机

使用前请先应用补丁：

```sh
cd <你的 deepseek-harness 检出目录>
git apply /path/to/dsh-archive-viewer/patches/0001-workspace-unarchive-and-host-shutdown-rpcs.patch
```

然后**重启 dsh web**（源码运行时 tsx 直接执行，无需构建；发布包安装的用户需重新构建受影响包）。补丁共 8 个文件：workspace 注册表、apiproxy 接口/校验/路由/实现、host schema 等。

> 若 DSH 官方后续合入这两个 RPC（`workspace.ts` 注释里的 "a future unarchive" 正是本补丁实现的位置），补丁会变为空操作，可安全跳过。

## 安装

前置：Node.js >= 22、pnpm。

```sh
git clone https://github.com/keepermttl/dsh-archive-viewer.git
cd dsh-archive-viewer
pnpm install
pnpm build

# 安装进 web profile（link: 指向本目录）
dsh plugin --profile web add link:$(pwd)        # POSIX
dsh plugin --profile web add link:E:\path\to\dsh-archive-viewer   # Windows
```

重启 `dsh web`，浏览器 **Ctrl+F5** 硬刷新。

> 从旧版本升级后，请务必**重启 `dsh web`**：本版本 host 半区新增了标签存储与 `/api/archive-viewer/tags` 本地 API，仅刷新浏览器无法加载 host 侧变更。

## 使用

1. 侧边栏底部（设置按钮上方）点击「已归档会话」打开面板
2. 搜索框输入关键词即时过滤；点击「内容」可同时搜索对话内容（设置里可调整每会话扫描页数）
3. 工具栏选择排序方式（最近更新 / 名称 / ID）与升/降序；点击「筛选」按钮打开标签筛选菜单，可按标签多选（AND / OR）、搜索标签或开启「Agent 检索」
4. 齿轮按钮打开设置：语言、排序、排列、搜索、AI 模式、AI 模型与思考强度、标签筛选模式、介绍文本显隐、恢复默认
5. 每个会话行：**查看对话 / 恢复会话 / 下载日志 (ZIP) / 复制 ID / 标签**
6. 面板底部「AI 助手」小窗口：直接和 DSH agent 对话，让它检索会话、添加标签或整理归档；agent 可通过标签 API 操作标签；代码块/长文本会自动折叠；AI 会话自动隐藏，点「新对话」会删除上一个 AI 会话
7. 会话头部**右上角**电源按钮 → 确认后关闭 dsh

设置项（语言、排序、排列、搜索、AI 模式、AI 模型与思考强度、标签筛选模式等）保存在浏览器 localStorage（`dsh-archive-viewer:settings:v1`），跨刷新、跨页面持久生效。

标签数据由 host 半区持久化到 DSH profile 目录下的 `dsh-archive-viewer-tags.json`，并通过本地 HTTP API 读写：

- `GET /api/archive-viewer/tags`：读取全部标签
- `POST /api/archive-viewer/tags`：增删标签，JSON 体如 `{"sessionId":"<id>","add":["标签"]}` / `{"sessionId":"<id>","remove":["标签"]}`
- `POST /api/archive-viewer/tags`：清除隐藏检索标签，JSON 体 `{"clearHidden":true}`

## 兼容性

- 针对 DSH `0.1.0-rc.5` 源码检出开发验证
- 客户端零框架类型依赖：不 import 任何 `@deepseek-ai/*` 值，全部结构类型，不随 DSH SDK 版本漂移
- 构建产物：`tsdown`（host 半区 `lib/index.js` + browser 半区 `lib/client.js`，标准 `window.__ModuleLoader__.load` 闭包工厂格式）

## 许可与使用声明

**MIT License**（见 [LICENSE](LICENSE)）。

欢迎任何人**使用、修改、引用、或把本项目收录进自己的插件合集**（如 dsh-web-ui 全家桶），只需：

- 保留 `LICENSE` 文件与版权声明
- 标明出处（本仓库链接）

## 相关

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- 插件形态参考 [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)（`dsh.bundle.patch` + `dsh.client` 声明 + 槽位注册）
