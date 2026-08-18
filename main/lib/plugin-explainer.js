'use strict'
/**
 * Built-in plugin catalog with plain-language explanations. The official dsh
 * engine is a Cordis plugin composition: every @deepseek-ai/dsh-* package in
 * the installed engine is one built-in plugin. This module scans the
 * installed engine (updated copy first, then the bundled one) and merges the
 * official package metadata with a curated Chinese explanation map so the
 * settings UI can explain what each built-in plugin actually does.
 */
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const { desktopDir } = require('./paths')

/** Curated explanations, keyed by short name (without @deepseek-ai/). */
const CURATED = {
  'dsh': { category: '入口', text: '命令行入口与浏览器 UI 别名：解析 dsh web 等命令、引导 profile 并装配全部插件。' },
  'dsh-agent': { category: '智能体', text: '智能体运行时核心：维护对话循环、上下文装配与模型交互节拍。' },
  'dsh-agent-default-model': { category: '智能体', text: '为未显式选择模型的会话提供默认模型回退。' },
  'dsh-agent-instructions': { category: '智能体', text: '装配系统提示词：把人格、规则、环境信息等指令层合并进每次请求。' },
  'dsh-agent-loop': { category: '智能体', text: '驱动「模型 → 工具 → 模型」的回合循环，直到任务完成或被中断。' },
  'dsh-agent-presets': { category: '智能体', text: 'Agent 预设管理：为不同任务场景保存/切换模型、权限与工具组合。' },
  'dsh-agent-tool-presentation': { category: '界面', text: '把工具调用过程渲染成可读的时间线条目（参数摘要、结果摘要）。' },
  'dsh-anonymous-user-id': { category: '基础', text: '生成匿名用户标识，用于本地统计与配额区分，不上传隐私信息。' },
  'dsh-api-gateway': { category: '基础', text: '浏览器与引擎之间的 API 网关：把前端的会话操作转发到宿主进程。' },
  'dsh-api-remotes': { category: '基础', text: '前端可调用的远程接口类型目录（模型目录、会话、设置等通信协议）。' },
  'dsh-app-boot': { category: '基础', text: '应用启动装配器：按依赖顺序拉起全部插件并处理启动失败。' },
  'dsh-atomic-write': { category: '基础', text: '原子写文件：先写临时文件再改名，避免崩溃留下半个文件。' },
  'dsh-attachment': { category: '多模态', text: '附件服务协议：定义图片附件的校验、落盘与引用方式。' },
  'dsh-attachment-local': { category: '多模态', text: '本地附件实现：把对话中的图片安全保存到本地存储并生成访问 URL。' },
  'dsh-base': { category: '基础', text: '共享基础库：日志、事件、通用工具等所有插件都依赖的底座。' },
  'dsh-bash-local': { category: '工具', text: '在本机执行 Bash 命令的工具后端（配合沙箱策略）。' },
  'dsh-bash-sandbox': { category: '工具', text: 'Bash 工具的沙箱隔离层，限制命令可触达的范围。' },
  'dsh-brand': { category: '界面', text: '品牌信息：产品名、图标与版权文案的统一来源。' },
  'dsh-client-connection': { category: '界面', text: '浏览器端到宿主的实时连接层（事件推送、断线重连）。' },
  'dsh-client-hmr': { category: '界面', text: '开发模式的前端热更新支持。' },
  'dsh-client-locale': { category: '界面', text: '多语言界面文案的装载与切换。' },
  'dsh-client-modules': { category: '界面', text: '前端模块装配：把各 UI 插件注册进浏览器运行时。' },
  'dsh-client-runtime': { category: '界面', text: '浏览器端运行时内核：状态存储、投影与远程调用的客户端基座。' },
  'dsh-client-schema-form': { category: '界面', text: '按 JSON Schema 自动生成设置表单（插件配置页的数据来源）。' },
  'dsh-client-ui-agent-preset': { category: '界面', text: '设置中的 Agent 预设管理界面。' },
  'dsh-client-ui-attachment': { category: '界面', text: '输入框图片附件栏、消息图片画廊与原图灯箱（多模态输入的界面层）。' },
  'dsh-client-ui-commands': { category: '界面', text: '斜杠命令菜单（/compact、/goal 等）的输入框集成。' },
  'dsh-client-ui-conversation': { category: '界面', text: '对话主界面：消息流、输入框状态机、发送队列与草稿。' },
  'dsh-client-ui-deliverables': { category: '界面', text: '交付物面板：集中展示会话产出的文件与下载入口。' },
  'dsh-client-ui-directory-picker-browse': { category: '界面', text: '网页式目录选择器（选择工作区）。' },
  'dsh-client-ui-directory-picker-native': { category: '界面', text: '系统原生目录选择器集成。' },
  'dsh-client-ui-goal': { category: '界面', text: '目标（Goal）面板：跟踪长跑任务的阶段与进度。' },
  'dsh-client-ui-input-trigger': { category: '界面', text: '输入框触发器：@ 引用、/ 命令等键入触发与补全的基础件。' },
  'dsh-client-ui-jobs': { category: '界面', text: '后台任务面板：查看与管理仍在运行的作业。' },
  'dsh-client-ui-layout': { category: '界面', text: '整体布局骨架：侧栏、主区、顶栏的组织。' },
  'dsh-client-ui-message-feedback': { category: '界面', text: '消息反馈按钮（赞/踩）与反馈提交。' },
  'dsh-client-ui-model-selection': { category: '界面', text: '输入框右侧的模型选择器：模型/推理强度两级菜单。' },
  'dsh-client-ui-permission-presets': { category: '界面', text: '权限预设切换（只读/工作区/完全等）的界面。' },
  'dsh-client-ui-plan': { category: '界面', text: '计划模式界面：先出计划再执行的任务流。' },
  'dsh-client-ui-primitives': { category: '界面', text: '基础组件库：按钮、图标、Toast、Tooltip 等设计系统原子件。' },
  'dsh-client-ui-settings': { category: '界面', text: '设置对话框骨架与分区导航（桌面端的设置区块即注入于此）。' },
  'dsh-client-ui-settings-general': { category: '界面', text: '「通用」设置分区：语言、主题、基础行为开关。' },
  'dsh-client-ui-settings-models': { category: '界面', text: '「模型」设置分区：官方模型登录与模型目录展示。' },
  'dsh-client-ui-settings-plugin-inventory': { category: '界面', text: '插件清单界面：展示已装配插件及其状态。' },
  'dsh-client-ui-settings-plugins': { category: '界面', text: '「插件」设置分区：查看各插件配置入口。' },
  'dsh-client-ui-sidebar': { category: '界面', text: '会话侧栏：历史会话列表、新建与搜索。' },
  'dsh-client-ui-skill': { category: '界面', text: 'Skill 在输入框中的引用与徽标展示。' },
  'dsh-client-ui-slots': { category: '界面', text: '界面插槽系统：各 UI 插件按插槽拼装页面的约定层。' },
  'dsh-client-ui-subagent': { category: '界面', text: '子智能体面板界面。' },
  'dsh-client-ui-theme': { category: '界面', text: '明暗主题与跟随系统的主题管理。' },
  'dsh-client-ui-tool': { category: '界面', text: '工具调用卡片的通用渲染。' },
  'dsh-client-ui-trajectory': { category: '界面', text: '轨迹视图：按步骤回看一次任务的工具调用序列。' },
  'dsh-client-ui-user-questions': { category: '界面', text: '模型主动向用户提问时的选择卡片界面。' },
  'dsh-client-ui-workflow-run': { category: '界面', text: '工作流运行界面。' },
  'dsh-client-ui-workspace': { category: '界面', text: '工作区选择与切换界面。' },
  'dsh-client-web': { category: '界面', text: 'Web 前端装配：把全部 UI 插件打包成可访问的 Web 应用。' },
  'dsh-client-web-react': { category: '界面', text: 'React 渲染层适配。' },
  'dsh-cmdline': { category: '基础', text: '命令行参数解析与子命令框架。' },
  'dsh-code-runtime': { category: '工具', text: '代码执行运行时：让模型安全地运行代码片段。' },
  'dsh-code-runtime-worker-thread': { category: '工具', text: '代码运行时的 worker 线程隔离实现。' },
  'dsh-command-compact': { category: '命令', text: '/compact 命令：压缩长会话上下文，释放上下文窗口。' },
  'dsh-command-feedback': { category: '命令', text: '/feedback 命令：提交使用反馈。' },
  'dsh-command-goal': { category: '命令', text: '/goal 命令：设定或查看当前任务目标。' },
  'dsh-commands': { category: '命令', text: '斜杠命令注册表：统一收纳所有 / 命令。' },
  'dsh-compaction': { category: '上下文', text: '上下文压缩协议：会话过长时把历史折叠成摘要。' },
  'dsh-compaction-basic': { category: '上下文', text: '基础压缩策略：按阈值触发并生成摘要。' },
  'dsh-compaction-tool-result-pruner': { category: '上下文', text: '裁剪旧工具结果：保留结论、移除大段输出，降低 token 占用。' },
  'dsh-cordis-client-runner': { category: '基础', text: '浏览器侧插件运行器。' },
  'dsh-cordis-host-runner': { category: '基础', text: '宿主侧插件运行器：插件生命周期的宿主实现。' },
  'dsh-credentials': { category: '基础', text: '凭据抽象：模型服务商密钥的统一读写接口。' },
  'dsh-credentials-local': { category: '基础', text: '本地凭据存储（.env 等）实现。' },
  'dsh-fs': { category: '工具', text: '文件系统抽象层。' },
  'dsh-fs-local': { category: '工具', text: '本地文件系统实现：读写、列目录等。' },
  'dsh-fs-observation-policy': { category: '工具', text: '文件观察策略：决定哪些文件变化需要通知模型。' },
  'dsh-fs-sandbox': { category: '工具', text: '文件访问沙箱：限制工具可访问的目录范围。' },
  'dsh-goal': { category: '任务', text: '目标系统：为长任务维护目标状态与完成判定。' },
  'dsh-goal-round-driver': { category: '任务', text: '按回合驱动目标推进，直到达成或被取消。' },
  'dsh-headless': { category: '入口', text: '无界面运行模式：脚本化/自动化调用入口。' },
  'dsh-home-paths': { category: '基础', text: 'DSH_HOME 目录解析（设置、会话、缓存的落点）。' },
  'dsh-host-apiproxy': { category: '基础', text: '宿主 API 代理：前端请求到宿主服务的桥。' },
  'dsh-host-directory-picker': { category: '界面', text: '目录选择器宿主协议。' },
  'dsh-host-directory-picker-auto': { category: '界面', text: '按环境自动选择网页式或原生目录选择器。' },
  'dsh-host-directory-picker-browse': { category: '界面', text: '网页式目录选择器的宿主实现。' },
  'dsh-host-directory-picker-native': { category: '界面', text: '原生目录选择器的宿主实现。' },
  'dsh-host-frontend-static': { category: '基础', text: '前端静态资源托管：把打包好的 Web UI 提供给浏览器。' },
  'dsh-host-plugin-inventory': { category: '基础', text: '插件清单：记录已装配插件与状态，供设置界面展示。' },
  'dsh-host-webserver': { category: '基础', text: '本地 Web 服务器：Web UI 与 API 的 HTTP 入口（默认 3080 端口）。' },
  'dsh-invariants': { category: '基础', text: '内部不变量检查：开发期断言工具。' },
  'dsh-jobs': { category: '任务', text: '后台作业抽象：长跑任务的登记与追踪。' },
  'dsh-jobs-local': { category: '任务', text: '本地作业实现。' },
  'dsh-launch-environment': { category: '基础', text: '启动环境探测：终端能力、操作系统、运行时版本识别。' },
  'dsh-llm': { category: '模型', text: '模型抽象层：统一的聊天/补全接口与流式协议。' },
  'dsh-llm-deepseek': { category: '模型', text: 'DeepSeek 官方模型接入：登录、目录与对话通道。' },
  'dsh-llm-pi-ai': { category: '模型', text: '第三方模型接入层：OpenAI 兼容端点与多模态声明（桌面端 Provider 即写入此层配置）。' },
  'dsh-llm-retry': { category: '模型', text: '模型请求重试：限流、超时与瞬时错误的自动退避重发。' },
  'dsh-mcp-client': { category: '扩展', text: 'MCP 客户端：接入外部 MCP 服务器并把其工具暴露给模型（mcp__<名称>__<工具>）。桌面端的 MCP 插件配置即注入此插件。' },
  'dsh-message-feedback': { category: '任务', text: '消息反馈记录：保存赞/踩与备注。' },
  'dsh-native-command': { category: '命令', text: '原生命令支持。' },
  'dsh-output-retention': { category: '基础', text: '输出保留策略：控制日志与产物保存多久。' },
  'dsh-permission-presets': { category: '任务', text: '权限预设：只读、工作区写、完全访问等档位的定义。' },
  'dsh-persona': { category: '智能体', text: '人格层：定义助手的身份与语气。' },
  'dsh-plan-mode': { category: '任务', text: '计划模式：执行前先产出计划供确认。' },
  'dsh-pwsh-local': { category: '工具', text: 'PowerShell 本地执行后端（Windows）。' },
  'dsh-pwsh-sandbox': { category: '工具', text: 'PowerShell 沙箱隔离层。' },
  'dsh-repeat-tool-reminder': { category: '智能体', text: '重复工具调用提醒：防止模型陷入同一工具的循环。' },
  'dsh-sandbox': { category: '工具', text: '沙箱抽象：命令与文件访问的隔离约定。' },
  'dsh-sandbox-local': { category: '工具', text: '本地沙箱实现。' },
  'dsh-sandbox-policy': { category: '工具', text: '沙箱策略：按权限预设决定隔离强度。' },
  'dsh-sandbox-windows-acl': { category: '工具', text: 'Windows ACL 沙箱：用系统访问控制表限制文件触达范围。' },
  'dsh-schedule': { category: '任务', text: '定时与延迟任务调度。' },
  'dsh-scope': { category: '基础', text: '作用域管理：会话/工作区级状态的隔离。' },
  'dsh-session': { category: '会话', text: '会话核心模型：消息、回合与状态机。' },
  'dsh-session-checkpoint-policy': { category: '会话', text: '会话检查点策略：何时保存可回滚的快照。' },
  'dsh-session-log-export': { category: '会话', text: '会话日志导出。' },
  'dsh-session-persistence': { category: '会话', text: '会话持久化抽象。' },
  'dsh-session-persistence-jsonl': { category: '会话', text: 'JSONL 会话落盘：逐行追加的可靠存储。' },
  'dsh-session-projection': { category: '会话', text: '会话投影：把内部状态转成界面可读视图。' },
  'dsh-session-projection-cache': { category: '会话', text: '投影缓存：长会话的界面渲染加速。' },
  'dsh-session-query': { category: '会话', text: '会话查询抽象。' },
  'dsh-session-query-sqlite': { category: '会话', text: 'SQLite 会话索引：历史会话的快速检索。' },
  'dsh-session-reference': { category: '会话', text: '会话引用：@ 引用历史会话内容。' },
  'dsh-session-stats': { category: '会话', text: '会话统计：token 用量与费用估算。' },
  'dsh-session-telemetry': { category: '会话', text: '遥测抽象。' },
  'dsh-session-telemetry-otel': { category: '会话', text: 'OpenTelemetry 遥测导出（默认关闭）。' },
  'dsh-session-title': { category: '会话', text: '会话标题生成协议。' },
  'dsh-session-title-first-prompt-llm': { category: '会话', text: '用首条提问生成会话标题。' },
  'dsh-session-title-llm': { category: '会话', text: '用小模型自动概括会话标题。' },
  'dsh-settings': { category: '基础', text: '设置协议：settings.yaml 的读取约定。' },
  'dsh-settings-file': { category: '基础', text: '设置文件实现（含环境变量层合并）。' },
  'dsh-shell': { category: '工具', text: 'Shell 抽象层。' },
  'dsh-shell-env': { category: '工具', text: 'Shell 环境变量装配。' },
  'dsh-skill': { category: '扩展', text: 'Skill 协议：技能（SKILL.md）的发现、校验与调用约定。' },
  'dsh-skill-badge': { category: '界面', text: 'Skill 徽标：输入框中已引用技能的展示。' },
  'dsh-skill-filesystem': { category: '扩展', text: 'Skill 文件系统扫描：按项目 → 用户的顺序发现各根目录下的技能。' },
  'dsh-spill': { category: '上下文', text: '溢出协议：超大工具输出的外置存储约定。' },
  'dsh-spill-local': { category: '上下文', text: '溢出本地实现：把超长输出写入本地文件并给出引用。' },
  'dsh-spill-policy': { category: '上下文', text: '溢出策略：多长的输出需要外置。' },
  'dsh-storage': { category: '基础', text: '存储抽象。' },
  'dsh-storage-domain': { category: '基础', text: '分域存储：按用途隔离的命名空间。' },
  'dsh-storage-json': { category: '基础', text: 'JSON 文件存储实现。' },
  'dsh-subagent': { category: '智能体', text: '子智能体协议：派生子任务并行工作。' },
  'dsh-subagent-fork-in-process': { category: '智能体', text: '进程内 fork 的子智能体实现。' },
  'dsh-subagent-in-process-driver': { category: '智能体', text: '子智能体进程内驱动器。' },
  'dsh-subagent-spawn-in-process': { category: '智能体', text: '子智能体进程内 spawn 实现。' },
  'dsh-subprocess': { category: '基础', text: '子进程抽象。' },
  'dsh-subprocess-local': { category: '基础', text: '本地子进程实现。' },
  'dsh-system-prompt': { category: '智能体', text: '系统提示词装配：规则、工具说明与环境信息的汇总。' },
  'dsh-terminal': { category: '工具', text: '终端抽象。' },
  'dsh-terminal-bash': { category: '工具', text: 'Bash 终端实现。' },
  'dsh-time-context': { category: '基础', text: '时间上下文：把当前时间与时区提供给模型。' },
  'dsh-timeout': { category: '基础', text: '超时控制工具。' },
  'dsh-tmux-context': { category: '工具', text: 'tmux 会话上下文（终端复用时）。' },
  'dsh-token-meter': { category: '上下文', text: 'token 计量：统计输入/输出 token 与上下文水位。' },
  'dsh-tool-ask-user': { category: '工具', text: 'AskUser 工具：模型主动向用户提问澄清。' },
  'dsh-tool-bash': { category: '工具', text: 'Bash 工具：让模型执行 shell 命令。' },
  'dsh-tool-bash-persistent': { category: '工具', text: '持久 Bash：跨调用保持 shell 会话状态。' },
  'dsh-tool-call-timeout-policy': { category: '工具', text: '工具调用超时策略。' },
  'dsh-tool-cordis': { category: '扩展', text: 'Cordis 工具桥：让模型查询/调用其它插件暴露的服务。' },
  'dsh-tool-fs': { category: '工具', text: '文件工具：读、写、编辑文件（含读图能力）。' },
  'dsh-tool-fs-search': { category: '工具', text: '文件搜索工具：按内容/文件名检索。' },
  'dsh-tool-goal': { category: '工具', text: '目标工具：模型读写任务目标。' },
  'dsh-tool-jobs': { category: '工具', text: '后台作业工具：模型启动与管理长任务。' },
  'dsh-tool-pwsh': { category: '工具', text: 'PowerShell 工具（Windows）。' },
  'dsh-tool-ralph': { category: '工具', text: 'Ralph 工具：迭代式自改进执行循环。' },
  'dsh-tool-skill': { category: '扩展', text: 'Skill 工具：模型按名调用已安装技能。' },
  'dsh-tool-str-replace-editor': { category: '工具', text: '字符串替换编辑器：精确的局部文件修改。' },
  'dsh-tool-subagent': { category: '工具', text: '子智能体工具：模型派生子任务的入口。' },
  'dsh-tool-subagent-control': { category: '工具', text: '子智能体控制：暂停/继续/停止子任务。' },
  'dsh-tool-subagent-report': { category: '工具', text: '子智能体汇报：子任务结果回收。' },
  'dsh-tool-todo': { category: '工具', text: '待办工具：模型维护任务清单。' },
  'dsh-tool-web': { category: '工具', text: 'Web 工具：抓取网页内容。' },
  'dsh-tool-workflow': { category: '工具', text: '工作流工具：编排多步骤流程。' },
  'dsh-tools': { category: '工具', text: '工具注册表：统一收纳全部内置工具。' },
  'dsh-typert-loader': { category: '基础', text: 'Typert 协议加载器。' },
  'dsh-typert-protocol': { category: '基础', text: 'Typert 通信协议：前后端类型化 RPC。' },
  'dsh-typert-registry': { category: '基础', text: 'Typert 注册表。' },
  'dsh-user-approval': { category: '任务', text: '用户审批：高风险操作前的确认门。' },
  'dsh-user-questions': { category: '任务', text: '用户提问协议：模型发起结构化提问。' },
  'dsh-web': { category: '入口', text: 'dsh web 子命令：启动本地 Web UI 服务。' },
  'dsh-web-app': { category: '入口', text: 'Web 应用装配。' },
  'dsh-web-frontend': { category: '界面', text: 'Web 前端入口页面。' },
  'dsh-web-search-deepseek': { category: '工具', text: 'DeepSeek 联网搜索集成。' },
  'dsh-workflow': { category: '任务', text: '工作流引擎协议。' },
  'dsh-workflow-worker-thread': { category: '任务', text: '工作流的 worker 线程实现。' },
  'dsh-workspace': { category: '基础', text: '工作区管理：项目目录的登记与切换。' },
}

/** Human-readable category order. */
const CATEGORY_ORDER = ['入口', '基础', '界面', '模型', '智能体', '工具', '扩展', '命令', '任务', '会话', '上下文', '多模态', '其它']

/** Derive a category from the package name when no curated entry exists. */
function guessCategory(name) {
  if (name.includes('client-ui') || name.includes('client-web')) return '界面'
  if (name.includes('client')) return '界面'
  if (name.includes('llm')) return '模型'
  if (name.includes('tool')) return '工具'
  if (name.includes('skill') || name.includes('mcp')) return '扩展'
  if (name.includes('command')) return '命令'
  if (name.includes('session')) return '会话'
  if (name.includes('agent')) return '智能体'
  if (name.includes('attachment')) return '多模态'
  if (name.includes('compaction') || name.includes('spill') || name.includes('token')) return '上下文'
  return '其它'
}

/** Engine package directories in priority order (updated copy wins). */
function engineDirs() {
  const dirs = []
  dirs.push(path.join(desktopDir, 'dsh-service', 'node_modules', '@deepseek-ai'))
  if (typeof process.resourcesPath === 'string') dirs.push(path.join(process.resourcesPath, 'dsh-service', 'node_modules', '@deepseek-ai'))
  dirs.push(path.join(app.getAppPath(), 'dsh-service', 'node_modules', '@deepseek-ai'))
  return dirs
}

function firstParagraphOfReadme(dir) {
  for (const name of ['README.zh.md', 'README.md']) {
    try {
      const text = fs.readFileSync(path.join(dir, name), 'utf8')
      const line = text.split(/\r?\n/).map((item) => item.trim())
        .find((item) => item !== '' && !item.startsWith('#') && !item.startsWith('[') && !item.startsWith('!'))
      if (line) return line.slice(0, 160)
    } catch { /* no readme */ }
  }
  return ''
}

/** Scan the installed engine and return the annotated plugin catalog. */
function catalog() {
  const found = new Map()
  for (const base of engineDirs()) {
    let entries = []
    try { entries = fs.readdirSync(base, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('dsh')) continue
      if (found.has(entry.name)) continue
      const dir = path.join(base, entry.name)
      let version = null
      let description = ''
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        version = typeof manifest.version === 'string' ? manifest.version : null
        description = typeof manifest.description === 'string' ? manifest.description : ''
      } catch { /* partial install */ }
      const curated = CURATED[entry.name]
      found.set(entry.name, {
        name: entry.name,
        package: `@deepseek-ai/${entry.name}`,
        version,
        category: curated?.category ?? guessCategory(entry.name),
        summary: curated?.text ?? description ?? firstParagraphOfReadme(dir),
        curated: Boolean(curated),
      })
    }
  }
  const items = [...found.values()].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb)
    return a.name.localeCompare(b.name)
  })
  const categories = [...new Set(items.map((item) => item.category))]
  return { items, categories, scannedDirs: engineDirs().filter((dir) => fs.existsSync(dir)) }
}

module.exports = { catalog }
