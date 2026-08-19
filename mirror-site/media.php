<?php
/** Serve images with proper MIME types. Resolution order:
 *  1. files/assets/<f>   — admin-managed copy (wins when present)
 *  2. assets/<f>         — packaged copy shipped with the site
 * The web server rewrites non-PHP paths to index.php, so packaged assets
 * must be reached through this script as well (media.php?f=...). */
require __DIR__ . '/lib.php';

$rel = str_replace('\\', '/', (string)($_GET['f'] ?? ''));
if ($rel === '' || !preg_match('#^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$#', $rel)) {
    http_response_code(404);
    exit('not found');
}

$full = resolve_download('assets/' . $rel);
if (!$full) {
    $base = realpath(__DIR__ . '/assets');
    $real = realpath(__DIR__ . '/assets/' . $rel);
    if ($base && $real && is_file($real)
        && str_starts_with(str_replace('\\', '/', $real), str_replace('\\', '/', $base) . '/')) {
        $full = $real;
    }
}
if (!$full) {
    http_response_code(404);
    exit('not found');
}
$ext = strtolower(pathinfo($full, PATHINFO_EXTENSION));
$mimes = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml'];
$mime = $mimes[$ext] ?? 'application/octet-stream';
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($full));
header('Cache-Control: public, max-age=300');
header('X-Content-Type-Options: nosniff');
readfile($full);
