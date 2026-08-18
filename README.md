# DeepSeek Harness Desktop

把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面。应用自动启动和管理本地 Harness 服务，集成系统托盘与桌面窗口，无需安装 Node.js 或执行命令。

- 图标与官方完全一致：所有图标（窗口 / 托盘 / 界面 / 安装包）均由官方 `favicon.svg`（字节级一致副本 `assets/dsh.svg`）栅格化生成。
- 桌面端不修改官方仓库的任何文件；全部自有状态存放在 `$DSH_HOME/dsh-desktop`（默认 `~/.dsh/dsh-desktop`）。

## 1.3.0 新特性

- **多模态融入官方对话流**：官方对话框模型切换器旁实时显示当前模型的「多模态 / 纯文本」能力标识；为纯文本模型一键声明图片输入能力；草稿含图片而当前模型不支持时给出引导提示，模型与模态切换自然无感。
- **Skill 生态扩展**：设置面板内直接搜索 GitHub 上的 Skill 仓库并一键安装；支持把 Skill 文件夹 / `SKILL.md` / zip / tgz 压缩包**拖入设置面板**即完成安装。
- **MCP 连接测试**：每个 MCP 服务器卡片提供「测试连接」，真实握手（stdio 进程 initialize / streamable-http 会话）并报告工具数量与延迟。
- **内置插件说明**：新增「内置插件」分区，对官方随包插件（MCP 客户端、web 工具、记忆等）给出中文用途解释与分类。
- **更新通道默认绑定镜像站**：桌面版更新源与引擎镜像默认指向 `http://199.7.140.33:8010`，主地址不可用时自动沿备用链回退，并显示实际生效的更新来源；支持在应用内直接下载桌面版安装包。
- **图片查看器增强**：修复官方图片灯箱缺陷，支持滚轮缩放、拖拽平移、双击重置与本地下载。
- **内置引擎升级至 0.1.0-rc.7**：修复官方若干已知问题。

## 目录

1. [安装与运行](#安装与运行)
2. [服务管理（自动安装 / 唤醒）](#服务管理)
3. [系统托盘](#系统托盘)
4. [Skill 加载器](#skill-加载器)
5. [MCP 插件自定义](#mcp-插件自定义)
6. [模型与多模态修复](#模型与多模态修复)
7. [内置插件说明](#内置插件说明)
8. [更新检查](#更新检查)
9. [打包分发（免 Node.js）](#打包分发)
10. [文件位置一览](#文件位置一览)
11. [常见问题](#常见问题)

## 安装与运行

```sh
cd dsh-desktop
npm install
npm start          # 开发运行
npm run gen:icons  # 生成打包用 build/icon.ico / icon.png（需一次）
npm run dist       # 打包 Windows 安装包（输出 release/）
```

主窗口启动时先显示加载页，服务就绪后自动载入 Web UI（默认 `http://127.0.0.1:3080`）。

## 官方设置一体化（唯一的设置入口）

全部桌面设置**注入官方设置对话框内**——入口就是官方左下角的“设置”按钮，无任何新增点击位置：

- 打开官方设置后，导航在官方分区（通用 / 模型 / 插件 / Agent 预设）之后追加六个桌面分区：**内置服务、模型与多模态、Skill 加载器、MCP 插件、内置插件、更新与关于**。
- 导航行克隆官方单元格的全部 CSS Modules 类名（运行时学习哈希类），选中态、悬停态、图标（官方 ui-primitives 原版 SVG）与官方完全一致。
- 内容区完全采用官方设置面板设计语言：dsw 语义 token 上色（自动跟随明暗主题）、14/22 正文与 12/18 说明、h36 r18 胶囊按钮、32px 输入框、r12 描边卡片、border-l2 发丝线。
- 实现方式：MutationObserver 监听官方设置面板挂载 → 注入导航与内容宿主；点击官方分区自动切回官方内容，关闭面板自动清理。不修改官方前端任何代码，官方升级不受影响。

## 服务管理

桌面端按以下顺序探测并选择服务来源（设置面板 → 服务管理 → 服务来源 可固定其一）：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 本地更新版 | “一键更新”安装到 `$DSH_HOME/dsh-desktop/dsh-service`，用户可写、优先运行、升级不丢失 |
| 2 | 内置服务 | 随安装包携带的 `@deepseek-ai/dsh`，用随包独立 Node 运行时运行，**无需系统安装 Node.js** |
| 3 | 本地源码 | 自动探测本仓库检出版本（也可手动指定路径），经 `pnpm dsh web` 运行 |
| 4 | 全局安装 | 系统 PATH 上的 `dsh` 命令 |
| 5 | npx 自动安装 | `npx -y @deepseek-ai/dsh@latest web`，首次自动下载安装，始终最新版 |

行为规则：

- 启动前先探测服务地址：**已在运行的服务直接唤醒复用**（状态显示“运行中（外部服务）”），不会重复起进程。
- 托管启动的进程才可被“停止/重启”；外部服务不受影响。
- MCP 注入层存在时自动附加 `--patch` 参数启动；修改服务地址端口后自动传递 `--port`。
- 日志保留最近 500 行，设置面板 → 查看日志 可查。

## 系统托盘

托盘使用官方图标，菜单包含：显示主窗口、设置面板、在浏览器中打开、启动/停止/重启服务、检查更新、关于（含产品描述与版本）、退出。托盘提示文字实时反映服务状态；“关闭窗口时最小化到托盘”默认开启。

## Skill 加载器

比官方更完整的可视化 Skill 管理（设置面板 → Skill 加载器）：

- **全根目录扫描**：项目 `.dsh/skills`、`.agents/skills`（需设置工作区路径）→ 用户 `~/.dsh/skills`、`~/.agents/skills`，与官方 rank 顺序一致。
- **智能校验**：kebab-case 命名规则、描述缺失/超长（目录上限 500 字符）、**跨目录同名遮蔽**（提示被哪个根目录的哪个条目遮蔽）。
- **一键安装**：Git 仓库（支持根目录 `SKILL.md` 或 `skills/<名称>/SKILL.md` 布局，自动拍平到目标根目录）、本地文件夹、单个 `.md` 文件 URL。
- **GitHub 搜索安装**（1.3）：内置 GitHub 仓库搜索，输入关键词即可浏览社区 Skill 仓库并一键安装到所选根目录。
- **拖拽安装**（1.3）：把 Skill 文件夹、单个 `.md` 文件或 `.zip` / `.tar.gz` 压缩包直接拖入设置面板（或点击选择文件）即可安装，压缩包自动解压并识别 `SKILL.md` 布局。
- **可视化启停**：开关直接写入 frontmatter 的 `disable-model-invocation`，模型目录即时反映；支持删除（仅限 Skill 根目录内，防误删）。
- **实时刷新**：文件系统变更自动推送刷新。

## MCP 插件自定义

设置面板 → MCP 插件，可视化增删改 MCP 服务器（stdio / streamable-http 双传输，含环境变量、请求头、超时、断线重连等全部官方参数）。每个服务器卡片提供**测试连接**（1.3）：stdio 真实拉起子进程完成 initialize 握手并统计工具数，http 走 streamable-http 会话协商，报告成功/失败、工具数量与耗时。保存后写入 `$DSH_HOME/dsh-desktop/mcp.patch.yml` 注入层，服务以 `dsh web --patch <该文件>` 启动，通过官方 `@deepseek-ai/dsh-mcp-client` 插件挂载，模型以 `mcp__<名称>__<工具>` 形式调用。**不改动任何官方 profile 文件**；保存后点击“重启服务以应用”即可。

对话输入辅助（1.3）：在官方输入框键入 `#` 会唤起桌面端快捷面板，可检索已安装 Skill 与 MCP 服务器，回车即把 `/skill名` 或 MCP 工具提示文本插入草稿。

## 模型与多模态修复

官方 dsh 将手动添加的第三方模型默认按仅文本处理（图片输入会被拒发），且 Anthropic 原生等非 OpenAI 兼容接口无法直接接入。桌面端两层修复：

1. **可视化 Provider 管理**（零 YAML）：编辑即写入官方 `$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers`（含每个模型的 `input: [text, image]` 多模态声明与路由级 `defaultInput`），密钥写入 `$DSH_HOME/.env`。支持从端点拉取模型列表，并按模型名**智能识别视觉能力**（gpt-4o / claude / gemini / glm-4v / *-vl / qvq 等）自动勾选 image。
2. **本地翻译网关**（可选，默认 `127.0.0.1:3081`）：勾选“经本地翻译网关接入”的 Provider 由网关代理——OpenAI 兼容端点做请求净化与转发；**Anthropic 原生 `/v1/messages` 全量翻译**（消息、多模态图片分块、工具定义与调用、用量统计、SSE 流式逐块转换）为 OpenAI 格式，dsh 侧始终走标准 `openai-completions` 协议。任何 Provider 启用网关后网关自动开启。

设置后无需重启服务，下一次模型请求即生效（官方行为）。

3. **对话流多模态集成**（1.3）：`chat-enhance` 桥在官方对话页内工作——读取当前选中模型并与 Provider 声明比对，在模型切换器旁注入「多模态 / 纯文本」能力标识；一键为模型写入 `input: [text, image]` 声明；当草稿中含图片而模型仅支持文本时，在输入区上方显示引导条，提示切换模型或一键开启图片输入，模态与模型切换自然衔接。

另修复官方图片灯箱缺陷（1.3）：查看图片时支持滚轮缩放、拖拽平移、双击还原与下载按钮。

## 内置插件说明

设置面板 → 内置插件（1.3）：自动扫描随包引擎中的官方插件包，结合内置中文注解表，按分类（模型接入、工具调用、记忆、Web 能力等）解释每个官方插件的用途与行为，便于理解官方功能边界。

## 更新检查与一键更新

设置面板 → 更新检查：

- **官方引擎一键更新**：默认优先从镜像站 `http://199.7.140.33:8010` 拉取引擎包（官方 npm 速率过慢），镜像不可用时自动回退 npm registry（npmjs / npmmirror），并显示本次实际生效的来源；随包 npm（`node-runtime/npm`）将最新 `@deepseek-ai/dsh` 安装到 `$DSH_HOME/dsh-desktop/dsh-service`（用户可写目录，优先于内置版本运行，桌面应用升级也不丢失）；实时显示安装进度，完成后可一键重启服务启用新版本——全程无需命令行。
- **官方 dsh 版本检查**：查询镜像站 `latest.json` 与 npm registry `dist-tags.latest`，与本地已解析安装版本对比；也可切换 npx 模式始终运行最新版。
- **桌面版**：更新源默认绑定 `http://199.7.140.33:8010/feed.json`（`{ "version", "url", "notes" }`），主地址不可用时沿备用更新地址链自动回退，界面显示当前生效来源；发现新版本后可直接在应用内**下载安装包**到本机（1.3），或跳转浏览器下载。

## 打包分发

```sh
# 1. 准备内置服务与随包 Node/npm 运行时（免 Node.js 运行的关键）
npm run gen:icons
mkdir dsh-service
npm install --prefix dsh-service @deepseek-ai/dsh
mkdir node-runtime
copy "C:\Program Files\nodejs\node.exe" node-runtime\          # Node >= 24
xcopy /E /I "C:\Program Files\nodejs\node_modules\npm" node-runtime\npm
# 2. 打包
npm run dist
```

`dsh-service/node_modules/@deepseek-ai/dsh` 会随安装包发布到 `resources/dsh-service`，桌面端用随包独立 Node 运行时（`resources/node-runtime`，含 npm 供一键更新使用）运行其 `lib/bin.js`——官方 dsh 需要 Node ≥22.19（`node:zlib` zstd 导出），Electron 内置 Node 不满足，因此必须携带独立运行时。终端用户无需安装 Node.js、npm 或执行任何命令。

## 文件位置一览

| 路径 | 用途 |
|---|---|
| `~/.dsh/settings.yaml` | 官方 dsh 设置（桌面端可视化写入 Provider/多模态声明） |
| `~/.dsh/.env` | 官方环境层（桌面端写入 Provider 密钥） |
| `~/.dsh/dsh-desktop/desktop-settings.json` | 桌面端自身设置 |
| `~/.dsh/dsh-desktop/mcp-servers.json` + `mcp.patch.yml` | MCP 定义与注入层 |
| `~/.dsh/dsh-desktop/providers.json` | Provider 元数据（上游类型、网关开关等） |
| `~/.dsh/skills`、`~/.agents/skills` | 官方用户级 Skill 根目录（Skill 加载器管理） |

## 常见问题

- **服务一直“启动中”**：npx 首次安装需要下载依赖，最长等待 5 分钟；查看日志确认进度。
- **图片附件被拒绝**：在“模型与多模态”中为该模型勾选 image（或点“智能识别”），保存后新会话生效；已有会话的日志仍含旧声明，需新建会话。1.3 起也可直接在对话页模型切换器旁一键开启。
- **Anthropic 模型报 401**：Provider 表单中重新保存 API Key（密钥仅写入不回显）。
- **MCP 工具未出现**：先用 MCP 卡片上的「测试连接」确认服务器可握手；确认服务器已启用且服务以注入层重启（托盘 → 重启服务）；stdio 命令需要本机可用（如 `npx` 需安装 Node.js）。
- **镜像站不可用**：更新检查会自动沿备用地址链回退（界面会提示当前生效来源）；完全离线时可手动在 更新与关于 中自定义更新源。
