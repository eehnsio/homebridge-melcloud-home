export type AuthAuditEvent = 'init' | 'refresh_attempt' | 'refresh_success' | 'refresh_failure' | 'token_rotated' | 'persist_attempt' | 'persist_success' | 'persist_failure' | 'connection_restored' | 'force_refresh_on_401' | 'circuit_breaker_paused';
export interface AuthAuditEntry {
    event: AuthAuditEvent;
    tokenSuffix?: string;
    newTokenSuffix?: string;
    httpStatus?: number;
    responseBody?: string;
    errorMessage?: string;
    expiresIn?: number;
    attempt?: number;
    source?: string;
}
export declare function maskToken(token: string | undefined | null): string;
export declare class AuthAuditLog {
    private readonly filePath;
    constructor(filePath: string);
    write(entry: AuthAuditEntry): Promise<void>;
    private rotateIfNeeded;
}
//# sourceMappingURL=auth-audit-log.d.ts.map