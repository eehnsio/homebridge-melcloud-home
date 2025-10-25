import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MELCloudAPI, AirToAirUnit } from './melcloud-api';
import { MELCloudAccessory } from './accessory';

export class MELCloudHomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly accessoryInstances: Map<string, MELCloudAccessory> = new Map();
  private melcloudAPI!: MELCloudAPI;
  private refreshInterval?: NodeJS.Timeout;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', async () => {
      this.log.info('Homebridge finished launching...');
      await this.initializeAuthentication();
    });
  }

  /**
   * Debug logging helper - respects config.debug flag
   * When debug is enabled, logs at INFO level so it shows without -D flag
   */
  public debugLog(message: string, ...args: any[]) {
    if (this.config.debug) {
      this.log.info(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Initialize authentication - uses OAuth refresh token from Homebridge UI
   */
  private async initializeAuthentication() {
    const hasRefreshToken = this.config.refreshToken;

    // Refresh Token Authentication (Only method)
    if (hasRefreshToken) {
      this.log.info('🔑 Using refresh token authentication (recommended)');

      try {
        this.melcloudAPI = new MELCloudAPI({
          refreshToken: this.config.refreshToken,
          debug: this.config.debug || false,
        });

        this.log.info('✅ MELCloud API initialized successfully');
        await this.discoverDevices();
        return;
      } catch (error) {
        this.log.error('Failed to initialize with refresh token:', error);
        return;
      }
    }

    // No authentication credentials provided
    this.log.warn('⚠️  No refresh token found');
    this.log.warn('');
    this.log.warn('📝 To authenticate:');
    this.log.warn('   1. Open Homebridge Config UI');
    this.log.warn('   2. Go to Plugins → MELCloud Home');
    this.log.warn('   3. Click the Settings button (⚙️)');
    this.log.warn('   4. Click "LOGIN VIA BROWSER"');
    this.log.warn('   5. Follow the on-screen instructions');
    this.log.warn('');
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    this.log.info('Discovering MELCloud Home devices...');

    try {
      const devices = await this.melcloudAPI.getAllDevices();
      this.log.info(`Found ${devices.length} device(s)`);

      if (devices.length === 0) {
        this.log.warn('No devices found. Please check:');
        this.log.warn('  1. Your MELCloud Home account has devices configured');
        this.log.warn('  2. Your cookies are valid and not expired');
        this.log.warn('  3. Try logging in again through the plugin settings');
        return;
      }

      // Register each device
      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Update existing accessory
          this.log.info('Restoring existing accessory from cache:', device.givenDisplayName);
          existingAccessory.context.device = device;
          this.api.updatePlatformAccessories([existingAccessory]);
          const accessoryInstance = new MELCloudAccessory(this, existingAccessory);
          this.accessoryInstances.set(uuid, accessoryInstance);
        } else {
          // Create new accessory
          this.log.info('Adding new accessory:', device.givenDisplayName);
          const accessory = new this.api.platformAccessory(device.givenDisplayName, uuid);
          accessory.context.device = device;
          this.accessories.push(accessory); // Add to our array for refresh to find it!
          const accessoryInstance = new MELCloudAccessory(this, accessory);
          this.accessoryInstances.set(uuid, accessoryInstance);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }

      // Remove accessories that no longer exist
      const devicesIds = devices.map(d => d.id);
      const accessoriesToRemove = this.accessories.filter(accessory => {
        return !devicesIds.includes(accessory.context.device.id);
      });

      if (accessoriesToRemove.length > 0) {
        this.log.info(`Removing ${accessoriesToRemove.length} cached accessory(ies)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
      }

      // Start refresh interval
      this.startRefreshInterval();

    } catch (error) {
      this.log.error('Failed to discover devices. This usually means:');
      this.log.error('  1. Your cookies have expired - please login again');
      this.log.error('  2. MELCloud Home API is temporarily unavailable');
      this.log.error('  3. Network connectivity issues');

      if (error instanceof Error) {
        this.log.error('Error details:', error.message);
        if (error.message.includes('401') || error.message.includes('403')) {
          this.log.error('Authentication failed - your cookies are invalid or expired');
          this.log.error('Please login again through the plugin settings');
        } else if (error.message.includes('timeout')) {
          this.log.error('Request timed out - check your network connection');
        }
      } else {
        this.log.error('Error details:', String(error));
      }
    }
  }

  private startRefreshInterval() {
    const interval = (this.config.refreshInterval || 300) * 1000;
    this.log.info(`Starting automatic device refresh every ${interval / 1000} seconds`);

    // Test immediate execution to verify the function works
    this.log.info(`Testing immediate refresh to verify functionality...`);
    setImmediate(async () => {
      try {
        await this.refreshAllDevices();
        this.log.info(`Initial refresh completed successfully`);
      } catch (error) {
        this.log.error('Initial refresh failed:', error);
      }
    });

    // Set up the interval
    this.refreshInterval = setInterval(async () => {
      this.log.info(`[Refresh Interval] Running scheduled device refresh...`);
      try {
        await this.refreshAllDevices();
      } catch (error) {
        this.log.error('Failed to refresh devices:', error);
      }
    }, interval);

    this.log.info(`Refresh interval created with ID: ${this.refreshInterval}`);
  }

  private async refreshAllDevices() {
    this.log.info('Refreshing device states from MELCloud API...');

    try {
      const devices = await this.melcloudAPI.getAllDevices();
      this.log.info(`Received ${devices.length} devices from MELCloud API`);

      let updatedCount = 0;
      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);

        if (accessory && accessoryInstance) {
          accessory.context.device = device;
          this.api.updatePlatformAccessories([accessory]);
          // Notify the accessory instance to update its characteristics
          // (it will log if anything changed)
          accessoryInstance.updateFromDevice(device);
          updatedCount++;
        }
      }
      this.log.info(`Successfully updated ${updatedCount} of ${devices.length} devices`);
    } catch (error) {
      this.log.error('Failed to refresh devices:', error);
    }
  }

  public getAPI(): MELCloudAPI {
    return this.melcloudAPI;
  }

  public async refreshDevice(deviceId: string) {
    try {
      const devices = await this.melcloudAPI.getAllDevices();
      const device = devices.find(d => d.id === deviceId);

      if (device) {
        const uuid = this.api.hap.uuid.generate(device.id);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);

        if (accessory && accessoryInstance) {
          accessory.context.device = device;
          this.api.updatePlatformAccessories([accessory]);
          accessoryInstance.updateFromDevice(device);
        }
      }
    } catch (error) {
      this.log.debug('Failed to refresh device:', error);
    }
  }
}
