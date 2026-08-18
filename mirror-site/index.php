<?php
/** DeepSeek Harness Desktop — 产品页 / 镜像与下载中心。 */
require __DIR__ . '/lib.php';

$latest = read_manifest('latest.json');
$feed = read_manifest('feed.json');
$engineHistory = read_history('engine');
$desktopHistory = read_history('desktop');

$base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
    . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

$desktopLatest = $desktopHistory[0] ?? null;
$desktopUrl = !empty($feed['url']) ? $feed['url'] : ($desktopLatest['url'] ?? null);

// Backfill history rows from packaged manifests on first run after deploy.
if ($latest && empty($engineHistory)) {
    $engineHistory = [[
        'version' => $latest['version'], 'url' => $latest['bundle'] ?? '',
        'size' => null, 'uploadedAt' => $latest['syncedAt'] ?? null, 'notes' => $latest['notes'] ?? '',
    ]];
}
if ($feed && empty($desktopHistory) && !empty($feed['version'])) {
    $desktopHistory = [[
        'version' => $feed['version'], 'url' => $feed['url'] ?? '',
        'size' => null, 'uploadedAt' => null, 'notes' => $feed['notes'] ?? '',
    ]];
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DeepSeek Harness Desktop — 桌面客户端 · 镜像与下载中心</title>
<meta name="description" content="DeepSeek Harness Desktop：把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面。免 Node.js、系统托盘、多模态增强、Skill 与 MCP 可视化管理。">
<link rel="icon" type="image/svg+xml" href="assets/dsh.svg">
<style>
:root {
  --bg: #08090d;
  --bg-raise: #0e1118;
  --panel: #11141d;
  --line: rgba(255,255,255,.07);
  --line-strong: rgba(255,255,255,.12);
  --text: #e8eaf0;
  --sub: #9aa1b2;
  --faint: #626a7c;
  --accent: #4d6bfe;
  --accent-soft: rgba(77,107,254,.12);
  --ok: #3fb96c;
  --radius: 14px;
  --font: "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font: 15px/1.75 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px; }

/* ambient */
.glow { position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(720px 380px at 18% -6%, rgba(77,107,254,.13), transparent 62%),
    radial-gradient(640px 340px at 84% 4%, rgba(77,107,254,.07), transparent 60%);
}
.grid-lines { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .35;
  background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse 90% 55% at 50% 0%, #000 40%, transparent 100%);
}

/* nav */
nav { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(14px); background: rgba(8,9,13,.72); border-bottom: 1px solid var(--line); }
nav .wrap { display: flex; align-items: center; height: 60px; gap: 28px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 600; letter-spacing: .2px; }
.brand img { width: 26px; height: 26px; }
.brand small { color: var(--faint); font-weight: 400; font-size: 12px; margin-left: 2px; }
nav .links { margin-left: auto; display: flex; gap: 26px; font-size: 13.5px; color: var(--sub); }
nav .links a:hover { color: var(--text); }

/* hero */
header.hero { position: relative; z-index: 1; padding: 108px 0 76px; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--sub); border: 1px solid var(--line-strong); border-radius: 999px; padding: 4px 14px; letter-spacing: .4px; }
.eyebrow i { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); display: inline-block; }
h1 { font-size: 46px; line-height: 1.22; font-weight: 650; letter-spacing: .3px; margin: 26px 0 0; max-width: 720px; }
h1 .thin { color: var(--sub); font-weight: 450; }
.hero p.lead { color: var(--sub); font-size: 17px; max-width: 620px; margin-top: 20px; }
.cta { display: flex; gap: 14px; margin-top: 38px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 24px; border-radius: 10px; font-size: 14.5px; border: 1px solid var(--line-strong); background: var(--bg-raise); color: var(--text); transition: border-color .15s, background .15s; }
.btn:hover { border-color: rgba(255,255,255,.24); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { background: #5f7bff; }
.btn svg { flex: none; }
.hero-meta { margin-top: 18px; color: var(--faint); font-size: 12.5px; }

/* stats */
.stats { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.stats div { padding: 22px 26px; }
.stats div + div { border-left: 1px solid var(--line); }
.stats b { display: block; font-size: 24px; font-weight: 600; margin-top: 6px; font-variant-numeric: tabular-nums; }
.stats b.ok { color: var(--ok); }
.stats span { color: var(--faint); font-size: 12.5px; letter-spacing: .3px; }

/* sections */
section { position: relative; z-index: 1; padding: 64px 0 8px; }
.sec-head { margin-bottom: 30px; }
.sec-head em { font-style: normal; color: var(--accent); font-size: 12.5px; letter-spacing: 2px; text-transform: uppercase; }
.sec-head h2 { font-size: 26px; font-weight: 600; margin-top: 8px; }
.sec-head p { color: var(--sub); margin-top: 8px; max-width: 640px; font-size: 14.5px; }

/* feature grid */
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.feature { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 24px 22px; transition: border-color .18s; }
.feature:hover { border-color: var(--line-strong); }
.feature h3 { font-size: 15.5px; font-weight: 600; margin-bottom: 8px; }
.feature p { color: var(--sub); font-size: 13.5px; line-height: 1.7; }
.feature .no { color: var(--accent); font-size: 12px; letter-spacing: 1px; display: block; margin-bottom: 12px; font-variant-numeric: tabular-nums; }

/* tables */
.panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.panel + .panel { margin-top: 16px; }
.panel-head { display: flex; align-items: baseline; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.panel-head h3 { font-size: 15px; font-weight: 600; }
.panel-head span { color: var(--faint); font-size: 12.5px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th, td { text-align: left; padding: 12px 22px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: none; }
th { color: var(--faint); font-weight: 500; font-size: 12px; letter-spacing: .4px; }
td.num { color: var(--sub); font-variant-numeric: tabular-nums; }
.pill { display: inline-block; font-size: 11.5px; padding: 1px 9px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--sub); margin-left: 8px; vertical-align: 1px; }
.pill.current { color: var(--ok); border-color: rgba(63,185,108,.4); background: rgba(63,185,108,.08); }
.dl { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 13px; }
.dl:hover { text-decoration: underline; }
.dl.off { color: var(--faint); pointer-events: none; }
.mono { font-family: "Cascadia Code", Consolas, monospace; font-size: 12.5px; }

/* usage */
.usage { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.usage .panel { padding: 20px 22px; }
.usage h3 { font-size: 14.5px; margin-bottom: 6px; }
.usage p { color: var(--sub); font-size: 13px; margin-bottom: 12px; }
pre { background: #0a0d13; border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; font: 12.5px/1.7 "Cascadia Code", Consolas, monospace; color: #b8c2d8; overflow: auto; user-select: all; }

/* community */
.community { display: grid; grid-template-columns: 1fr 300px; gap: 14px; }
.community .panel { padding: 24px 26px; }
.community h3 { font-size: 15.5px; margin-bottom: 8px; }
.community p { color: var(--sub); font-size: 13.5px; }
.qq-no { font-size: 22px; font-weight: 600; letter-spacing: 1px; margin: 12px 0 4px; font-variant-numeric: tabular-nums; }
.qq-qr { text-align: center; }
.qq-qr img { width: 180px; height: 180px; border-radius: 10px; border: 1px solid var(--line-strong); }
.qq-qr figcaption { color: var(--faint); font-size: 12px; margin-top: 10px; }

footer { position: relative; z-index: 1; border-top: 1px solid var(--line); margin-top: 84px; padding: 30px 0 46px; color: var(--faint); font-size: 12.5px; }
footer .wrap { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
footer a { color: var(--sub); }
footer a:hover { color: var(--text); }
footer .sep { margin: 0 10px; color: var(--line-strong); }

@media (max-width: 860px) {
  .features { grid-template-columns: 1fr 1fr; }
  .stats { grid-template-columns: 1fr; }
  .stats div + div { border-left: none; border-top: 1px solid var(--line); }
  .usage, .community { grid-template-columns: 1fr; }
  h1 { font-size: 34px; }
  nav .links { display: none; }
}
</style>
</head>
<body>
<div class="glow"></div>
<div class="grid-lines"></div>

<nav><div class="wrap">
  <a class="brand" href="./">
    <img src="assets/dsh.svg" alt="DeepSeek Harness">
    DeepSeek Harness Desktop <small>镜像与下载中心</small>
  </a>
  <div class="links">
    <a href="#features">功能</a>
    <a href="#downloads">下载</a>
    <a href="#mirror">镜像</a>
    <a href="#community">社区</a>
  </div>
</div></nav>

<header class="hero"><div class="wrap">
  <span class="eyebrow"><i></i>官方引擎桌面发行版 · v<?= h($feed['version'] ?? '1.3.0') ?></span>
  <h1>把 DeepSeek Harness<br><span class="thin">装进你的桌面。</span></h1>
  <p class="lead">官方引擎随包内置，独立 Node 运行时，无需安装任何依赖。系统托盘常驻、多模态对话增强、Skill 与 MCP 可视化管理，以及不受官方源速率限制的高速更新镜像。</p>
  <div class="cta">
    <?php if ($desktopUrl): ?>
    <a class="btn primary" href="<?= h($desktopUrl) ?>">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1v9.2M3.8 6.4 8 10.6l4.2-4.2M2.5 13.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      下载桌面版 <?= h($feed['version'] ?? '') ?>
    </a>
    <?php endif; ?>
    <a class="btn" href="#downloads">查看历史版本</a>
    <a class="btn" href="#mirror">更新镜像</a>
  </div>
  <p class="hero-meta">Windows 10 及以上 · x64 · 安装包内置官方引擎，开箱即用</p>
</div></header>

<div class="wrap">
  <div class="stats">
    <div><span>镜像引擎版本</span><b class="ok"><?= $latest ? h($latest['version']) : '—' ?></b></div>
    <div><span>桌面版当前版本</span><b><?= $feed ? h($feed['version']) : '—' ?></b></div>
    <div><span>镜像同步时间</span><b><?= !empty($latest['syncedAt']) ? h(date('Y-m-d', strtotime($latest['syncedAt']))) : '—' ?></b></div>
  </div>
</div>

<section id="features"><div class="wrap">
  <div class="sec-head">
    <em>Features</em>
    <h2>官方体验，桌面级完整。</h2>
    <p>不修改官方仓库的任何文件，全部增强以注入层形式存在；官方升级随时可用，桌面能力随版本持续叠加。</p>
  </div>
  <div class="features">
    <div class="feature"><span class="no">01</span><h3>内置服务，免装 Node.js</h3><p>随包携带官方引擎与独立 Node 运行时，应用自动启动并管理本地 Harness 服务；已在运行的服务直接唤醒复用。</p></div>
    <div class="feature"><span class="no">02</span><h3>多模态对话流</h3><p>为第三方模型声明视觉输入，对话框内实时显示当前模型模态；图片草稿遇到纯文本模型时一键开启，模型切换自然无断点。</p></div>
    <div class="feature"><span class="no">03</span><h3>Skill 加载器</h3><p>全根目录扫描与遮蔽校验，支持 GitHub 搜索安装、Git 仓库、本地文件夹，以及把 Skill 文件直接拖入窗口完成安装。</p></div>
    <div class="feature"><span class="no">04</span><h3>MCP 插件与连接测试</h3><p>可视化增删改 MCP 服务器并一键测试连接、列出工具清单；配置经官方 mcp-client 插件注入，不改动任何官方文件。</p></div>
    <div class="feature"><span class="no">05</span><h3>内置插件注解</h3><p>官方引擎的一百多个内置插件逐一给出中文功能说明，结构与用途一目了然。</p></div>
    <div class="feature"><span class="no">06</span><h3>高速更新镜像</h3><p>预构建引擎包从本站直接下载，绕开缓慢的 npm 官方源；桌面版更新默认绑定本站，主地址不可用时自动启用备用源。</p></div>
  </div>
</div></section>

<section id="downloads"><div class="wrap">
  <div class="sec-head">
    <em>Downloads</em>
    <h2>桌面端下载</h2>
    <p>最新版本与历史版本均可在此查看和下载。安装后打开「设置 → 更新与关于」即可自动检查后续更新。</p>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>DeepSeek Harness Desktop for Windows</h3><span>NSIS 安装包 · x64</span></div>
    <table>
      <tr><th style="width:22%">版本</th><th style="width:16%">大小</th><th style="width:20%">发布时间</th><th>说明</th><th style="width:12%"></th></tr>
      <?php foreach ($desktopHistory as $i => $row): ?>
      <tr>
        <td class="mono"><?= h($row['version']) ?><?= $i === 0 ? '<span class="pill current">最新</span>' : '' ?></td>
        <td class="num"><?= isset($row['size']) && $row['size'] ? fmt_size($row['size']) : '—' ?></td>
        <td class="num"><?= !empty($row['uploadedAt']) ? h(date('Y-m-d', (int)$row['uploadedAt'])) : '—' ?></td>
        <td style="color:var(--sub)"><?= h($row['notes'] ?? '') ?></td>
        <td><?php if (!empty($row['url'])): ?><a class="dl" href="<?= h($row['url']) ?>">下载</a><?php else: ?><span class="dl off">—</span><?php endif; ?></td>
      </tr>
      <?php endforeach; ?>
      <?php if (empty($desktopHistory)): ?>
      <tr><td colspan="5" style="color:var(--faint)">暂无发布记录</td></tr>
      <?php endif; ?>
    </table>
  </div>
</div></section>

<section id="mirror"><div class="wrap">
  <div class="sec-head">
    <em>Engine Mirror</em>
    <h2>官方引擎镜像</h2>
    <p>官方引擎的预构建镜像（含完整依赖树）。桌面端「一键更新官方引擎」默认从本站高速下载；历史镜像版本保留，可随时回取。</p>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>镜像版本历史</h3><span>@deepseek-ai/dsh 预构建包</span></div>
    <table>
      <tr><th style="width:22%">引擎版本</th><th style="width:16%">大小</th><th style="width:20%">同步时间</th><th>说明</th><th style="width:12%"></th></tr>
      <?php foreach ($engineHistory as $i => $row): ?>
      <tr>
        <td class="mono"><?= h($row['version']) ?><?= $i === 0 ? '<span class="pill current">当前</span>' : '' ?></td>
        <td class="num"><?= isset($row['size']) && $row['size'] ? fmt_size($row['size']) : '—' ?></td>
        <td class="num"><?= !empty($row['uploadedAt']) ? h(date('Y-m-d', is_numeric($row['uploadedAt']) ? (int)$row['uploadedAt'] : strtotime($row['uploadedAt']))) : '—' ?></td>
        <td style="color:var(--sub)"><?= h($row['notes'] ?? '') ?></td>
        <td><?php if (!empty($row['url'])): ?><a class="dl" href="<?= h($row['url']) ?>">下载</a><?php else: ?><span class="dl off">—</span><?php endif; ?></td>
      </tr>
      <?php endforeach; ?>
      <?php if (empty($engineHistory)): ?>
      <tr><td colspan="5" style="color:var(--faint)">暂无镜像记录</td></tr>
      <?php endif; ?>
    </table>
  </div>

  <div class="usage" style="margin-top:16px">
    <div class="panel">
      <h3>引擎更新镜像地址</h3>
      <p>桌面端「设置 → 更新与关于 → 加速更新镜像地址」，默认已绑定本站：</p>
      <pre><?= h($base) ?></pre>
    </div>
    <div class="panel">
      <h3>桌面版更新源（feed.json）</h3>
      <p>桌面版更新检查默认使用以下地址，主地址不可用时自动回退备用源：</p>
      <pre><?= h($base) ?>/feed.json</pre>
    </div>
  </div>
</div></section>

<section id="community"><div class="wrap">
  <div class="sec-head">
    <em>Community</em>
    <h2>用户社区</h2>
    <p>使用问题、功能建议、版本预告，都会在群内第一时间同步。</p>
  </div>
  <div class="community">
    <div class="panel">
      <h3>QQ 交流群</h3>
      <p>加入 DeepSeek Harness Desktop 用户群，获取使用帮助与更新通知。</p>
      <div class="qq-no">1017339599</div>
      <p style="margin-bottom:14px">群号即搜即入，或点击链接一键加群。</p>
      <a class="btn" href="https://qm.qq.com/q/LnuRC7T5my" target="_blank" rel="noopener">一键加入 QQ 群</a>
    </div>
    <div class="panel qq-qr">
      <figure>
        <img src="assets/qq-qrcode.png" alt="QQ 群二维码">
        <figcaption>扫码加入 QQ 群 1017339599</figcaption>
      </figure>
    </div>
  </div>
</div></section>

<footer><div class="wrap">
  <span>DeepSeek Harness Desktop · 镜像与下载中心</span>
  <span>
    <a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">官方仓库</a>
    <span class="sep">/</span><a href="latest.json">latest.json</a>
    <span class="sep">/</span><a href="feed.json">feed.json</a>
    <span class="sep">/</span><a href="admin/">管理入口</a>
  </span>
</div></footer>
</body>
</html>
