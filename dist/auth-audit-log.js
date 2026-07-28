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
    /**
     * Most recent `family_start`, i.e. when the refresh-token family currently in
     * use was created. Written by the custom UI at login (the plugin only sees the
     * new token after the user saves and restarts), so it has to be read back from
     * the file rather than kept in memory.
     *
     * Returns undefined when there is no anchor yet — a missing/unreadable log, or
     * a family that predates this bookkeeping. Never throws: a lost anchor costs a
     * diagnostic field, and must not cost authentication.
     */
    async readLastFamilyStart() {
        if (!this.enabled) {
            return undefined;
        }
        try {
            const lines = (await node_fs_1.default.promises.readFile(this.filePath, 'utf8')).split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                if (!lines[i].includes('"family_start"')) {
                    continue;
                }
                try {
                    const entry = JSON.parse(lines[i]);
                    if (entry?.event === 'family_start' && typeof entry.ts === 'string') {
                        return { ts: entry.ts, tokenSuffix: entry.tokenSuffix, source: entry.source };
                    }
                }
                catch {
                    // Half-written line (append is not atomic) — keep scanning backwards.
                }
            }
        }
        catch {
            // No log yet, or unreadable — caller falls back to bootstrapping an anchor.
        }
        return undefined;
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