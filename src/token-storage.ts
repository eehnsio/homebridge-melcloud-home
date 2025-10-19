import fs from 'fs';
import path from 'path';
import { Logger } from 'homebridge';
import { OAuthTokens } from './auth';

export class TokenStorage {
  private readonly storagePath: string;
  private readonly log?: Logger;

  constructor(storagePath: string, log?: Logger) {
    this.storagePath = storagePath;
    this.log = log;

    // Ensure the directory exists
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Save tokens to disk
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    try {
      const data = JSON.stringify(tokens, null, 2);
      await fs.promises.writeFile(this.storagePath, data, { mode: 0o600 }); // Read/write for owner only

      if (this.log?.debug) {
        this.log.debug('[TokenStorage] Tokens saved successfully');
      }
    } catch (error) {
      if (this.log) {
        this.log.error('[TokenStorage] Failed to save tokens:', error);
      }
      throw error;
    }
  }

  /**
   * Load tokens from disk
   */
  async loadTokens(): Promise<OAuthTokens | null> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        if (this.log?.debug) {
          this.log.debug('[TokenStorage] No stored tokens found');
        }
        return null;
      }

      const data = await fs.promises.readFile(this.storagePath, 'utf-8');
      const tokens = JSON.parse(data) as OAuthTokens;

      if (this.log?.debug) {
        this.log.debug('[TokenStorage] Tokens loaded successfully');
      }

      return tokens;
    } catch (error) {
      if (this.log) {
        this.log.error('[TokenStorage] Failed to load tokens:', error);
      }
      return null;
    }
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    try {
      if (fs.existsSync(this.storagePath)) {
        await fs.promises.unlink(this.storagePath);

        if (this.log?.debug) {
          this.log.debug('[TokenStorage] Tokens cleared successfully');
        }
      }
    } catch (error) {
      if (this.log) {
        this.log.error('[TokenStorage] Failed to clear tokens:', error);
      }
      throw error;
    }
  }

  /**
   * Check if tokens exist in storage
   */
  hasTokens(): boolean {
    return fs.existsSync(this.storagePath);
  }
}
