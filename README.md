# dsh-archive-viewer

DeepSeek Harness（DSH）Web GUI 的归档会话管理插件：**查看 / 恢复已归档会话**，外加右上角**一键关闭 dsh**。

English: [README.en.md](README.en.md)

## 功能

- **侧边栏插件栏入口「已归档会话」**（设置按钮上方）：列出全部归档会话——标题、最后活跃时间、所属工作区、运行中/空白状态
- **关键词搜索**：输入即筛（标题 / 会话 ID / 工作区，不区分大小写）；开启「内容」模式后还会逐页扫描每段会话最近的对话（每会话扫描页数可在设置中调整，扫描进度实时显示）
- **排序**：按最近更新 / 名称 / 会话 ID 排序，升序/降序一键切换
- **排列方式**：竖列列表 / 横排网格（网格下展开的对话横跨整行）
- **可关闭的介绍文本**：面板顶部说明可一键关闭，可在设置中重新开启
- **设置界面**（面板右上角齿轮）：语言、排序、排列、内容搜索、介绍文本显隐，全部即时持久化；「恢复默认」一键还原
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

## 使用

1. 侧边栏底部（设置按钮上方）点击「已归档会话」打开面板
2. 搜索框输入关键词即时过滤；点击「内容」可同时搜索对话内容（设置里可调整每会话扫描页数）
3. 工具栏选择排序方式（最近更新 / 名称 / ID）与升/降序；列表/网格按钮切换排列方式
4. 齿轮按钮打开设置：语言、排序、排列、搜索、介绍文本显隐、恢复默认
5. 每个会话行：**查看对话 / 恢复会话 / 下载日志 (ZIP) / 复制 ID**
6. 会话头部**右上角**电源按钮 → 确认后关闭 dsh

设置项（语言、排序、排列、搜索、介绍文本等）保存在浏览器 localStorage（`dsh-archive-viewer:settings:v1`），跨刷新、跨页面持久生效。

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
