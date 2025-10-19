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
    configureAccessory(accessory: PlatformAccessory): void;
    discoverDevices(): Promise<void>;
    private startRefreshInterval;
    private refreshAllDevices;
    getAPI(): MELCloudAPI;
    refreshDevice(deviceId: string): Promise<void>;
}
//# sourceMappingURL=platform.d.ts.map