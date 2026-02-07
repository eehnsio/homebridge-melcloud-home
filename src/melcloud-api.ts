import https from 'https';

export interface MELCloudConfig {
  refreshToken: string;
  debug?: boolean;
  onTokenRefresh?: (newRefreshToken: string) => void;
  debugLog?: (message: string) => void;
}

export interface DeviceSetting {
  name: string;
  value: string;
}

export interface DeviceCapabilities {
  isMultiSplitSystem: boolean;
  isLegacyDevice: boolean;
  hasStandby: boolean;
  hasCoolOperationMode: boolean;
  hasHeatOperationMode: boolean;
  hasAutoOperationMode: boolean;
  hasDryOperationMode: boolean;
  hasAutomaticFanSpeed: boolean;
  hasAirDirection: boolean;
  hasSwing: boolean;
  hasExtendedTemperatureRange: boolean;
  hasEnergyConsumedMeter: boolean;
  numberOfFanSpeeds: number;
  minTempCoolDry: number;
  maxTempCoolDry: number;
  minTempHeat: number;
  maxTempHeat: number;
  minTempAutomatic: number;
  maxTempAutomatic: number;
  hasDemandSideControl: boolean;
  hasHalfDegreeIncrements: boolean;
  supportsWideVane: boolean;
}

export interface AirToAirUnit {
  id: string;
  givenDisplayName: string;
  displayIcon: string;
  settings: DeviceSetting[];
  capabilities: DeviceCapabilities;
  rssi: number;
  isConnected: boolean;
  connectedInterfaceIdentifier: string;
  systemId: string;
  isInError: boolean;
}

export interface Building {
  id: string;
  name: string;
  timezone: string;
  airToAirUnits: AirToAirUnit[];
}

export interface UserContext {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  language: string;
  country: string;
  buildings: Building[];
}

export interface DeviceCommand {
  power?: boolean | null;
  operationMode?: string | null;
  setFanSpeed?: string | null;
  vaneHorizontalDirection?: string | null;
  vaneVerticalDirection?: string | null;
  setTemperature?: number | null;
  temperatureIncrementOverride?: number | null;
  inStandbyMode?: boolean | null;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export class MELCloudAPI {
  private readonly config: MELCloudConfig;
  private accessToken?: string;
  private tokenExpiry?: number;
  private currentRefreshToken?: string;
  private refreshPromise?: Promise<void>;

  // Mobile app client credentials (from captured traffic)
  // Base64 of "homemobile:" (client_id:client_secret where secret is empty)
  private readonly CLIENT_AUTH = 'Basic aG9tZW1vYmlsZTo=';
  private readonly httpsAgent = new https.Agent({ keepAlive: true });

  constructor(config: MELCloudConfig) {
    this.config = config;
    this.currentRefreshToken = config.refreshToken;
  }


  /**
   * Check if access token is expired or about to expire
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return true;
    }
    // Refresh if token expires in less than 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() >= (this.tokenExpiry - bufferTime);
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.currentRefreshToken) {
      throw new Error('No refresh token available');
    }

    this.config.debugLog?.('[MELCloud] Refreshing access token...');

    const formData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.currentRefreshToken,
    });

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: 'auth.melcloudhome.com',
        port: 443,
        path: '/connect/token',
        method: 'POST',
        timeout: 10000,
        agent: this.httpsAgent,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': this.CLIENT_AUTH,
          'User-Agent': 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0',
          'Content-Length': Buffer.byteLength(formData.toString()).toString(),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            this.config.debugLog?.(`[MELCloud] Token refresh response body: ${body}`);
            reject(new Error(`Token refresh failed: HTTP ${res.statusCode}`));
            return;
          }

          try {
            const tokenResponse = JSON.parse(body);
            if (
              typeof tokenResponse.access_token !== 'string' ||
              typeof tokenResponse.refresh_token !== 'string' ||
              typeof tokenResponse.expires_in !== 'number'
            ) {
              reject(new Error('Invalid token response: missing required fields'));
              return;
            }
            this.accessToken = tokenResponse.access_token;
            this.currentRefreshToken = tokenResponse.refresh_token;
            this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);

            this.config.debugLog?.('[MELCloud] Access token refreshed successfully');
            this.config.debugLog?.(`[MELCloud] Token expires in: ${tokenResponse.expires_in} seconds`);

            // Notify platform if refresh token changed (for persistence)
            if (this.config.onTokenRefresh && tokenResponse.refresh_token !== this.config.refreshToken) {
              this.config.debugLog?.('[MELCloud] Refresh token rotated, saving to config...');
              this.config.onTokenRefresh(tokenResponse.refresh_token);
            }

            resolve();
          } catch (error) {
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
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || this.isTokenExpired()) {
      if (this.refreshPromise) {
        await this.refreshPromise;
        return;
      }
      this.config.debugLog?.('[MELCloud] Access token missing or expired, refreshing...');
      this.refreshPromise = this.refreshAccessToken();
      try {
        await this.refreshPromise;
      } finally {
        this.refreshPromise = undefined;
      }
    }
  }


  private static readonly RETRYABLE_STATUS_CODES = [429, 500, 502, 503];
  private static readonly RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
  private static readonly MAX_RETRIES = 3;

  private async makeRequest<T>(
    method: string,
    path: string,
    data: unknown = null,
    retryCount = 0,
  ): Promise<T> {
    // Ensure we have valid authentication
    await this.ensureAuthenticated();

    // Use mobile BFF API with Bearer token for all requests
    const hostname = 'mobile.bff.melcloudhome.com';
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'User-Agent': 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0',
    };

    try {
      return await this.executeRequest<T>(hostname, method, path, headers, data);
    } catch (error) {
      // If we get 401, try to refresh token and retry once
      if (error instanceof Error && error.message.includes('HTTP 401') && retryCount === 0) {
        this.config.debugLog?.('[MELCloud] Got 401 error, forcing token refresh and retrying...');
        this.accessToken = undefined; // Force refresh
        this.tokenExpiry = undefined;
        await this.ensureAuthenticated();
        return this.makeRequest<T>(method, path, data, retryCount + 1);
      }

      // Retry on transient failures with exponential backoff
      if (retryCount < MELCloudAPI.MAX_RETRIES && this.isRetryableError(error)) {
        const delay = this.getRetryDelay(error, retryCount);
        this.config.debugLog?.(`[MELCloud] Retryable error, attempt ${retryCount + 1}/${MELCloudAPI.MAX_RETRIES}, waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest<T>(method, path, data, retryCount + 1);
      }

      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
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

  private getRetryDelay(error: unknown, retryCount: number): number {
    // Respect Retry-After header (encoded in error message for 429s)
    if (error instanceof Error && error.message.includes('HTTP 429')) {
      const retryAfterMatch = error.message.match(/Retry-After: (\d+)/);
      if (retryAfterMatch) {
        return parseInt(retryAfterMatch[1]) * 1000;
      }
    }
    // Exponential backoff: 1s, 2s, 4s
    return Math.pow(2, retryCount) * 1000;
  }

  /**
   * Execute the actual HTTP request
   */
  private executeRequest<T>(
    hostname: string,
    method: string,
    path: string,
    headers: Record<string, string>,
    data: unknown = null,
  ): Promise<T> {

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname,
        port: 443,
        path,
        method,
        timeout: 10000,
        agent: this.httpsAgent,
        headers,
      };

      let body: string | undefined;
      if (data) {
        body = JSON.stringify(data);
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body).toString(),
        };
      }

      const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limit

      const req = https.request(options, (res) => {
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
              resolve(undefined as T);
              return;
            }
            const response = JSON.parse(responseBody);
            resolve(response);
          } catch (error) {
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
  async getUserContext(): Promise<UserContext> {
    this.config.debugLog?.('[MELCloud] Fetching user context...');
    return this.makeRequest<UserContext>('GET', '/context');
  }

  /**
   * Control a device
   */
  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    this.config.debugLog?.(`[MELCloud] Controlling device ${encodeURIComponent(deviceId)}: ${JSON.stringify(command)}`);
    // Use mobile BFF API for control - /monitor endpoint matches mobile app
    await this.makeRequest('PUT', `/monitor/ataunit/${encodeURIComponent(deviceId)}`, command);
  }

  /**
   * Get all air-to-air units from all buildings
   */
  async getAllDevices(): Promise<AirToAirUnit[]> {
    const context = await this.getUserContext();
    const devices: AirToAirUnit[] = [];

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
  static parseSettings(settings: DeviceSetting[]): Record<string, string> {
    const parsed: Record<string, string> = {};
    for (const setting of settings) {
      parsed[setting.name] = setting.value;
    }
    return parsed;
  }

}
