<?php
/** Serve admin-managed images from files/assets/ with proper MIME types. */
require __DIR__ . '/lib.php';

$rel = $_GET['f'] ?? '';
$full = resolve_download('assets/' . str_replace('\\', '/', (string)$rel));
if (!$full || !str_starts_with(str_replace('\\', '/', $full), str_replace('\\', '/', files_dir()) . '/assets/')) {
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
