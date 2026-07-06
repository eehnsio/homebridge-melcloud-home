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
  // Self-contained failure context (last-known-good state at failure time):
  fromConfigToken?: boolean;
  lastRotatedSuffix?: string;
  lastPersistedSuffix?: string;
  lastPersistedAt?: string;
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
}
