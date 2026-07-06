"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthAuditLog = void 0;
exports.maskToken = maskToken;
const node_fs_1 = __importDefault(require("node:fs"));
function maskToken(token) {
    if (!token || token.length < 8)
        return '<empty>';
    return `...${token.slice(-8)}`;
}
class AuthAuditLog {
    constructor(filePath, enabled = true) {
        this.filePath = filePath;
        this.enabled = enabled;
        this.lastWriteAt = 0;
    }
    async write(entry) {
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
            await node_fs_1.default.promises.appendFile(this.filePath, line, 'utf8');
        }
        catch {
            // Audit logging must never break auth — silently drop on write errors.
        }
    }
}
exports.AuthAuditLog = AuthAuditLog;
// Suppress identical consecutive failures for this long. A stuck refresh loop
// (e.g. invalid_grant retried every refresh interval — the circuit breaker is
// known to not always stop it) would otherwise balloon the file. The first
// occurrence (the onset, which matters most) is always kept, plus an hourly
// heartbeat while the same failure persists.
AuthAuditLog.REPEAT_SUPPRESS_MS = 60 * 60 * 1000;
//# sourceMappingURL=auth-audit-log.js.map