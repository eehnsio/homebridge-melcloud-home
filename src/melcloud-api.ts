import https from 'https';
import { MELCloudOAuth } from './auth';

export interface MELCloudConfig {
  email: string;
  password: string;
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
  setFanSpeed?: number | null;
  vaneHorizontalDirection?: string | null;
  vaneVerticalDirection?: string | null;
  setTemperature?: number | null;
  temperatureIncrementOverride?: number | null;
  inStandbyMode?: boolean | null;
}

export class MELCloudAPI {
  private readonly config: MELCloudConfig;
  private readonly oauth: MELCloudOAuth;

  constructor(config: MELCloudConfig) {
    this.config = config;
    this.oauth = new MELCloudOAuth({
      email: config.email,
      password: config.password,
      debug: config.debug,
    });
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    data: unknown = null,
  ): Promise<T> {
    // Get fresh access token (will auto-refresh if needed)
    const accessToken = await this.oauth.getAccessToken();

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: 'melcloudhome.com',
        port: 443,
        path,
        method,
        timeout: 10000, // 10 second timeout
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'homebridge-melcloud-home/0.1.0',
          'DNT': '1',
          'Origin': 'https://melcloudhome.com',
          'Referer': 'https://melcloudhome.com/dashboard',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-CSRF': '1',
        },
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
              resolve({} as T);
              return;
            }
            const response = JSON.parse(body);
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
    return this.makeRequest<UserContext>('GET', '/api/user/context');
  }

  /**
   * Control a device
   */
  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    if (this.config.debug) {
      console.log(`[MELCloud] Controlling device ${deviceId}:`, command);
    }
    await this.makeRequest('PUT', `/api/ataunit/${deviceId}`, command);
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
