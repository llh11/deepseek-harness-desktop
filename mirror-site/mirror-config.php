<?php
/**
 * Mirror subsite config. The admin password is stored as a SHA-256 hash.
 * Generate with: hash('sha256', '<your-password>') and change the default
 * immediately after first login.
 */
return [
    // hash('sha256', '<password>')
    'admin_password_sha256' => '80cae920c7107bc99369ec486e710ab8adb4e0de9923d62fef1a91ab3f3fca4a',
    // Upstream registry used by the admin "check official latest" action.
    'upstream_registry'     => 'https://registry.npmmirror.com',
    'package_name'          => '@deepseek-ai/dsh',
];
