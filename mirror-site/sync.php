<?php
/**
 * 自动同步官方引擎版本（供 cron / 命令行 / 管理后台触发）。
 *
 * - cron:  *&#47;30 * * * * php /path/to/sync.php  （CLI 直接运行）
 * - HTTP:  GET /sync.php?token=<sync_token>        （mirror-config.php 中配置）
 * - 管理后台的「自动同步官方版本」按钮直接调用 lib.php 的同一函数，不经此入口。
 */
require __DIR__ . '/lib.php';
$config = require __DIR__ . '/mirror-config.php';

$isCli = PHP_SAPI === 'cli';
$authed = $isCli;
if (!$authed) {
    session_start();
    if (!empty($_SESSION['dsh_mirror_admin'])) $authed = true;
}
if (!$authed) {
    $token = (string)($_GET['token'] ?? '');
    $expect = (string)($config['sync_token'] ?? '');
    if ($expect !== '' && hash_equals($expect, $token)) $authed = true;
}
if (!$authed) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['code' => 403, 'message' => '未授权'], JSON_UNESCAPED_UNICODE);
    exit;
}

$result = mirror_sync_official($config);

if ($isCli) {
    echo ($result['ok'] ? '[ok] ' : '[fail] ') . $result['message'] . "\n";
    exit($result['ok'] ? 0 : 1);
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'code' => $result['ok'] ? 0 : 1,
    'message' => $result['message'],
    'data' => ['action' => $result['action'], 'version' => $result['version'], 'sha256' => $result['sha256']],
], JSON_UNESCAPED_UNICODE);
