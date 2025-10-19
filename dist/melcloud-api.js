"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MELCloudAPI = void 0;
const https_1 = __importDefault(require("https"));
class MELCloudAPI {
    constructor(config) {
        this.config = config;
        if (!config.cookieC1 || !config.cookieC2) {
            throw new Error('Must provide both cookieC1 and cookieC2');
        }
    }
    async makeRequest(method, path, data = null) {
        // Use cookies from config - trim any whitespace
        const c1 = this.config.cookieC1.trim();
        const c2 = this.config.cookieC2.trim();
        if (this.config.debug) {
            console.log('[MELCloud] Using cookies from config');
            console.log('[MELCloud] Cookie C1 length:', c1.length);
            console.log('[MELCloud] Cookie C2 length:', c2.length);
        }
        const cookieString = [
            '__Secure-monitorandcontrol=chunks-2',
            `__Secure-monitorandcontrolC1=${c1}`,
            `__Secure-monitorandcontrolC2=${c2}`,
        ].join('; ');
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'melcloudhome.com',
                port: 443,
                path,
                method,
                timeout: 10000, // 10 second timeout
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cookie': cookieString,
                    'User-Agent': 'homebridge-melcloud-home/0.2.0',
                    'DNT': '1',
                    'Origin': 'https://melcloudhome.com',
                    'Referer': 'https://melcloudhome.com/dashboard',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'X-CSRF': '1',
                },
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
            const req = https_1.default.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                        return;
                    }
                    try {
                        // Handle empty responses (e.g., from PUT requests)
                        if (!body || body.trim() === '') {
                            resolve({});
                            return;
                        }
                        const response = JSON.parse(body);
                        resolve(response);
                    }
                    catch (error) {
                        reject(new Error(`Failed to parse response: ${error}`));
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
        if (this.config.debug) {
            console.log('[MELCloud] Fetching user context...');
        }
        return this.makeRequest('GET', '/api/user/context');
    }
    /**
     * Control a device
     */
    async controlDevice(deviceId, command) {
        if (this.config.debug) {
            console.log(`[MELCloud] Controlling device ${deviceId}:`, command);
        }
        await this.makeRequest('PUT', `/api/ataunit/${deviceId}`, command);
    }
    /**
     * Get all air-to-air units from all buildings
     */
    async getAllDevices() {
        const context = await this.getUserContext();
        const devices = [];
        for (const building of context.buildings) {
            devices.push(...building.airToAirUnits);
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
//# sourceMappingURL=melcloud-api.js.map