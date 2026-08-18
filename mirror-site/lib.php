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
