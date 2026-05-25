"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthAuditLog = void 0;
exports.maskToken = maskToken;
const node_fs_1 = __importDefault(require("node:fs"));
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
function maskToken(token) {
    if (!token || token.length < 8)
        return '<empty>';
    return `...${token.slice(-8)}`;
}
class AuthAuditLog {
    constructor(filePath) {
        this.filePath = filePath;
    }
    async write(entry) {
        const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
        try {
            await this.rotateIfNeeded();
            await node_fs_1.default.promises.appendFile(this.filePath, line, 'utf8');
        }
        catch {
            // Audit logger failures must not break auth. Silently drop — the next
            // write attempt will retry rotation and append from scratch.
        }
    }
    async rotateIfNeeded() {
        try {
            const stat = await node_fs_1.default.promises.stat(this.filePath);
            if (stat.size > MAX_SIZE_BYTES) {
                await node_fs_1.default.promises.rename(this.filePath, `${this.filePath}.1`);
            }
        }
        catch (err) {
            if (err.code === 'ENOENT')
                return;
            throw err;
        }
    }
}
exports.AuthAuditLog = AuthAuditLog;
//# sourceMappingURL=auth-audit-log.js.map