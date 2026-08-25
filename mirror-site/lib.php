<?php
/** Shared helpers for the DeepSeek Harness Desktop mirror subsite. */

/** Persistent directory for binaries and runtime state. It lives OUTSIDE the
 * versioned release directory (releases/<ts>/) so deployments never wipe the
 * downloadable files. Layout: <site_root>/files/{engine,desktop,state}. */
function files_dir() {
    $candidates = [];
    // Running from releases/<ts>_: site root is two levels up.
    if (basename(dirname(__DIR__)) === 'releases') $candidates[] = dirname(__DIR__, 2) . '/files';
    // Running from a plain docroot.
    $candidates[] = __DIR__ . '/files';
    foreach ($candidates as $dir) if (is_dir($dir)) return $dir;
    return $candidates[0];
}

function ensure_files_dir() {
    $dir = files_dir();
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    foreach (['engine', 'desktop', 'state'] as $sub) {
        if (!is_dir("$dir/$sub")) mkdir("$dir/$sub", 0775, true);
    }
    return $dir;
}

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function fmt_size($n) {
    if ($n >= 1073741824) return number_format($n / 1073741824, 2) . ' GB';
    if ($n >= 1048576) return number_format($n / 1048576, 1) . ' MB';
    return number_format($n / 1024, 1) . ' KB';
}

function fmt_time($ts) { return date('Y-m-d H:i', (int)$ts); }

/** Read a JSON manifest. Runtime state in files/state/ wins over the packaged
 * copy at the site root, so admin edits survive the next code deployment. */
function read_manifest($name) {
    $runtime = files_dir() . '/state/' . $name;
    if (is_file($runtime)) {
        $data = json_decode((string)file_get_contents($runtime), true);
        if (is_array($data)) return $data;
    }
    $path = __DIR__ . '/' . $name;
    if (!is_file($path)) return null;
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

/** Write a manifest to BOTH the runtime state dir (wins) and the packaged
 * root file (kept in sync so the static URL keeps working). */
function write_manifest($name, $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    $state = ensure_files_dir() . '/state';
    file_put_contents("$state/$name", $json);
    file_put_contents(__DIR__ . '/' . $name, $json);
}

/** History lists (engine mirrors / desktop releases), stored in files/state/. */
function read_history($kind) {
    $data = read_manifest("$kind-history.json");
    return is_array($data) ? $data : [];
}

function write_history($kind, $entries) {
    write_manifest("$kind-history.json", array_values($entries));
}

function upsert_history($kind, $entry) {
    $entries = read_history($kind);
    $entries = array_values(array_filter($entries, fn($e) => ($e['version'] ?? '') !== $entry['version']));
    array_unshift($entries, $entry);
    write_history($kind, $entries);
}

/** Resolve a dl.php relative target (engine/xxx.tgz) to a safe absolute path. */
function resolve_download($rel) {
    $rel = str_replace('\\', '/', (string)$rel);
    if ($rel === '' || str_contains($rel, '..') || str_starts_with($rel, '/')) return null;
    $base = files_dir();
    $full = realpath("$base/$rel");
    if ($full === false || !is_file($full)) return null;
    if (!str_starts_with(str_replace('\\', '/', $full), str_replace('\\', '/', $base) . '/')) return null;
    return $full;
}

/** Editable site content (QQ group, GitHub link, screenshots). Admin changes
 * write files/state/site-config.json; packaged defaults ship in code. */
function site_config() {
    $defaults = [
        'qq_number'    => '1017339599',
        'qq_link'      => 'https://qm.qq.com/q/LnuRC7T5my',
        'qq_qr'        => 'assets/qq-qrcode.png',
        'github_url'   => 'https://github.com/llh11/deepseek-harness-desktop',
        'official_url' => 'https://www.deepseek.com/harness/',
        'screens'      => [],
    ];
    $saved = read_manifest('site-config.json');
    return array_merge($defaults, is_array($saved) ? array_intersect_key($saved, $defaults) : []);
}

function save_site_config($cfg) {
    $clean = array_intersect_key($cfg, array_flip(['qq_number', 'qq_link', 'qq_qr', 'github_url', 'official_url', 'screens']));
    write_manifest('site-config.json', $clean);
}

/**
 * Read the official @deepseek-ai/dsh dist-tags from the first reachable
 * upstream registry. Falls back from npmmirror to npmjs so a lagging or
 * unreachable primary mirror never hides an official release.
 *
 * @return array{ok:bool, version:?string, registry:?string, message:string}
 */
function mirror_official_latest($config) {
    $registries = [];
    if (!empty($config['upstream_registries']) && is_array($config['upstream_registries'])) {
        $registries = array_values(array_filter(array_map('trim', $config['upstream_registries'])));
    }
    if (empty($config['upstream_registry']) === false) $registries[] = rtrim((string)$config['upstream_registry'], '/');
    if (empty($registries)) $registries = ['https://registry.npmmirror.com', 'https://registry.npmjs.org'];
    $registries = array_values(array_unique($registries));
    $package = (string)($config['package_name'] ?? '@deepseek-ai/dsh');
    $ctx = stream_context_create(['http' => ['timeout' => 25], 'https' => ['timeout' => 25]]);
    $errors = [];
    foreach ($registries as $registry) {
        $raw = @file_get_contents(rtrim($registry, '/') . '/' . $package, false, $ctx);
        $meta = $raw ? json_decode($raw, true) : null;
        $latest = $meta['dist-tags']['latest'] ?? null;
        if (is_string($latest) && $latest !== '') return ['ok' => true, 'version' => $latest, 'registry' => rtrim($registry, '/'), 'message' => ''];
        $errors[] = rtrim($registry, '/') . ' 不可用';
    }
    return ['ok' => false, 'version' => null, 'registry' => null, 'message' => '无法访问上游 registry：' . implode('；', $errors)];
}

/**
 * Sync the official @deepseek-ai/dsh latest version into the mirror.
 *
 * Flow: read upstream registry dist-tags → compare with latest.json → when a
 * newer version exists and node/npm are available on the server, npm-install
 * the package into a temp prefix and pack node_modules (+package.json) into
 * files/engine/dsh-engine-<version>.tgz, then switch latest.json over with the
 * bundle's sha256. Without node/npm the mirror still refreshes latest.json's
 * version/notes and marks pendingBuild, so desktop clients learn about the
 * release and fall back to the npm registry install path.
 *
 * @return array{ok:bool, action:string, version:?string, message:string, sha256:?string}
 */
function mirror_sync_official($config) {
    $discovered = mirror_official_latest($config);
    if (!$discovered['ok']) {
        return ['ok' => false, 'action' => 'none', 'version' => null, 'message' => $discovered['message'], 'sha256' => null];
    }
    $latest = $discovered['version'];
    $registry = $discovered['registry'];
    $current = read_manifest('latest.json') ?? [];
    if (($current['version'] ?? '') === $latest && !empty($current['bundle']) && empty($current['pendingBuild'])) {
        return ['ok' => true, 'action' => 'none', 'version' => $latest, 'message' => "镜像已是最新（$latest）", 'sha256' => $current['sha256'] ?? null];
    }

    $notes = "DeepSeek Harness 官方引擎 $latest 预构建镜像（含完整依赖树，免 npm 官方源下载）";
    $nodeBin = (string)($config['node_bin'] ?? 'node');
    $npmBin = (string)($config['npm_bin'] ?? 'npm');
    $nodeOk = false;
    $probe = @shell_exec(escapeshellarg($nodeBin) . ' --version 2>&1');
    if (is_string($probe) && preg_match('/^v(\d+)/', trim($probe), $m)) $nodeOk = (int)$m[1] >= 22;

    if (!$nodeOk) {
        // bundle must be null here: keeping the previous bundle would serve the
        // OLD engine under the NEW version label.
        write_manifest('latest.json', [
            'version' => $latest, 'bundle' => null,
            'notes' => "官方已发布 {$latest}；服务器未配置 Node(>=22)，暂不能自动构建引擎包，客户端将回退到 npm 源安装。",
            'pendingBuild' => true, 'syncedAt' => date('c'),
        ]);
        return ['ok' => true, 'action' => 'metadata', 'version' => $latest, 'message' => "已同步版本号 {$latest}，但服务器缺少 Node(>=22)，未自动构建 bundle", 'sha256' => null];
    }

    @set_time_limit(900);
    $work = ensure_files_dir() . '/state/sync-' . date('YmdHis') . '-' . bin2hex(random_bytes(4));
    mkdir($work, 0775, true);
    $isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    $npmCmd = $isWin ? "$npmBin.cmd" : $npmBin;
    $installCmd = escapeshellarg($npmCmd) . ' install --prefix ' . escapeshellarg($work)
        . ' --registry ' . escapeshellarg($registry) . ' --no-audit --no-fund --loglevel error'
        . ' ' . escapeshellarg("@deepseek-ai/dsh@$latest") . ' 2>&1';
    $prefix = getenv('PATH');
    putenv('PATH=' . dirname($nodeBin) . PATH_SEPARATOR . (string)$prefix);
    $output = [];
    $code = 1;
    @exec($installCmd, $output, $code);
    if ($code !== 0 || !is_file("$work/node_modules/@deepseek-ai/dsh/package.json")) {
        return ['ok' => false, 'action' => 'none', 'version' => $latest, 'message' => 'npm 安装失败：' . implode("\n", array_slice($output, -5)), 'sha256' => null];
    }

    $safeVersion = preg_replace('/[^0-9A-Za-z.\-]/', '', $latest);
    $name = "dsh-engine-$safeVersion.tgz";
    $dest = ensure_files_dir() . "/engine/$name";
    $tarCmd = 'tar -czf ' . escapeshellarg($dest) . ' -C ' . escapeshellarg($work) . ' node_modules'
        . (is_file("$work/package.json") ? ' package.json' : '')
        . (is_file("$work/package-lock.json") ? ' package-lock.json' : '') . ' 2>&1';
    $output = [];
    @exec($tarCmd, $output, $code);
    // Cleanup the work prefix regardless of tar outcome.
    $rmCmd = $isWin ? 'rmdir /s /q ' . escapeshellarg($work) : 'rm -rf ' . escapeshellarg($work);
    @exec($rmCmd);
    if ($code !== 0 || !is_file($dest)) {
        return ['ok' => false, 'action' => 'none', 'version' => $latest, 'message' => '打包失败：' . implode("\n", array_slice($output, -5)), 'sha256' => null];
    }

    $size = filesize($dest);
    $sha = hash_file('sha256', $dest);
    $url = 'dl.php?f=engine/' . $name;
    write_manifest('latest.json', [
        'version' => $latest, 'bundle' => $url, 'notes' => $notes,
        'sha256' => $sha, 'size' => $size, 'syncedAt' => date('c'),
    ]);
    upsert_history('engine', ['version' => $latest, 'url' => $url, 'size' => $size, 'sha256' => $sha, 'uploadedAt' => time(), 'notes' => $notes, 'source' => 'auto-sync']);
    return ['ok' => true, 'action' => 'built', 'version' => $latest, 'message' => "已自动构建并切换镜像：$latest（" . fmt_size($size) . "）", 'sha256' => $sha];
}

/**
 * Lazy background sync: when latest.json is older than the freshness window,
 * schedule ONE upstream sync to run after the current response is flushed.
 * A lock file throttles concurrent attempts, so frequent visitors cannot pile
 * up npm builds. This keeps the mirror self-updating without any cron.
 */
function mirror_maybe_lazy_sync($config) {
    $maxAge = (int)($config['lazy_sync_max_age'] ?? 21600);
    if ($maxAge <= 0) return;
    $latest = read_manifest('latest.json') ?? [];
    $syncedAt = strtotime((string)($latest['syncedAt'] ?? '')) ?: 0;
    if (time() - $syncedAt < $maxAge) return;
    $lock = ensure_files_dir() . '/state/lazy-sync.lock';
    if (is_file($lock) && time() - (int)filemtime($lock) < 1800) return;
    @touch($lock);
    register_shutdown_function(function () use ($config, $lock) {
        if (function_exists('fastcgi_finish_request')) {
            @fastcgi_finish_request();
        } else {
            @ignore_user_abort(true);
            @set_time_limit(900);
        }
        try {
            mirror_sync_official($config);
        } finally {
            @unlink($lock);
        }
    });
}
