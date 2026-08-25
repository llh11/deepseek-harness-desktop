<?php
/** DeepSeek Harness Desktop — 产品页 / 镜像与下载中心。
 * 视觉风格对齐 deepseek.com/harness：浅色、编辑排版、克制留白。 */
require __DIR__ . '/lib.php';
$config = require __DIR__ . '/mirror-config.php';

// Serving the homepage also refreshes the mirror in the background when the
// manifest is stale, so the download center stays current without any cron.
mirror_maybe_lazy_sync($config);

$latest = read_manifest('latest.json');
$feed = read_manifest('feed.json');
$engineHistory = read_history('engine');
$desktopHistory = read_history('desktop');
$cfg = site_config();

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

$screens = !empty($cfg['screens']) && is_array($cfg['screens'])
    ? $cfg['screens']
    : ['media.php?f=screens/app-main.png', 'media.php?f=screens/app-settings.png', 'media.php?f=screens/app-plugins.png', 'media.php?f=screens/app-usage.png'];
// The web server rewrites non-PHP paths to index.php, so any legacy
// "assets/..." reference must go through media.php.
$mediaUrl = fn(string $src): string => str_starts_with($src, 'assets/') ? 'media.php?f=' . substr($src, 7) : $src;
$screens = array_map($mediaUrl, $screens);
$cfg['qq_qr'] = $mediaUrl((string)$cfg['qq_qr']);
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DeepSeek Harness Desktop — 桌面客户端 · 镜像与下载中心</title>
<meta name="description" content="DeepSeek Harness Desktop：把官方 DeepSeek Harness 带到原生桌面。免 Node.js、系统托盘、多模态对话、Skill 与 MCP 可视化管理、账户与用量一览。">
<link rel="icon" type="image/svg+xml" href="media.php?f=dsh.svg">
<style>
:root {
  --bg: #ffffff;
  --bg-soft: #f7f8fa;
  --panel: #ffffff;
  --line: #e8eaee;
  --line-strong: #d8dbe2;
  --text: #0b0d12;
  --sub: #5b6270;
  --faint: #98a0ae;
  --accent: #4d6bfe;
  --accent-deep: #3b56e8;
  --accent-soft: rgba(77,107,254,.07);
  --ok: #12934f;
  --radius: 14px;
  --font: "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font: 15px/1.75 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px; }

/* nav */
nav { position: sticky; top: 0; z-index: 20; backdrop-filter: blur(14px); background: rgba(255,255,255,.82); border-bottom: 1px solid var(--line); }
nav .wrap { display: flex; align-items: center; height: 64px; gap: 32px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; letter-spacing: .2px; font-size: 15.5px; }
.brand img { width: 26px; height: 26px; }
.brand small { color: var(--faint); font-weight: 400; font-size: 12px; margin-left: 2px; }
nav .links { margin-left: auto; display: flex; align-items: center; gap: 28px; font-size: 13.5px; color: var(--sub); }
nav .links a:hover { color: var(--text); }
nav .gh { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--text); font-size: 13px; transition: border-color .15s, background .15s; }
nav .gh:hover { border-color: var(--text); background: var(--bg-soft); }

/* hero */
header.hero { padding: 120px 0 88px; border-bottom: 1px solid var(--line); }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sub); border: 1px solid var(--line-strong); border-radius: 999px; padding: 4px 14px; letter-spacing: 1.2px; text-transform: uppercase; }
.eyebrow i { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); display: inline-block; }
h1 { font-size: 58px; line-height: 1.16; font-weight: 680; letter-spacing: -.5px; margin: 30px 0 0; max-width: 760px; }
h1 .thin { color: var(--faint); font-weight: 500; }
.hero p.lead { color: var(--sub); font-size: 17.5px; max-width: 640px; margin-top: 24px; }
.cta { display: flex; gap: 14px; margin-top: 42px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 9px; height: 46px; padding: 0 26px; border-radius: 10px; font-size: 14.5px; border: 1px solid var(--line-strong); background: var(--panel); color: var(--text); transition: border-color .15s, background .15s, color .15s; }
.btn:hover { border-color: var(--text); }
.btn.primary { background: #0b0d12; border-color: #0b0d12; color: #fff; }
.btn.primary:hover { background: #232733; border-color: #232733; }
.btn.accent { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.accent:hover { background: var(--accent-deep); border-color: var(--accent-deep); }
.btn svg { flex: none; }
.hero-meta { margin-top: 20px; color: var(--faint); font-size: 12.5px; letter-spacing: .2px; }

/* stats */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--line); }
.stats div { padding: 30px 32px; }
.stats div + div { border-left: 1px solid var(--line); }
.stats b { display: block; font-size: 26px; font-weight: 620; margin-top: 6px; font-variant-numeric: tabular-nums; letter-spacing: -.3px; }
.stats b.ok { color: var(--ok); }
.stats span { color: var(--faint); font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }

/* sections */
section { padding: 88px 0 0; }
.sec-head { margin-bottom: 40px; }
.sec-head em { font-style: normal; color: var(--accent); font-size: 12px; letter-spacing: 2.4px; text-transform: uppercase; font-weight: 600; }
.sec-head h2 { font-size: 34px; font-weight: 640; margin-top: 12px; letter-spacing: -.4px; }
.sec-head p { color: var(--sub); margin-top: 12px; max-width: 660px; font-size: 15px; }

/* feature grid — editorial, hairline */
.features { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
.feature { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 30px 28px 34px; transition: background .18s; }
.feature:hover { background: var(--bg-soft); }
.feature h3 { font-size: 16px; font-weight: 620; margin-bottom: 10px; }
.feature p { color: var(--sub); font-size: 13.5px; line-height: 1.75; }
.feature .no { color: var(--faint); font-size: 12px; letter-spacing: 1.4px; display: block; margin-bottom: 16px; font-variant-numeric: tabular-nums; }

/* screenshots */
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.shots figure { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--bg-soft); }
.shots img { display: block; width: 100%; }
.shots figcaption { padding: 12px 18px; color: var(--faint); font-size: 12.5px; border-top: 1px solid var(--line); background: var(--panel); }

/* tables */
.panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.panel + .panel { margin-top: 16px; }
.panel-head { display: flex; align-items: baseline; gap: 12px; padding: 20px 24px; border-bottom: 1px solid var(--line); }
.panel-head h3 { font-size: 15.5px; font-weight: 620; }
.panel-head span { color: var(--faint); font-size: 12.5px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th, td { text-align: left; padding: 14px 24px; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: none; }
tbody tr, table tr { transition: background .12s; }
tr:hover td { background: var(--bg-soft); }
th { color: var(--faint); font-weight: 500; font-size: 12px; letter-spacing: .6px; }
td.num { color: var(--sub); font-variant-numeric: tabular-nums; }
.pill { display: inline-block; font-size: 11.5px; padding: 1px 10px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--sub); margin-left: 8px; vertical-align: 1px; }
.pill.current { color: var(--ok); border-color: rgba(18,147,79,.35); background: rgba(18,147,79,.06); }
.dl { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 13px; font-weight: 550; }
.dl:hover { text-decoration: underline; }
.dl.off { color: var(--faint); pointer-events: none; }
.mono { font-family: "Cascadia Code", Consolas, monospace; font-size: 12.5px; }

/* endpoints */
.usage { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
.usage .panel { padding: 22px 24px; }
.usage h3 { font-size: 14.5px; font-weight: 620; margin-bottom: 6px; }
.usage p { color: var(--sub); font-size: 13px; margin-bottom: 12px; }
pre { background: var(--bg-soft); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; font: 12.5px/1.7 "Cascadia Code", Consolas, monospace; color: #3c4353; overflow: auto; user-select: all; }

/* community */
.community { display: grid; grid-template-columns: 1fr 280px; gap: 18px; }
.community .panel { padding: 28px 30px; }
.community h3 { font-size: 16px; font-weight: 620; margin-bottom: 8px; }
.community p { color: var(--sub); font-size: 13.5px; }
.qq-no { font-size: 26px; font-weight: 640; letter-spacing: 1.2px; margin: 14px 0 6px; font-variant-numeric: tabular-nums; }
.qq-qr { display: flex; align-items: center; justify-content: center; }
.qq-qr img { width: 196px; height: 196px; border-radius: 12px; border: 1px solid var(--line); }
.qq-qr figcaption { color: var(--faint); font-size: 12px; margin-top: 12px; text-align: center; }

footer { border-top: 1px solid var(--line); margin-top: 100px; padding: 36px 0 52px; color: var(--faint); font-size: 12.5px; }
footer .wrap { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
footer a { color: var(--sub); }
footer a:hover { color: var(--text); }
footer .sep { margin: 0 10px; color: var(--line-strong); }

@media (max-width: 900px) {
  .features { grid-template-columns: 1fr; }
  .stats { grid-template-columns: 1fr; }
  .stats div + div { border-left: none; border-top: 1px solid var(--line); }
  .usage, .community, .shots { grid-template-columns: 1fr; }
  h1 { font-size: 38px; }
  nav .links a:not(.gh) { display: none; }
}
</style>
</head>
<body>

<nav><div class="wrap">
  <a class="brand" href="./">
    <img src="media.php?f=dsh.svg" alt="DeepSeek Harness">
    DeepSeek Harness Desktop <small>镜像与下载中心</small>
  </a>
  <div class="links">
    <a href="#features">功能</a>
    <a href="#screens">界面</a>
    <a href="#downloads">下载</a>
    <a href="#mirror">镜像</a>
    <a href="docs.php">操作文档</a>
    <a href="#community">社区</a>
    <a class="gh" href="<?= h($cfg['github_url']) ?>" target="_blank" rel="noopener">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      GitHub
    </a>
  </div>
</div></nav>

<header class="hero"><div class="wrap">
  <span class="eyebrow"><i></i>Desktop Edition · v<?= h($feed['version'] ?? '1.3.1') ?></span>
  <h1>DeepSeek Harness，<br><span class="thin">桌面级形态。</span></h1>
  <p class="lead">官方引擎随包内置，独立运行时，无需安装任何依赖。模型与多模态管理回归官方「模型」板块，桌面端专注服务托管、Skill 生态、MCP 管理与账户用量——官方体验之上，桌面级的完整。</p>
  <div class="cta">
    <?php if ($desktopUrl): ?>
    <a class="btn primary" href="<?= h($desktopUrl) ?>">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1v9.2M3.8 6.4 8 10.6l4.2-4.2M2.5 13.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      下载桌面版 <?= h($feed['version'] ?? '') ?>
    </a>
    <?php endif; ?>
    <a class="btn" href="<?= h($cfg['github_url']) ?>" target="_blank" rel="noopener">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      在 GitHub 查看
    </a>
    <a class="btn" href="<?= h($cfg['official_url']) ?>" target="_blank" rel="noopener">官方介绍</a>
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
    <div class="feature"><span class="no">02</span><h3>官方模型 · 原生多模态</h3><p>官方「模型」板块一站管理密钥、第三方 Provider（含 Anthropic 原生协议）与逐模型图片输入声明；官方引擎原生处理多模态请求，桌面端零干预。</p></div>
    <div class="feature"><span class="no">03</span><h3>账户与用量</h3><p>按官方凭据解析 API Key 查询账户余额；直接读取引擎会话日志统计每个模型的 token 消耗，按日与累计汇总，一目了然。</p></div>
    <div class="feature"><span class="no">04</span><h3>Skill 加载器</h3><p>全根目录扫描与遮蔽校验，支持 GitHub 搜索安装、Git 仓库、本地文件夹，以及把 Skill 文件直接拖入窗口完成安装。</p></div>
    <div class="feature"><span class="no">05</span><h3>MCP 插件与连接测试</h3><p>可视化增删改 MCP 服务器并一键测试连接、列出工具清单；官方插件列表内附中文功能注解，配置不改动任何官方文件。</p></div>
    <div class="feature"><span class="no">06</span><h3>高速更新镜像</h3><p>预构建引擎包与桌面版更新默认绑定本站，镜像自动跟进官方最新版本；仅在镜像不可用时才提示切换备用地址。</p></div>
  </div>
</div></section>

<section id="screens"><div class="wrap">
  <div class="sec-head">
    <em>Interface</em>
    <h2>界面预览</h2>
    <p>官方 Web UI 原样保留，桌面能力以官方设计语言无缝融入。</p>
  </div>
  <div class="shots">
    <?php
      $captions = ['对话主界面 · 官方原生多模态', '设置面板 · 桌面端分区', '官方插件列表 · 内置插件中文注解', '账户与用量 · 余额与模型消耗统计'];
      foreach ($screens as $i => $src): ?>
    <figure>
      <img src="<?= h($src) ?>" alt="DeepSeek Harness Desktop 界面截图 <?= $i + 1 ?>" loading="lazy">
      <figcaption><?= h($captions[$i] ?? '界面截图') ?></figcaption>
    </figure>
    <?php endforeach; ?>
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

  <div class="usage">
    <div class="panel">
      <h3>引擎更新镜像地址</h3>
      <p>桌面端默认已绑定本站；仅当本站无法访问时，才会提示切换备用地址：</p>
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
      <div class="qq-no"><?= h($cfg['qq_number']) ?></div>
      <p style="margin-bottom:16px">群号即搜即入，或点击链接一键加群。</p>
      <a class="btn accent" href="<?= h($cfg['qq_link']) ?>" target="_blank" rel="noopener">一键加入 QQ 群</a>
    </div>
    <div class="panel qq-qr">
      <figure>
        <img src="<?= h($cfg['qq_qr']) ?>" alt="QQ 群二维码">
        <figcaption>扫码加入 QQ 群 <?= h($cfg['qq_number']) ?></figcaption>
      </figure>
    </div>
  </div>
</div></section>

<footer><div class="wrap">
  <span>DeepSeek Harness Desktop · 镜像与下载中心</span>
  <span>
    <a href="<?= h($cfg['github_url']) ?>" target="_blank" rel="noopener">GitHub</a>
    <span class="sep">/</span><a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">官方仓库</a>
    <span class="sep">/</span><a href="latest.json">latest.json</a>
    <span class="sep">/</span><a href="feed.json">feed.json</a>
  </span>
</div></footer>
</body>
</html>
