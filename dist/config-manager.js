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
            // Check if config file exists
            if (!fs_1.default.existsSync(this.configPath)) {
                this.log.error(`Config file not found at: ${this.configPath}`);
                return false;
            }
            // Check if we have write permissions
            try {
                fs_1.default.accessSync(this.configPath, fs_1.default.constants.W_OK);
            }
            catch (error) {
                this.log.error(`Config file is not writable: ${this.configPath}`);
                this.log.error('Check file permissions or run Homebridge as appropriate user');
                return false;
            }
            // Read current config
            const configData = fs_1.default.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);
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
            // Optionally remove email/password for better security
            if (config.platforms[platformIndex].email && config.platforms[platformIndex].password) {
                this.log.info('💡 Removing email/password from config (keeping refresh token only)');
                delete config.platforms[platformIndex].email;
                delete config.platforms[platformIndex].password;
            }
            // Write back to file with nice formatting
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(config, null, 4), 'utf8');
            this.log.info('✅ Refresh token saved to config successfully!');
            this.log.info('   Future restarts will use the saved token automatically');
            return true;
        }
        catch (error) {
            this.log.error('Failed to save refresh token to config:', error);
            this.log.warn('   You can manually add it to your config.json:');
            this.log.warn(`   "refreshToken": "${refreshToken.substring(0, 30)}..."`);
            return false;
        }
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config-manager.js.map