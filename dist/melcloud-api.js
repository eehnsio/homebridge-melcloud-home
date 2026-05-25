"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MELCloudAPI = void 0;
const node_https_1 = __importDefault(require("node:https"));
const auth_audit_log_1 = require("./auth-audit-log");
class MELCloudAPI {
    constructor(config) {
        // Mobile app client credentials (from captured traffic)
        // Base64 of "homemobile:" (client_id:client_secret where secret is empty)
        this.CLIENT_AUTH = 'Basic aG9tZW1vYmlsZTo=';
        this.httpsAgent = new node_https_1.default.Agent({ keepAlive: true });
        this.config = config;
        this.currentRefreshToken = config.refreshToken;
        void config.auditLog?.write({
            event: 'init',
            tokenSuffix: (0, auth_audit_log_1.maskToken)(config.refreshToken),
        });
    }
    /**
     * Check if access token is expired or about to expire
     */
    isTokenExpired() {
        if (!this.tokenExpiry) {
            return true;
        }
        // Refresh if token expires in less than 5 minutes
        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return Date.now() >= this.tokenExpiry - bufferTime;
    }
    /**
     * Refresh the access token using the refresh token
     */
    async refreshAccessToken() {
        if (!this.currentRefreshToken) {
            throw new Error('No refresh token available');
        }
        this.config.debugLog?.('[MELCloud] Refreshing access token...');
        const usedTokenSuffix = (0, auth_audit_log_1.maskToken)(this.currentRefreshToken);
        void this.config.auditLog?.write({
            event: 'refresh_attempt',
            tokenSuffix: usedTokenSuffix,
        });
        const formData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.currentRefreshToken,
        });
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'auth.melcloudhome.com',
                port: 443,
                path: '/connect/token',
                method: 'POST',
                timeout: 10000,
                agent: this.httpsAgent,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: this.CLIENT_AUTH,
                    'User-Agent': 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0',
                    'Content-Length': Buffer.byteLength(formData.toString()).toString(),
                },
            };
            const req = node_https_1.default.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', async () => {
                    if (res.statusCode !== 200) {
                        this.config.warnLog?.(`[MELCloud] Token refresh failed (HTTP ${res.statusCode}): ${body}`);
                        void this.config.auditLog?.write({
                            event: 'refresh_failure',
                            tokenSuffix: usedTokenSuffix,
                            httpStatus: res.statusCode,
                            responseBody: body.slice(0, 500),
                        });
                        reject(new Error(`Token refresh failed: HTTP ${res.statusCode}`));
                        return;
                    }
                    try {
                        const tokenResponse = JSON.parse(body);
                        if (typeof tokenResponse.access_token !== 'string' ||
                            typeof tokenResponse.refresh_token !== 'string' ||
                            typeof tokenResponse.expires_in !== 'number') {
                            void this.config.auditLog?.write({
                                event: 'refresh_failure',
                                tokenSuffix: usedTokenSuffix,
                                errorMessage: 'invalid response shape',
                                responseBody: body.slice(0, 500),
                            });
                            reject(new Error('Invalid token response: missing required fields'));
                            return;
                        }
                        const newTokenSuffix = (0, auth_audit_log_1.maskToken)(tokenResponse.refresh_token);
                        const rotated = tokenResponse.refresh_token !== this.currentRefreshToken;
                        this.accessToken = tokenResponse.access_token;
                        this.currentRefreshToken = tokenResponse.refresh_token;
                        this.tokenExpiry = Date.now() + tokenResponse.expires_in * 1000;
                        this.config.debugLog?.('[MELCloud] Access token refreshed successfully');
                        this.config.debugLog?.(`[MELCloud] Token expires in: ${tokenResponse.expires_in} seconds`);
                        void this.config.auditLog?.write({
                            event: 'refresh_success',
                            tokenSuffix: usedTokenSuffix,
                            newTokenSuffix,
                            expiresIn: tokenResponse.expires_in,
                        });
                        if (rotated) {
                            void this.config.auditLog?.write({
                                event: 'token_rotated',
                                tokenSuffix: usedTokenSuffix,
                                newTokenSuffix,
                            });
                        }
                        // Persist the rotated refresh token to disk before resolving. MELCloud already
                        // invalidated the previous token server-side as soon as it issued this one, so if
                        // the process dies before the new token reaches disk, the old disk-stored token is
                        // already useless and the user has to re-authenticate. Awaiting the persist
                        // shrinks that loss window from "until next refresh cycle" to just the duration of
                        // the atomic file write.
                        if (this.config.onTokenRefresh && tokenResponse.refresh_token !== this.config.refreshToken) {
                            this.config.debugLog?.('[MELCloud] Refresh token rotated, saving to config...');
                            void this.config.auditLog?.write({
                                event: 'persist_attempt',
                                newTokenSuffix,
                            });
                            try {
                                await this.config.onTokenRefresh(tokenResponse.refresh_token);
                                void this.config.auditLog?.write({
                                    event: 'persist_success',
                                    newTokenSuffix,
                                });
                            }
                            catch (persistError) {
                                const errMsg = persistError instanceof Error ? persistError.message : String(persistError);
                                this.config.warnLog?.(`[MELCloud] Failed to persist rotated refresh token: ${errMsg}`);
                                void this.config.auditLog?.write({
                                    event: 'persist_failure',
                                    newTokenSuffix,
                                    errorMessage: errMsg,
                                });
                                // Don't reject — token is in memory and the next refresh cycle will retry the
                                // persist with whatever the next rotation produces. Rejecting would force an
                                // immediate retry that would fail with invalid_grant.
                            }
                        }
                        resolve();
                    }
                    catch (error) {
                        reject(new Error(`Failed to parse token response: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Token refresh timeout'));
            });
            req.write(formData.toString());
            req.end();
        });
    }
    /**
     * Ensure we have a valid access token
     */
    async ensureAuthenticated() {
        if (!this.accessToken || this.isTokenExpired()) {
            if (this.refreshPromise) {
                await this.refreshPromise;
                return;
            }
            this.config.debugLog?.('[MELCloud] Access token missing or expired, refreshing...');
            this.refreshPromise = this.refreshAccessToken();
            try {
                await this.refreshPromise;
            }
            finally {
                this.refreshPromise = undefined;
            }
        }
    }
    async makeRequest(method, path, data = null, retryCount = 0) {
        // Ensure we have valid authentication
        await this.ensureAuthenticated();
        // Use mobile BFF API with Bearer token for all requests
        const hostname = 'mobile.bff.melcloudhome.com';
        const headers = {
            Accept: 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0',
        };
        try {
            return await this.executeRequest(hostname, method, path, headers, data);
        }
        catch (error) {
            // If we get 401, try to refresh token and retry once
            if (error instanceof Error && error.message.includes('HTTP 401') && retryCount === 0) {
                this.config.debugLog?.('[MELCloud] Got 401 error, forcing token refresh and retrying...');
                void this.config.auditLog?.write({
                    event: 'force_refresh_on_401',
                    tokenSuffix: (0, auth_audit_log_1.maskToken)(this.currentRefreshToken),
                    source: `${method} ${path}`,
                });
                this.accessToken = undefined; // Force refresh
                this.tokenExpiry = undefined;
                await this.ensureAuthenticated();
                return this.makeRequest(method, path, data, retryCount + 1);
            }
            // Retry on transient failures with exponential backoff
            if (retryCount < MELCloudAPI.MAX_RETRIES && this.isRetryableError(error)) {
                const delay = this.getRetryDelay(error, retryCount);
                this.config.debugLog?.(`[MELCloud] Retryable error, attempt ${retryCount + 1}/${MELCloudAPI.MAX_RETRIES}, waiting ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this.makeRequest(method, path, data, retryCount + 1);
            }
            throw error;
        }
    }
    isRetryableError(error) {
        if (!(error instanceof Error)) {
            return false;
        }
        // Check HTTP status codes
        for (const code of MELCloudAPI.RETRYABLE_STATUS_CODES) {
            if (error.message.includes(`HTTP ${code}`)) {
                return true;
            }
        }
        // Check network error codes
        for (const code of MELCloudAPI.RETRYABLE_ERROR_CODES) {
            if (error.message.includes(code)) {
                return true;
            }
        }
        return false;
    }
    getRetryDelay(error, retryCount) {
        // Respect Retry-After header (encoded in error message for 429s)
        if (error instanceof Error && error.message.includes('HTTP 429')) {
            const retryAfterMatch = error.message.match(/Retry-After: (\d+)/);
            if (retryAfterMatch) {
                return parseInt(retryAfterMatch[1], 10) * 1000;
            }
        }
        // Exponential backoff: 1s, 2s, 4s
        return 2 ** retryCount * 1000;
    }
    /**
     * Execute the actual HTTP request
     */
    executeRequest(hostname, method, path, headers, data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname,
                port: 443,
                path,
                method,
                timeout: 10000,
                agent: this.httpsAgent,
                headers,
            };
            let body;
            if (data) {
                body = JSON.stringify(data);
                options.headers = {
                    ...options.headers,
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': Buffer.byteLength(body).toString(),
                };
            }
            const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limit
            const req = node_https_1.default.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => {
                    responseBody += chunk;
                    if (responseBody.length > MAX_RESPONSE_SIZE) {
                        req.destroy();
                        reject(new Error('Response body exceeds size limit'));
                    }
                });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        const retryAfter = res.headers['retry-after'];
                        const retryInfo = retryAfter ? ` Retry-After: ${retryAfter}` : '';
                        reject(new Error(`HTTP ${res.statusCode}${retryInfo}`));
                        return;
                    }
                    try {
                        // Handle empty responses (e.g., from PUT requests that return no body)
                        if (!responseBody || responseBody.trim() === '') {
                            resolve(undefined);
                            return;
                        }
                        const response = JSON.parse(responseBody);
                        resolve(response);
                    }
                    catch (error) {
                        reject(new Error(`Failed to parse response: ${error instanceof Error ? error.message : String(error)}`));
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    /**
     * Get user context including all devices
     */
    async getUserContext() {
        this.config.debugLog?.('[MELCloud] Fetching user context...');
        return this.makeRequest('GET', '/context');
    }
    /**
     * Control a device
     */
    async controlDevice(deviceId, command) {
        this.config.debugLog?.(`[MELCloud] Controlling device ${encodeURIComponent(deviceId)}: ${JSON.stringify(command)}`);
        // Use mobile BFF API for control - /monitor endpoint matches mobile app
        await this.makeRequest('PUT', `/monitor/ataunit/${encodeURIComponent(deviceId)}`, command);
    }
    /**
     * Get all air-to-air units from all buildings
     */
    async getAllDevices() {
        const context = await this.getUserContext();
        const devices = [];
        if (!context?.buildings || !Array.isArray(context.buildings)) {
            this.config.debugLog?.('[MELCloud] Invalid context response: missing buildings array');
            return devices;
        }
        for (const building of context.buildings) {
            if (Array.isArray(building.airToAirUnits)) {
                devices.push(...building.airToAirUnits);
            }
        }
        return devices;
    }
    /**
     * Parse device settings array into an object
     */
    static parseSettings(settings) {
        const parsed = {};
        for (const setting of settings) {
            parsed[setting.name] = setting.value;
        }
        return parsed;
    }
}
exports.MELCloudAPI = MELCloudAPI;
MELCloudAPI.RETRYABLE_STATUS_CODES = [429, 500, 502, 503];
MELCloudAPI.RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
MELCloudAPI.MAX_RETRIES = 3;
//# sourceMappingURL=melcloud-api.js.map