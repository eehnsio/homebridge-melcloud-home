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
    constructor(platform, accessory, service, positionKey) {
        this.platform = platform;
        this.accessory = accessory;
        this.positionKey = positionKey;
        this.device = accessory.context.device;
        this.service = service;
        // Service display name + On characteristic
        const positionName = VaneButton.POSITION_NAMES[this.positionKey] || this.positionKey;
        this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.device.givenDisplayName} Vane ${positionName}`);
        this.service
            .getCharacteristic(this.platform.Characteristic.On)
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
        // Normalize for comparison — MELCloud occasionally returns numeric strings instead
        // of the canonical text values, especially for Auto/Swing edge cases.
        const normalizeVane = (v) => {
            const numericMap = {
                '0': 'Auto',
                '1': 'One',
                '2': 'Two',
                '3': 'Three',
                '4': 'Four',
                '5': 'Five',
                '6': 'Swing',
                '7': 'Swing',
                Six: 'Swing',
            };
            return numericMap[v] || v;
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
        this.platform.debugLog(`[${this.device.givenDisplayName} Vane ${positionName}] Set On: ${turnOn}`);
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
        this.platform.debugLog(`[${this.device.givenDisplayName} Vane] Sending API command: vaneVerticalDirection=${vaneDirection}`);
        try {
            // MELCloud expects ONLY the fields being changed, with the rest left out (or null).
            // Sending the full state every time appears to reset the AC's vane-motor state
            // without re-engaging physical oscillation, which is why pressing Swing in HomeKit
            // sets VaneVerticalDirection=Swing on the server but the AC doesn't physically
            // move — while the IR remote (which sends only the vane field) does work.
            await this.platform.getAPI().controlDevice(this.device.id, {
                // Only force power=true if we're turning a button ON (matches the previous behaviour
                // of waking the AC if it was off). Otherwise leave power untouched.
                ...(forcePowerOn ? { power: true } : {}),
                vaneVerticalDirection: vaneDirection,
            });
            // Update cached state
            const updatedSettings = this.device.settings.map((setting) => {
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
    // Whether this button should read as ON: AC powered on AND its vane position is the active one.
    computeShouldBeOn() {
        return this.getSettings().Power === 'True' && this.isCurrentPosition();
    }
    // Update from device state (called by platform refresh)
    updateFromDevice(device) {
        this.device = device;
        this.accessory.context.device = device;
        const shouldBeOn = this.computeShouldBeOn();
        const currentValue = this.service.getCharacteristic(this.platform.Characteristic.On).value;
        if (shouldBeOn !== currentValue) {
            this.platform.debugLog(`[${this.device.givenDisplayName} Vane ${VaneButton.POSITION_NAMES[this.positionKey]}] Update: ${currentValue} -> ${shouldBeOn}`);
            this.service.updateCharacteristic(this.platform.Characteristic.On, shouldBeOn);
        }
    }
}
exports.VaneButton = VaneButton;
// Vane position mapping (display names shown in HomeKit)
VaneButton.POSITION_NAMES = {
    auto: 'Auto',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    swing: 'Swing',
};
// API values for each position (what MELCloud expects in vaneVerticalDirection)
VaneButton.POSITION_API_VALUES = {
    auto: 'Auto',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    '5': 'Five',
    swing: 'Swing',
};
//# sourceMappingURL=vane-button.js.map