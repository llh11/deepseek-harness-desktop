<?php
/** Chunked upload endpoint for the mirror admin (engine bundles & desktop
 * installers). Chunks are small POSTs that dodge PHP/WAF size limits; the
 * assemble step concatenates them into files/{kind}/ and updates manifests. */
session_start();
header('Content-Type: application/json; charset=utf-8');
require dirname(__DIR__) . '/lib.php';
$config = require dirname(__DIR__) . '/mirror-config.php';

function out($code, $message, $data = []) {
    echo json_encode(['code' => $code, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['dsh_mirror_admin'])) out(401, '未登录');
$token = $_SERVER['HTTP_X_CSRF'] ?? ($_POST['csrf'] ?? '');
if (!hash_equals($_SESSION['dsh_mirror_csrf'] ?? '', (string)$token)) out(403, 'CSRF 校验失败');

$action = $_POST['action'] ?? '';
$kind = $_POST['kind'] ?? '';
if (!in_array($kind, ['engine', 'desktop'], true)) out(400, 'kind 非法');

$uploadId = preg_replace('/[^0-9A-Za-z_-]/', '', (string)($_POST['upload_id'] ?? ''));
if ($uploadId === '') out(400, '缺少 upload_id');
$tmpDir = ensure_files_dir() . '/state/tmp-' . $uploadId;

if ($action === 'chunk') {
    $index = (int)($_POST['index'] ?? -1);
    if ($index < 0 || !isset($_FILES['c']) || $_FILES['c']['error'] !== UPLOAD_ERR_OK) out(400, '分片无效');
    if (!is_dir($tmpDir)) mkdir($tmpDir, 0775, true);
    move_uploaded_file($_FILES['c']['tmp_name'], "$tmpDir/$index.part");
    out(0, 'ok', ['index' => $index]);
}

if ($action === 'assemble') {
    $total = (int)($_POST['total'] ?? 0);
    $version = trim((string)($_POST['version'] ?? ''));
    $notes = trim((string)($_POST['notes'] ?? ''));
    $origName = basename((string)($_POST['name'] ?? ''));
    if ($total <= 0 || $version === '') out(400, '缺少 total/version');
    if (!is_dir($tmpDir)) out(400, '分片不存在');

    $safeVersion = preg_replace('/[^0-9A-Za-z.\-]/', '', $version);
    if ($kind === 'engine') {
        if (!preg_match('/\.(tgz|tar\.gz)$/i', $origName)) out(400, '引擎包仅接受 .tgz / .tar.gz');
        $name = "dsh-engine-$safeVersion.tgz";
    } else {
        if (!preg_match('/\.(exe|msi|zip)$/i', $origName)) out(400, '桌面端安装包仅接受 .exe / .msi / .zip');
        $ext = pathinfo($origName, PATHINFO_EXTENSION);
        $name = "DeepSeek-Harness-Desktop-Setup-$safeVersion.$ext";
    }
    $dest = ensure_files_dir() . "/$kind/$name";
    $fp = fopen($dest, 'wb');
    for ($i = 0; $i < $total; $i++) {
        $part = "$tmpDir/$i.part";
        if (!is_file($part)) { fclose($fp); @unlink($dest); out(400, "缺少分片 $i"); }
        fwrite($fp, (string)file_get_contents($part));
    }
    fclose($fp);
    // cleanup chunks
    foreach (glob("$tmpDir/*.part") ?: [] as $p) @unlink($p);
    @rmdir($tmpDir);

    $size = filesize($dest);
    $url = 'dl.php?f=' . $kind . '/' . $name;
    if ($kind === 'engine') {
        $latest = read_manifest('latest.json') ?? [];
        write_manifest('latest.json', array_merge($latest, [
            'version' => $version, 'bundle' => $url, 'notes' => $notes !== '' ? $notes : ($latest['notes'] ?? ''), 'syncedAt' => date('c'),
        ]));
        upsert_history('engine', ['version' => $version, 'url' => $url, 'size' => $size, 'uploadedAt' => time(), 'notes' => $notes]);
    } else {
        $feed = read_manifest('feed.json') ?? [];
        write_manifest('feed.json', [
            'version' => $version,
            'url' => $url,
            'notes' => $notes !== '' ? $notes : ($feed['notes'] ?? ''),
        ]);
        upsert_history('desktop', ['version' => $version, 'url' => $url, 'size' => $size, 'uploadedAt' => time(), 'notes' => $notes]);
    }
    out(0, 'ok', ['file' => $name, 'size' => $size, 'url' => $url]);
}

out(400, '未知 action');
