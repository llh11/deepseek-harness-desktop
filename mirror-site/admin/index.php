<?php
/** 镜像与发布管理（/admin/）：引擎 bundle、桌面端安装包、版本历史、feed、站点内容。 */
session_start();
require dirname(__DIR__) . '/lib.php';
$config = require dirname(__DIR__) . '/mirror-config.php';
$msg = '';
$err = '';

if (empty($_SESSION['dsh_mirror_csrf'])) $_SESSION['dsh_mirror_csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['dsh_mirror_csrf'];
$authed = !empty($_SESSION['dsh_mirror_admin']);

if (isset($_POST['logout'])) { session_destroy(); header('Location: ./'); exit; }

if (!$authed && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if (hash('sha256', (string)$_POST['password']) === ($config['admin_password_sha256'] ?? '')) {
        session_regenerate_id(true);
        $_SESSION['dsh_mirror_admin'] = true;
        $_SESSION['dsh_mirror_csrf'] = bin2hex(random_bytes(16));
        header('Location: ./');
        exit;
    }
    $err = '密码错误';
}

function csrf_ok() {
    return hash_equals($_SESSION['dsh_mirror_csrf'] ?? '', (string)($_POST['csrf'] ?? ''));
}

/** Save an uploaded image into files/assets/ and return its media.php URL. */
function save_uploaded_image($field, $prefix) {
    if (empty($_FILES[$field]) || $_FILES[$field]['error'] !== UPLOAD_ERR_OK) return null;
    $tmp = $_FILES[$field]['tmp_name'];
    $info = @getimagesize($tmp);
    if (!$info) return null;
    $exts = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp'];
    $ext = $exts[$info[2]] ?? null;
    if (!$ext) return null;
    if ($_FILES[$field]['size'] > 8 * 1024 * 1024) return null;
    $dir = ensure_files_dir() . '/assets';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $name = $prefix . '-' . date('YmdHis') . '.' . $ext;
    if (!move_uploaded_file($tmp, "$dir/$name")) return null;
    return 'media.php?f=' . $name;
}

if ($authed && $_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['password']) && !isset($_POST['logout'])) {
    if (!csrf_ok()) { $err = 'CSRF 校验失败，请刷新页面重试'; }
    else {
        $action = $_POST['action'] ?? '';
        if ($action === 'check_official') {
            $url = rtrim($config['upstream_registry'], '/') . '/' . $config['package_name'];
            $ctx = stream_context_create(['http' => ['timeout' => 15], 'https' => ['timeout' => 15]]);
            $raw = @file_get_contents($url, false, $ctx);
            $meta = $raw ? json_decode($raw, true) : null;
            $official = $meta['dist-tags']['latest'] ?? null;
            $msg = $official ? "官方最新版本：{$official}" : '无法访问上游 registry';
        } elseif ($action === 'save_feed') {
            write_manifest('feed.json', [
                'version' => trim((string)($_POST['feed_version'] ?? '')),
                'url' => trim((string)($_POST['feed_url'] ?? '')),
                'notes' => trim((string)($_POST['feed_notes'] ?? '')),
            ]);
            $msg = 'feed.json 已更新';
        } elseif ($action === 'save_content') {
            $cfg = site_config();
            $cfg['qq_number'] = trim((string)($_POST['qq_number'] ?? $cfg['qq_number']));
            $cfg['qq_link'] = trim((string)($_POST['qq_link'] ?? $cfg['qq_link']));
            $cfg['github_url'] = trim((string)($_POST['github_url'] ?? $cfg['github_url']));
            $qr = save_uploaded_image('qq_qr_file', 'qq');
            if ($qr) $cfg['qq_qr'] = $qr;
            save_site_config($cfg);
            $msg = '站点内容已更新' . ($qr ? '（含新二维码）' : '');
        } elseif ($action === 'add_screen') {
            $url = save_uploaded_image('screen_file', 'screen');
            if ($url) {
                $cfg = site_config();
                $screens = is_array($cfg['screens']) ? $cfg['screens'] : [];
                $screens[] = $url;
                $cfg['screens'] = $screens;
                save_site_config($cfg);
                $msg = '截图已添加';
            } else {
                $err = '截图上传失败（支持 png/jpg/webp/gif，不超过 8 MB）';
            }
        } elseif ($action === 'del_screen') {
            $cfg = site_config();
            $target = (string)($_POST['screen'] ?? '');
            $cfg['screens'] = array_values(array_filter((array)$cfg['screens'], fn($s) => $s !== $target));
            save_site_config($cfg);
            // Best-effort file removal for admin-uploaded images.
            if (str_starts_with($target, 'media.php?f=')) {
                $full = resolve_download('assets/' . substr($target, strlen('media.php?f=')));
                if ($full) @unlink($full);
            }
            $msg = '截图已移除';
        } elseif ($action === 'delete_history') {
            $kind = $_POST['kind'] ?? '';
            $version = (string)($_POST['version'] ?? '');
            if (in_array($kind, ['engine', 'desktop'], true) && $version !== '') {
                $entries = array_values(array_filter(read_history($kind), fn($e) => ($e['version'] ?? '') !== $version));
                write_history($kind, $entries);
                if (!empty($_POST['with_file'])) {
                    $full = resolve_download($kind . '/' . basename((string)($_POST['file'] ?? '')));
                    if ($full) @unlink($full);
                }
                $msg = "已删除 {$kind} 历史版本 {$version}";
            }
        } elseif ($action === 'change_password') {
            $new = (string)($_POST['new_password'] ?? '');
            if (strlen($new) < 8) {
                $err = '新密码至少 8 位';
            } else {
                $cfgPath = dirname(__DIR__) . '/mirror-config.php';
                $content = file_get_contents($cfgPath);
                $content = preg_replace(
                    "/'admin_password_sha256'\s*=>\s*'[0-9a-f]{64}'/",
                    "'admin_password_sha256' => '" . hash('sha256', $new) . "'",
                    $content
                );
                file_put_contents($cfgPath, $content);
                $msg = '管理密码已修改';
            }
        }
    }
}

$latest = read_manifest('latest.json');
$feed = read_manifest('feed.json');
$engineHistory = read_history('engine');
$desktopHistory = read_history('desktop');
$cfg = site_config();
$filesDir = ensure_files_dir();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>镜像与发布管理 — DeepSeek Harness Desktop</title>
<link rel="icon" type="image/svg+xml" href="../media.php?f=dsh.svg">
<style>
:root { --bg:#f7f8fa; --panel:#ffffff; --line:#e8eaee; --line2:#d8dbe2; --text:#0b0d12; --sub:#5b6270; --faint:#98a0ae; --accent:#4d6bfe; --accent-deep:#3b56e8; --err:#d64545; --ok:#12934f; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font:14px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; -webkit-font-smoothing:antialiased; }
.wrap { max-width:980px; margin:0 auto; padding:40px 28px 80px; }
h1 { font-size:20px; font-weight:650; letter-spacing:-.2px; }
h2 { font-size:15.5px; font-weight:620; margin-bottom:4px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px 26px; margin-bottom:18px; }
.card:hover { border-color:var(--line2); }
label { display:block; color:var(--sub); font-size:12.5px; margin:14px 0 5px; letter-spacing:.2px; }
input[type=text], input[type=password], input[type=url] { width:100%; height:36px; padding:4px 12px; border:1px solid var(--line2); border-radius:8px; background:#fff; color:var(--text); font:inherit; transition:border-color .15s, box-shadow .15s; }
input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px rgba(77,107,254,.12); }
input[type=file] { color:var(--sub); font-size:13px; margin-top:4px; }
button, .btn { display:inline-flex; align-items:center; margin-top:14px; padding:9px 22px; border-radius:9px; border:none; background:#0b0d12; color:#fff; font:inherit; font-size:13.5px; cursor:pointer; transition:background .15s; }
button:hover, .btn:hover { background:#232733; }
.btn.secondary { background:transparent; border:1px solid var(--line2); color:var(--text); }
.btn.secondary:hover { border-color:var(--text); background:transparent; }
.btn.accent { background:var(--accent); }
.btn.accent:hover { background:var(--accent-deep); }
.btn.danger { background:transparent; border:1px solid rgba(214,69,69,.35); color:var(--err); }
.btn.danger:hover { background:rgba(214,69,69,.06); }
table { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); }
tr:last-child td { border-bottom:none; }
th { color:var(--faint); font-weight:500; font-size:12px; letter-spacing:.4px; }
.msg { color:var(--ok); margin:8px 0; }
.err { color:var(--err); margin:8px 0; }
.muted { color:var(--sub); font-size:12.5px; }
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }
.topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:26px; }
.topbar form { margin:0; }
.topbar .btn { margin-top:0; }
.brand { display:flex; align-items:center; gap:10px; }
.brand img { width:26px; height:26px; }
.prog { height:6px; border-radius:3px; background:var(--bg); border:1px solid var(--line); margin-top:12px; overflow:hidden; display:none; }
.prog i { display:block; height:100%; width:0; background:var(--accent); transition:width .2s; }
.status-line { color:var(--sub); font-size:12.5px; margin-top:8px; }
.mono { font-family:"Cascadia Code",Consolas,monospace; font-size:12.5px; }
td form { display:inline; margin:0; }
td form .btn { margin-top:0; padding:4px 14px; font-size:12px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 22px; }
.qr-now { display:flex; align-items:center; gap:18px; margin-top:12px; }
.qr-now img { width:96px; height:96px; border:1px solid var(--line); border-radius:10px; }
.screens { display:flex; flex-wrap:wrap; gap:12px; margin-top:14px; }
.screens figure { width:220px; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--bg); }
.screens img { display:block; width:100%; height:124px; object-fit:cover; object-position:top; }
.screens figcaption { padding:6px 10px; display:flex; justify-content:space-between; align-items:center; }
.screens .btn { margin-top:0; padding:2px 10px; font-size:11.5px; }
.sec-label { color:var(--faint); font-size:11.5px; letter-spacing:1.6px; text-transform:uppercase; margin:26px 0 10px; }
@media (max-width:760px){ .grid2 { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">
<?php if (!$authed): ?>
  <div class="brand" style="margin-bottom:26px"><img src="../media.php?f=dsh.svg" alt=""><h1>镜像与发布管理</h1></div>
  <div class="card" style="max-width:400px">
    <?php if ($err): ?><p class="err"><?= h($err) ?></p><?php endif; ?>
    <form method="post">
      <label>管理密码</label>
      <input type="password" name="password" autofocus>
      <button type="submit">登录</button>
    </form>
    <p class="muted" style="margin-top:16px"><a href="../">← 返回首页</a></p>
  </div>
<?php else: ?>
  <div class="topbar">
    <div class="brand"><img src="../media.php?f=dsh.svg" alt=""><h1>镜像与发布管理</h1></div>
    <form method="post"><button class="btn secondary" type="submit" name="logout" value="1">退出登录</button></form>
  </div>
  <?php if ($msg): ?><p class="msg"><?= h($msg) ?></p><?php endif; ?>
  <?php if ($err): ?><p class="err"><?= h($err) ?></p><?php endif; ?>

  <p class="sec-label">站点内容</p>

  <div class="card">
    <h2>社区与链接</h2>
    <p class="muted">首页展示的 QQ 群信息、二维码与 GitHub 链接，随时可更换。</p>
    <form method="post" enctype="multipart/form-data">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="save_content">
      <div class="grid2">
        <div>
          <label>QQ 群号</label>
          <input type="text" name="qq_number" value="<?= h($cfg['qq_number']) ?>">
        </div>
        <div>
          <label>加群链接</label>
          <input type="url" name="qq_link" value="<?= h($cfg['qq_link']) ?>">
        </div>
      </div>
      <label>GitHub 仓库地址</label>
      <input type="url" name="github_url" value="<?= h($cfg['github_url']) ?>">
      <label>更换 QQ 二维码（可选，png/jpg/webp，不超过 8 MB）</label>
      <input type="file" name="qq_qr_file" accept="image/png,image/jpeg,image/webp,image/gif">
      <div class="qr-now">
        <img src="../<?= h($cfg['qq_qr']) ?>" alt="当前二维码">
        <span class="muted">当前二维码</span>
      </div>
      <button type="submit">保存站点内容</button>
    </form>
  </div>

  <div class="card">
    <h2>界面截图</h2>
    <p class="muted">首页「界面预览」区展示的图片。上传即加入展示，移除后首页回落到随包默认截图。</p>
    <form method="post" enctype="multipart/form-data">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="add_screen">
      <input type="file" name="screen_file" accept="image/png,image/jpeg,image/webp,image/gif">
      <button type="submit" class="btn secondary">上传截图</button>
    </form>
    <?php $screens = (array)($cfg['screens'] ?? []); if ($screens): ?>
    <div class="screens">
      <?php foreach ($screens as $s): ?>
      <figure>
        <img src="../<?= h($s) ?>" alt="界面截图">
        <figcaption>
          <span class="muted"><?= h(basename((string)parse_url($s, PHP_URL_QUERY) ?: $s)) ?></span>
          <form method="post" onsubmit="return confirm('移除该截图？')">
            <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
            <input type="hidden" name="action" value="del_screen">
            <input type="hidden" name="screen" value="<?= h($s) ?>">
            <button class="btn danger" type="submit">移除</button>
          </form>
        </figcaption>
      </figure>
      <?php endforeach; ?>
    </div>
    <?php else: ?>
    <p class="muted" style="margin-top:12px">当前使用随包默认截图。</p>
    <?php endif; ?>
  </div>

  <p class="sec-label">发布管理</p>

  <div class="card">
    <h2>引擎镜像（latest.json）</h2>
    <table>
      <tr><th style="width:140px">镜像版本</th><td class="mono"><?= h($latest['version'] ?? '—') ?></td></tr>
      <tr><th>bundle</th><td class="mono"><?= h($latest['bundle'] ?? '—') ?></td></tr>
      <tr><th>同步时间</th><td><?= h($latest['syncedAt'] ?? '—') ?></td></tr>
    </table>
    <form method="post" style="display:inline">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="check_official">
      <button class="btn secondary" type="submit">检查官方最新版本</button>
    </form>
  </div>

  <div class="card">
    <h2>上传引擎 bundle</h2>
    <p class="muted">.tgz（含完整 node_modules 树），分片上传不受 PHP 大小限制。上传后自动切换 latest.json 并记入历史。</p>
    <label>引擎版本号（如 0.1.0-rc.8）</label>
    <input type="text" id="eng-version" placeholder="0.1.0-rc.8">
    <label>说明（可选）</label>
    <input type="text" id="eng-notes" placeholder="DeepSeek Harness 官方引擎预构建镜像">
    <label>bundle 文件</label>
    <input type="file" id="eng-file" accept=".tgz,.tar.gz">
    <button type="button" class="btn accent" onclick="uploadFile('engine')">上传并切换镜像版本</button>
    <div class="prog" id="eng-prog"><i></i></div>
    <p class="status-line" id="eng-status"></p>
  </div>

  <div class="card">
    <h2>上传桌面端安装包</h2>
    <p class="muted">Windows 安装包（.exe/.zip），上传后自动更新 feed.json（桌面版更新源）并记入历史。</p>
    <label>桌面版版本号（如 1.3.1）</label>
    <input type="text" id="dsk-version" placeholder="1.3.1">
    <label>更新说明（可选）</label>
    <input type="text" id="dsk-notes" placeholder="DeepSeek Harness Desktop 新版本">
    <label>安装包文件</label>
    <input type="file" id="dsk-file" accept=".exe,.msi,.zip">
    <button type="button" class="btn accent" onclick="uploadFile('desktop')">上传并发布</button>
    <div class="prog" id="dsk-prog"><i></i></div>
    <p class="status-line" id="dsk-status"></p>
  </div>

  <div class="card">
    <h2>引擎镜像历史</h2>
    <?php if (!$engineHistory): ?><p class="muted">（空）</p><?php else: ?>
    <table>
      <tr><th>版本</th><th>文件</th><th>大小</th><th>时间</th><th></th></tr>
      <?php foreach ($engineHistory as $row): ?>
      <tr>
        <td class="mono"><?= h($row['version']) ?></td>
        <td class="mono"><a href="../<?= h($row['url'] ?? '#') ?>"><?= h(basename((string)parse_url((string)($row['url'] ?? ''), PHP_URL_QUERY) ?: ($row['url'] ?? ''))) ?></a></td>
        <td><?= !empty($row['size']) ? fmt_size($row['size']) : '—' ?></td>
        <td><?= !empty($row['uploadedAt']) ? fmt_time(is_numeric($row['uploadedAt']) ? $row['uploadedAt'] : strtotime($row['uploadedAt'])) : '—' ?></td>
        <td>
          <form method="post" onsubmit="return confirm('删除该历史版本记录？')">
            <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
            <input type="hidden" name="action" value="delete_history">
            <input type="hidden" name="kind" value="engine">
            <input type="hidden" name="version" value="<?= h($row['version']) ?>">
            <input type="hidden" name="file" value="<?= h($row['url'] ?? '') ?>">
            <button class="btn danger" type="submit">删除</button>
          </form>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>桌面端发布历史</h2>
    <?php if (!$desktopHistory): ?><p class="muted">（空）</p><?php else: ?>
    <table>
      <tr><th>版本</th><th>文件</th><th>大小</th><th>时间</th><th></th></tr>
      <?php foreach ($desktopHistory as $row): ?>
      <tr>
        <td class="mono"><?= h($row['version']) ?></td>
        <td class="mono"><?= h(basename((string)($row['url'] ?? ''))) ?></td>
        <td><?= !empty($row['size']) ? fmt_size($row['size']) : '—' ?></td>
        <td><?= !empty($row['uploadedAt']) ? fmt_time($row['uploadedAt']) : '—' ?></td>
        <td>
          <form method="post" onsubmit="return confirm('删除该历史版本记录？')">
            <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
            <input type="hidden" name="action" value="delete_history">
            <input type="hidden" name="kind" value="desktop">
            <input type="hidden" name="version" value="<?= h($row['version']) ?>">
            <input type="hidden" name="file" value="<?= h($row['url'] ?? '') ?>">
            <button class="btn danger" type="submit">删除</button>
          </form>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
    <?php endif; ?>
  </div>

  <p class="sec-label">更新源与安全</p>

  <div class="card">
    <h2>桌面版更新源（feed.json）</h2>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="save_feed">
      <label>版本号</label>
      <input type="text" name="feed_version" value="<?= h($feed['version'] ?? '') ?>">
      <label>下载地址</label>
      <input type="text" name="feed_url" value="<?= h($feed['url'] ?? '') ?>">
      <label>更新说明</label>
      <input type="text" name="feed_notes" value="<?= h($feed['notes'] ?? '') ?>">
      <button type="submit">保存</button>
    </form>
  </div>

  <div class="card">
    <h2>修改管理密码</h2>
    <form method="post">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <input type="hidden" name="action" value="change_password">
      <label>新密码（至少 8 位）</label>
      <input type="password" name="new_password">
      <button type="submit">修改</button>
    </form>
  </div>

  <p class="muted">文件目录：<span class="mono"><?= h($filesDir) ?></span>（独立于版本目录，部署不受影响） · <a href="../">← 返回首页</a></p>

<script>
const CSRF = <?= json_encode($csrf) ?>;
const CHUNK = 4 * 1024 * 1024;
async function uploadFile(kind) {
  const version = document.getElementById(kind + '-version').value.trim();
  const notes = document.getElementById(kind + '-notes').value.trim();
  const file = document.getElementById(kind + '-file').files[0];
  const prog = document.getElementById(kind + '-prog');
  const bar = prog.querySelector('i');
  const status = document.getElementById(kind + '-status');
  if (!version) { status.textContent = '请填写版本号'; return; }
  if (!file) { status.textContent = '请选择文件'; return; }
  const uploadId = 'up-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const total = Math.ceil(file.size / CHUNK);
  prog.style.display = 'block';
  status.textContent = '开始上传（共 ' + total + ' 片）…';
  try {
    for (let i = 0; i < total; i++) {
      const fd = new FormData();
      fd.append('action', 'chunk');
      fd.append('kind', kind);
      fd.append('upload_id', uploadId);
      fd.append('index', i);
      fd.append('c', file.slice(i * CHUNK, (i + 1) * CHUNK));
      const res = await fetch('upload.php', { method: 'POST', headers: { 'X-CSRF': CSRF }, body: fd });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || ('分片 ' + i + ' 失败'));
      bar.style.width = Math.round(((i + 1) / (total + 1)) * 100) + '%';
      status.textContent = '上传中 ' + (i + 1) + ' / ' + total + '（' + (file.size / 1048576).toFixed(1) + ' MB）';
    }
    status.textContent = '正在合并分片…';
    const fd = new FormData();
    fd.append('action', 'assemble');
    fd.append('kind', kind);
    fd.append('upload_id', uploadId);
    fd.append('total', total);
    fd.append('version', version);
    fd.append('notes', notes);
    fd.append('name', file.name);
    const res = await fetch('upload.php', { method: 'POST', headers: { 'X-CSRF': CSRF }, body: fd });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || '合并失败');
    bar.style.width = '100%';
    status.textContent = '完成：' + json.data.file + '（' + (json.data.size / 1048576).toFixed(1) + ' MB）';
    setTimeout(() => location.reload(), 1200);
  } catch (error) {
    status.textContent = '失败：' + error.message;
  }
}
</script>
<?php endif; ?>
</div>
</body>
</html>
