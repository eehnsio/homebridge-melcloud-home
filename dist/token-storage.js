"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class TokenStorage {
    constructor(storagePath, log) {
        this.storagePath = storagePath;
        this.log = log;
        // Ensure the directory exists
        const dir = path_1.default.dirname(storagePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
    }
    /**
     * Save tokens to disk
     */
    async saveTokens(tokens) {
        try {
            const data = JSON.stringify(tokens, null, 2);
            await fs_1.default.promises.writeFile(this.storagePath, data, { mode: 0o600 }); // Read/write for owner only
            if (this.log?.debug) {
                this.log.debug('[TokenStorage] Tokens saved successfully');
            }
        }
        catch (error) {
            if (this.log) {
                this.log.error('[TokenStorage] Failed to save tokens:', error);
            }
            throw error;
        }
    }
    /**
     * Load tokens from disk
     */
    async loadTokens() {
        try {
            if (!fs_1.default.existsSync(this.storagePath)) {
                if (this.log?.debug) {
                    this.log.debug('[TokenStorage] No stored tokens found');
                }
                return null;
            }
            const data = await fs_1.default.promises.readFile(this.storagePath, 'utf-8');
            const tokens = JSON.parse(data);
            if (this.log?.debug) {
                this.log.debug('[TokenStorage] Tokens loaded successfully');
            }
            return tokens;
        }
        catch (error) {
            if (this.log) {
                this.log.error('[TokenStorage] Failed to load tokens:', error);
            }
            return null;
        }
    }
    /**
     * Clear stored tokens
     */
    async clearTokens() {
        try {
            if (fs_1.default.existsSync(this.storagePath)) {
                await fs_1.default.promises.unlink(this.storagePath);
                if (this.log?.debug) {
                    this.log.debug('[TokenStorage] Tokens cleared successfully');
                }
            }
        }
        catch (error) {
            if (this.log) {
                this.log.error('[TokenStorage] Failed to clear tokens:', error);
            }
            throw error;
        }
    }
    /**
     * Check if tokens exist in storage
     */
    hasTokens() {
        return fs_1.default.existsSync(this.storagePath);
    }
}
exports.TokenStorage = TokenStorage;
//# sourceMappingURL=token-storage.js.map