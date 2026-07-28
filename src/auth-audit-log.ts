import fs from 'node:fs';

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

export type AuthAuditEvent =
  | 'family_start'
  | 'refresh_failure'
  | 'persist_failure'
  | 'circuit_breaker_paused'
  | 'connection_restored';

export interface AuthAuditEntry {
  event: AuthAuditEvent;
  tokenSuffix?: string;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  source?: string;
  attempt?: number;
  // Self-contained failure context (last-known-good state at failure time):
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

export function maskToken(token: string | undefined | null): string {
  if (!token || token.length < 8) return '<empty>';
  return `...${token.slice(-8)}`;
}

export class AuthAuditLog {
  // Suppress identical consecutive failures for this long. A stuck refresh loop
  // (e.g. invalid_grant retried every refresh interval — the circuit breaker is
  // known to not always stop it) would otherwise balloon the file. The first
  // occurrence (the onset, which matters most) is always kept, plus an hourly
  // heartbeat while the same failure persists.
  private static readonly REPEAT_SUPPRESS_MS = 60 * 60 * 1000;

  private lastSignature?: string;
  private lastWriteAt = 0;

  constructor(
    private readonly filePath: string,
    private readonly enabled: boolean = true,
  ) {}

  async write(entry: AuthAuditEntry): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const signature = [
      entry.event,
      entry.tokenSuffix ?? '',
      entry.httpStatus ?? '',
      entry.responseBody ?? entry.errorMessage ?? '',
    ].join('|');
    const now = Date.now();
    if (signature === this.lastSignature && now - this.lastWriteAt < AuthAuditLog.REPEAT_SUPPRESS_MS) {
      return;
    }
    this.lastSignature = signature;
    this.lastWriteAt = now;

    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
    try {
      await fs.promises.appendFile(this.filePath, line, 'utf8');
    } catch {
      // Audit logging must never break auth — silently drop on write errors.
    }
  }

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
  async readLastFamilyStart(): Promise<FamilyStart | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    try {
      const lines = (await fs.promises.readFile(this.filePath, 'utf8')).split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"family_start"')) {
          continue;
        }
        try {
          const entry = JSON.parse(lines[i]);
          if (entry?.event === 'family_start' && typeof entry.ts === 'string') {
            return { ts: entry.ts, tokenSuffix: entry.tokenSuffix, source: entry.source };
          }
        } catch {
          // Half-written line (append is not atomic) — keep scanning backwards.
        }
      }
    } catch {
      // No log yet, or unreadable — caller falls back to bootstrapping an anchor.
    }
    return undefined;
  }
}
