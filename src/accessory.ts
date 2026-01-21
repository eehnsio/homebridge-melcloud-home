import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit, MELCloudAPI } from './melcloud-api';

export class MELCloudAccessory {
  private service: Service;
  private temperatureSensor?: Service;
  private device: AirToAirUnit;
  private refreshDebounceTimer?: NodeJS.Timeout;
  private pendingCommandRefresh?: NodeJS.Timeout; // Track pending command verification refresh
  private pendingMode?: string; // Store mode changes requested while device is off

  // Track heating and cooling thresholds separately for AUTO mode
  // These represent what HomeKit wants, we'll calculate midpoint for MELCloud
  private heatingThreshold?: number;
  private coolingThreshold?: number;

  constructor(
    private readonly platform: MELCloudHomePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device;

    // Restore cached thresholds from accessory context (persists across restarts)
    this.heatingThreshold = accessory.context.heatingThreshold;
    this.coolingThreshold = accessory.context.coolingThreshold;

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

    // Set up cooling threshold with safe default value first to avoid validation warnings
    const coolingChar = this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature);
    const coolingMin = Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING);
    coolingChar.updateValue(coolingMin); // Set safe default before setProps
    coolingChar
      .setProps({
        minValue: coolingMin,
        maxValue: this.device.capabilities.maxTempCoolDry,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(this.getCoolingThresholdTemperature.bind(this))
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    // Set up heating threshold with safe default value first to avoid validation warnings
    const heatingChar = this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature);
    const heatingMin = Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING);
    heatingChar.updateValue(heatingMin); // Set safe default before setProps
    heatingChar
      .setProps({
        minValue: heatingMin,
        maxValue: this.device.capabilities.maxTempHeat,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(this.getHeatingThresholdTemperature.bind(this))
      .onSet(this.setHeatingThresholdTemperature.bind(this));

    // Optional: Rotation Speed for fan speed
    // We use 1-6 range (Auto=1, One=2, ..., Five=6) to avoid HomeKit treating 0 as "off"
    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minValue: 1,
          maxValue: this.device.capabilities.numberOfFanSpeeds + 1, // +1 because we shifted range
          minStep: 1,
        })
        .onGet(this.getRotationSpeed.bind(this))
        .onSet(this.setRotationSpeed.bind(this));
    }

    // Add separate TemperatureSensor service for HomeKit automations (if enabled in config)
    // HomeKit doesn't allow automations based on CurrentTemperature from HeaterCooler service,
    // but it does allow automations from dedicated TemperatureSensor services
    const exposeTemperatureSensor = this.platform.config.exposeTemperatureSensor !== false; // Default true

    if (exposeTemperatureSensor) {
      this.temperatureSensor = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor);

      this.temperatureSensor.setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.device.givenDisplayName} Temperature`,
      );

      this.temperatureSensor.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this));
    } else {
      // Remove temperature sensor if it exists but is now disabled
      const existingSensor = this.accessory.getService(this.platform.Service.TemperatureSensor);
      if (existingSensor) {
        this.accessory.removeService(existingSensor);
      }
    }

    // Clean up old/deprecated services (vane control is now handled by separate VaneButton accessories)
    const servicesToRemove = [
      this.accessory.getService(this.platform.Service.Fan),        // Old fan service
      this.accessory.getService(this.platform.Service.Slat),       // Old slat service
      this.accessory.getService('swing-control'),                  // Old swing switch
      this.accessory.getService('vane-control'),                   // Old vane slider
    ];
    for (const svc of servicesToRemove) {
      if (svc) {
        this.accessory.removeService(svc);
        this.platform.log.info(`[${this.device.givenDisplayName}] Removed old service: ${svc.displayName || svc.UUID}`);
      }
    }
    // Remove old SwingMode characteristic from HeaterCooler if it exists
    if (this.service.testCharacteristic(this.platform.Characteristic.SwingMode)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.platform.Characteristic.SwingMode));
    }

    // Update device state from cache (do this AFTER setting props to avoid validation warnings)
    setImmediate(() => this.updateCharacteristics());
  }

  private getSettings() {
    return MELCloudAPI.parseSettings(this.device.settings);
  }

  // Active (On/Off)
  async getActive(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const isActive = settings.Power === 'True';
      this.platform.debugLog(`[${this.device.givenDisplayName}] Get Active:`, isActive);
      return isActive ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getActive:`, error);
      // Return last known value from cache to prevent HomeKit "Not Responding"
      const cached = this.service.getCharacteristic(this.platform.Characteristic.Active).value;
      return cached ?? this.platform.Characteristic.Active.INACTIVE;
    }
  }

  async setActive(value: CharacteristicValue) {
    const power = value === this.platform.Characteristic.Active.ACTIVE;
    this.platform.debugLog(`[${this.device.givenDisplayName}] Set Active requested: ${power}`);

    const settings = this.getSettings();

    // Convert fan speed to number for logging (handle both text and numeric formats)
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    const reverseSpeedMap: Record<string, number> = {
      'Auto': 1, 'One': 2, 'Two': 3, 'Three': 4, 'Four': 5, 'Five': 6,
      '0': 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
    };
    const currentFanSpeed = reverseSpeedMap[settings.SetFanSpeed] ?? 1;

    // Don't send command if the state is already correct
    if ((power && settings.Power === 'True') || (!power && settings.Power === 'False')) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Active state already matches (${settings.Power}), skipping command`);
      return;
    }

    try {
      // Convert numeric fan speed back to text format for API
      // API returns numbers but expects text input
      const speedToTextMap: Record<string, string> = {
        '0': 'Auto', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five',
      };
      const fanSpeedForAPI = speedToTextMap[settings.SetFanSpeed] || settings.SetFanSpeed;

      // If powering on and there's a pending mode change, apply it now
      const operationMode = (power && this.pendingMode) ? this.pendingMode : settings.OperationMode;
      if (power && this.pendingMode) {
        this.platform.log.info(`[${this.device.givenDisplayName}] Applying pending mode change: ${this.pendingMode}`);
        this.pendingMode = undefined; // Clear after use
      }

      // Send current state for all parameters except power (only change power)
      // This prevents the API from changing other settings when toggling power
      await this.platform.getAPI().controlDevice(this.device.id, {
        power,
        operationMode,
        setFanSpeed: fanSpeedForAPI,
        vaneHorizontalDirection: settings.VaneHorizontalDirection,
        vaneVerticalDirection: settings.VaneVerticalDirection,
        setTemperature: parseFloat(settings.SetTemperature),
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });

      // Optimistically update the cached state immediately for responsive HomeKit UI
      // This prevents HomeKit from reverting the UI while waiting for API confirmation
      this.platform.debugLog(`[${this.device.givenDisplayName}] Power command sent successfully, updating HomeKit state immediately`);

      // Update the cached device settings to reflect the new power state
      const updatedSettings = this.device.settings.map(setting => {
        if (setting.name === 'Power') {
          return { ...setting, value: power ? 'True' : 'False' };
        }
        if (setting.name === 'OperationMode' && operationMode !== settings.OperationMode) {
          return { ...setting, value: operationMode };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Update HomeKit characteristic immediately so UI responds
      this.service.updateCharacteristic(
        this.platform.Characteristic.Active,
        power ? 1 : 0,
      );

      // Immediately update ALL buttons (fan + vane) for instant UI response
      // Buttons show ON only when AC is ON + correct setting
      this.platform.updateAllButtonsForDevice(this.device);

      // Schedule background refresh to sync with actual device state (verify our command worked)
      this.scheduleRefresh(2000);
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set power:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Current State (Idle/Heating/Cooling)
  async getCurrentState(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const power = settings.Power === 'True';
      const mode = settings.OperationMode;

      if (!power) {
        return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      }

      switch (mode) {
        case 'Heat': {
          const roomTemp = parseFloat(settings.RoomTemperature);
          const targetTemp = parseFloat(settings.SetTemperature);
          // Only show heating if room is below target
          return roomTemp < targetTemp
            ? this.platform.Characteristic.CurrentHeaterCoolerState.HEATING
            : this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        case 'Cool': {
          const roomTemp = parseFloat(settings.RoomTemperature);
          const targetTemp = parseFloat(settings.SetTemperature);
          // Only show cooling if room is above target
          return roomTemp > targetTemp
            ? this.platform.Characteristic.CurrentHeaterCoolerState.COOLING
            : this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        case 'Automatic':  // Auto mode - infer state from room temp vs target
        case 'Auto': {
          const roomTemp = parseFloat(settings.RoomTemperature);
          const targetTemp = parseFloat(settings.SetTemperature);

          // Use 1°C hysteresis to match typical device behavior
          // Device heats if room < target - 1°C, cools if room > target + 1°C
          if (roomTemp < targetTemp - 1) {
            return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
          } else if (roomTemp > targetTemp + 1) {
            return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
          }
          return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        case 'Fan':  // Fan mode - just circulating air, not heating/cooling
        case 'Dry':  // Dry mode - dehumidifying, treat as idle
        default:
          return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getCurrentState:`, error);
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
  }

  // Target State (Auto/Heat/Cool)
  async getTargetState(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const mode = settings.OperationMode;

      switch (mode) {
        case 'Heat':
          return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
        case 'Cool':
          return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        case 'Automatic':  // API returns 'Automatic'
        case 'Auto':       // Also support 'Auto' for backwards compatibility
        default:
          return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
      }
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getTargetState:`, error);
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
        mode = 'Automatic';  // API uses 'Automatic' not 'Auto'
        break;
    }

    this.platform.log.info(`[${this.device.givenDisplayName}] Set Target State:`, mode);

    // Don't send command if the mode is already correct
    const settings = this.getSettings();
    if (settings.OperationMode === mode) {
      this.platform.log.info(`[${this.device.givenDisplayName}] Operation mode already matches, skipping command`);
      return;
    }

    // Don't change mode if device is off - MELCloud API will reject with HTTP 400
    // Store the requested mode and apply it when device is powered on
    if (settings.Power === 'False') {
      this.platform.log.info(`[${this.device.givenDisplayName}] Device is off, storing mode change for power on`);
      this.pendingMode = mode;
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

      // Optimistically update cached state immediately
      this.platform.debugLog(`[${this.device.givenDisplayName}] Mode command sent successfully, updating cache`);
      const updatedSettings = this.device.settings.map(setting => {
        if (setting.name === 'OperationMode') {
          return { ...setting, value: mode };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set mode:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Current Temperature
  async getCurrentTemperature(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const temp = parseFloat(settings.RoomTemperature);
      // Validate temperature is a reasonable value
      if (isNaN(temp) || temp < -40 || temp > 60) {
        this.platform.log.warn(`[${this.device.givenDisplayName}] Invalid temperature: ${settings.RoomTemperature}, using cached value`);
        const cached = this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;
        return (cached as number) ?? 20;
      }
      return temp;
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getCurrentTemperature:`, error);
      const cached = this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;
      return (cached as number) ?? 20;
    }
  }

  // Cooling Threshold Temperature
  async getCoolingThresholdTemperature(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const currentTemp = parseFloat(settings.SetTemperature);
      const mode = settings.OperationMode;

      // In AUTO mode, use cached cooling threshold for range display
      if ((mode === 'Automatic' || mode === 'Auto') && this.coolingThreshold !== undefined) {
        return this.coolingThreshold;
      }

      // In other modes (Heat/Cool/Fan/Dry), return actual device setpoint
      return isNaN(currentTemp) ? 24 : currentTemp;
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getCoolingThresholdTemperature:`, error);
      return this.coolingThreshold ?? 24;
    }
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {
    const temp = value as number;
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Cooling Threshold:`, temp);

    // Store the cooling threshold (in memory and persist to context)
    this.coolingThreshold = temp;
    this.accessory.context.coolingThreshold = temp;

    const settings = this.getSettings();
    const mode = settings.OperationMode;

    // Only use midpoint calculation in AUTO mode
    if (mode === 'Automatic' || mode === 'Auto') {
      await this.updateAutoModeTemperature();
    } else {
      // In non-AUTO modes, set temperature directly
      await this.setTemperature(temp);
    }
  }

  // Heating Threshold Temperature
  async getHeatingThresholdTemperature(): Promise<CharacteristicValue> {
    try {
      const settings = this.getSettings();
      const currentTemp = parseFloat(settings.SetTemperature);
      const mode = settings.OperationMode;

      // In AUTO mode, use cached heating threshold for range display
      if ((mode === 'Automatic' || mode === 'Auto') && this.heatingThreshold !== undefined) {
        return this.heatingThreshold;
      }

      // In other modes (Heat/Cool/Fan/Dry), return actual device setpoint
      return isNaN(currentTemp) ? 20 : currentTemp;
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getHeatingThresholdTemperature:`, error);
      return this.heatingThreshold ?? 20;
    }
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue) {
    const temp = value as number;
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Heating Threshold:`, temp);

    // Store the heating threshold (in memory and persist to context)
    this.heatingThreshold = temp;
    this.accessory.context.heatingThreshold = temp;

    const settings = this.getSettings();
    const mode = settings.OperationMode;

    // Only use midpoint calculation in AUTO mode
    if (mode === 'Automatic' || mode === 'Auto') {
      await this.updateAutoModeTemperature();
    } else {
      // In non-AUTO modes, set temperature directly
      await this.setTemperature(temp);
    }
  }

  /**
   * Calculate and send midpoint temperature when in AUTO mode
   * This reconciles HomeKit's range-based UI with MELCloud's single setpoint
   */
  private async updateAutoModeTemperature() {
    // Only calculate midpoint if both thresholds are set
    if (this.heatingThreshold === undefined || this.coolingThreshold === undefined) {
      return;
    }

    // Calculate midpoint
    const midpoint = (this.heatingThreshold + this.coolingThreshold) / 2;

    this.platform.log.info(
      `[${this.device.givenDisplayName}] AUTO mode: Heating ${this.heatingThreshold}°C, ` +
      `Cooling ${this.coolingThreshold}°C → Sending midpoint ${midpoint.toFixed(1)}°C to device`
    );

    // Send the midpoint temperature to the device
    await this.setTemperature(midpoint);
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

      // Optimistically update cached state immediately
      this.platform.debugLog(`[${this.device.givenDisplayName}] Temperature command sent successfully, updating cache`);
      const updatedSettings = this.device.settings.map(setting => {
        if (setting.name === 'SetTemperature') {
          return { ...setting, value: temp.toString() };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set temperature:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Rotation Speed (Fan Speed)
  async getRotationSpeed(): Promise<CharacteristicValue> {
    try {
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
      this.platform.debugLog(`[${this.device.givenDisplayName}] Get Rotation Speed: ${speed} (from: ${fanSpeedText})`);
      return speed;
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Error in getRotationSpeed:`, error);
      return 1; // Default to Auto
    }
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

      // Optimistically update cached state immediately
      this.platform.debugLog(`[${this.device.givenDisplayName}] Fan speed command sent successfully, updating cache`);
      const updatedSettings = this.device.settings.map(setting => {
        if (setting.name === 'SetFanSpeed') {
          return { ...setting, value: fanSpeedText };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set fan speed:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Update characteristics from device state
  private updateCharacteristics() {
    // Skip updates if we're waiting for a command verification refresh
    // This prevents periodic refreshes from overwriting optimistic updates before our own refresh executes
    if (this.pendingCommandRefresh) {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Skipping updateCharacteristics - command verification refresh pending`);
      return;
    }

    // Validate device data before updating
    if (!this.device?.settings || this.device.settings.length === 0) {
      this.platform.log.warn(`[${this.device?.givenDisplayName || 'Unknown'}] No device settings available, skipping update`);
      return;
    }

    let settings: Record<string, string>;
    try {
      settings = this.getSettings();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to parse device settings:`, error);
      return;
    }

    this.platform.debugLog(`[${this.device.givenDisplayName}] updateCharacteristics() called - Power='${settings.Power}', Mode='${settings.OperationMode}', Temp='${settings.RoomTemperature}'`);

    // Only update characteristics if values have actually changed
    // This prevents HomeKit from showing errors when settings panel is open

    const activeValue = settings.Power === 'True' ? 1 : 0;
    const cachedActive = this.service.getCharacteristic(this.platform.Characteristic.Active).value;
    if (activeValue !== cachedActive) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, activeValue);
    }

    const currentTemp = parseFloat(settings.RoomTemperature);
    const cachedTemp = this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;

    if (currentTemp !== cachedTemp) {
      this.platform.log.info(
        `[${this.device.givenDisplayName}] Temperature update: ${cachedTemp}°C -> ${currentTemp}°C (from MELCloud: ${settings.RoomTemperature})`,
      );
    }

    // IMPORTANT: Always update CurrentTemperature even if unchanged, as a "heartbeat" to keep
    // HomeKit aware that the device is responsive. Without periodic updates, HomeKit may
    // mark accessories as "Not Responding" after periods of inactivity.
    // Use updateValue() to properly trigger HAP notifications to subscribed clients.
    // Validate temperature before sending to HomeKit (NaN would cause issues)
    const validCurrentTemp = isNaN(currentTemp) ? (cachedTemp as number) ?? 20 : currentTemp;
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(validCurrentTemp);

    // Also update the separate temperature sensor service for automations (if enabled)
    if (this.temperatureSensor) {
      this.temperatureSensor.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .updateValue(validCurrentTemp);
    }

    // Validate cooling threshold temperature
    const setTemp = parseFloat(settings.SetTemperature);
    const defaultTemp = 20; // Default to 20°C if temperature is invalid

    // Use default if setTemp is NaN or out of valid range
    const validSetTemp = isNaN(setTemp) ? defaultTemp : setTemp;

    // HomeKit minimums (same as setProps)
    const HOMEKIT_MIN_COOLING = 16;
    const HOMEKIT_MIN_HEATING = 10;

    // Initialize cached thresholds if not set
    // For AUTO mode: device setpoint is the midpoint, so we calculate ±2°C spread
    if (this.heatingThreshold === undefined) {
      this.heatingThreshold = validSetTemp - 2;
      this.accessory.context.heatingThreshold = this.heatingThreshold;
    }
    if (this.coolingThreshold === undefined) {
      this.coolingThreshold = validSetTemp + 2;
      this.accessory.context.coolingThreshold = this.coolingThreshold;
    }

    // Clamp to both device capabilities AND HomeKit minimums
    const coolingTemp = Math.max(
      Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING),
      Math.min(this.device.capabilities.maxTempCoolDry, this.coolingThreshold),
    );
    const cachedCoolingTemp = this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value;
    if (coolingTemp !== cachedCoolingTemp) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature,
        coolingTemp,
      );
    }

    // Validate heating threshold temperature
    const heatingTemp = Math.max(
      Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING),
      Math.min(this.device.capabilities.maxTempHeat, this.heatingThreshold),
    );
    const cachedHeatingTemp = this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value;
    if (heatingTemp !== cachedHeatingTemp) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature,
        heatingTemp,
      );
    }

    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      // Convert API values to numeric speed (handle both text and numeric formats)
      // Use 1-6 range (Auto=1, One=2, ..., Five=6) to match getRotationSpeed
      const reverseSpeedMap: Record<string, number> = {
        'Auto': 1, 'One': 2, 'Two': 3, 'Three': 4, 'Four': 5, 'Five': 6,
        '0': 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6,
      };
      const speed = reverseSpeedMap[settings.SetFanSpeed] ?? 1;
      const cachedSpeed = this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).value;

      if (speed !== cachedSpeed) {
        this.service.updateCharacteristic(
          this.platform.Characteristic.RotationSpeed,
          speed,
        );
      }
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

    // Set flag to block periodic refreshes from overwriting optimistic updates
    // This flag will be cleared when the debounced refresh executes or after 5s timeout
    if (this.pendingCommandRefresh) {
      clearTimeout(this.pendingCommandRefresh);
    }
    this.pendingCommandRefresh = setTimeout(() => {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Pending command refresh timeout expired`);
      this.pendingCommandRefresh = undefined;
    }, 5000); // Safety timeout in case refresh fails

    // Schedule new refresh after delay
    this.refreshDebounceTimer = setTimeout(() => {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Debounced refresh executing`);
      this.platform.refreshDevice(this.device.id);
      this.refreshDebounceTimer = undefined;

      // Clear the pending command flag when our verification refresh completes
      if (this.pendingCommandRefresh) {
        clearTimeout(this.pendingCommandRefresh);
        this.pendingCommandRefresh = undefined;
      }
    }, delay);
  }

  // Public method to update device state from platform refresh
  public updateFromDevice(device: AirToAirUnit) {
    const oldSettings = MELCloudAPI.parseSettings(this.device.settings);
    const newSettings = MELCloudAPI.parseSettings(device.settings);

    // Log current state during refresh (respects config.debug)
    this.platform.debugLog(
      `[${device.givenDisplayName}] Refresh: Power=${newSettings.Power}, Mode=${newSettings.OperationMode}, Temp=${newSettings.RoomTemperature}°C, Target=${newSettings.SetTemperature}°C, Fan=${newSettings.SetFanSpeed}, Vane=${newSettings.VaneVerticalDirection}`,
    );

    // Normalize fan speed: API alternates between numeric and text formats
    // "0" and "Auto" are the same, "1" and "One" are the same, etc.
    const normalizeFanSpeed = (speed: string): string => {
      const numericToText: Record<string, string> = {
        '0': 'Auto', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five',
      };
      return numericToText[speed] || speed;
    };

    // Check if anything actually changed
    const tempChanged = oldSettings.RoomTemperature !== newSettings.RoomTemperature;
    const powerChanged = oldSettings.Power !== newSettings.Power;
    const modeChanged = oldSettings.OperationMode !== newSettings.OperationMode;
    const fanChanged = normalizeFanSpeed(oldSettings.SetFanSpeed) !== normalizeFanSpeed(newSettings.SetFanSpeed);

    // Always log state changes (important for users to see)
    if (tempChanged || powerChanged || modeChanged || fanChanged) {
      const changes = [];
      if (powerChanged) {
        changes.push(`Power: ${oldSettings.Power} -> ${newSettings.Power}`);
      }
      if (tempChanged) {
        changes.push(`Temp: ${oldSettings.RoomTemperature}°C -> ${newSettings.RoomTemperature}°C`);
      }
      if (modeChanged) {
        changes.push(`Mode: ${oldSettings.OperationMode} -> ${newSettings.OperationMode}`);
      }
      if (fanChanged) {
        changes.push(`Fan: ${oldSettings.SetFanSpeed} -> ${newSettings.SetFanSpeed}`);
      }
      this.platform.log.info(
        `[${device.givenDisplayName}] ⚡ State changed: ${changes.join(', ')}`,
      );
    }

    this.device = device;
    this.accessory.context.device = device;
    this.updateCharacteristics();
  }
}
