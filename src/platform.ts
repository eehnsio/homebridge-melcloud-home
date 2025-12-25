import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MELCloudAPI, AirToAirUnit } from './melcloud-api';
import { MELCloudAccessory } from './accessory';
import { FanSpeedButton } from './fan-speed-button';
import { VaneButton } from './vane-button';
import { ConfigManager } from './config-manager';

export class MELCloudHomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly accessoryInstances: Map<string, MELCloudAccessory> = new Map();
  private readonly fanButtonInstances: Map<string, FanSpeedButton> = new Map();
  private readonly vaneButtonInstances: Map<string, VaneButton> = new Map();
  private melcloudAPI!: MELCloudAPI;
  private refreshInterval?: NodeJS.Timeout;
  private refreshTimeout?: NodeJS.Timeout;
  private configManager: ConfigManager;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // Initialize config manager for token persistence
    this.configManager = new ConfigManager(this.log, this.api.user.storagePath());

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
          onTokenRefresh: async (newRefreshToken: string) => {
            // Save the new refresh token to config when it rotates
            this.log.info('🔄 Refresh token rotated by MELCloud API');
            await this.configManager.saveRefreshToken(newRefreshToken);
          },
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
        // Main AC accessory
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

        // Fan Speed Buttons (if enabled)
        const fanSpeedButtons = this.config.fanSpeedButtons || 'none';
        if (fanSpeedButtons !== 'none' && device.capabilities.numberOfFanSpeeds > 0) {
          // Determine which speeds to create buttons for
          let speeds: string[];
          if (fanSpeedButtons === 'simple') {
            speeds = ['auto', 'quiet', 'max']; // Auto, Speed 1, Speed 5
          } else if (fanSpeedButtons === 'all') {
            speeds = ['auto', 'quiet', '2', '3', '4', 'max']; // All speeds
          } else {
            speeds = [];
          }

          for (const speedKey of speeds) {
            const buttonUuid = this.api.hap.uuid.generate(`${device.id}-fan-${speedKey}`);
            const existingButton = this.accessories.find(accessory => accessory.UUID === buttonUuid);

            const speedName = FanSpeedButton.SPEED_NAMES[FanSpeedButton.SPEED_API_VALUES[speedKey]] || speedKey;

            if (existingButton) {
              this.log.info(`Restoring Fan ${speedName} button from cache:`, device.givenDisplayName);
              existingButton.context.device = device;
              existingButton.context.speedKey = speedKey;
              this.api.updatePlatformAccessories([existingButton]);
              const buttonInstance = new FanSpeedButton(this, existingButton, speedKey);
              this.fanButtonInstances.set(buttonUuid, buttonInstance);
            } else {
              this.log.info(`Adding Fan ${speedName} button:`, device.givenDisplayName);
              const buttonAccessory = new this.api.platformAccessory(
                `${device.givenDisplayName} Fan ${speedName}`,
                buttonUuid,
              );
              buttonAccessory.context.device = device;
              buttonAccessory.context.speedKey = speedKey;
              buttonAccessory.context.isFanButton = true;
              this.accessories.push(buttonAccessory);
              const buttonInstance = new FanSpeedButton(this, buttonAccessory, speedKey);
              this.fanButtonInstances.set(buttonUuid, buttonInstance);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [buttonAccessory]);
            }
          }
        }

        // Vane Buttons (if vaneControl === 'buttons')
        // Also support legacy config: vaneButtons === 'simple'
        const vaneControl = this.config.vaneControl || this.config.vaneButtons || 'none';
        const enableVaneButtons = vaneControl === 'buttons' || vaneControl === 'simple';
        if (enableVaneButtons) {
          const positions = ['auto', 'swing']; // Auto and Swing buttons

          for (const positionKey of positions) {
            const buttonUuid = this.api.hap.uuid.generate(`${device.id}-vane-${positionKey}`);
            const existingButton = this.accessories.find(accessory => accessory.UUID === buttonUuid);

            const positionName = VaneButton.POSITION_NAMES[positionKey] || positionKey;

            if (existingButton) {
              this.log.info(`Restoring Vane ${positionName} button from cache:`, device.givenDisplayName);
              existingButton.context.device = device;
              existingButton.context.positionKey = positionKey;
              this.api.updatePlatformAccessories([existingButton]);
              const buttonInstance = new VaneButton(this, existingButton, positionKey);
              this.vaneButtonInstances.set(buttonUuid, buttonInstance);
            } else {
              this.log.info(`Adding Vane ${positionName} button:`, device.givenDisplayName);
              const buttonAccessory = new this.api.platformAccessory(
                `${device.givenDisplayName} Vane ${positionName}`,
                buttonUuid,
              );
              buttonAccessory.context.device = device;
              buttonAccessory.context.positionKey = positionKey;
              buttonAccessory.context.isVaneButton = true;
              this.accessories.push(buttonAccessory);
              const buttonInstance = new VaneButton(this, buttonAccessory, positionKey);
              this.vaneButtonInstances.set(buttonUuid, buttonInstance);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [buttonAccessory]);
            }
          }
        }
      }

      // Remove accessories that no longer exist OR are disabled by config
      const devicesIds = devices.map(d => d.id);
      const fanSpeedButtonsConfig = this.config.fanSpeedButtons || 'none';
      // Support new vaneControl and legacy vaneButtons
      const vaneControlConfig = this.config.vaneControl || this.config.vaneButtons || 'none';
      const vaneButtonsEnabled = vaneControlConfig === 'buttons' || vaneControlConfig === 'simple';

      const accessoriesToRemove = this.accessories.filter(accessory => {
        const deviceId = accessory.context.device?.id;

        // Remove if device no longer exists
        if (!deviceId || !devicesIds.includes(deviceId)) {
          return true;
        }

        // Remove old swing accessories (deprecated - replaced by vane buttons)
        if (accessory.context.isSwingAccessory) {
          this.log.info('Removing deprecated swing accessory:', accessory.displayName);
          return true;
        }

        // Remove old fan slider accessory (deprecated)
        if (accessory.context.isFanAccessory) {
          this.log.info('Removing deprecated fan slider accessory:', accessory.displayName);
          return true;
        }

        // Remove fan buttons if fanSpeedButtons is 'none'
        if (accessory.context.isFanButton && fanSpeedButtonsConfig === 'none') {
          this.log.info('Removing fan button (fanSpeedButtons=none):', accessory.displayName);
          return true;
        }

        // Remove fan buttons that don't match current config (e.g., 'all' buttons when config is 'simple')
        if (accessory.context.isFanButton && accessory.context.speedKey) {
          const configSpeeds = fanSpeedButtonsConfig === 'simple'
            ? ['auto', 'quiet', 'max']
            : fanSpeedButtonsConfig === 'all'
              ? ['auto', 'quiet', '2', '3', '4', 'max']
              : [];
          if (!configSpeeds.includes(accessory.context.speedKey)) {
            this.log.info(`Removing fan button (not in ${fanSpeedButtonsConfig}):`, accessory.displayName);
            return true;
          }
        }

        // Remove vane buttons if vaneControl is disabled
        if (accessory.context.isVaneButton && !vaneButtonsEnabled) {
          this.log.info('Removing vane button (vaneControl disabled):', accessory.displayName);
          return true;
        }

        return false;
      });

      if (accessoriesToRemove.length > 0) {
        this.log.info(`Removing ${accessoriesToRemove.length} cached accessory(ies)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
        // Also remove from our local array
        for (const acc of accessoriesToRemove) {
          const index = this.accessories.indexOf(acc);
          if (index > -1) {
            this.accessories.splice(index, 1);
          }
        }
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
    const interval = (this.config.refreshInterval || 30) * 1000;
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
        // Update main AC accessory
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

        // Update Fan Speed Buttons (if exist)
        for (const [buttonUuid, buttonInstance] of this.fanButtonInstances) {
          if (buttonUuid.includes(device.id)) {
            const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
            if (buttonAccessory) {
              buttonAccessory.context.device = device;
              this.api.updatePlatformAccessories([buttonAccessory]);
              buttonInstance.updateFromDevice(device);
            }
          }
        }

        // Update Vane Buttons (if exist)
        for (const [buttonUuid, buttonInstance] of this.vaneButtonInstances) {
          const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
          if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
            buttonAccessory.context.device = device;
            this.api.updatePlatformAccessories([buttonAccessory]);
            buttonInstance.updateFromDevice(device);
          }
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
        // Update main AC accessory
        const uuid = this.api.hap.uuid.generate(device.id);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);

        if (accessory && accessoryInstance) {
          accessory.context.device = device;
          this.api.updatePlatformAccessories([accessory]);
          accessoryInstance.updateFromDevice(device);
        }

        // Update Fan Speed Buttons (if exist)
        for (const [buttonUuid, buttonInstance] of this.fanButtonInstances) {
          if (buttonUuid.includes(device.id)) {
            const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
            if (buttonAccessory) {
              buttonAccessory.context.device = device;
              this.api.updatePlatformAccessories([buttonAccessory]);
              buttonInstance.updateFromDevice(device);
            }
          }
        }

        // Update Vane Buttons (if exist)
        for (const [buttonUuid, buttonInstance] of this.vaneButtonInstances) {
          const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
          if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
            buttonAccessory.context.device = device;
            this.api.updatePlatformAccessories([buttonAccessory]);
            buttonInstance.updateFromDevice(device);
          }
        }

      }
    } catch (error) {
      this.log.debug('Failed to refresh device:', error);
    }
  }

  /**
   * Schedule a debounced refresh of all devices
   * Called after button presses to sync state across all accessories
   */
  public scheduleRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(async () => {
      await this.refreshAllDevices();
    }, 2000);
  }

  /**
   * Immediately update all fan buttons for a specific device
   * Called when a fan speed is changed to ensure mutual exclusivity
   */
  public updateFanButtonsForDevice(device: AirToAirUnit) {
    for (const [buttonUuid, buttonInstance] of this.fanButtonInstances) {
      const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
      // Check if this button belongs to the same device by comparing device IDs in context
      if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
        buttonAccessory.context.device = device;
        buttonInstance.updateFromDevice(device);
        this.debugLog(`[${device.givenDisplayName}] Updated fan button: ${buttonAccessory.displayName}`);
      }
    }
  }

  /**
   * Immediately update all vane buttons for a specific device
   * Called when vane position is changed to ensure mutual exclusivity
   */
  public updateVaneButtonsForDevice(device: AirToAirUnit) {
    for (const [buttonUuid, buttonInstance] of this.vaneButtonInstances) {
      const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
      // Check if this button belongs to the same device by comparing device IDs in context
      if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
        buttonAccessory.context.device = device;
        buttonInstance.updateFromDevice(device);
        this.debugLog(`[${device.givenDisplayName}] Updated vane button: ${buttonAccessory.displayName}`);
      }
    }
  }

  /**
   * Update ALL buttons (fan + vane) for a device to keep caches in sync
   * This ensures that when one button type is pressed, all other buttons
   * have the correct device state for their next API call
   */
  public updateAllButtonsForDevice(device: AirToAirUnit) {
    this.updateFanButtonsForDevice(device);
    this.updateVaneButtonsForDevice(device);
  }
}
