<?php
/**
 * Mirror subsite config. The admin password is stored as a SHA-256 hash.
 * Generate with: hash('sha256', '<your-password>') and change the default
 * immediately after first login.
 */
return [
    // hash('sha256', '<password>')
    'admin_password_sha256' => '80cae920c7107bc99369ec486e710ab8adb4e0de9923d62fef1a91ab3f3fca4a',
    // Upstream registries used to discover the official latest version, tried
    // in order until one answers (npmmirror first, npmjs as the fallback).
    'upstream_registries'   => ['https://registry.npmmirror.com', 'https://registry.npmjs.org'],
    'package_name'          => '@deepseek-ai/dsh',
    // sync.php auto-build: node/npm binaries on the server (Node >= 22 required;
    // when absent the sync only refreshes metadata and marks pendingBuild).
    'node_bin'              => 'node',
    'npm_bin'               => 'npm',
    // Optional token for unauthenticated cron hits: GET /sync.php?token=...
    'sync_token'            => '133f48c0c191fe9f0722074a3f2b13664ad33d11c0b2df5d',
    // Token for the remote release API (api.php): sync + chunked uploads for
    // engine bundles and desktop installers without an admin session.
    'api_token'             => 'bbbb272cf9a2bd62dd2ace2e13c0fb745a9365ef34f58ac6',
    // Lazy background sync: when latest.json is older than this many seconds,
    // serving latest.php / index.php kicks one background sync attempt.
    'lazy_sync_max_age'     => 21600,
];
