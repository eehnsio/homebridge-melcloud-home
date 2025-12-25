"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FanSpeedButton = void 0;
const melcloud_api_1 = require("./melcloud-api");
/**
 * Fan Speed Button - A simple switch for setting a specific fan speed
 *
 * - ON: AC is powered on AND fan speed matches this button's speed
 * - Setting ON: Sets fan speed to this value (powers on AC if off)
 * - Setting OFF: Sets fan speed to Auto (doesn't power off AC)
 */
class FanSpeedButton {
    constructor(platform, accessory, speedKey) {
        this.platform = platform;
        this.accessory = accessory;
        this.speedKey = speedKey;
        this.device = accessory.context.device;
        const speedName = this.getSpeedDisplayName();
        // Set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mitsubishi Electric')
            .setCharacteristic(this.platform.Characteristic.Model, 'MELCloud Fan Button')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.device.connectedInterfaceIdentifier}-fan-${speedKey}`);
        // Get or create the Switch service
        this.service = this.accessory.getService(this.platform.Service.Switch) ||
            this.accessory.addService(this.platform.Service.Switch);
        this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.device.givenDisplayName} Fan ${speedName}`);
        // On/Off control
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getOn.bind(this))
            .onSet(this.setOn.bind(this));
    }
    getSpeedDisplayName() {
        const apiValue = FanSpeedButton.SPEED_API_VALUES[this.speedKey];
        return FanSpeedButton.SPEED_NAMES[apiValue] || this.speedKey;
    }
    getApiValue() {
        return FanSpeedButton.SPEED_API_VALUES[this.speedKey] || 'Auto';
    }
    getSettings() {
        return melcloud_api_1.MELCloudAPI.parseSettings(this.device.settings);
    }
    isCurrentSpeed() {
        const settings = this.getSettings();
        const currentSpeed = settings.SetFanSpeed;
        const targetApiValue = this.getApiValue();
        // Match both text and numeric forms
        const normalizedCurrent = FanSpeedButton.SPEED_NAMES[currentSpeed] || currentSpeed;
        const normalizedTarget = FanSpeedButton.SPEED_NAMES[targetApiValue] || targetApiValue;
        return normalizedCurrent === normalizedTarget;
    }
    async getOn() {
        const settings = this.getSettings();
        const isPowerOn = settings.Power === 'True';
        const isThisSpeed = this.isCurrentSpeed();
        const isOn = isPowerOn && isThisSpeed;
        this.platform.debugLog(`[${this.device.givenDisplayName} Fan ${this.getSpeedDisplayName()}] Get On: ${isOn} (power=${isPowerOn}, speed=${settings.SetFanSpeed})`);
        return isOn;
    }
    async setOn(value) {
        const turnOn = value;
        const speedName = this.getSpeedDisplayName();
        this.platform.log.info(`[${this.device.givenDisplayName} Fan ${speedName}] Set On: ${turnOn}`);
        if (!turnOn) {
            // When turning OFF this button, set fan to Auto (don't power off AC)
            // But only if this speed is currently active
            if (this.isCurrentSpeed()) {
                await this.setFanSpeed('Auto');
            }
            return;
        }
        // When turning ON, set this fan speed
        await this.setFanSpeed(this.getApiValue());
    }
    async setFanSpeed(fanSpeed) {
        const settings = this.getSettings();
        this.platform.debugLog(`[${this.device.givenDisplayName} Fan] Setting fan=${fanSpeed}, preserving vane=${settings.VaneVerticalDirection}`);
        try {
            await this.platform.getAPI().controlDevice(this.device.id, {
                power: true, // Always power on when setting fan speed
                operationMode: settings.OperationMode,
                setFanSpeed: fanSpeed,
                vaneHorizontalDirection: settings.VaneHorizontalDirection,
                vaneVerticalDirection: settings.VaneVerticalDirection,
                setTemperature: parseFloat(settings.SetTemperature),
                temperatureIncrementOverride: null,
                inStandbyMode: null,
            });
            // Update cached state
            const updatedSettings = this.device.settings.map(setting => {
                if (setting.name === 'SetFanSpeed') {
                    return { ...setting, value: fanSpeed };
                }
                if (setting.name === 'Power') {
                    return { ...setting, value: 'True' };
                }
                return setting;
            });
            this.device.settings = updatedSettings;
            // Immediately update ALL buttons (fan + vane) so they have correct cached state
            this.platform.updateAllButtonsForDevice(this.device);
            // Also schedule a full refresh to sync with API
            this.platform.scheduleRefresh();
        }
        catch (error) {
            this.platform.log.error(`[${this.device.givenDisplayName} Fan] Failed to set speed:`, error);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    // Update from device state (called by platform refresh)
    updateFromDevice(device) {
        this.device = device;
        this.accessory.context.device = device;
        const settings = this.getSettings();
        const isPowerOn = settings.Power === 'True';
        const isThisSpeed = this.isCurrentSpeed();
        const shouldBeOn = isPowerOn && isThisSpeed;
        const currentValue = this.service.getCharacteristic(this.platform.Characteristic.On).value;
        if (shouldBeOn !== currentValue) {
            this.platform.debugLog(`[${this.device.givenDisplayName} Fan ${this.getSpeedDisplayName()}] Update: ${currentValue} -> ${shouldBeOn}`);
            this.service.updateCharacteristic(this.platform.Characteristic.On, shouldBeOn);
        }
    }
}
exports.FanSpeedButton = FanSpeedButton;
// Fan speed mapping: API value -> display name
FanSpeedButton.SPEED_NAMES = {
    'Auto': 'Auto',
    '0': 'Auto',
    'One': 'Quiet',
    '1': 'Quiet',
    'Two': '2',
    '2': '2',
    'Three': '3',
    '3': '3',
    'Four': '4',
    '4': '4',
    'Five': 'Max',
    '5': 'Max',
};
// API values for each speed
FanSpeedButton.SPEED_API_VALUES = {
    'auto': 'Auto',
    'quiet': 'One',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    'max': 'Five',
    '5': 'Five',
};
//# sourceMappingURL=fan-speed-button.js.map