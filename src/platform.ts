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

    // Validate configuration
    if (!config.email || !config.password) {
      this.log.error('Missing required configuration: email and password are required');
      this.log.error('Please add your MELCloud Home credentials to the config');
      return;
    }

    // Initialize API client
    this.melcloudAPI = new MELCloudAPI({
      email: config.email,
      password: config.password,
      debug: config.debug || false,
    });

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
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
      this.log.error('Failed to discover devices:', error);
    }
  }

  private startRefreshInterval() {
    const interval = (this.config.refreshInterval || 60) * 1000;
    this.log.debug(`Starting refresh interval: ${interval / 1000}s`);

    this.refreshInterval = setInterval(async () => {
      try {
        await this.refreshAllDevices();
      } catch (error) {
        this.log.error('Failed to refresh devices:', error);
      }
    }, interval);
  }

  private async refreshAllDevices() {
    this.log.debug('Refreshing device states...');

    try {
      const devices = await this.melcloudAPI.getAllDevices();

      for (const device of devices) {
        const uuid = this.api.hap.uuid.generate(device.id);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);

        if (accessory && accessoryInstance) {
          accessory.context.device = device;
          this.api.updatePlatformAccessories([accessory]);
          // Notify the accessory instance to update its characteristics
          accessoryInstance.updateFromDevice(device);
        }
      }
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
