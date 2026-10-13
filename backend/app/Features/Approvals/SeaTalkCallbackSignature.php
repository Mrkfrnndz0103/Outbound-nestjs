<?php

namespace App\Features\Approvals;

final class SeaTalkCallbackSignature
{
    public static function approvalSignature(
        string $method,
        string $requestTarget,
        string $contentType,
        string $rawBody,
        string $date,
        string $token,
        string $secret,
    ): string {
        [$path, $query] = self::pathAndQuery($requestTarget);
        $canonical = implode("\n", [
            strtoupper($method),
            $path,
            $contentType,
            self::md5BodyHash($rawBody),
            $date,
            $token,
            self::canonicalQuery($query),
        ]);

        return self::hmacBase64($canonical, $secret);
    }

    public static function verifyApproval(
        string $method,
        string $requestTarget,
        ?string $contentType,
        string $rawBody,
        ?string $date,
        ?string $token,
        ?string $authorization,
        string $secret,
    ): bool {
        if (
            $contentType === null || $date === null || $token === null
            || $authorization === null || $secret === ''
            || trim($date) === '' || trim($token) === ''
        ) {
            return false;
        }

        $expected = self::approvalSignature(
            $method,
            $requestTarget,
            $contentType,
            $rawBody,
            $date,
            $token,
            $secret,
        );

        return hash_equals($expected, trim($authorization));
    }

    public static function verifyEvent(string $rawBody, ?string $signature, string $secret): bool
    {
        if ($signature === null || $secret === '' || ! preg_match('/\A[a-f0-9]{64}\z/', $signature)) {
            return false;
        }

        return hash_equals(hash('sha256', $rawBody.$secret), $signature);
    }

    public static function md5BodyHash(string $rawBody): string
    {
        return md5($rawBody);
    }

    public static function hmacBase64(string $message, string $secret): string
    {
        return base64_encode(hash_hmac('sha1', $message, $secret, true));
    }

    private static function pathAndQuery(string $requestTarget): array
    {
        $parts = parse_url($requestTarget);
        $path = is_array($parts) ? ($parts['path'] ?? '/') : '/';

        return [$path, is_array($parts) ? ($parts['query'] ?? '') : ''];
    }

    private static function canonicalQuery(string $query): string
    {
        if ($query === '') {
            return '';
        }

        $parameters = [];
        foreach (explode('&', $query) as $parameter) {
            [$key, $value] = array_pad(explode('=', $parameter, 2), 2, '');
            $parameters[] = rawurlencode(urldecode($key)).'='.rawurlencode(urldecode($value));
        }
        sort($parameters, SORT_STRING);

        return implode('&', $parameters);
    }
}
