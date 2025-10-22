import https from 'https';

export interface MELCloudConfig {
  refreshToken: string;
  debug?: boolean;
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
  private sessionValid: boolean = true;
  private lastAuthError?: Date;
  private accessToken?: string;
  private tokenExpiry?: number;
  private currentRefreshToken?: string;

  // Mobile app client credentials (from captured traffic)
  // Base64 of "homemobile:" (client_id:client_secret where secret is empty)
  private readonly CLIENT_AUTH = 'Basic aG9tZW1vYmlsZTo=';

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

    if (this.config.debug) {
      console.log('[MELCloud] Refreshing access token...');
    }

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
            this.sessionValid = false;
            this.lastAuthError = new Date();
            reject(new Error(`Token refresh failed: HTTP ${res.statusCode}: ${body}`));
            return;
          }

          try {
            const tokenResponse: TokenResponse = JSON.parse(body);
            this.accessToken = tokenResponse.access_token;
            this.currentRefreshToken = tokenResponse.refresh_token;
            this.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
            this.sessionValid = true;

            if (this.config.debug) {
              console.log('[MELCloud] ✅ Access token refreshed successfully');
              console.log('[MELCloud] Token expires in:', tokenResponse.expires_in, 'seconds');
            }

            resolve();
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error}`));
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
      if (this.config.debug) {
        console.log('[MELCloud] Access token missing or expired, refreshing...');
      }
      await this.refreshAccessToken();
    }
  }


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
        if (this.config.debug) {
          console.log('[MELCloud] Got 401 error, forcing token refresh and retrying...');
        }
        this.accessToken = undefined; // Force refresh
        this.tokenExpiry = undefined;
        await this.ensureAuthenticated();
        return this.makeRequest<T>(method, path, data, retryCount + 1);
      }
      throw error;
    }
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

      const req = https.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            if (res.statusCode === 401) {
              this.sessionValid = false;
              this.lastAuthError = new Date();
            }
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
            return;
          }

          try {
            // Handle empty responses (e.g., from PUT requests)
            if (!responseBody || responseBody.trim() === '') {
              resolve({} as T);
              return;
            }
            const response = JSON.parse(responseBody);
            resolve(response);
          } catch (error) {
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
  async getUserContext(): Promise<UserContext> {
    if (this.config.debug) {
      console.log('[MELCloud] Fetching user context...');
    }

    // Use different endpoint based on auth method
    const path = this.config.refreshToken ? '/context' : '/api/user/context';
    return this.makeRequest<UserContext>('GET', path);
  }

  /**
   * Control a device
   */
  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    if (this.config.debug) {
      console.log(`[MELCloud] Controlling device ${deviceId}:`, command);
    }
    // Use mobile BFF API for control - /monitor endpoint matches mobile app
    await this.makeRequest('PUT', `/monitor/ataunit/${deviceId}`, command);
  }

  /**
   * Get all air-to-air units from all buildings
   */
  async getAllDevices(): Promise<AirToAirUnit[]> {
    const context = await this.getUserContext();
    const devices: AirToAirUnit[] = [];

    for (const building of context.buildings) {
      devices.push(...building.airToAirUnits);
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
