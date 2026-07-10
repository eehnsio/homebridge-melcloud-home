import type { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { type AirToAirUnit } from './melcloud-api';
import type { MELCloudHomePlatform } from './platform';
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
    /**
     * Wrap a synchronous onGet reader. Returns cached state normally, but throws a
     * (per-read, self-clearing) HapStatusError once the cloud connection is genuinely
     * dead — the auth circuit breaker tripped — so HomeKit shows an honest "Not
     * Responding" instead of stale state. This is the ONE sanctioned place onGet may
     * throw: it is tightly gated on the tripped breaker and clears on the next valid
     * read after recovery/restart. The reader itself must still never throw (it returns
     * a safe default), so the only throw path is the deliberate connection-dead one.
     */
    private guardRead;
    setActive(value: CharacteristicValue): Promise<void>;
    private getActive;
    private getCurrentState;
    private getTargetState;
    private getCurrentTemp;
    private getCoolingThreshold;
    private getHeatingThreshold;
    private getRotationSpeed;
    /**
     * Compute current heater/cooler state from device settings
     */
    private computeCurrentState;
    /**
     * Compute target heater/cooler state from device settings
     */
    private computeTargetState;
    setTargetState(value: CharacteristicValue): Promise<void>;
    setCoolingThresholdTemperature(value: CharacteristicValue): Promise<void>;
    setHeatingThresholdTemperature(value: CharacteristicValue): Promise<void>;
    /**
     * Calculate and send midpoint temperature when in AUTO mode
     * This reconciles HomeKit's range-based UI with MELCloud's single setpoint
     */
    private updateAutoModeTemperature;
    private setTemperature;
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