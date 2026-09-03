# DeepSeek Harness Desktop

把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面。应用自动启动和管理本地 Harness 服务，集成系统托盘与桌面窗口，无需安装 Node.js 或执行命令。

- 图标与官方完全一致：所有图标（窗口 / 托盘 / 界面 / 安装包）均由官方 `favicon.svg`（字节级一致副本 `assets/dsh.svg`）栅格化生成。
- 桌面端不修改官方仓库的任何文件；全部自有状态存放在 `$DSH_HOME/dsh-desktop`（默认 `~/.dsh/dsh-desktop`）。

## 新特性（近期版本）

**1.5.5**

- **启动自愈（Failed to load plugins）**：社区插件与当前引擎版本不匹配时（例如 `@nanmicoder/dsh-agent-teams` 注入的 `uiConversation` 服务只存在于 0.1.2-alpha 引擎，而稳定引擎名为 `conversation`），官方 Web UI 的浏览器启动审计会失败并停留在 "Failed to load plugins" 页——此时连桌面端设置面板都无法打开。桌面端现在直接在启动页上检测该失败，自动停用未激活的插件并恢复启动：
  - 修复走官方「用户补丁层」机制（`profiles/web/cordis.patch.yml` 追加 `- id: X` + `disabled: true` 行，与插件市场启停完全同源），引擎热重载约 1 秒生效，随后自动刷新页面；
  - 停用前先校验宿主重启图（`window.__DSH_BOOT__`）确实移除了该插件；补丁行无法写入或热重载未生效时，自动回退为注销 bundle 注册并重启服务；
  - 插件包与数据全部保留（不执行卸载），插件市场内显示为已停用，引擎升级后可一键重新启用；官方 `@deepseek-ai/*` 基础设施条目永不会被停用；
  - 每个插件每会话最多尝试 3 次，失败后给出手动指引，绝不无限循环。

**1.4.0**

- **模型与多模态管理全面回归官方**：官方引擎 0.1.1 起已原生支持多模态（官方「模型」板块逐模型声明 `input` 模态，内置 `DeepSeek-V4-Flash-Vision-Exp` 等视觉模型）与 Anthropic 原生 `anthropic-messages` 协议。桌面端「模型与多模态」板块与本地翻译网关（127.0.0.1:3081）整体移除，相关功能全部由官方「模型」板块承担。
- **旧配置自动迁移**：首次启动 1.4.0 时，1.3.x 在桌面端配置的第三方 Provider 自动改写为官方 `llm-pi-ai` 直连路由（网关前缀移除、Anthropic 上游标注 `api: anthropic-messages`），已保存的密钥继续生效（`$DSH_HOME/.env` 本就是官方凭据解析层的一部分）；原 `providers.json` 归档为 `.bak`。
- **修复账户余额误报**：官方 0.1.1 起 API Key 统一持久化到 `$DSH_HOME/.credentials.yaml`（官方「模型」板块写入），桌面端余额查询改为按官方凭据层级解析（进程环境 > `.credentials.yaml` > `.env`），不再误报「未配置 DEEPSEEK_API_KEY」。
- **修复官方用量读取失败**：打包环境下扫描脚本位于 `app.asar` 内、随包 Node 进程无法读取导致「官方用量读取失败」。现在扫描脚本自动部署到 `$DSH_HOME/dsh-desktop` 后再执行（并在版本更新时自动刷新）。
- **修复模型模态误标**（如 K3 被标为纯文本）：桌面端不再自行推断任何模型的"多模态 / 纯文本"标签，模型能力完全以官方模型选择器为准。
- **镜像自动跟进官方版本**：镜像站新增 `latest.php` 动态端点（客户端检查更新时优先请求），官方版本发现依次尝试 npmmirror / npmjs 双 registry；镜像数据超过 6 小时未同步时在后台自动触发同步，无需服务器 cron。
- **远程发布 API**：镜像站新增 token 认证的 `api.php`（status / sync / 分片上传 / set-feed），构建机可直接发布安装包与引擎包。

**1.3.3**

- **内置引擎升级至 0.1.1-rc.2**：融合官方最新版--DeepSeek Files API 文件上传、llm-pi-ai 请求级图片体积预算（长会话图片自动降级为占位符，不再撑爆请求体）、新增持久 PowerShell 工具插件等。Provider 配置（`llm-pi-ai.providers` 的 `models` / `input` / `defaultInput` 声明）与设置面板、对话流全部注入锚点经逐版本比对保持兼容，桌面端既有逻辑不变。
- **适配官方启动行为变更**：官方 0.1.0-rc.8 起 `dsh web` 默认打开系统浏览器；桌面端托管服务在引擎 ≥ 0.1.0-rc.8 时自动追加 `--no-open`（全局安装按 `--help` 探测，npx 始终最新直接追加），不再弹出多余浏览器窗口。
- **插件注解跟进官方**：新增 `dsh-tool-pwsh-persistent`（持久 PowerShell）中文说明。

**1.3.2**

- **修复「账户与用量」等列表渲染**：修复设置面板中余额列表、最近任务消耗、Provider 列表、Skill 列表、MCP 服务器列表、GitHub 搜索结果在特定数据下渲染为 `[object HTMLDivElement]` 的问题。
- **插件注解全量覆盖**：官方插件列表的注解匹配兼容官方显示名（自动剥离 `dsh-` / `cordis-plugin-` 前缀），随包 160 个插件中 120 个获得内联中文说明（含 Cordis 框架插件）。
- **修复对话流增强偶发不生效**：修复 preload 早期执行时 `document.documentElement` 尚未就绪导致多模态拦截/插件注解偶发不注入的问题。

**1.3.1**

- **多模态直接集成官方对话流**：不再有任何独立窗口或模块。当前模型支持图片时一切照常；纯文本模型在上传图片/视频的瞬间即被拦截，并给出可一键切换的多模态模型建议（或一键为该模型开启图片输入）。
- **账户与用量**：设置面板新增「账户与用量」--查询当前 API Key 对应账户的余额（DeepSeek 官方账户），按今日 / 近 7 日 / 累计统计 token 消耗与估算费用，逐模型汇总，逐任务明细可查。
- **官方插件列表内联注解**：官方「插件」设置分区中，每个插件名下方直接附加中文功能说明，不再单独开设板块。
- **更新源界面收敛**：加速镜像与更新源默认绑定 `199.7.140.33:8010`，正常时界面完全不展示替换选项；仅当默认地址不可用时才出现「备用更新地址」切换区。
- **修复镜像引擎包完整性问题**：修复了某些情况下引擎更新后 `sharp` 原生模块残缺导致服务无法启动的问题。

**1.3.0**

- Skill：GitHub 仓库搜索安装；文件夹 / `.md` / zip / tgz 拖入设置面板即装。
- MCP：每个服务器一键「测试连接」，真实握手并报告工具数量；对话输入框 `#` 唤起 Skill / MCP 快捷插入面板。
- 更新通道默认绑定镜像站，主地址不可用时自动沿备用链回退；桌面版安装包可在应用内直接下载。
- 修复官方图片灯箱缺陷：滚轮缩放、拖拽平移、双击还原、下载按钮。
- 内置引擎升级至 0.1.0-rc.7。

## 目录

1. [安装与运行](#安装与运行)
2. [服务管理（自动安装 / 唤醒）](#服务管理)
3. [系统托盘](#系统托盘)
4. [Skill 加载器](#skill-加载器)
5. [MCP 插件自定义](#mcp-插件自定义)
6. [模型与多模态（官方板块管理）](#模型与多模态)
7. [账户与用量](#账户与用量)
8. [更新检查](#更新检查)
9. [打包分发（免 Node.js）](#打包分发)
10. [文件位置一览](#文件位置一览)
11. [常见问题](#常见问题)
12. [镜像站管理（admin / 远程 API）](#镜像站管理)

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

全部桌面设置**注入官方设置对话框内**--入口就是官方左下角的“设置”按钮，无任何新增点击位置：

- 打开官方设置后，导航在官方分区（通用 / 模型 / 插件 / Agent 预设）之后追加五个桌面分区：**内置服务、账户与用量、Skill 加载器、MCP 插件、更新与关于**。（1.4.0 起模型与多模态管理回归官方「模型」板块，桌面端不再设该分区。）
- 导航行克隆官方单元格的全部 CSS Modules 类名（运行时学习哈希类），选中态、悬停态、图标（官方 ui-primitives 原版 SVG）与官方完全一致。
- 内容区完全采用官方设置面板设计语言：dsw 语义 token 上色（自动跟随明暗主题）、14/22 正文与 12/18 说明、h36 r18 胶囊按钮、32px 输入框、r12 描边卡片、border-l2 发丝线。
- 实现方式：MutationObserver 监听官方设置面板挂载 -> 注入导航与内容宿主；点击官方分区自动切回官方内容，关闭面板自动清理。不修改官方前端任何代码，官方升级不受影响。

## 服务管理

桌面端按以下顺序探测并选择服务来源（设置面板 -> 服务管理 -> 服务来源 可固定其一）：

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
- 日志保留最近 500 行，设置面板 -> 查看日志 可查。

## 系统托盘

托盘使用官方图标，菜单包含：显示主窗口、设置面板、在浏览器中打开、启动/停止/重启服务、检查更新、关于（含产品描述与版本）、退出。托盘提示文字实时反映服务状态；“关闭窗口时最小化到托盘”默认开启。

## Skill 加载器

比官方更完整的可视化 Skill 管理（设置面板 -> Skill 加载器）：

- **全根目录扫描**：项目 `.dsh/skills`、`.agents/skills`（需设置工作区路径）-> 用户 `~/.dsh/skills`、`~/.agents/skills`，与官方 rank 顺序一致。
- **智能校验**：kebab-case 命名规则、描述缺失/超长（目录上限 500 字符）、**跨目录同名遮蔽**（提示被哪个根目录的哪个条目遮蔽）。
- **一键安装**：Git 仓库（支持根目录 `SKILL.md` 或 `skills/<名称>/SKILL.md` 布局，自动拍平到目标根目录）、本地文件夹、单个 `.md` 文件 URL。
- **GitHub 搜索安装**（1.3）：内置 GitHub 仓库搜索，输入关键词即可浏览社区 Skill 仓库并一键安装到所选根目录。
- **拖拽安装**（1.3）：把 Skill 文件夹、单个 `.md` 文件或 `.zip` / `.tar.gz` 压缩包直接拖入设置面板（或点击选择文件）即可安装，压缩包自动解压并识别 `SKILL.md` 布局。
- **可视化启停**：开关直接写入 frontmatter 的 `disable-model-invocation`，模型目录即时反映；支持删除（仅限 Skill 根目录内，防误删）。
- **实时刷新**：文件系统变更自动推送刷新。

## MCP 插件自定义

设置面板 -> MCP 插件，可视化增删改 MCP 服务器（stdio / streamable-http 双传输，含环境变量、请求头、超时、断线重连等全部官方参数）。每个服务器卡片提供**测试连接**（1.3）：stdio 真实拉起子进程完成 initialize 握手并统计工具数，http 走 streamable-http 会话协商，报告成功/失败、工具数量与耗时。保存后写入 `$DSH_HOME/dsh-desktop/mcp.patch.yml` 注入层，服务以 `dsh web --patch <该文件>` 启动，通过官方 `@deepseek-ai/dsh-mcp-client` 插件挂载，模型以 `mcp__<名称>__<工具>` 形式调用。**不改动任何官方 profile 文件**；保存后点击“重启服务以应用”即可。

对话输入辅助（1.3）：在官方输入框键入 `#` 会唤起桌面端快捷面板，可检索已安装 Skill 与 MCP 服务器，回车即把 `/skill名` 或 MCP 工具提示文本插入草稿。

## 模型与多模态

**自 1.4.0 起，模型与多模态完全由官方「模型」板块管理**，桌面端不再有自己的 Provider 面板：

- **API Key**：官方「模型」板块的每个 Provider 编辑卡片填写，密钥经官方 `credentials.set` 写入 `$DSH_HOME/.credentials.yaml`（settings.yaml 只保存引用，不含密钥值）。
- **第三方 Provider**：官方「模型」板块「添加自定义提供方」创建 `llm-pi-ai` 路由；OpenAI 兼容与 **Anthropic 原生（`anthropic-messages`）** 协议均原生支持，无需本地翻译网关。
- **多模态**：官方引擎逐模型声明输入模态（内置目录含 `DeepSeek-V4-Flash-Vision-Exp` 等视觉模型）；自定义路由通过 profile 的 `defaultInput` 或逐模型 `input: [text, image]` 声明。`/goal`、`/plan` 等命令可直接接收图文输入。
- **从 1.3.x 升级**：旧桌面端 Provider 配置自动迁移为官方直连路由（Anthropic 上游自动标注 `anthropic-messages`，本地网关前缀移除），密钥继续生效，无需手动搬移。

另修复官方图片灯箱缺陷（1.3）：查看图片时支持滚轮缩放、拖拽平移、双击还原与下载按钮。

**官方插件内联注解**（1.3.1）：官方「插件」设置分区中，每个插件名称下方直接附加中文功能说明（内置注解表覆盖全部随包插件），无需跳转任何独立页面。

## 账户与用量

设置面板 -> 账户与用量（1.4.0 简化为只读两卡）：

- **账户余额**：按官方凭据层（进程环境 > `$DSH_HOME/.credentials.yaml` > `$DSH_HOME/.env`）解析 API Key，查询 DeepSeek 官方账户与各第三方路由中 DeepSeek 端点的余额；密钥的写入与维护全部在官方「模型」板块完成，本面板只读。
- **官方引擎用量**：直接读取官方引擎会话日志（`$DSH_HOME/sessions`，含 zstd 压缩）统计 token 消耗，覆盖官方「模型」板块中的所有可选模型（含第三方 Provider 路由）--今日 / 近 7 日 / 累计三档汇总、逐模型分解、缓存命中与推理 token、最近请求明细。扫描脚本随包分发并在首次使用时自动部署到用户目录执行（打包环境必需）。

## 更新检查与一键更新

设置面板 -> 更新检查：

- **官方引擎一键更新**：默认优先从镜像站 `http://199.7.140.33:8010` 拉取引擎包（客户端优先请求动态 `latest.php`，镜像过旧时该请求本身会触发镜像站后台同步官方最新版），镜像不可用时自动回退 npm registry（npmjs / npmmirror），并显示本次实际生效的来源；随包 npm（`node-runtime/npm`）将最新 `@deepseek-ai/dsh` 安装到 `$DSH_HOME/dsh-desktop/dsh-service`（用户可写目录，优先于内置版本运行，桌面应用升级也不丢失）；实时显示安装进度，完成后可一键重启服务启用新版本--全程无需命令行。
- **官方 dsh 版本检查**：查询镜像站版本清单与 npm registry `dist-tags.latest`，与本地已解析安装版本对比；也可切换 npx 模式始终运行最新版。
- **桌面版**：更新源默认绑定 `http://199.7.140.33:8010/feed.json`，主地址不可用时沿备用地址链自动回退；发现新版本后可直接在应用内**下载安装包**到本机，或跳转浏览器下载。界面正常时不展示任何备用源选项，仅当默认地址无法访问时才出现「备用更新地址」切换区（1.3.1）。

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

`dsh-service/node_modules/@deepseek-ai/dsh` 会随安装包发布到 `resources/dsh-service`，桌面端用随包独立 Node 运行时（`resources/node-runtime`，含 npm 供一键更新使用）运行其 `lib/bin.js`--官方 dsh 需要 Node ≥22.19（`node:zlib` zstd 导出），Electron 内置 Node 不满足，因此必须携带独立运行时。终端用户无需安装 Node.js、npm 或执行任何命令。

## 文件位置一览

| 路径 | 用途 |
|---|---|
| `~/.dsh/settings.yaml` | 官方 dsh 设置（官方「模型」板块与桌面端迁移写入 Provider / 多模态声明） |
| `~/.dsh/.credentials.yaml` | 官方凭据存储（官方「模型」板块写入 API Key；桌面端只读解析） |
| `~/.dsh/.env` | 官方环境层（官方凭据解析的最低优先级回退；1.3.x Provider 密钥仍在此生效） |
| `~/.dsh/sessions` | 官方引擎会话日志（账户与用量的数据来源） |
| `~/.dsh/dsh-desktop/desktop-settings.json` | 桌面端自身设置 |
| `~/.dsh/dsh-desktop/mcp-servers.json` + `mcp.patch.yml` | MCP 定义与注入层 |
| `~/.dsh/dsh-desktop/providers.json.bak` | 1.3.x Provider 存档（已自动迁移为官方路由） |
| `~/.dsh/skills`、`~/.agents/skills` | 官方用户级 Skill 根目录（Skill 加载器管理） |

## 常见问题

- **服务一直“启动中”**：npx 首次安装需要下载依赖，最长等待 5 分钟；查看日志确认进度。
- **启动页报 Failed to load plugins / web boot: entries did not activate**：多为社区插件与当前引擎版本不匹配（插件等待的服务在新引擎里才存在，如 `@nanmicoder/dsh-agent-teams` 等待的 `uiConversation`）。1.5.5 起桌面端会自动停用该插件并恢复启动（横幅提示修复进度，完成后 toast 说明停用清单）；插件与数据保留，引擎升级后可在插件市场重新启用。仍失败时可在官方「设置 → 插件市场」卸载该插件后重启服务。
- **API Key 应该在哪里填**：官方设置 ->「模型」板块，对应 Provider 的编辑卡片中填写（写入 `~/.dsh/.credentials.yaml`），桌面端「账户与用量」自动读取，无需重复配置。
- **升级 1.4.0 后旧的第三方模型还能用吗**：能。旧「模型与多模态」面板中的 Provider 首次启动时自动迁移为官方直连路由（含 Anthropic 原生协议），模型与密钥全部保留；后续维护在官方「模型」板块进行。
- **图片附件被拒绝**：该模型未声明图片输入。在官方「模型」板块为对应自定义路由声明 `defaultInput: [text, image]`，或选择官方内置视觉模型（如 DeepSeek-V4-Flash-Vision-Exp）。
- **MCP 工具未出现**：先用 MCP 卡片上的「测试连接」确认服务器可握手；确认服务器已启用且服务以注入层重启（托盘 -> 重启服务）；stdio 命令需要本机可用（如 `npx` 需安装 Node.js）。
- **镜像站不可用**：更新检查会自动沿备用地址链回退，此时设置面板才会出现「备用更新地址」切换区（1.3.1 起，正常时该区域不展示）；完全离线时可临时填写自定义更新源，默认地址恢复后清空即可。
- **服务启动报 sharp 模块错误**：引擎更新包解压不完整（多见于更新过程中断）。在「更新与关于」重新执行一次「一键更新官方引擎」即可修复；1.3.1 起更新器已加固。
- **镜像引擎版本落后于官方**：镜像站会在 `latest.php` 被访问或数据超过 6 小时未同步时自动后台同步官方最新版（依次尝试 npmmirror / npmjs）；也可在管理后台点「自动同步官方版本」立即执行。

## 镜像站管理

镜像站（`mirror-site/`）提供三种管理入口：

- **管理后台**（`/admin/`，密码登录）：上传引擎包 / 桌面安装包（分片上传）、编辑 feed.json、站点内容（QQ 群、截图）、版本历史管理、手动「检查官方最新版本 / 自动同步官方版本」。
- **cron / HTTP 同步**（`sync.php`）：`*/30 * * * * php sync.php` 或 `GET /sync.php?token=<sync_token>`；官方版本发现依次尝试 npmmirror 与 npmjs。
- **远程发布 API**（`api.php`，请求头 `X-Mirror-Token`，1.4.0 新增）：`action=status` 查看镜像状态、`action=sync` 触发同步、`action=chunk` + `action=assemble` 分片上传安装包 / 引擎包、`action=set-feed` 更新桌面版更新源。适合构建机发布新版本，无需登录后台。
- **站点代码发布**（`build-tools/publish-site.py`，构建机侧）：把 `mirror-site/` 打包为 **tar.gz** 经部署管家 API 上传并自动部署。Windows 下必须用 tar.gz 而非 zip——`Compress-Archive` 的 zip 条目使用反斜杠路径（`assets\dsh.svg`），Linux 端解压会把反斜杠当作文件名字符，破坏全部子目录结构（图片 404、admin 失效）。
- **懒同步**（1.4.0 新增）：`latest.php`（动态版本清单，客户端更新检查优先请求）与首页在镜像数据超过 6 小时未同步时自动安排一次后台同步（带锁防并发），镜像站因此无需任何 cron 也能自动跟进官方版本。
