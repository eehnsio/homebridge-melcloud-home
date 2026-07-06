/**
 * Auth audit log — records OAuth token-refresh FAILURES (and the recovery /
 * circuit-breaker transitions around them) to a small append-only file in the
 * Homebridge storage directory.
 *
 * It deliberately does NOT log routine successes/rotations: when refresh works
 * there is nothing to diagnose, and skipping them keeps the file tiny and the
 * actual failures trivial to find. Each failure entry is self-contained — it
 * carries the last-known-good token context so you can tell whether MELCloud
 * rejected a token we actually persisted (their side) or we sent a stale /
 * never-saved token (our side, e.g. the UI never saved the login).
 *
 * Only the last 8 characters of any token are ever recorded — never the token
 * itself, and never the password.
 */
export type AuthAuditEvent = 'refresh_failure' | 'persist_failure' | 'circuit_breaker_paused' | 'connection_restored';
export interface AuthAuditEntry {
    event: AuthAuditEvent;
    tokenSuffix?: string;
    httpStatus?: number;
    responseBody?: string;
    errorMessage?: string;
    source?: string;
    attempt?: number;
    fromConfigToken?: boolean;
    lastRotatedSuffix?: string;
    lastPersistedSuffix?: string;
    lastPersistedAt?: string;
}
export declare function maskToken(token: string | undefined | null): string;
export declare class AuthAuditLog {
    private readonly filePath;
    private readonly enabled;
    private static readonly REPEAT_SUPPRESS_MS;
    private lastSignature?;
    private lastWriteAt;
    constructor(filePath: string, enabled?: boolean);
    write(entry: AuthAuditEntry): Promise<void>;
}
//# sourceMappingURL=auth-audit-log.d.ts.map