"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MELCloudHomePlatform = void 0;
const settings_1 = require("./settings");
const melcloud_api_1 = require("./melcloud-api");
const accessory_1 = require("./accessory");
const fan_speed_button_1 = require("./fan-speed-button");
const vane_button_1 = require("./vane-button");
const config_manager_1 = require("./config-manager");
class MELCloudHomePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.accessories = [];
        this.accessoryInstances = new Map();
        this.fanButtonInstances = new Map();
        this.vaneButtonInstances = new Map();
        this.log.debug('Finished initializing platform:', this.config.name);
        // Initialize config manager for token persistence
        this.configManager = new config_manager_1.ConfigManager(this.log, this.api.user.storagePath());
        this.api.on('didFinishLaunching', async () => {
            try {
                this.log.info('Homebridge finished launching...');
                await this.initializeAuthentication();
            }
            catch (error) {
                this.log.error('Failed during initialization:', error instanceof Error ? error.message : String(error));
            }
        });
        this.api.on('shutdown', () => {
            if (this.refreshInterval) {
                clearTimeout(this.refreshInterval);
                this.refreshInterval = undefined;
            }
            if (this.refreshTimeout) {
                clearTimeout(this.refreshTimeout);
                this.refreshTimeout = undefined;
            }
        });
    }
    /**
     * Debug logging helper - respects config.debug flag
     * When debug is enabled, logs at INFO level so it shows without -D flag
     */
    debugLog(message, ...args) {
        if (this.config.debug) {
            this.log.info(`[DEBUG] ${message}`, ...args);
        }
    }
    /**
     * Initialize authentication - uses OAuth refresh token from Homebridge UI
     */
    async initializeAuthentication() {
        const hasRefreshToken = this.config.refreshToken;
        // Refresh Token Authentication (Only method)
        if (hasRefreshToken) {
            this.log.info('🔑 Using refresh token authentication (recommended)');
            try {
                this.melcloudAPI = new melcloud_api_1.MELCloudAPI({
                    refreshToken: this.config.refreshToken,
                    debug: this.config.debug || false,
                    onTokenRefresh: async (newRefreshToken) => {
                        // Save the new refresh token to config when it rotates
                        this.log.info('🔄 Refresh token rotated by MELCloud API');
                        await this.configManager.saveRefreshToken(newRefreshToken);
                    },
                    debugLog: (msg) => this.debugLog(msg),
                });
                this.log.info('✅ MELCloud API initialized successfully');
                await this.discoverDevices();
                return;
            }
            catch (error) {
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
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        this.log.info('Discovering MELCloud Home devices...');
        try {
            const devices = await this.getAPI().getAllDevices();
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
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, existingAccessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                }
                else {
                    // Create new accessory
                    this.log.info('Adding new accessory:', device.givenDisplayName);
                    const accessory = new this.api.platformAccessory(device.givenDisplayName, uuid);
                    accessory.context.device = device;
                    this.accessories.push(accessory); // Add to our array for refresh to find it!
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, accessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                    this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                }
                // Fan Speed Buttons (if enabled)
                const fanSpeedButtons = this.config.fanSpeedButtons || 'none';
                if (fanSpeedButtons !== 'none' && device.capabilities.numberOfFanSpeeds > 0) {
                    // Determine which speeds to create buttons for
                    let speeds;
                    if (fanSpeedButtons === 'simple') {
                        speeds = ['auto', 'quiet', 'max']; // Auto, Speed 1, Speed 5
                    }
                    else if (fanSpeedButtons === 'all') {
                        speeds = ['auto', 'quiet', '2', '3', '4', 'max']; // All speeds
                    }
                    else {
                        speeds = [];
                    }
                    for (const speedKey of speeds) {
                        const buttonUuid = this.api.hap.uuid.generate(`${device.id}-fan-${speedKey}`);
                        const existingButton = this.accessories.find(accessory => accessory.UUID === buttonUuid);
                        const speedName = fan_speed_button_1.FanSpeedButton.SPEED_NAMES[fan_speed_button_1.FanSpeedButton.SPEED_API_VALUES[speedKey]] || speedKey;
                        if (existingButton) {
                            this.log.info(`Restoring Fan ${speedName} button from cache:`, device.givenDisplayName);
                            existingButton.context.device = device;
                            existingButton.context.speedKey = speedKey;
                            this.api.updatePlatformAccessories([existingButton]);
                            const buttonInstance = new fan_speed_button_1.FanSpeedButton(this, existingButton, speedKey);
                            this.fanButtonInstances.set(buttonUuid, buttonInstance);
                        }
                        else {
                            this.log.info(`Adding Fan ${speedName} button:`, device.givenDisplayName);
                            const buttonAccessory = new this.api.platformAccessory(`${device.givenDisplayName} Fan ${speedName}`, buttonUuid);
                            buttonAccessory.context.device = device;
                            buttonAccessory.context.speedKey = speedKey;
                            buttonAccessory.context.isFanButton = true;
                            this.accessories.push(buttonAccessory);
                            const buttonInstance = new fan_speed_button_1.FanSpeedButton(this, buttonAccessory, speedKey);
                            this.fanButtonInstances.set(buttonUuid, buttonInstance);
                            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [buttonAccessory]);
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
                        const positionName = vane_button_1.VaneButton.POSITION_NAMES[positionKey] || positionKey;
                        if (existingButton) {
                            this.log.info(`Restoring Vane ${positionName} button from cache:`, device.givenDisplayName);
                            existingButton.context.device = device;
                            existingButton.context.positionKey = positionKey;
                            this.api.updatePlatformAccessories([existingButton]);
                            const buttonInstance = new vane_button_1.VaneButton(this, existingButton, positionKey);
                            this.vaneButtonInstances.set(buttonUuid, buttonInstance);
                        }
                        else {
                            this.log.info(`Adding Vane ${positionName} button:`, device.givenDisplayName);
                            const buttonAccessory = new this.api.platformAccessory(`${device.givenDisplayName} Vane ${positionName}`, buttonUuid);
                            buttonAccessory.context.device = device;
                            buttonAccessory.context.positionKey = positionKey;
                            buttonAccessory.context.isVaneButton = true;
                            this.accessories.push(buttonAccessory);
                            const buttonInstance = new vane_button_1.VaneButton(this, buttonAccessory, positionKey);
                            this.vaneButtonInstances.set(buttonUuid, buttonInstance);
                            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [buttonAccessory]);
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
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, accessoriesToRemove);
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
        }
        catch (error) {
            this.log.error('Failed to discover devices. This usually means:');
            this.log.error('  1. Your cookies have expired - please login again');
            this.log.error('  2. MELCloud Home API is temporarily unavailable');
            this.log.error('  3. Network connectivity issues');
            if (error instanceof Error) {
                this.log.error('Error details:', error.message);
                if (error.message.includes('401') || error.message.includes('403')) {
                    this.log.error('Authentication failed - your cookies are invalid or expired');
                    this.log.error('Please login again through the plugin settings');
                }
                else if (error.message.includes('timeout')) {
                    this.log.error('Request timed out - check your network connection');
                }
            }
            else {
                this.log.error('Error details:', String(error));
            }
        }
    }
    startRefreshInterval() {
        const interval = Math.max(10, Math.min(3600, this.config.refreshInterval || 30)) * 1000;
        this.log.info(`Refresh interval: ${interval / 1000}s`);
        // Initial refresh to sync state
        setImmediate(async () => {
            try {
                await this.refreshAllDevices();
            }
            catch (error) {
                this.log.error('Initial refresh failed:', error instanceof Error ? error.message : String(error));
            }
        });
        // Self-rescheduling refresh to prevent overlapping cycles
        const scheduleNext = () => {
            this.refreshInterval = setTimeout(async () => {
                this.debugLog('Refresh cycle starting...');
                try {
                    await this.refreshAllDevices();
                }
                catch (error) {
                    this.log.error('Failed to refresh devices:', error instanceof Error ? error.message : String(error));
                }
                scheduleNext();
            }, interval);
        };
        scheduleNext();
    }
    async refreshAllDevices() {
        try {
            const devices = await this.getAPI().getAllDevices();
            this.debugLog(`Refreshing ${devices.length} devices...`);
            for (const device of devices) {
                this.updateDeviceAccessories(device);
            }
        }
        catch (error) {
            this.log.error('Failed to refresh devices:', error);
        }
    }
    getAPI() {
        if (!this.melcloudAPI) {
            throw new Error('MELCloud API not initialized - ensure authentication completed successfully');
        }
        return this.melcloudAPI;
    }
    async refreshDevice(deviceId) {
        try {
            const devices = await this.getAPI().getAllDevices();
            // Update all device accessories from the same response to avoid redundant API calls
            for (const device of devices) {
                this.updateDeviceAccessories(device);
            }
        }
        catch (error) {
            this.log.debug('Failed to refresh device:', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * Update all accessories (main AC, fan buttons, vane buttons) for a single device
     */
    updateDeviceAccessories(device) {
        // Update main AC accessory
        const uuid = this.api.hap.uuid.generate(device.id);
        const accessory = this.accessories.find(acc => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);
        if (accessory && accessoryInstance) {
            accessory.context.device = device;
            this.api.updatePlatformAccessories([accessory]);
            accessoryInstance.updateFromDevice(device);
        }
        // Update Fan Speed Buttons
        for (const [buttonUuid, buttonInstance] of this.fanButtonInstances) {
            const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
            if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
                buttonAccessory.context.device = device;
                this.api.updatePlatformAccessories([buttonAccessory]);
                buttonInstance.updateFromDevice(device);
            }
        }
        // Update Vane Buttons
        for (const [buttonUuid, buttonInstance] of this.vaneButtonInstances) {
            const buttonAccessory = this.accessories.find(acc => acc.UUID === buttonUuid);
            if (buttonAccessory && buttonAccessory.context.device?.id === device.id) {
                buttonAccessory.context.device = device;
                this.api.updatePlatformAccessories([buttonAccessory]);
                buttonInstance.updateFromDevice(device);
            }
        }
    }
    /**
     * Schedule a debounced refresh of all devices
     * Called after button presses to sync state across all accessories
     */
    scheduleRefresh() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(async () => {
            try {
                await this.refreshAllDevices();
            }
            catch (error) {
                this.log.error('Scheduled refresh failed:', error instanceof Error ? error.message : String(error));
            }
        }, 2000);
    }
    /**
     * Immediately update all fan buttons for a specific device
     * Called when a fan speed is changed to ensure mutual exclusivity
     */
    updateFanButtonsForDevice(device) {
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
    updateVaneButtonsForDevice(device) {
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
    updateAllButtonsForDevice(device) {
        this.updateFanButtonsForDevice(device);
        this.updateVaneButtonsForDevice(device);
    }
}
exports.MELCloudHomePlatform = MELCloudHomePlatform;
//# sourceMappingURL=platform.js.map