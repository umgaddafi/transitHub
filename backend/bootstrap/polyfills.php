<?php

/**
 * Polyfills for PHP environments missing mbstring regex / oniguruma
 * Common in shared cPanel and LiteSpeed/Apache PHP builds where mbstring was compiled without --enable-mbregex
 */

if (!function_exists('mb_split')) {
    function mb_split(string $pattern, string $string, int $limit = -1): array|false {
        $delimiter = '/';
        $escaped = str_replace($delimiter, '\\' . $delimiter, $pattern);
        $result = @preg_split('/' . $escaped . '/u', $string, $limit);
        if ($result === false) {
            $result = preg_split('/' . $escaped . '/', $string, $limit);
        }
        return $result;
    }
}

if (!function_exists('mb_ereg')) {
    function mb_ereg(string $pattern, string $string, ?array &$matches = null): int|false {
        $escaped = str_replace('/', '\/', $pattern);
        $res = @preg_match('/' . $escaped . '/u', $string, $matches);
        if ($res === false) {
            $res = preg_match('/' . $escaped . '/', $string, $matches);
        }
        return $res === false ? false : ($res > 0 ? 1 : 0);
    }
}

if (!function_exists('mb_eregi')) {
    function mb_eregi(string $pattern, string $string, ?array &$matches = null): int|false {
        $escaped = str_replace('/', '\/', $pattern);
        $res = @preg_match('/' . $escaped . '/ui', $string, $matches);
        if ($res === false) {
            $res = preg_match('/' . $escaped . '/', $string, $matches);
        }
        return $res === false ? false : ($res > 0 ? 1 : 0);
    }
}

if (!function_exists('mb_ereg_replace')) {
    function mb_ereg_replace(string $pattern, string $replacement, string $string, ?string $options = null): string|false {
        $opt = 'u';
        if ($options && str_contains($options, 'i')) {
            $opt .= 'i';
        }
        $escaped = str_replace('/', '\/', $pattern);
        $res = @preg_replace('/' . $escaped . '/' . $opt, $replacement, $string);
        if ($res === null) {
            $res = preg_replace('/' . $escaped . '/' . str_replace('u', '', $opt), $replacement, $string);
        }
        return $res ?? false;
    }
}

if (!function_exists('mb_eregi_replace')) {
    function mb_eregi_replace(string $pattern, string $replacement, string $string, ?string $options = null): string|false {
        $opt = 'ui';
        $escaped = str_replace('/', '\/', $pattern);
        $res = @preg_replace('/' . $escaped . '/' . $opt, $replacement, $string);
        if ($res === null) {
            $res = preg_replace('/' . $escaped . '/i', $replacement, $string);
        }
        return $res ?? false;
    }
}

if (!function_exists('mb_ereg_match')) {
    function mb_ereg_match(string $pattern, string $string, ?string $options = null): bool {
        $opt = 'u';
        if ($options && str_contains($options, 'i')) {
            $opt .= 'i';
        }
        $escaped = str_replace('/', '\/', $pattern);
        $res = @preg_match('/^' . $escaped . '/' . $opt, $string);
        if ($res === false) {
            $res = preg_match('/^' . $escaped . '/' . str_replace('u', '', $opt), $string);
        }
        return (bool) $res;
    }
}

if (!function_exists('mb_regex_encoding')) {
    function mb_regex_encoding(?string $encoding = null): string|bool {
        return 'UTF-8';
    }
}

if (!function_exists('mb_regex_set_options')) {
    function mb_regex_set_options(?string $options = null): string {
        return 'msr';
    }
}
