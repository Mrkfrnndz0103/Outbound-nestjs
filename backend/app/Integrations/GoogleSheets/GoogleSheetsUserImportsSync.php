<?php

namespace App\Integrations\GoogleSheets;

use Google\Client;
use Google\Service\Sheets;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class GoogleSheetsUserImportsSync
{
    private const SOURCE_PREFIX = 'google-sheet:user:';

    private const ALLOWED_ROLES = ['ops_pic', 'fte_ops', 'fte_mm', 'doc_officer'];

    public function __construct(private readonly ?Sheets $sheets = null) {}

    public function sync(): array
    {
        $spreadsheetId = (string) config('services.user_imports_sheet.spreadsheet_id');
        $sheetName = (string) config('services.user_imports_sheet.sheet_name', 'user');
        $maxRows = (int) config('services.user_imports_sheet.max_rows', 5000);
        if ($spreadsheetId === '' || $sheetName === '') {
            throw new RuntimeException('User imports Google Sheet ID and tab name must be configured.');
        }
        if ($maxRows < 1) {
            throw new RuntimeException('User imports Google Sheet max_rows must be positive.');
        }

        $escapedSheetName = str_replace("'", "''", $sheetName);
        $range = "'{$escapedSheetName}'!A1:Z".($maxRows + 1);
        $response = ($this->sheets ?? $this->client())->spreadsheets_values->get(
            $spreadsheetId,
            $range,
            ['majorDimension' => 'ROWS', 'valueRenderOption' => 'UNFORMATTED_VALUE'],
        );
        $values = $response->getValues() ?? [];
        if ($values === []) {
            throw new RuntimeException('User imports Google Sheet is empty; refusing to change staged users.');
        }

        $headers = array_map(fn (mixed $header): string => $this->header((string) $header), $values[0]);
        $indexes = array_flip($headers);
        $hasEmployeeCode = array_key_exists('seatalk_employee_code', $indexes);
        foreach (['name', 'role', 'email', 'ops_id', 'is_active'] as $required) {
            if (! array_key_exists($required, $indexes)) {
                throw new RuntimeException("User imports Google Sheet is missing the {$required} column.");
            }
        }
        if (count($values) - 1 > $maxRows) {
            throw new RuntimeException("User imports Google Sheet exceeds the configured {$maxRows}-row limit.");
        }
        if (count($values) < 2) {
            throw new RuntimeException('User imports Google Sheet has headers but no user rows; refusing to change staged users.');
        }

        $rows = [];
        $seenSources = [];
        $seenEmails = [];
        $seenOpsIds = [];
        $seenEmployeeCodes = [];
        foreach (array_slice($values, 1) as $offset => $cells) {
            if ($this->isBlankRow($cells)) {
                continue;
            }
            $line = $offset + 2;
            $record = [];
            foreach (['name', 'role', 'email', 'ops_id', 'is_active'] as $field) {
                $record[$field] = isset($indexes[$field]) ? ($cells[$indexes[$field]] ?? null) : null;
            }
            $record['seatalk_employee_code'] = $hasEmployeeCode
                ? ($cells[$indexes['seatalk_employee_code']] ?? null)
                : null;

            $name = trim((string) ($record['name'] ?? ''));
            $role = strtolower(trim((string) ($record['role'] ?? '')));
            if ($name === '' || mb_strlen($name) > 120) {
                throw new RuntimeException("User imports Google Sheet row {$line} has an empty or invalid name.");
            }
            if (! in_array($role, self::ALLOWED_ROLES, true)) {
                throw new RuntimeException("User imports Google Sheet row {$line} has an unsupported role.");
            }

            // Ops PIC accounts use Ops IDs; FTE and DOC accounts use email.
            // The other sheet field often contains a repeated placeholder.
            $opsId = $role === 'ops_pic' ? $this->identity($record['ops_id']) : null;
            $email = $role === 'ops_pic' ? null : $this->email($record['email']);
            $identity = $role === 'ops_pic' ? $opsId : $email;
            if ($identity === null) {
                $column = $role === 'ops_pic' ? 'Ops_id' : 'email';
                throw new RuntimeException("User imports Google Sheet row {$line} has no valid {$column} for its role.");
            }
            $sourceId = self::SOURCE_PREFIX.$role.':'.$identity;
            if (isset($seenSources[$sourceId])) {
                throw new RuntimeException("User imports Google Sheet contains duplicate role identities on rows {$seenSources[$sourceId]} and {$line}.");
            }
            $seenSources[$sourceId] = $line;
            $seenIdentities = $role === 'ops_pic' ? $seenOpsIds : $seenEmails;
            if (isset($seenIdentities[$identity])) {
                throw new RuntimeException("User imports Google Sheet contains duplicate role identities on rows {$seenIdentities[$identity]} and {$line}.");
            }
            if ($role === 'ops_pic') {
                $seenOpsIds[$identity] = $line;
            } else {
                $seenEmails[$identity] = $line;
            }

            $employeeCode = $this->identity($record['seatalk_employee_code']);
            if ($employeeCode !== null) {
                $employeeCode = strtoupper($employeeCode);
                if (isset($seenEmployeeCodes[$employeeCode])) {
                    throw new RuntimeException("User imports Google Sheet contains a duplicate SeaTalk employee code on rows {$seenEmployeeCodes[$employeeCode]} and {$line}.");
                }
                $seenEmployeeCodes[$employeeCode] = $line;
            }

            $rows[] = [
                'source_id' => $sourceId,
                'name' => $name,
                'role' => $role,
                'email' => $email,
                'ops_id' => $opsId,
                'is_active' => $this->boolean($record['is_active'], $line),
                'seatalk_employee_code' => $employeeCode,
                'imported_at' => now(),
            ];
        }
        if ($rows === []) {
            throw new RuntimeException('User imports Google Sheet has no usable user rows; refusing to change staged users.');
        }

        DB::transaction(function () use ($rows, $hasEmployeeCode): void {
            $updateColumns = ['name', 'role', 'email', 'ops_id', 'is_active', 'imported_at'];
            if ($hasEmployeeCode) {
                $updateColumns[] = 'seatalk_employee_code';
            }
            foreach (array_chunk($rows, 500) as $batch) {
                DB::table('user_imports')->upsert(
                    $batch,
                    ['source_id'],
                    $updateColumns,
                );
            }

            // A completed, non-empty source snapshot can retire rows previously
            // owned by this sync. Retain the auth link and all rows from other imports.
            DB::table('user_imports')
                ->where('source_id', 'like', self::SOURCE_PREFIX.'%')
                ->whereNotIn('source_id', array_column($rows, 'source_id'))
                ->update(['is_active' => false, 'imported_at' => now()]);
        });

        return ['synced' => count($rows)];
    }

    private function client(): Sheets
    {
        $credentials = config('services.google_sheets.credentials_json');
        $credentialsPath = config('services.google_sheets.credentials_path');
        if ($credentialsPath && is_file($credentialsPath)) {
            $credentials = file_get_contents($credentialsPath);
        }
        $decoded = is_string($credentials) ? json_decode($credentials, true) : null;
        if (! is_array($decoded)) {
            throw new RuntimeException('Google Sheets credentials are missing or invalid.');
        }

        $client = new Client;
        $client->setApplicationName(config('app.name'));
        $client->setAuthConfig($decoded);
        $client->setScopes([Sheets::SPREADSHEETS_READONLY]);

        return new Sheets($client);
    }

    private function header(string $value): string
    {
        return strtolower(str_replace([' ', '-'], '_', trim($value)));
    }

    private function identity(mixed $value): ?string
    {
        $value = strtolower(trim((string) ($value ?? '')));
        if ($value === '' || in_array($value, ['-', 'n/a', 'na', 'none', 'null'], true)) {
            return null;
        }

        return $value;
    }

    private function email(mixed $value): ?string
    {
        $email = $this->identity($value);

        return $email !== null && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    private function boolean(mixed $value, int $line): bool
    {
        if (is_string($value)) {
            $value = match (strtolower(trim($value))) {
                'y' => true,
                'n' => false,
                default => $value,
            };
        }
        $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($parsed === null) {
            throw new RuntimeException("User imports Google Sheet row {$line} has an invalid is_active value.");
        }

        return $parsed;
    }

    private function isBlankRow(array $cells): bool
    {
        foreach ($cells as $cell) {
            if (trim((string) ($cell ?? '')) !== '') {
                return false;
            }
        }

        return true;
    }
}
