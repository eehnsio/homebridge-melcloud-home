"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MELCloudHomePlatform = void 0;
const settings_1 = require("./settings");
const melcloud_api_1 = require("./melcloud-api");
const accessory_1 = require("./accessory");
class MELCloudHomePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.accessories = [];
        this.accessoryInstances = new Map();
        this.log.debug('Finished initializing platform:', this.config.name);
        // Validate configuration
        if (!config.email || !config.password) {
            this.log.error('Missing required configuration: email and password are required');
            this.log.error('Please add your MELCloud Home credentials to the config');
            return;
        }
        // Initialize API client
        this.melcloudAPI = new melcloud_api_1.MELCloudAPI({
            email: config.email,
            password: config.password,
            debug: config.debug || false,
        });
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });
    }
    configureAccessory(accessory) {
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
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, existingAccessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                }
                else {
                    // Create new accessory
                    this.log.info('Adding new accessory:', device.givenDisplayName);
                    const accessory = new this.api.platformAccessory(device.givenDisplayName, uuid);
                    accessory.context.device = device;
                    const accessoryInstance = new accessory_1.MELCloudAccessory(this, accessory);
                    this.accessoryInstances.set(uuid, accessoryInstance);
                    this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                }
            }
            // Remove accessories that no longer exist
            const devicesIds = devices.map(d => d.id);
            const accessoriesToRemove = this.accessories.filter(accessory => {
                return !devicesIds.includes(accessory.context.device.id);
            });
            if (accessoriesToRemove.length > 0) {
                this.log.info(`Removing ${accessoriesToRemove.length} cached accessory(ies)`);
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, accessoriesToRemove);
            }
            // Start refresh interval
            this.startRefreshInterval();
        }
        catch (error) {
            this.log.error('Failed to discover devices:', error);
        }
    }
    startRefreshInterval() {
        const interval = (this.config.refreshInterval || 60) * 1000;
        this.log.debug(`Starting refresh interval: ${interval / 1000}s`);
        this.refreshInterval = setInterval(async () => {
            try {
                await this.refreshAllDevices();
            }
            catch (error) {
                this.log.error('Failed to refresh devices:', error);
            }
        }, interval);
    }
    async refreshAllDevices() {
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
        }
        catch (error) {
            this.log.error('Failed to refresh devices:', error);
        }
    }
    getAPI() {
        return this.melcloudAPI;
    }
    async refreshDevice(deviceId) {
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
        }
        catch (error) {
            this.log.debug('Failed to refresh device:', error);
        }
    }
}
exports.MELCloudHomePlatform = MELCloudHomePlatform;
//# sourceMappingURL=platform.js.map