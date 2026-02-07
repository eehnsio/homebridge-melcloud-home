"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaneButton = void 0;
const melcloud_api_1 = require("./melcloud-api");
/**
 * Vane Button - A simple switch for setting vane position (Auto or Swing)
 *
 * - ON: AC is powered on AND vane matches this button's position
 * - Setting ON: Sets vane to this position
 * - Setting OFF: Sets vane to Auto (doesn't power off AC)
 */
class VaneButton {
    constructor(platform, accessory, positionKey) {
        this.platform = platform;
        this.accessory = accessory;
        this.positionKey = positionKey;
        this.device = accessory.context.device;
        const positionName = VaneButton.POSITION_NAMES[this.positionKey] || this.positionKey;
        // Set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mitsubishi Electric')
            .setCharacteristic(this.platform.Characteristic.Model, 'MELCloud Vane Button')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.device.connectedInterfaceIdentifier}-vane-${positionKey}`);
        // Get or create the Switch service
        this.service = this.accessory.getService(this.platform.Service.Switch) ||
            this.accessory.addService(this.platform.Service.Switch);
        this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.device.givenDisplayName} Vane ${positionName}`);
        // On/Off control
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getOn.bind(this))
            .onSet(this.setOn.bind(this));
    }
    getApiValue() {
        return VaneButton.POSITION_API_VALUES[this.positionKey] || 'Auto';
    }
    getSettings() {
        return melcloud_api_1.MELCloudAPI.parseSettings(this.device.settings);
    }
    isCurrentPosition() {
        const settings = this.getSettings();
        const currentVane = settings.VaneVerticalDirection;
        const targetApiValue = this.getApiValue();
        // Normalize for comparison (handle both text and numeric formats)
        const normalizeVane = (v) => {
            if (v === '0' || v === 'Auto')
                return 'Auto';
            if (v === '6' || v === 'Six' || v === '7' || v === 'Swing')
                return 'Swing';
            return v;
        };
        return normalizeVane(currentVane) === normalizeVane(targetApiValue);
    }
    async getOn() {
        const settings = this.getSettings();
        const isPowerOn = settings.Power === 'True';
        const isThisPosition = this.isCurrentPosition();
        const isOn = isPowerOn && isThisPosition;
        this.platform.debugLog(`[${this.device.givenDisplayName} Vane ${VaneButton.POSITION_NAMES[this.positionKey]}] Get On: ${isOn} (power=${isPowerOn}, vane=${settings.VaneVerticalDirection})`);
        return isOn;
    }
    async setOn(value) {
        const turnOn = value;
        const positionName = VaneButton.POSITION_NAMES[this.positionKey] || this.positionKey;
        this.platform.log.info(`[${this.device.givenDisplayName} Vane ${positionName}] Set On: ${turnOn}`);
        if (!turnOn) {
            // When turning OFF this button, set vane to Auto (don't power off AC)
            // But only if this position is currently active
            if (this.isCurrentPosition() && this.positionKey !== 'auto') {
                await this.setVanePosition('Auto', false);
            }
            return;
        }
        // When turning ON, set this vane position
        await this.setVanePosition(this.getApiValue(), true);
    }
    async setVanePosition(vaneDirection, forcePowerOn) {
        const settings = this.getSettings();
        const power = forcePowerOn ? true : settings.Power === 'True';
        this.platform.log.info(`[${this.device.givenDisplayName} Vane] Sending API command: vaneVerticalDirection=${vaneDirection}`);
        try {
            await this.platform.getAPI().controlDevice(this.device.id, {
                power,
                operationMode: settings.OperationMode,
                setFanSpeed: settings.SetFanSpeed,
                vaneHorizontalDirection: settings.VaneHorizontalDirection,
                vaneVerticalDirection: vaneDirection,
                setTemperature: parseFloat(settings.SetTemperature),
                temperatureIncrementOverride: null,
                inStandbyMode: null,
            });
            // Update cached state
            const updatedSettings = this.device.settings.map(setting => {
                if (setting.name === 'VaneVerticalDirection') {
                    return { ...setting, value: vaneDirection };
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
            this.platform.log.error(`[${this.device.givenDisplayName} Vane] Failed to set position:`, error instanceof Error ? error.message : String(error));
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    // Update from device state (called by platform refresh)
    updateFromDevice(device) {
        this.device = device;
        this.accessory.context.device = device;
        const settings = this.getSettings();
        const isPowerOn = settings.Power === 'True';
        const isThisPosition = this.isCurrentPosition();
        const shouldBeOn = isPowerOn && isThisPosition;
        const currentValue = this.service.getCharacteristic(this.platform.Characteristic.On).value;
        if (shouldBeOn !== currentValue) {
            this.platform.debugLog(`[${this.device.givenDisplayName} Vane ${VaneButton.POSITION_NAMES[this.positionKey]}] Update: ${currentValue} -> ${shouldBeOn}`);
            this.service.updateCharacteristic(this.platform.Characteristic.On, shouldBeOn);
        }
    }
}
exports.VaneButton = VaneButton;
// Vane position mapping
VaneButton.POSITION_NAMES = {
    'auto': 'Auto',
    'swing': 'Swing',
};
// API values for each position
VaneButton.POSITION_API_VALUES = {
    'auto': 'Auto',
    'swing': 'Swing', // Position 7 = Swing mode (oscillating)
};
//# sourceMappingURL=vane-button.js.map