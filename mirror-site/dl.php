<?php
/** Download bridge for binaries kept in the persistent files/ directory.
 * Supports HTTP Range so large installers and engine bundles resume cleanly. */
require __DIR__ . '/lib.php';

$full = resolve_download($_GET['f'] ?? '');
if ($full === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not Found';
    exit;
}

$size = filesize($full);
$name = basename($full);
$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
$mime = [
    'tgz' => 'application/gzip', 'gz' => 'application/gzip', 'zip' => 'application/zip',
    'exe' => 'application/octet-stream', 'msi' => 'application/octet-stream',
    'json' => 'application/json', 'md' => 'text/markdown; charset=utf-8',
][$ext] ?? 'application/octet-stream';

$start = 0;
$end = $size - 1;
$partial = false;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] !== '') { $start = (int)$m[1]; }
    if ($m[2] !== '') { $end = min((int)$m[2], $size - 1); }
    if ($start > $end || $start >= $size) {
        http_response_code(416);
        header("Content-Range: bytes */$size");
        exit;
    }
    $partial = true;
}
$length = $end - $start + 1;

header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . rawurlencode($name) . '"');
header('Accept-Ranges: bytes');
header('Cache-Control: public, max-age=3600');
if ($partial) {
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
}
header('Content-Length: ' . $length);

$fp = fopen($full, 'rb');
fseek($fp, $start);
$remaining = $length;
while ($remaining > 0 && !feof($fp)) {
    $chunk = fread($fp, min(1024 * 1024, $remaining));
    if ($chunk === false) break;
    echo $chunk;
    $remaining -= strlen($chunk);
    flush();
}
fclose($fp);
