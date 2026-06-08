import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { type AirToAirUnit, MELCloudAPI } from './melcloud-api';
import type { MELCloudHomePlatform } from './platform';

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
export class FanSpeedButton {
  private service: Service;
  private device: AirToAirUnit;

  // Fan speed mapping: API value -> display name
  static readonly SPEED_NAMES: Record<string, string> = {
    Auto: 'Auto',
    '0': 'Auto',
    One: 'Quiet',
    '1': 'Quiet',
    Two: '2',
    '2': '2',
    Three: '3',
    '3': '3',
    Four: '4',
    '4': '4',
    Five: 'Max',
    '5': 'Max',
  };

  // API values for each speed
  static readonly SPEED_API_VALUES: Record<string, string> = {
    auto: 'Auto',
    quiet: 'One',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    max: 'Five',
    '5': 'Five',
  };

  constructor(
    private readonly platform: MELCloudHomePlatform,
    private readonly accessory: PlatformAccessory,
    service: Service,
    private readonly speedKey: string, // 'auto', 'quiet', '2', '3', '4', 'max'
  ) {
    this.device = accessory.context.device;
    this.service = service;

    const speedName = this.getSpeedDisplayName();
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.device.givenDisplayName} Fan ${speedName}`,
    );
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));
  }

  private getSpeedDisplayName(): string {
    const apiValue = FanSpeedButton.SPEED_API_VALUES[this.speedKey];
    return FanSpeedButton.SPEED_NAMES[apiValue] || this.speedKey;
  }

  private getApiValue(): string {
    return FanSpeedButton.SPEED_API_VALUES[this.speedKey] || 'Auto';
  }

  private getSettings() {
    return MELCloudAPI.parseSettings(this.device.settings);
  }

  private isCurrentSpeed(): boolean {
    const settings = this.getSettings();
    const currentSpeed = settings.SetFanSpeed;
    const targetApiValue = this.getApiValue();

    // Match both text and numeric forms
    const normalizedCurrent = FanSpeedButton.SPEED_NAMES[currentSpeed] || currentSpeed;
    const normalizedTarget = FanSpeedButton.SPEED_NAMES[targetApiValue] || targetApiValue;

    return normalizedCurrent === normalizedTarget;
  }

  async getOn(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    const isPowerOn = settings.Power === 'True';
    const isThisSpeed = this.isCurrentSpeed();

    const isOn = isPowerOn && isThisSpeed;
    this.platform.debugLog(
      `[${this.device.givenDisplayName} Fan ${this.getSpeedDisplayName()}] Get On: ${isOn} (power=${isPowerOn}, speed=${settings.SetFanSpeed})`,
    );
    return isOn;
  }

  async setOn(value: CharacteristicValue) {
    const turnOn = value as boolean;
    const speedName = this.getSpeedDisplayName();

    this.platform.debugLog(`[${this.device.givenDisplayName} Fan ${speedName}] Set On: ${turnOn}`);

    if (!turnOn) {
      // When turning OFF this button, set fan to Auto (don't power off AC)
      // But only if this speed is currently active
      if (this.isCurrentSpeed()) {
        await this.setFanSpeed('Auto', false);
      }
      return;
    }

    // When turning ON, set this fan speed (and power on if off)
    await this.setFanSpeed(this.getApiValue(), true);
  }

  private async setFanSpeed(fanSpeed: string, forcePowerOn: boolean) {
    this.platform.debugLog(`[${this.device.givenDisplayName} Fan] Setting fan=${fanSpeed}`);

    try {
      // Send only the changed fields — see swing-button fix for rationale.
      // Power is included only when forcing the AC on (when toggling a fan-speed button on
      // while the AC is off); otherwise leave power state alone.
      await this.platform.getAPI().controlDevice(this.device.id, {
        ...(forcePowerOn ? { power: true } : {}),
        setFanSpeed: fanSpeed,
      });

      // Update cached state
      const updatedSettings = this.device.settings.map((setting) => {
        if (setting.name === 'SetFanSpeed') {
          return { ...setting, value: fanSpeed };
        }
        if (setting.name === 'Power' && forcePowerOn) {
          return { ...setting, value: 'True' };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Immediately update ALL buttons (fan + vane) so they have correct cached state
      this.platform.updateAllButtonsForDevice(this.device);

      // Also schedule a full refresh to sync with API
      this.platform.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(
        `[${this.device.givenDisplayName} Fan] Failed to set speed:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Whether this button should read as ON: AC powered on AND its speed is the active one.
  private computeShouldBeOn(): boolean {
    return this.getSettings().Power === 'True' && this.isCurrentSpeed();
  }

  // Update from device state (called by platform refresh)
  public updateFromDevice(device: AirToAirUnit) {
    this.device = device;
    this.accessory.context.device = device;

    const shouldBeOn = this.computeShouldBeOn();
    const currentValue = this.service.getCharacteristic(this.platform.Characteristic.On).value;
    if (shouldBeOn !== currentValue) {
      this.platform.debugLog(
        `[${this.device.givenDisplayName} Fan ${this.getSpeedDisplayName()}] Update: ${currentValue} -> ${shouldBeOn}`,
      );
      this.service.updateCharacteristic(this.platform.Characteristic.On, shouldBeOn);
    }
  }
}
