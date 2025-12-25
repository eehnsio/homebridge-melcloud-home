import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit } from './melcloud-api';
/**
 * Vane Button - A simple switch for setting vane position (Auto or Swing)
 *
 * - ON: AC is powered on AND vane matches this button's position
 * - Setting ON: Sets vane to this position
 * - Setting OFF: Sets vane to Auto (doesn't power off AC)
 */
export declare class VaneButton {
    private readonly platform;
    private readonly accessory;
    private readonly positionKey;
    private service;
    private device;
    static readonly POSITION_NAMES: Record<string, string>;
    static readonly POSITION_API_VALUES: Record<string, string>;
    constructor(platform: MELCloudHomePlatform, accessory: PlatformAccessory, positionKey: string);
    private getApiValue;
    private getSettings;
    private isCurrentPosition;
    getOn(): Promise<CharacteristicValue>;
    setOn(value: CharacteristicValue): Promise<void>;
    private setVanePosition;
    updateFromDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=vane-button.d.ts.map