"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MELCloudHomePlatform = void 0;
const accessory_1 = require("./accessory");
const config_manager_1 = require("./config-manager");
const fan_speed_button_1 = require("./fan-speed-button");
const melcloud_api_1 = require("./melcloud-api");
const settings_1 = require("./settings");
const vane_button_1 = require("./vane-button");
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
        this.consecutiveAuthFailures = 0;
        this.log.debug('Finished initializing platform:', this.config.name);
        // Initialize config manager for token persistence
        this.configManager = new config_manager_1.ConfigManager(this.log, this.api.user.storagePath());
        this.api.on('didFinishLaunching', async () => {
            try {
                this.debugLog('Homebridge finished launching...');
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
            this.debugLog('Using refresh token authentication');
            try {
                this.melcloudAPI = new melcloud_api_1.MELCloudAPI({
                    refreshToken: this.config.refreshToken,
                    debug: this.config.debug || false,
                    onTokenRefresh: async (newRefreshToken) => {
                        // Save the new refresh token to config when it rotates
                        this.debugLog('Refresh token rotated by MELCloud API');
                        await this.configManager.saveRefreshToken(newRefreshToken);
                    },
                    debugLog: (msg) => this.debugLog(msg),
                    warnLog: (msg) => this.log.warn(msg),
                });
                this.debugLog('MELCloud API initialized successfully');
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
        this.log.debug('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }
    async discoverDevices() {
        this.debugLog('Discovering MELCloud Home devices...');
        try {
            const devices = await this.getAPI().getAllDevices();
            if (devices.length === 0) {
                this.log.warn('No devices found. Please check:');
                this.log.warn('  1. Your MELCloud Home account has devices configured');
                this.log.warn('  2. Your cookies are valid and not expired');
                this.log.warn('  3. Try logging in again through the plugin settings');
                return;
            }
            // Register each device
            for (const device of devices) {
                // Main AC accessory — vane and fan-speed switches are now child Switch services on
                // this same accessory (with subtypes), not separate accessories. This means iOS Home
                // automatically groups them with the AC by room, and accessory settings live in one
                // place instead of N separate "Settings" pages.
                const uuid = this.api.hap.uuid.generate(device.id);
                let mainAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
                if (mainAccessory) {
                    this.debugLog('Restoring existing accessory from cache: ' + device.givenDisplayName);
                    mainAccessory.context.device = device;
                    this.api.updatePlatformAccessories([mainAccessory]);
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, mainAccessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                }
                else {
                    this.debugLog('Adding new accessory: ' + device.givenDisplayName);
                    mainAccessory = new this.api.platformAccessory(device.givenDisplayName, uuid);
                    mainAccessory.context.device = device;
                    this.accessories.push(mainAccessory);
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, mainAccessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                    this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [mainAccessory]);
                }
                // Fan Speed Buttons (if enabled) — Switch services on the main accessory
                const fanSpeedButtons = this.config.fanSpeedButtons || 'none';
                let activeFanSpeedKeys = [];
                if (fanSpeedButtons !== 'none' && device.capabilities.numberOfFanSpeeds > 0) {
                    if (fanSpeedButtons === 'simple')
                        activeFanSpeedKeys = ['auto', 'quiet', 'max'];
                    else if (fanSpeedButtons === 'all')
                        activeFanSpeedKeys = ['auto', 'quiet', '2', '3', '4', 'max'];
                    for (const speedKey of activeFanSpeedKeys) {
                        const subtype = `fan-${speedKey}`;
                        const speedName = fan_speed_button_1.FanSpeedButton.SPEED_NAMES[fan_speed_button_1.FanSpeedButton.SPEED_API_VALUES[speedKey]] || speedKey;
                        const displayName = `${device.givenDisplayName} Fan ${speedName}`;
                        let switchService = mainAccessory.getServiceById(this.Service.Switch, subtype);
                        if (!switchService) {
                            this.debugLog(`Adding Fan ${speedName} switch service: ${device.givenDisplayName}`);
                            switchService = mainAccessory.addService(this.Service.Switch, displayName, subtype);
                        }
                        const buttonInstance = new fan_speed_button_1.FanSpeedButton(this, mainAccessory, switchService, speedKey);
                        this.fanButtonInstances.set(`${uuid}-${subtype}`, buttonInstance);
                    }
                }
                // Vane Buttons (if vaneControl === 'buttons') — Switch services on the main accessory
                // Legacy config: vaneButtons === 'simple' is treated as 'buttons'.
                const vaneControl = this.config.vaneControl || this.config.vaneButtons || 'none';
                const enableVaneButtons = vaneControl === 'buttons' || vaneControl === 'simple';
                let activeVanePositions = [];
                if (enableVaneButtons) {
                    // Single Swing switch per AC: ON = Swing (oscillating), OFF = Auto (AC picks fixed
                    // position). The setter in vane-button.ts handles the OFF→Auto transition. Auto is
                    // never exposed as its own button — it would just be a "not Swing" duplicate.
                    activeVanePositions = ['swing'];
                    for (const positionKey of activeVanePositions) {
                        const subtype = `vane-${positionKey}`;
                        const positionName = vane_button_1.VaneButton.POSITION_NAMES[positionKey] || positionKey;
                        const displayName = `${device.givenDisplayName} Vane ${positionName}`;
                        let switchService = mainAccessory.getServiceById(this.Service.Switch, subtype);
                        if (!switchService) {
                            this.debugLog(`Adding Vane ${positionName} switch service: ${device.givenDisplayName}`);
                            switchService = mainAccessory.addService(this.Service.Switch, displayName, subtype);
                        }
                        const buttonInstance = new vane_button_1.VaneButton(this, mainAccessory, switchService, positionKey);
                        this.vaneButtonInstances.set(`${uuid}-${subtype}`, buttonInstance);
                    }
                }
                // Remove Switch services that no longer match the configured set (e.g. user switched
                // fanSpeedButtons from 'all' to 'simple', or disabled vane buttons entirely).
                const allowedSubtypes = new Set([
                    ...activeFanSpeedKeys.map((k) => `fan-${k}`),
                    ...activeVanePositions.map((p) => `vane-${p}`),
                ]);
                for (const svc of [...mainAccessory.services]) {
                    const subtype = svc.subtype;
                    if (subtype &&
                        (subtype.startsWith('fan-') || subtype.startsWith('vane-')) &&
                        !allowedSubtypes.has(subtype)) {
                        this.debugLog(`Removing stale switch service: ${svc.displayName} (${subtype})`);
                        mainAccessory.removeService(svc);
                    }
                }
            }
            // Remove accessories for devices that no longer exist, plus legacy standalone button
            // accessories from before the 1.6.0 refactor (now child services on the main accessory).
            const devicesIds = devices.map((d) => d.id);
            const accessoriesToRemove = this.accessories.filter((accessory) => {
                const deviceId = accessory.context.device?.id;
                // Remove if device no longer exists
                if (!deviceId || !devicesIds.includes(deviceId)) {
                    return true;
                }
                // Remove deprecated standalone accessories. As of 1.6.0, vane and fan-speed buttons
                // are child Switch services on the main AC accessory — anything standalone is legacy.
                // Older builds also had isSwingAccessory / isFanAccessory variants.
                if (accessory.context.isFanButton ||
                    accessory.context.isVaneButton ||
                    accessory.context.isVaneSlider ||
                    accessory.context.isSwingAccessory ||
                    accessory.context.isFanAccessory) {
                    this.debugLog(`Removing deprecated standalone accessory: ${accessory.displayName}`);
                    return true;
                }
                return false;
            });
            if (accessoriesToRemove.length > 0) {
                this.debugLog(`Removing ${accessoriesToRemove.length} cached accessory(ies)`);
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, accessoriesToRemove);
                // Also remove from our local array
                for (const acc of accessoriesToRemove) {
                    const index = this.accessories.indexOf(acc);
                    if (index > -1) {
                        this.accessories.splice(index, 1);
                    }
                }
            }
            // Log startup summary (the only info-level startup message)
            const interval = Math.max(10, Math.min(3600, this.config.refreshInterval || 30));
            this.log.info(`Initialized with ${devices.length} device(s), refresh interval ${interval}s`);
            // Start refresh interval
            this.startRefreshInterval();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isAuthError = /HTTP (400|401|403)/.test(message);
            if (isAuthError) {
                this.log.error('Authentication failed:', message);
                this.log.error('Please re-authenticate via Homebridge UI → Plugins → MELCloud Home → Settings → LOGIN VIA BROWSER');
            }
            else if (message.includes('timeout')) {
                this.log.error('Request timed out - check your network connection');
            }
            else {
                this.log.error('Failed to discover devices:', message);
            }
        }
    }
    startRefreshInterval() {
        const interval = Math.max(10, Math.min(3600, this.config.refreshInterval || 30)) * 1000;
        this.debugLog(`Refresh interval: ${interval / 1000}s`);
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
                    if (this.consecutiveAuthFailures > 0) {
                        this.log.info('Connection restored.');
                    }
                    this.consecutiveAuthFailures = 0;
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const isAuthError = /HTTP (400|401|403)/.test(message);
                    if (isAuthError) {
                        this.consecutiveAuthFailures++;
                        if (this.consecutiveAuthFailures === 1) {
                            this.log.error('Authentication failed:', message);
                        }
                        if (this.consecutiveAuthFailures === 3) {
                            this.log.error('Repeated authentication failures. Your refresh token is likely expired or invalid.');
                            this.log.error('Please re-authenticate via Homebridge UI → Plugins → MELCloud Home → Settings → LOGIN VIA BROWSER');
                            this.log.error('Pausing device refresh until Homebridge is restarted.');
                            return; // Stop scheduling further refreshes
                        }
                    }
                    else {
                        this.log.error('Failed to refresh devices:', message);
                    }
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
    async refreshDevice(_deviceId) {
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
        const accessory = this.accessories.find((acc) => acc.UUID === uuid);
        const accessoryInstance = this.accessoryInstances.get(uuid);
        if (accessory && accessoryInstance) {
            accessory.context.device = device;
            this.api.updatePlatformAccessories([accessory]);
            accessoryInstance.updateFromDevice(device);
        }
        // Update Fan Speed + Vane Buttons. Map keys are `${mainUuid}-fan-<key>` and
        // `${mainUuid}-vane-<key>` respectively, so we filter by prefix to find buttons that
        // belong to this device.
        const keyPrefix = `${uuid}-`;
        for (const [key, buttonInstance] of this.fanButtonInstances) {
            if (key.startsWith(keyPrefix))
                buttonInstance.updateFromDevice(device);
        }
        for (const [key, buttonInstance] of this.vaneButtonInstances) {
            if (key.startsWith(keyPrefix))
                buttonInstance.updateFromDevice(device);
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
        const keyPrefix = `${this.api.hap.uuid.generate(device.id)}-`;
        for (const [key, buttonInstance] of this.fanButtonInstances) {
            if (key.startsWith(keyPrefix))
                buttonInstance.updateFromDevice(device);
        }
    }
    /**
     * Immediately update all vane buttons for a specific device
     * Called when vane position is changed to ensure mutual exclusivity
     */
    updateVaneButtonsForDevice(device) {
        const keyPrefix = `${this.api.hap.uuid.generate(device.id)}-`;
        for (const [key, buttonInstance] of this.vaneButtonInstances) {
            if (key.startsWith(keyPrefix))
                buttonInstance.updateFromDevice(device);
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