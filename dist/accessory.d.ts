import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit } from './melcloud-api';
export declare class MELCloudAccessory {
    private readonly platform;
    private readonly accessory;
    private service;
    private device;
    constructor(platform: MELCloudHomePlatform, accessory: PlatformAccessory);
    private getSettings;
    getActive(): Promise<CharacteristicValue>;
    setActive(value: CharacteristicValue): Promise<void>;
    getCurrentState(): Promise<CharacteristicValue>;
    getTargetState(): Promise<CharacteristicValue>;
    setTargetState(value: CharacteristicValue): Promise<void>;
    getCurrentTemperature(): Promise<CharacteristicValue>;
    getCoolingThresholdTemperature(): Promise<CharacteristicValue>;
    setCoolingThresholdTemperature(value: CharacteristicValue): Promise<void>;
    getHeatingThresholdTemperature(): Promise<CharacteristicValue>;
    setHeatingThresholdTemperature(value: CharacteristicValue): Promise<void>;
    private setTemperature;
    getRotationSpeed(): Promise<CharacteristicValue>;
    setRotationSpeed(value: CharacteristicValue): Promise<void>;
    private updateCharacteristics;
    updateFromDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=accessory.d.ts.map