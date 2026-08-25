<?php
/** DeepSeek Harness Desktop - 在线操作文档。
 * 与 GitHub README 同步维护；版本内容与镜像站发布的安装包一致。 */
require __DIR__ . '/lib.php';

$feed = read_manifest('feed.json');
$latest = read_manifest('latest.json');
$cfg = site_config();
$v = $feed['version'] ?? '1.4.0';
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>操作文档 · DeepSeek Harness Desktop</title>
<meta name="description" content="DeepSeek Harness Desktop 操作文档：安装、设置面板、模型与多模态、账户与用量、Skill、MCP、更新与常见问题。">
<link rel="icon" type="image/svg+xml" href="media.php?f=dsh.svg">
<style>
:root {
  --bg: #ffffff; --bg-soft: #f7f8fa; --panel: #ffffff; --line: #e8eaee; --line-strong: #d8dbe2;
  --text: #0b0d12; --sub: #5b6270; --faint: #98a0ae; --accent: #4d6bfe; --accent-deep: #3b56e8;
  --ok: #12934f; --radius: 14px;
  --font: "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  --mono: "Cascadia Code", Consolas, monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 15px/1.8 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 900px; margin: 0 auto; padding: 0 32px; }
nav { position: sticky; top: 0; z-index: 20; backdrop-filter: blur(14px); background: rgba(255,255,255,.85); border-bottom: 1px solid var(--line); }
nav .wrap { display: flex; align-items: center; height: 60px; gap: 28px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; font-size: 15px; }
.brand img { width: 24px; height: 24px; }
nav .links { margin-left: auto; display: flex; gap: 24px; font-size: 13.5px; color: var(--sub); }
nav .links a:hover { color: var(--text); }
.doc-hero { padding: 56px 0 36px; border-bottom: 1px solid var(--line); }
.doc-hero .eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sub); border: 1px solid var(--line-strong); border-radius: 999px; padding: 4px 14px; letter-spacing: 1.2px; text-transform: uppercase; }
.doc-hero h1 { font-size: 36px; font-weight: 680; letter-spacing: -.5px; margin: 20px 0 0; }
.doc-hero p { color: var(--sub); margin-top: 14px; max-width: 620px; }
.toc { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 28px 0 8px; }
.toc a { border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; font-size: 13.5px; color: var(--sub); transition: border-color .15s, color .15s; }
.toc a:hover { border-color: var(--accent); color: var(--text); }
.toc a b { display: block; color: var(--text); font-size: 13.5px; font-weight: 600; margin-bottom: 2px; }
section { padding: 40px 0 8px; }
section h2 { font-size: 24px; font-weight: 660; letter-spacing: -.3px; margin-bottom: 16px; }
section h3 { font-size: 16px; font-weight: 640; margin: 22px 0 8px; }
section p { color: var(--sub); margin-bottom: 10px; }
section p b, section li b { color: var(--text); font-weight: 620; }
section ul, section ol { color: var(--sub); padding-left: 22px; margin: 0 0 12px; }
section li { margin-bottom: 6px; line-height: 1.8; }
code { font-family: var(--mono); font-size: 12.5px; background: var(--bg-soft); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; color: var(--text); }
pre { background: #0b0f16; border-radius: 10px; padding: 14px 18px; overflow-x: auto; margin: 10px 0 16px; }
pre code { background: none; border: none; color: #c8d0dd; padding: 0; font-size: 12.5px; line-height: 1.7; display: block; white-space: pre; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 10px 0 18px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
th, td { text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: none; }
th { color: var(--faint); font-weight: 500; font-size: 12px; letter-spacing: .6px; background: var(--bg-soft); }
td { color: var(--sub); }
td:first-child { color: var(--text); font-weight: 520; }
.callout { border: 1px solid var(--line-strong); border-left: 3px solid var(--accent); border-radius: 10px; padding: 14px 18px; margin: 12px 0 18px; color: var(--sub); font-size: 14px; background: var(--bg-soft); }
.callout b { color: var(--text); }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 20px; border-radius: 9px; font-size: 14px; border: 1px solid var(--line-strong); background: var(--panel); color: var(--text); transition: border-color .15s; }
.btn:hover { border-color: var(--text); }
.btn.primary { background: #0b0d12; border-color: #0b0d12; color: #fff; }
footer { border-top: 1px solid var(--line); margin-top: 64px; padding: 32px 0 48px; color: var(--faint); font-size: 12.5px; }
footer .wrap { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
footer a { color: var(--sub); }
footer a:hover { color: var(--text); }
@media (max-width: 760px) { .toc { grid-template-columns: 1fr; } nav .links { display: none; } }
</style>
</head>
<body>

<nav><div class="wrap">
  <a class="brand" href="./"><img src="media.php?f=dsh.svg" alt="">DeepSeek Harness Desktop</a>
  <div class="links">
    <a href="./">首页</a>
    <a href="https://github.com/llh11/deepseek-harness-desktop" target="_blank" rel="noopener">GitHub</a>
  </div>
</div></nav>

<div class="wrap">
<header class="doc-hero">
  <span class="eyebrow">Docs · v<?= h($v) ?></span>
  <h1>操作文档</h1>
  <p>DeepSeek Harness Desktop 把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面：自动启动并管理本地服务、系统托盘、免装 Node.js。当前镜像引擎版本 <b><?= h($latest['version'] ?? '-') ?></b>。</p>
  <p style="margin-top:18px; display:flex; gap:12px; flex-wrap:wrap">
    <a class="btn primary" href="<?= h($feed['url'] ?? '#') ?>">下载桌面版 <?= h($v) ?></a>
    <a class="btn" href="https://github.com/llh11/deepseek-harness-desktop#readme" target="_blank" rel="noopener">GitHub 完整 README</a>
  </p>
</header>

<div class="toc">
  <a href="#install"><b>1 · 安装与启动</b>系统要求与首次运行</a>
  <a href="#settings"><b>2 · 设置面板</b>五大桌面分区总览</a>
  <a href="#models"><b>3 · 模型与多模态</b>官方「模型」板块管理</a>
  <a href="#usage"><b>4 · 账户与用量</b>余额查询与用量统计</a>
  <a href="#skills-mcp"><b>5 · Skill 与 MCP</b>可视化生态管理</a>
  <a href="#update"><b>6 · 更新与常见问题</b>一键更新与排障</a>
</div>

<section id="install">
  <h2>1 · 安装与启动</h2>
  <p>Windows 10 及以上（x64）。安装包内置官方引擎与独立 Node 运行时，<b>无需安装 Node.js 或执行任何命令</b>。</p>
  <ol>
    <li>从上方按钮或首页下载安装包（NSIS，约 170 MB），双击安装。</li>
    <li>首次启动自动探测并拉起本地 Harness 服务（默认 <code>http://127.0.0.1:3080</code>）；已在运行的服务会被直接唤醒复用。</li>
    <li>在官方 Web UI 左下角点「设置」打开设置面板--桌面端能力全部注入其中，无任何新增点击位置。</li>
  </ol>
  <div class="callout"><b>API Key 配置：</b>官方设置 ->「模型」板块，在对应 Provider 的编辑卡片中填写（写入 <code>~/.dsh/.credentials.yaml</code>）。桌面端「账户与用量」自动读取，无需重复配置。</div>
</section>

<section id="settings">
  <h2>2 · 设置面板（唯一设置入口）</h2>
  <p>打开官方设置后，导航在官方分区（通用 / 模型 / 插件 / Agent 预设）之后追加 <b>五个桌面分区</b>（自 1.4.0 起「模型与多模态」回归官方板块，桌面端不再设该分区）：</p>
  <table>
    <tr><th style="width:160px">分区</th><th>功能</th></tr>
    <tr><td>内置服务</td><td>服务状态与日志、启动/停止/重启、服务来源（本地更新版 -> 内置 -> 源码 -> 全局 -> npx）、Web 地址、工作区路径、托盘/开机自启等行为开关。</td></tr>
    <tr><td>账户与用量</td><td>按官方凭据解析 API Key 查询 DeepSeek 账户余额；直接读取引擎会话日志统计全部模型（含第三方 Provider 路由）的 token 消耗。</td></tr>
    <tr><td>Skill 加载器</td><td>全根目录扫描、遮蔽检测、GitHub 搜索安装、Git / 文件夹 / 压缩包拖拽安装、可视化启停与删除。</td></tr>
    <tr><td>MCP 插件</td><td>可视化增删改 MCP 服务器（stdio / streamable-http），一键测试连接并列出工具清单；以官方 mcp-client 插件注入，不改动任何官方 profile 文件。</td></tr>
    <tr><td>更新与关于</td><td>官方引擎一键更新（镜像加速）、桌面版更新检查与应用内下载、备用更新地址切换。</td></tr>
  </table>
</section>

<section id="models">
  <h2>3 · 模型与多模态（官方板块管理）</h2>
  <p><b>自 1.4.0 起，模型与多模态完全由官方「模型」板块管理</b>，官方引擎已原生支持全部能力：</p>
  <ul>
    <li><b>第三方 Provider</b>：官方「模型」板块「添加自定义提供方」创建 <code>llm-pi-ai</code> 路由；OpenAI 兼容与 <b>Anthropic 原生（anthropic-messages）</b>协议均原生支持，无需本地翻译网关。</li>
    <li><b>多模态</b>：官方引擎逐模型声明输入模态（内置目录含 <code>DeepSeek-V4-Flash-Vision-Exp</code> 等视觉模型）；自定义路由通过 <code>defaultInput</code> 或逐模型 <code>input: [text, image]</code> 声明。<code>/goal</code>、<code>/plan</code> 等命令可直接接收图文输入。</li>
    <li><b>从 1.3.x 升级</b>：旧桌面端 Provider 配置首次启动时<b>自动迁移</b>为官方直连路由（Anthropic 上游自动标注 anthropic-messages、本地网关前缀移除），已保存的密钥继续生效，无需手动搬移；原 <code>providers.json</code> 归档为 <code>.bak</code>。</li>
  </ul>
  <div class="callout"><b>对话流辅助仍在</b>：输入框 <code>#</code> 唤起 Skill / MCP 速查面板；图片灯箱增强（滚轮缩放、拖拽平移、双击还原、下载）；官方插件列表内联中文注解。</div>
</section>

<section id="usage">
  <h2>4 · 账户与用量</h2>
  <h3>账户余额</h3>
  <p>按官方凭据层（进程环境 &gt; <code>~/.dsh/.credentials.yaml</code> &gt; <code>~/.dsh/.env</code>）解析 API Key，查询 DeepSeek 官方账户与各第三方路由中 DeepSeek 端点的余额。密钥写入与维护全部在官方「模型」板块完成，本面板只读。</p>
  <h3>官方引擎用量</h3>
  <p>直接读取官方会话日志（<code>~/.dsh/sessions</code>，含 zstd 压缩）统计：今日 / 近 7 日 / 累计三档汇总、逐模型分解（含缓存命中与推理 token）、最近请求明细。覆盖官方「模型」板块中的全部可选模型。首次扫描可能需要几秒。</p>
</section>

<section id="skills-mcp">
  <h2>5 · Skill 与 MCP</h2>
  <h3>Skill 加载器</h3>
  <ul>
    <li>扫描项目 <code>.dsh/skills</code>、<code>.agents/skills</code>（需设置工作区路径）与用户级根目录，rank 与官方一致；跨目录同名遮蔽会明确提示。</li>
    <li>安装方式：GitHub 仓库搜索一键安装、Git 仓库 URL、本地文件夹、单个 .md URL，以及把文件 / 压缩包<b>直接拖入设置面板</b>。</li>
    <li>开关写入 frontmatter 的 <code>disable-model-invocation</code>，模型目录即时生效。</li>
  </ul>
  <h3>MCP 插件</h3>
  <ul>
    <li>支持 stdio（本地命令，含环境变量与工作目录）与 streamable-http（远程 URL，含请求头）双传输，超时与断线重连等参数完整可视化。</li>
    <li>每个服务器可「测试连接」：真实握手并报告工具数量与清单。</li>
    <li>保存写入 <code>~/.dsh/dsh-desktop/mcp.patch.yml</code> 注入层，服务以 <code>dsh web --patch</code> 启动，<b>不改动任何官方文件</b>；点「重启服务以应用」生效。</li>
  </ul>
</section>

<section id="update">
  <h2>6 · 更新与常见问题</h2>
  <h3>一键更新</h3>
  <ul>
    <li><b>官方引擎</b>：优先从本镜像站拉取预构建引擎包（镜像过旧时该请求自动触发镜像站后台同步官方最新版），失败时回退 npm registry；更新安装到用户目录，重启服务即启用。</li>
    <li><b>桌面版</b>：更新检查绑定本站 <code>feed.json</code>，发现新版本可在应用内直接下载安装包。</li>
  </ul>
  <h3>常见问题</h3>
  <table>
    <tr><th style="width:200px">问题</th><th>处理</th></tr>
    <tr><td>服务一直「启动中」</td><td>npx 首次安装需下载依赖，最长 5 分钟；「内置服务 -> 查看日志」确认进度。</td></tr>
    <tr><td>图片附件被拒绝</td><td>该模型未声明图片输入。在官方「模型」板块为自定义路由声明 <code>defaultInput: [text, image]</code>，或选择官方内置视觉模型。</td></tr>
    <tr><td>MCP 工具未出现</td><td>先「测试连接」确认握手；确认已启用并以注入层重启；stdio 命令需本机可用。</td></tr>
    <tr><td>服务报 sharp 模块错误</td><td>引擎包解压不完整（更新中断）。重新执行一次「一键更新官方引擎」。</td></tr>
    <tr><td>镜像引擎版本落后官方</td><td>镜像站访问 <code>latest.php</code> 或超 6 小时未同步会自动后台同步（npmmirror -> npmjs 双回退）；也可在管理后台手动同步。</td></tr>
  </table>
  <h3>版本历史要点</h3>
  <ul>
    <li><b>1.4.0</b>：模型与多模态管理回归官方板块（含旧配置自动迁移）；修复账户余额误报与官方用量读取失败；修复模型模态误标；镜像自动跟进官方版本 + 远程发布 API。</li>
    <li><b>1.3.3</b>：内置引擎升级 0.1.1-rc.2；适配官方 <code>--no-open</code> 启动行为。</li>
    <li><b>1.3.2 / 1.3.1 / 1.3.0</b>：多模态对话流集成、账户与用量板块、Skill/MCP 可视化管理、更新通道绑定镜像站、插件中文注解、图片灯箱增强。</li>
  </ul>
</section>
</div>

<footer><div class="wrap">
  <span>DeepSeek Harness Desktop · 操作文档（v<?= h($v) ?>）</span>
  <span>
    <a href="<?= h($cfg['github_url']) ?>" target="_blank" rel="noopener">GitHub</a> ·
    <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">官方仓库</a> ·
    <a href="./">下载中心</a>
  </span>
</div></footer>
</body>
</html>
