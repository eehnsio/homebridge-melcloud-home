import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit } from './melcloud-api';
/**
 * Fan Speed Button - A simple switch for setting a specific fan speed
 *
 * - ON: AC is powered on AND fan speed matches this button's speed
 * - Setting ON: Sets fan speed to this value (powers on AC if off)
 * - Setting OFF: Sets fan speed to Auto (doesn't power off AC)
 *
 * NOTE: The `device` reference is shared across all accessories (main AC,
 * fan buttons, vane buttons) for the same physical device. Mutations to
 * `device.settings` are visible to all accessories immediately, which is
 * intentional for keeping cached state in sync without extra API calls.
 */
export declare class FanSpeedButton {
    private readonly platform;
    private readonly accessory;
    private readonly speedKey;
    private service;
    private device;
    static readonly SPEED_NAMES: Record<string, string>;
    static readonly SPEED_API_VALUES: Record<string, string>;
    constructor(platform: MELCloudHomePlatform, accessory: PlatformAccessory, speedKey: string);
    private getSpeedDisplayName;
    private getApiValue;
    private getSettings;
    private isCurrentSpeed;
    getOn(): Promise<CharacteristicValue>;
    setOn(value: CharacteristicValue): Promise<void>;
    private setFanSpeed;
    updateFromDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=fan-speed-button.d.ts.map