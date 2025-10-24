import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit, MELCloudAPI } from './melcloud-api';

export class MELCloudAccessory {
  private service: Service;
  private device: AirToAirUnit;
  private refreshDebounceTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: MELCloudHomePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device;

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mitsubishi Electric')
      .setCharacteristic(this.platform.Characteristic.Model, 'MELCloud Home')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.connectedInterfaceIdentifier);

    // Get or create the HeaterCooler service
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.givenDisplayName);

    // Register handlers
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.getTargetState.bind(this))
      .onSet(this.setTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // HomeKit has strict minimum values for temperature thresholds
    // Cooling: min 10°C (actually enforces 16°C in practice)
    // Heating: min 0°C (actually enforces 10°C in practice)
    // Use the higher of device minimum or HomeKit minimum
    const HOMEKIT_MIN_COOLING = 16;
    const HOMEKIT_MIN_HEATING = 10;

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING),
        maxValue: this.device.capabilities.maxTempCoolDry,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(this.getCoolingThresholdTemperature.bind(this))
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING),
        maxValue: this.device.capabilities.maxTempHeat,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(this.getHeatingThresholdTemperature.bind(this))
      .onSet(this.setHeatingThresholdTemperature.bind(this));

    // Optional: Rotation Speed for fan speed
    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minValue: 0,
          maxValue: this.device.capabilities.numberOfFanSpeeds,
          minStep: 1,
        })
        .onGet(this.getRotationSpeed.bind(this))
        .onSet(this.setRotationSpeed.bind(this));
    }

    // Update device state from cache (do this AFTER setting props to avoid validation warnings)
    setImmediate(() => this.updateCharacteristics());
  }

  private getSettings() {
    return MELCloudAPI.parseSettings(this.device.settings);
  }

  // Active (On/Off)
  async getActive(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    const isActive = settings.Power === 'True';
    this.platform.log.debug(`[${this.device.givenDisplayName}] Get Active:`, isActive);
    return isActive ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
  }

  async setActive(value: CharacteristicValue) {
    const power = value === this.platform.Characteristic.Active.ACTIVE;
    const settings = this.getSettings();

    // Convert fan speed to number for logging (handle both text and numeric formats)
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    const reverseSpeedMap: Record<string, number> = {
      'Auto': 1, 'One': 2, 'Two': 3, 'Three': 4, 'Four': 5, 'Five': 6,
      '0': 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
    };
    const currentFanSpeed = reverseSpeedMap[settings.SetFanSpeed] ?? 1;

    this.platform.log.info(`[${this.device.givenDisplayName}] Set Active:`, power, `(current fan speed: ${currentFanSpeed})`);

    // Don't send command if the state is already correct
    if ((power && settings.Power === 'True') || (!power && settings.Power === 'False')) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Active state already matches, skipping command`);
      return;
    }

    try {
      // Convert numeric fan speed back to text format for API
      // API returns numbers but expects text input
      const speedToTextMap: Record<string, string> = {
        '0': 'Auto', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five',
      };
      const fanSpeedForAPI = speedToTextMap[settings.SetFanSpeed] || settings.SetFanSpeed;

      // Send current state for all parameters except power (only change power)
      // This prevents the API from changing other settings when toggling power
      await this.platform.getAPI().controlDevice(this.device.id, {
        power,
        operationMode: settings.OperationMode,
        setFanSpeed: fanSpeedForAPI,
        vaneHorizontalDirection: settings.VaneHorizontalDirection,
        vaneVerticalDirection: settings.VaneVerticalDirection,
        setTemperature: parseFloat(settings.SetTemperature),
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });

      // Refresh device state after power command (keep fast for immediate feedback)
      this.scheduleRefresh(500);
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set power:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Current State (Idle/Heating/Cooling)
  async getCurrentState(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    const power = settings.Power === 'True';
    const mode = settings.OperationMode;

    if (!power) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    switch (mode) {
      case 'Heat':
        return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
      case 'Cool':
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
      default:
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  // Target State (Auto/Heat/Cool)
  async getTargetState(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    const mode = settings.OperationMode;

    switch (mode) {
      case 'Heat':
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
      case 'Cool':
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
      case 'Auto':
      default:
        return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    }
  }

  async setTargetState(value: CharacteristicValue) {
    let mode: string;

    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        mode = 'Heat';
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        mode = 'Cool';
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
      default:
        mode = 'Auto';
        break;
    }

    this.platform.log.info(`[${this.device.givenDisplayName}] Set Target State:`, mode);

    // Don't send command if the mode is already correct
    const settings = this.getSettings();
    if (settings.OperationMode === mode) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Operation mode already matches, skipping command`);
      return;
    }

    try {
      await this.platform.getAPI().controlDevice(this.device.id, {
        power: null,
        operationMode: mode,
        setFanSpeed: null,
        vaneHorizontalDirection: null,
        vaneVerticalDirection: null,
        setTemperature: null,
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });
      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set mode:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Current Temperature
  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    return parseFloat(settings.RoomTemperature);
  }

  // Cooling Threshold Temperature
  async getCoolingThresholdTemperature(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    return parseFloat(settings.SetTemperature);
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Cooling Threshold:`, value);
    await this.setTemperature(value as number);
  }

  // Heating Threshold Temperature
  async getHeatingThresholdTemperature(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    return parseFloat(settings.SetTemperature);
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue) {
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Heating Threshold:`, value);
    await this.setTemperature(value as number);
  }

  private async setTemperature(temp: number) {
    // Don't send command if the temperature is already correct
    const settings = this.getSettings();
    const currentTemp = parseFloat(settings.SetTemperature);
    if (Math.abs(currentTemp - temp) < 0.1) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Temperature already matches, skipping command`);
      return;
    }

    try {
      await this.platform.getAPI().controlDevice(this.device.id, {
        power: null,
        operationMode: null,
        setFanSpeed: null,
        vaneHorizontalDirection: null,
        vaneVerticalDirection: null,
        setTemperature: temp,
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });
      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set temperature:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Rotation Speed (Fan Speed)
  async getRotationSpeed(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    const fanSpeedText = settings.SetFanSpeed;

    // Convert API values to numeric speed
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    // So we shift everything up by 1: Auto=1, One=2, Two=3, etc.
    const reverseSpeedMap: Record<string, number> = {
      'Auto': 1,  // Shifted from 0 to 1
      'One': 2,   // Shifted from 1 to 2
      'Two': 3,   // Shifted from 2 to 3
      'Three': 4, // Shifted from 3 to 4
      'Four': 5,  // Shifted from 4 to 5
      'Five': 6,  // Shifted from 5 to 6
      // Also handle numeric format from API
      '0': 1,
      '1': 2,
      '2': 3,
      '3': 4,
      '4': 5,
      '5': 6,
    };

    const speed = reverseSpeedMap[fanSpeedText] ?? 1;
    this.platform.log.debug(`[${this.device.givenDisplayName}] Get Rotation Speed: ${speed} (from: ${fanSpeedText})`);
    return speed;
  }

  async setRotationSpeed(value: CharacteristicValue) {
    const speed = value as number;
    // Convert numeric speed to API text values
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    const speedMap: Record<number, string> = {
      1: 'Auto',  // Shifted from 0
      2: 'One',   // Shifted from 1
      3: 'Two',   // Shifted from 2
      4: 'Three', // Shifted from 3
      5: 'Four',  // Shifted from 4
      6: 'Five',  // Shifted from 5
    };
    const fanSpeedText = speedMap[speed] || 'Auto';

    // Don't send command if the fan speed is already correct
    const settings = this.getSettings();
    this.platform.log.info(
      `[${this.device.givenDisplayName}] Set Fan Speed:`,
      speed,
      `(${fanSpeedText}) - Current: ${settings.SetFanSpeed}, Power: ${settings.Power}`
    );

    // Don't change fan speed when device is off (AC resets to Auto when powered off)
    if (settings.Power === 'False') {
      this.platform.log.info(`[${this.device.givenDisplayName}] Device is off, ignoring fan speed change`);
      return;
    }

    // Check if fan speed matches (handle both text format "Five" and numeric format "5")
    const currentSpeedMatches = settings.SetFanSpeed === fanSpeedText ||
                                settings.SetFanSpeed === speed.toString();

    if (currentSpeedMatches) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Fan speed already matches, skipping command`);
      return;
    }

    try {
      // Send current state for all parameters except fan speed (only change fan speed)
      await this.platform.getAPI().controlDevice(this.device.id, {
        power: settings.Power === 'True',
        operationMode: settings.OperationMode,
        setFanSpeed: fanSpeedText,
        vaneHorizontalDirection: settings.VaneHorizontalDirection,
        vaneVerticalDirection: settings.VaneVerticalDirection,
        setTemperature: parseFloat(settings.SetTemperature),
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });
      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set fan speed:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Update characteristics from device state
  private updateCharacteristics() {
    const settings = this.getSettings();
    this.platform.log.debug(`[${this.device.givenDisplayName}] Updating characteristics`, settings);

    // Update all characteristics with current values
    this.service.updateCharacteristic(
      this.platform.Characteristic.Active,
      settings.Power === 'True' ? 1 : 0,
    );

    const currentTemp = parseFloat(settings.RoomTemperature);

    // Get the current cached value from HomeKit to see if it's different
    const cachedValue = this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;

    this.platform.log.debug(
      `[${this.device.givenDisplayName}] Updating HomeKit CurrentTemperature: ${cachedValue}°C -> ${currentTemp}°C (${currentTemp !== cachedValue ? 'CHANGED' : 'NO CHANGE'})`,
    );

    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentTemperature,
      currentTemp,
    );

    // Validate cooling threshold temperature
    const setTemp = parseFloat(settings.SetTemperature);
    const defaultTemp = 20; // Default to 20°C if temperature is invalid

    // Use default if setTemp is NaN or out of valid range
    const validSetTemp = isNaN(setTemp) ? defaultTemp : setTemp;

    // HomeKit minimums (same as setProps)
    const HOMEKIT_MIN_COOLING = 16;
    const HOMEKIT_MIN_HEATING = 10;

    // Clamp to both device capabilities AND HomeKit minimums
    const coolingTemp = Math.max(
      Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING),
      Math.min(this.device.capabilities.maxTempCoolDry, validSetTemp),
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature,
      coolingTemp,
    );

    // Validate heating threshold temperature
    const heatingTemp = Math.max(
      Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING),
      Math.min(this.device.capabilities.maxTempHeat, validSetTemp),
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.HeatingThresholdTemperature,
      heatingTemp,
    );

    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      // Convert API values to numeric speed (handle both text and numeric formats)
      const reverseSpeedMap: Record<string, number> = {
        'Auto': 0, 'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5,
        '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
      };
      const speed = reverseSpeedMap[settings.SetFanSpeed] ?? 0;

      this.service.updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        speed,
      );
    }
  }

  /**
   * Schedule a debounced refresh to prevent API spam from rapid consecutive commands
   * This ensures only ONE refresh happens even if user changes multiple settings quickly
   */
  private scheduleRefresh(delay: number = 2000) {
    // Clear any pending refresh
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
    }

    // Schedule new refresh after delay
    this.refreshDebounceTimer = setTimeout(() => {
      this.platform.log.debug(`[${this.device.givenDisplayName}] Debounced refresh executing`);
      this.platform.refreshDevice(this.device.id);
      this.refreshDebounceTimer = undefined;
    }, delay);
  }

  // Public method to update device state from platform refresh
  public updateFromDevice(device: AirToAirUnit) {
    const oldSettings = MELCloudAPI.parseSettings(this.device.settings);
    const newSettings = MELCloudAPI.parseSettings(device.settings);
    const oldTemp = oldSettings.RoomTemperature;
    const newTemp = newSettings.RoomTemperature;

    this.platform.log.debug(
      `[${device.givenDisplayName}] updateFromDevice called - Temp: ${oldTemp}°C -> ${newTemp}°C`,
    );

    this.device = device;
    this.accessory.context.device = device;
    this.updateCharacteristics();
  }
}
