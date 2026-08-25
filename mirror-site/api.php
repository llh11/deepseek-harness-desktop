<?php
/**
 * Remote release API for the mirror subsite (token-authenticated, no admin
 * session needed). Mirrors the admin panel's core operations so releases can
 * be published from CI or a build machine:
 *
 *   POST /api.php                (all actions)
 *   Headers: X-Mirror-Token: <api_token from mirror-config.php>
 *
 *   action=status                 → current manifests + official latest
 *   action=sync                   → run mirror_sync_official() now
 *   action=chunk                  → upload one file chunk (multipart: kind,
 *                                   upload_id, index, c)
 *   action=assemble               → merge chunks into files/{kind}/ and update
 *                                   the manifest (latest.json / feed.json)
 *   action=set-feed               → overwrite feed.json fields (version, url,
 *                                   notes, sha256)
 */
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/lib.php';
$config = require __DIR__ . '/mirror-config.php';

function out($code, $message, $data = []) {
    echo json_encode(['code' => $code, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

$token = $_SERVER['HTTP_X_MIRROR_TOKEN'] ?? ($_POST['token'] ?? '');
$expect = (string)($config['api_token'] ?? '');
if ($expect === '' || !hash_equals($expect, (string)$token)) out(403, '未授权');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'status') {
    $discovered = mirror_official_latest($config);
    out(0, 'ok', [
        'latest' => read_manifest('latest.json'),
        'feed' => read_manifest('feed.json'),
        'engine_history' => array_slice(read_history('engine'), 0, 5),
        'desktop_history' => array_slice(read_history('desktop'), 0, 5),
        'official' => $discovered['ok'] ? $discovered['version'] : null,
        'official_registry' => $discovered['registry'],
    ]);
}

if ($action === 'sync') {
    @set_time_limit(900);
    $result = mirror_sync_official($config);
    out($result['ok'] ? 0 : 1, $result['message'], [
        'action' => $result['action'], 'version' => $result['version'], 'sha256' => $result['sha256'],
    ]);
}

$kind = $_POST['kind'] ?? '';
if (!in_array($kind, ['engine', 'desktop'], true)) out(400, 'kind 非法');
$uploadId = preg_replace('/[^0-9A-Za-z_-]/', '', (string)($_POST['upload_id'] ?? ''));
if ($uploadId === '') out(400, '缺少 upload_id');
$tmpDir = ensure_files_dir() . '/state/tmp-api-' . $uploadId;

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
    foreach (glob("$tmpDir/*.part") ?: [] as $p) @unlink($p);
    @rmdir($tmpDir);

    $size = filesize($dest);
    $sha = hash_file('sha256', $dest);
    $url = 'dl.php?f=' . $kind . '/' . $name;
    if ($kind === 'engine') {
        $latest = read_manifest('latest.json') ?? [];
        unset($latest['pendingBuild']);
        write_manifest('latest.json', array_merge($latest, [
            'version' => $version, 'bundle' => $url, 'notes' => $notes !== '' ? $notes : ($latest['notes'] ?? ''),
            'sha256' => $sha, 'size' => $size, 'syncedAt' => date('c'),
        ]));
        upsert_history('engine', ['version' => $version, 'url' => $url, 'size' => $size, 'sha256' => $sha, 'uploadedAt' => time(), 'notes' => $notes]);
    } else {
        $feed = read_manifest('feed.json') ?? [];
        write_manifest('feed.json', [
            'version' => $version,
            'url' => $url,
            'notes' => $notes !== '' ? $notes : ($feed['notes'] ?? ''),
            'sha256' => $sha,
        ]);
        upsert_history('desktop', ['version' => $version, 'url' => $url, 'size' => $size, 'sha256' => $sha, 'uploadedAt' => time(), 'notes' => $notes]);
    }
    out(0, 'ok', ['file' => $name, 'size' => $size, 'url' => $url, 'sha256' => $sha]);
}

if ($action === 'set-feed') {
    $feedNow = read_manifest('feed.json') ?? [];
    write_manifest('feed.json', [
        'version' => trim((string)($_POST['version'] ?? ($feedNow['version'] ?? ''))),
        'url' => trim((string)($_POST['url'] ?? ($feedNow['url'] ?? ''))),
        'notes' => trim((string)($_POST['notes'] ?? ($feedNow['notes'] ?? ''))),
        'sha256' => trim((string)($_POST['sha256'] ?? ($feedNow['sha256'] ?? ''))),
    ]);
    out(0, 'feed.json 已更新');
}

out(400, '未知 action');
