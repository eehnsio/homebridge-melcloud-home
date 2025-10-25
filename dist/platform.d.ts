import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { MELCloudAPI } from './melcloud-api';
export declare class MELCloudHomePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    private readonly accessoryInstances;
    private melcloudAPI;
    private refreshInterval?;
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
}
//# sourceMappingURL=platform.d.ts.map