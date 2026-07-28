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
 * The one non-failure event is `family_start`: a single line marking the birth
 * of a refresh-token family (a browser login). Rotation is continuous, so
 * without that anchor there is no way to say how long a family survived before
 * MELCloud revoked it — and the interval between logins and deaths is the only
 * handle we have on the intermittent `invalid_grant`.
 *
 * Only the last 8 characters of any token are ever recorded — never the token
 * itself, and never the password.
 */
export type AuthAuditEvent = 'family_start' | 'refresh_failure' | 'persist_failure' | 'circuit_breaker_paused' | 'connection_restored';
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
    familyStartedAt?: string;
    familyAgeDays?: number;
}
export interface FamilyStart {
    ts: string;
    tokenSuffix?: string;
    source?: string;
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
    /**
     * Most recent `family_start`, i.e. when the refresh-token family currently in
     * use was created. Written by the custom UI at login (the plugin only sees the
     * new token after the user saves and restarts), so it has to be read back from
     * the file rather than kept in memory.
     *
     * Returns undefined when there is no anchor yet — a missing/unreadable log, or
     * a family that predates this bookkeeping. Never throws: a lost anchor costs a
     * diagnostic field, and must not cost authentication.
     */
    readLastFamilyStart(): Promise<FamilyStart | undefined>;
}
//# sourceMappingURL=auth-audit-log.d.ts.map