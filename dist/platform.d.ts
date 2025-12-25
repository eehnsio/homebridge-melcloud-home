import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { MELCloudAPI, AirToAirUnit } from './melcloud-api';
export declare class MELCloudHomePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    private readonly accessoryInstances;
    private readonly fanButtonInstances;
    private readonly vaneButtonInstances;
    private melcloudAPI;
    private refreshInterval?;
    private refreshTimeout?;
    private configManager;
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * Debug logging helper - respects config.debug flag
     * When debug is enabled, logs at INFO level so it shows without -D flag
     */
    debugLog(message: string, ...args: any[]): void;
    /**
     * Initialize authentication - uses OAuth refresh token from Homebridge UI
     */
    private initializeAuthentication;
    configureAccessory(accessory: PlatformAccessory): void;
    discoverDevices(): Promise<void>;
    private startRefreshInterval;
    private refreshAllDevices;
    getAPI(): MELCloudAPI;
    refreshDevice(deviceId: string): Promise<void>;
    /**
     * Schedule a debounced refresh of all devices
     * Called after button presses to sync state across all accessories
     */
    scheduleRefresh(): void;
    /**
     * Immediately update all fan buttons for a specific device
     * Called when a fan speed is changed to ensure mutual exclusivity
     */
    updateFanButtonsForDevice(device: AirToAirUnit): void;
    /**
     * Immediately update all vane buttons for a specific device
     * Called when vane position is changed to ensure mutual exclusivity
     */
    updateVaneButtonsForDevice(device: AirToAirUnit): void;
    /**
     * Update ALL buttons (fan + vane) for a device to keep caches in sync
     * This ensures that when one button type is pressed, all other buttons
     * have the correct device state for their next API call
     */
    updateAllButtonsForDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=platform.d.ts.map