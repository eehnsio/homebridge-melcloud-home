import fs from 'node:fs';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export type AuthAuditEvent =
  | 'init'
  | 'refresh_attempt'
  | 'refresh_success'
  | 'refresh_failure'
  | 'token_rotated'
  | 'persist_attempt'
  | 'persist_success'
  | 'persist_failure'
  | 'connection_restored'
  | 'force_refresh_on_401'
  | 'circuit_breaker_paused';

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

export function maskToken(token: string | undefined | null): string {
  if (!token || token.length < 8) return '<empty>';
  return `...${token.slice(-8)}`;
}

export class AuthAuditLog {
  constructor(private readonly filePath: string) {}

  async write(entry: AuthAuditEntry): Promise<void> {
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
    try {
      await this.rotateIfNeeded();
      await fs.promises.appendFile(this.filePath, line, 'utf8');
    } catch {
      // Audit logger failures must not break auth. Silently drop — the next
      // write attempt will retry rotation and append from scratch.
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.promises.stat(this.filePath);
      if (stat.size > MAX_SIZE_BYTES) {
        await fs.promises.rename(this.filePath, `${this.filePath}.1`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }
}
