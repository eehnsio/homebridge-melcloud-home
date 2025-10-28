import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit } from './melcloud-api';
export declare class MELCloudAccessory {
    private readonly platform;
    private readonly accessory;
    private service;
    private temperatureSensor?;
    private device;
    private refreshDebounceTimer?;
    private pendingCommandRefresh?;
    private pendingMode?;
    private heatingThreshold?;
    private coolingThreshold?;
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
    /**
     * Calculate and send midpoint temperature when in AUTO mode
     * This reconciles HomeKit's range-based UI with MELCloud's single setpoint
     */
    private updateAutoModeTemperature;
    private setTemperature;
    getRotationSpeed(): Promise<CharacteristicValue>;
    setRotationSpeed(value: CharacteristicValue): Promise<void>;
    private updateCharacteristics;
    /**
     * Schedule a debounced refresh to prevent API spam from rapid consecutive commands
     * This ensures only ONE refresh happens even if user changes multiple settings quickly
     */
    private scheduleRefresh;
    updateFromDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=accessory.d.ts.map