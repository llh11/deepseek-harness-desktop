<?php
/**
 * Dynamic latest.json — the mirror's engine manifest as a JSON endpoint.
 *
 * Serving this endpoint also keeps the mirror self-updating: when the manifest
 * is older than the freshness window (mirror-config.php → lazy_sync_max_age),
 * one background upstream sync is scheduled AFTER the response is flushed, so
 * desktop clients polling this address automatically discover new official
 * releases without any cron on the server. The static latest.json remains as
 * a fallback and is kept in sync by the same code path.
 */
require __DIR__ . '/lib.php';
$config = require __DIR__ . '/mirror-config.php';

mirror_maybe_lazy_sync($config);

$latest = read_manifest('latest.json') ?? [];
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode($latest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
