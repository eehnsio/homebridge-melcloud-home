const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const fs = require('node:fs');
const path = require('node:path');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Handler to save email/password and get token automatically
    this.onRequest('/login-with-credentials', this.loginWithCredentials.bind(this));

    // Handler to clear the auth audit log file
    this.onRequest('/clear-auth-log', this.clearAuthLog.bind(this));

    // "Stay signed in" — encrypted credential storage for automatic re-login
    this.onRequest('/credentials-status', this.credentialsStatus.bind(this));
    this.onRequest('/save-credentials', this.saveCredentials.bind(this));
    this.onRequest('/clear-credentials', this.clearCredentials.bind(this));

    // Ready
    this.ready();
  }

  /**
   * Delete the auth audit log from the Homebridge storage directory. The running
   * plugin recreates it on the next failure if logging is still enabled. Used by
   * the "Clear Auth Log" button in the custom UI so users don't need shell access.
   */
  async clearAuthLog() {
    try {
      const storagePath = this.homebridgeStoragePath;
      if (!storagePath) {
        return { success: false, error: 'Could not determine Homebridge storage path' };
      }
      const logPath = path.join(storagePath, 'melcloud-auth-audit.log');
      await fs.promises.rm(logPath, { force: true });
      console.log('[MELCloudHome UI] Auth audit log cleared:', logPath);
      return { success: true, message: 'Auth audit log cleared.' };
    } catch (error) {
      console.error('[MELCloudHome UI] Failed to clear auth log:', error);
      return { success: false, error: error.message || 'Failed to clear auth log' };
    }
  }

  /** Shared, encrypted credential storage (src/credential-store.ts). */
  getCredentialStore() {
    const storagePath = this.homebridgeStoragePath;
    if (!storagePath) {
      throw new Error('Could not determine Homebridge storage path');
    }
    const { CredentialStore } = require('../dist/credential-store');
    return new CredentialStore(storagePath, (msg) => console.warn('[MELCloudHome UI]', msg));
  }

  /** Whether credentials are currently saved, so the checkbox reflects reality. */
  async credentialsStatus() {
    try {
      return { success: true, saved: await this.getCredentialStore().has() };
    } catch (error) {
      return { success: false, saved: false, error: error.message };
    }
  }

  /**
   * Store the credentials the user just logged in with, encrypted at rest, so the
   * plugin can sign in again on its own when MELCloud revokes the token family.
   * Strictly opt-in — nothing is written unless "Stay signed in" is ticked.
   */
  async saveCredentials(payload) {
    try {
      const { email, password } = payload || {};
      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }
      await this.getCredentialStore().save({ email, password });
      console.log('[MELCloudHome UI] Credentials saved (encrypted) for automatic re-login');
      return { success: true };
    } catch (error) {
      console.error('[MELCloudHome UI] Failed to save credentials:', error);
      return { success: false, error: error.message };
    }
  }

  /** Unticking the box must actually delete them, not just stop using them. */
  async clearCredentials() {
    try {
      await this.getCredentialStore().clear();
      console.log('[MELCloudHome UI] Saved credentials deleted');
      return { success: true };
    } catch (error) {
      console.error('[MELCloudHome UI] Failed to clear credentials:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark the birth of a refresh-token family in the auth audit log.
   *
   * A browser login is the only moment a new family is created; from then on the
   * token rotates every ~55 minutes and its value says nothing about the age of
   * the grant behind it. MELCloud revokes families server-side at unpredictable
   * intervals (`invalid_grant` on a token we just persisted), and this line is
   * what lets the plugin state how long the dead family had lived.
   *
   * Written here rather than in the plugin because the plugin does not see the
   * new token until the user saves it and restarts Homebridge. Consequence: a
   * login the user abandons without saving still writes an anchor, which would
   * understate the age of the family that is actually still running. Visible in
   * the log as two `family_start` lines close together.
   */
  async recordFamilyStart(refreshToken) {
    try {
      const storagePath = this.homebridgeStoragePath;
      if (!storagePath || !refreshToken) {
        return;
      }
      if (!(await this.isAuditLogEnabled(storagePath))) {
        return;
      }
      const entry = {
        ts: new Date().toISOString(),
        event: 'family_start',
        tokenSuffix: `...${refreshToken.slice(-8)}`,
        source: 'oauth-ui',
      };
      await fs.promises.appendFile(
        path.join(storagePath, 'melcloud-auth-audit.log'),
        `${JSON.stringify(entry)}\n`,
        'utf8',
      );
      console.log('[MELCloudHome UI] Recorded family_start for token', entry.tokenSuffix);
    } catch (error) {
      // Bookkeeping must never break a successful login.
      console.error('[MELCloudHome UI] Failed to record family_start:', error.message);
    }
  }

  /**
   * Honour the `authAuditLog: false` opt-out from the UI process, which has no
   * access to the running plugin's config. Unreadable config → assume the
   * default (on), matching the plugin.
   */
  async isAuditLogEnabled(storagePath) {
    try {
      const raw = await fs.promises.readFile(path.join(storagePath, 'config.json'), 'utf8');
      const platforms = JSON.parse(raw).platforms || [];
      const entry = platforms.find((p) => p && p.platform === 'MELCloudHome');
      return !entry || entry.authAuditLog !== false;
    } catch {
      return true;
    }
  }

  /**
   * Login with email/password and automatically obtain OAuth token
   * Uses the proven bash script approach
   */
  async loginWithCredentials(payload) {
    try {
      console.log('[MELCloudHome UI] Login with credentials request received');
      const { email, password } = payload;

      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      console.log('[MELCloudHome UI] Attempting OAuth login for:', email);

      // Use the automated curl approach (proven to work)
      const tokens = await this.getTokensViaCurl(email, password);
      console.log('[MELCloudHome UI] OAuth tokens obtained successfully');

      await this.recordFamilyStart(tokens.refreshToken);

      const result = {
        success: true,
        message: 'Login successful! Refresh token obtained.',
        refreshToken: tokens.refreshToken,
        instructions:
          'Copy the token below and paste it in the "Refresh Token" field in the plugin configuration, then click Save.',
      };

      // Also deliver over the independent event/stream channel. In
      // homebridge-config-ui-x 5.21+ the request/response promise can hang and
      // never resolve in the iframe (same regression worked around for
      // savePluginConfig). pushEvent is a separate code path, so the UI gets a
      // second chance to receive the token even when the response is lost.
      this.pushEvent('login-result', result);

      return result;
    } catch (error) {
      console.error('[MELCloudHome UI] Login error:', error);
      console.error('[MELCloudHome UI] Error stack:', error.stack);
      const errorResult = {
        success: false,
        error: error.message || 'Login failed. Please check your credentials.',
      };
      this.pushEvent('login-result', errorResult);
      return errorResult;
    }
  }

  /**
   * Obtain OAuth tokens with email + password.
   *
   * The flow itself lives in src/oauth-login.js (shipped as dist/oauth-login.js)
   * so the plugin can run the exact same, proven code path when it needs to sign
   * in again on its own. It used to be duplicated here.
   */
  async getTokensViaCurl(email, password) {
    const { loginWithPassword } = require('../dist/oauth-login');
    return loginWithPassword(email, password, console.log);
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
