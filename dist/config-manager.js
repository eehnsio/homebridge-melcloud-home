"use strict";
/**
 * Config Manager - Automatically save refresh tokens to config
 *
 * This module handles automatic saving of refresh tokens to the Homebridge
 * config file, so users don't need to manually update their config after
 * initial authentication.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ConfigManager {
    constructor(log, storagePath) {
        this.log = log;
        // Homebridge config.json is in the storage path
        this.configPath = path_1.default.join(storagePath, 'config.json');
        this.log.debug('Config path:', this.configPath);
    }
    /**
     * Update the plugin config with a new refresh token
     */
    async saveRefreshToken(refreshToken) {
        try {
            this.log.debug(`Saving refresh token to config at: ${this.configPath}`);
            // Check if config file exists and is writable
            try {
                await fs_1.default.promises.access(this.configPath, fs_1.default.constants.W_OK);
            }
            catch {
                this.log.error(`Config file not found or not writable: ${this.configPath}`);
                this.log.error('Check file permissions or run Homebridge as appropriate user');
                return false;
            }
            // Read current config
            const configData = await fs_1.default.promises.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            if (!config || typeof config !== 'object' || Array.isArray(config)) {
                this.log.error('Config file has invalid structure (not a JSON object)');
                return false;
            }
            // Find our platform config
            if (!config.platforms || !Array.isArray(config.platforms)) {
                this.log.error('Config file has invalid structure (no platforms array)');
                return false;
            }
            const platformIndex = config.platforms.findIndex((p) => p.platform === 'MELCloudHome');
            if (platformIndex === -1) {
                this.log.error('Could not find MELCloudHome platform in config');
                return false;
            }
            // Update refresh token
            config.platforms[platformIndex].refreshToken = refreshToken;
            // Remove email/password for security (refresh token is sufficient)
            if (config.platforms[platformIndex].email || config.platforms[platformIndex].password) {
                this.log.warn('Removing stored email/password from config (refresh token authentication is used instead)');
                delete config.platforms[platformIndex].email;
                delete config.platforms[platformIndex].password;
            }
            // Write atomically: write to temp file, then rename over original
            const tmpPath = this.configPath + '.tmp';
            await fs_1.default.promises.writeFile(tmpPath, JSON.stringify(config, null, 4), 'utf8');
            await fs_1.default.promises.rename(tmpPath, this.configPath);
            this.log.info('✅ Refresh token saved to config successfully!');
            this.log.info('   Future restarts will use the saved token automatically');
            return true;
        }
        catch (error) {
            this.log.error('Failed to save refresh token to config:', error instanceof Error ? error.message : String(error));
            this.log.warn('   Please re-authenticate via the plugin settings UI to obtain a new token');
            return false;
        }
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config-manager.js.map