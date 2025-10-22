/**
 * Config Manager - Automatically save refresh tokens to config
 *
 * This module handles automatic saving of refresh tokens to the Homebridge
 * config file, so users don't need to manually update their config after
 * initial authentication.
 */
import { Logger } from 'homebridge';
export declare class ConfigManager {
    private readonly log;
    private configPath;
    constructor(log: Logger, storagePath: string);
    /**
     * Update the plugin config with a new refresh token
     */
    saveRefreshToken(refreshToken: string): Promise<boolean>;
}
//# sourceMappingURL=config-manager.d.ts.map