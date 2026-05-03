import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { type AirToAirUnit, MELCloudAPI } from './melcloud-api';
import type { MELCloudHomePlatform } from './platform';

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
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mitsubishi Electric')
      .setCharacteristic(this.platform.Characteristic.Model, 'MELCloud Home')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.connectedInterfaceIdentifier);

    // Get or create the HeaterCooler service
    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.givenDisplayName);

    // Register handlers. We pair each controllable characteristic with an onGet that returns
    // synchronously from cached device state. HomeKit periodically probes characteristics; if
    // there is no onGet the probe can mark the accessory as "Not Responding" and that state
    // sticks until the user opens the accessory detail view. onGet handlers never throw — they
    // return the last-known value or a safe default.
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.getActive())
      .onSet(this.setActive.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(() => this.getCurrentState());

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(() => this.getTargetState())
      .onSet(this.setTargetState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).onGet(() => this.getCurrentTemp());

    // HomeKit has strict minimum values for temperature thresholds
    // Cooling: min 10°C (actually enforces 16°C in practice)
    // Heating: min 0°C (actually enforces 10°C in practice)
    // Use the higher of device minimum or HomeKit minimum
    const HOMEKIT_MIN_COOLING = 16;
    const HOMEKIT_MIN_HEATING = 10;

    // Set up cooling threshold with safe default value first to avoid validation warnings
    const coolingChar = this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature);
    const coolingMin = Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING);
    const coolingMax = this.device.capabilities.maxTempCoolDry;
    coolingChar.updateValue(coolingMin); // Set safe default before setProps
    coolingChar
      .setProps({
        minValue: coolingMin,
        maxValue: coolingMax,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(() => this.getCoolingThreshold(coolingMin, coolingMax))
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    // Set up heating threshold with safe default value first to avoid validation warnings
    const heatingChar = this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature);
    const heatingMin = Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING);
    const heatingMax = this.device.capabilities.maxTempHeat;
    heatingChar.updateValue(heatingMin); // Set safe default before setProps
    heatingChar
      .setProps({
        minValue: heatingMin,
        maxValue: heatingMax,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(() => this.getHeatingThreshold(heatingMin, heatingMax))
      .onSet(this.setHeatingThresholdTemperature.bind(this));

    // Optional: Rotation Speed for fan speed
    // We use 1-6 range (Auto=1, One=2, ..., Five=6) to avoid HomeKit treating 0 as "off"
    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      this.service
        .getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minValue: 1,
          maxValue: this.device.capabilities.numberOfFanSpeeds + 1, // +1 because we shifted range
          minStep: 1,
        })
        .onGet(() => this.getRotationSpeed())
        .onSet(this.setRotationSpeed.bind(this));
    }


    // Add separate TemperatureSensor service for HomeKit automations (if enabled in config)
    // HomeKit doesn't allow automations based on CurrentTemperature from HeaterCooler service,
    // but it does allow automations from dedicated TemperatureSensor services
    const exposeTemperatureSensor = this.platform.config.exposeTemperatureSensor !== false; // Default true

    if (exposeTemperatureSensor) {
      this.temperatureSensor =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor);

      this.temperatureSensor.setCharacteristic(
        this.platform.Characteristic.Name,
        `${this.device.givenDisplayName} Temperature`,
      );

      this.temperatureSensor
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(() => this.getCurrentTemp());
    } else {
      // Remove temperature sensor if it exists but is now disabled
      const existingSensor = this.accessory.getService(this.platform.Service.TemperatureSensor);
      if (existingSensor) {
        this.accessory.removeService(existingSensor);
      }
    }

    // Clean up old/deprecated services (vane control is now handled by separate VaneButton accessories)
    const servicesToRemove = [
      this.accessory.getService(this.platform.Service.Fan), // Old fan service
      this.accessory.getService(this.platform.Service.Slat), // Old slat service
      this.accessory.getService('swing-control'), // Old swing switch
      this.accessory.getService('vane-control'), // Old vane slider
    ];
    for (const svc of servicesToRemove) {
      if (svc) {
        this.accessory.removeService(svc);
        this.platform.debugLog(`[${this.device.givenDisplayName}] Removed old service: ${svc.displayName || svc.UUID}`);
      }
    }
    // Remove SwingMode characteristic if it exists from an earlier build — iOS Home does
    // not render SwingMode on HeaterCooler in iOS 18+, so adding it is dead code that just
    // confuses future debugging. Use vane-control config option for visible swing buttons.
    if (this.service.testCharacteristic(this.platform.Characteristic.SwingMode)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.platform.Characteristic.SwingMode));
    }

    // Update device state from cache (do this AFTER setting props to avoid validation warnings)
    setImmediate(() => {
      try {
        this.updateCharacteristics();
      } catch (error) {
        this.platform.log.error(
          `[${this.device.givenDisplayName}] Initial characteristic update failed:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }

  private getSettings() {
    return MELCloudAPI.parseSettings(this.device.settings);
  }

  async setActive(value: CharacteristicValue) {
    const power = value === this.platform.Characteristic.Active.ACTIVE;
    this.platform.debugLog(`[${this.device.givenDisplayName}] Set Active requested: ${power}`);

    const settings = this.getSettings();

    // Convert fan speed to number for logging (handle both text and numeric formats)
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    const reverseSpeedMap: Record<string, number> = {
      Auto: 1,
      One: 2,
      Two: 3,
      Three: 4,
      Four: 5,
      Five: 6,
      '0': 1,
      '1': 2,
      '2': 3,
      '3': 4,
      '4': 5,
      '5': 6,
    };
    const _currentFanSpeed = reverseSpeedMap[settings.SetFanSpeed] ?? 1;

    // Don't send command if the state is already correct
    if ((power && settings.Power === 'True') || (!power && settings.Power === 'False')) {
      this.platform.debugLog(
        `[${this.device.givenDisplayName}] Active state already matches (${settings.Power}), skipping command`,
      );
      return;
    }

    // Save previous state for rollback on failure
    const previousSettings = [...this.device.settings];

    try {
      // If powering on and there's a pending mode change, apply it now
      const operationMode = power && this.pendingMode ? this.pendingMode : settings.OperationMode;
      if (power && this.pendingMode) {
        this.platform.debugLog(`[${this.device.givenDisplayName}] Applying pending mode change: ${this.pendingMode}`);
        this.pendingMode = undefined; // Clear after use
      }

      // Send only the fields we want to change. MELCloud preserves any field set to null
      // (or omitted), and re-sending the full state can disturb AC firmware substates such
      // as the vane oscillation engine — same root cause as the swing-button fix.
      await this.platform.getAPI().controlDevice(this.device.id, {
        power,
        // Apply pending mode change only if there is one pending (otherwise leave mode alone)
        ...(power && operationMode !== settings.OperationMode ? { operationMode } : {}),
      });

      // Optimistically update the cached state immediately for responsive HomeKit UI
      // This prevents HomeKit from reverting the UI while waiting for API confirmation
      this.platform.debugLog(
        `[${this.device.givenDisplayName}] Power command sent successfully, updating HomeKit state immediately`,
      );

      // Update the cached device settings to reflect the new power state
      const updatedSettings = this.device.settings.map((setting) => {
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
      this.service.updateCharacteristic(this.platform.Characteristic.Active, power ? 1 : 0);

      // Immediately update ALL buttons (fan + vane) for instant UI response
      // Buttons show ON only when AC is ON + correct setting
      this.platform.updateAllButtonsForDevice(this.device);

      // Schedule background refresh to sync with actual device state (verify our command worked)
      this.scheduleRefresh(2000);
    } catch (error) {
      // Revert optimistic state on failure
      this.device.settings = previousSettings;
      this.platform.log.error(
        `[${this.device.givenDisplayName}] Failed to set power:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // onGet handlers — all return synchronously from cached device state and never throw.
  // They exist so HomeKit's liveness probes always get an immediate answer, which prevents
  // the "Not Responding" icon from latching. Cache is kept fresh by the polling loop via
  // updateFromDevice() / updateCharacteristics().

  private getActive(): CharacteristicValue {
    try {
      const v = this.getSettings().Power === 'True'
        ? this.platform.Characteristic.Active.ACTIVE
        : this.platform.Characteristic.Active.INACTIVE;
      this.platform.debugLog(`[${this.device.givenDisplayName}] onGet Active -> ${v}`);
      return v;
    } catch (e) {
      this.platform.log.warn(`[${this.device?.givenDisplayName || '?'}] onGet Active threw, defaulting INACTIVE: ${e}`);
      return this.platform.Characteristic.Active.INACTIVE;
    }
  }

  private getCurrentState(): CharacteristicValue {
    try {
      const v = this.computeCurrentState(this.getSettings());
      this.platform.debugLog(`[${this.device.givenDisplayName}] onGet CurrentState -> ${v}`);
      return v;
    } catch (e) {
      this.platform.log.warn(`[${this.device?.givenDisplayName || '?'}] onGet CurrentState threw: ${e}`);
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
  }

  private getTargetState(): CharacteristicValue {
    try {
      const v = this.computeTargetState(this.getSettings());
      this.platform.debugLog(`[${this.device.givenDisplayName}] onGet TargetState -> ${v}`);
      return v;
    } catch (e) {
      this.platform.log.warn(`[${this.device?.givenDisplayName || '?'}] onGet TargetState threw: ${e}`);
      return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
    }
  }

  private getCurrentTemp(): CharacteristicValue {
    try {
      const t = parseFloat(this.getSettings().RoomTemperature);
      const v = Number.isNaN(t) ? 20 : t;
      this.platform.debugLog(`[${this.device.givenDisplayName}] onGet CurrentTemp -> ${v}`);
      return v;
    } catch (e) {
      this.platform.log.warn(`[${this.device?.givenDisplayName || '?'}] onGet CurrentTemp threw: ${e}`);
      return 20;
    }
  }

  private getCoolingThreshold(min: number, max: number): CharacteristicValue {
    try {
      let t = this.coolingThreshold;
      if (t === undefined) {
        const setTemp = parseFloat(this.getSettings().SetTemperature);
        t = Number.isNaN(setTemp) ? min : setTemp;
      }
      return Math.max(min, Math.min(max, t));
    } catch {
      return min;
    }
  }

  private getHeatingThreshold(min: number, max: number): CharacteristicValue {
    try {
      let t = this.heatingThreshold;
      if (t === undefined) {
        const setTemp = parseFloat(this.getSettings().SetTemperature);
        t = Number.isNaN(setTemp) ? min : setTemp;
      }
      return Math.max(min, Math.min(max, t));
    } catch {
      return min;
    }
  }

  private getRotationSpeed(): CharacteristicValue {
    try {
      const reverseSpeedMap: Record<string, number> = {
        Auto: 1,
        One: 2,
        Two: 3,
        Three: 4,
        Four: 5,
        Five: 6,
        '0': 1,
        '1': 2,
        '2': 3,
        '3': 4,
        '4': 5,
        '5': 6,
      };
      return reverseSpeedMap[this.getSettings().SetFanSpeed] ?? 1;
    } catch {
      return 1;
    }
  }


  /**
   * Compute current heater/cooler state from device settings
   */
  private computeCurrentState(settings: Record<string, string>): CharacteristicValue {
    const power = settings.Power === 'True';
    const mode = settings.OperationMode;

    if (!power) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    const roomTemp = parseFloat(settings.RoomTemperature);
    const targetTemp = parseFloat(settings.SetTemperature);

    switch (mode) {
      case 'Heat':
        if (Number.isNaN(roomTemp) || Number.isNaN(targetTemp)) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        return roomTemp < targetTemp
          ? this.platform.Characteristic.CurrentHeaterCoolerState.HEATING
          : this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      case 'Cool':
        if (Number.isNaN(roomTemp) || Number.isNaN(targetTemp)) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        return roomTemp > targetTemp
          ? this.platform.Characteristic.CurrentHeaterCoolerState.COOLING
          : this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      case 'Automatic':
      case 'Auto': {
        if (Number.isNaN(roomTemp) || Number.isNaN(targetTemp)) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        if (roomTemp < targetTemp - 1) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        } else if (roomTemp > targetTemp + 1) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        }
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
      default:
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  /**
   * Compute target heater/cooler state from device settings
   */
  private computeTargetState(settings: Record<string, string>): CharacteristicValue {
    switch (settings.OperationMode) {
      case 'Heat':
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
      case 'Cool':
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
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
      default:
        mode = 'Automatic'; // API uses 'Automatic' not 'Auto'
        break;
    }

    this.platform.debugLog(`[${this.device.givenDisplayName}] Set Target State: ${mode}`);

    // Don't send command if the mode is already correct
    const settings = this.getSettings();
    if (settings.OperationMode === mode) {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Operation mode already matches, skipping command`);
      return;
    }

    // Don't change mode if device is off - MELCloud API will reject with HTTP 400
    // Store the requested mode and apply it when device is powered on
    if (settings.Power === 'False') {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Device is off, storing mode change for power on`);
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
      const updatedSettings = this.device.settings.map((setting) => {
        if (setting.name === 'OperationMode') {
          return { ...setting, value: mode };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(
        `[${this.device.givenDisplayName}] Failed to set mode:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {
    const temp = value as number;
    this.platform.debugLog(`[${this.device.givenDisplayName}] Set Cooling Threshold: ${temp}`);

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

  async setHeatingThresholdTemperature(value: CharacteristicValue) {
    const temp = value as number;
    this.platform.debugLog(`[${this.device.givenDisplayName}] Set Heating Threshold: ${temp}`);

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

    this.platform.debugLog(
      `[${this.device.givenDisplayName}] AUTO mode: Heating ${this.heatingThreshold}°C, ` +
        `Cooling ${this.coolingThreshold}°C → Sending midpoint ${midpoint.toFixed(1)}°C to device`,
    );

    // Send the midpoint temperature to the device
    await this.setTemperature(midpoint);
  }

  private async setTemperature(temp: number) {
    // Don't send command if the temperature is already correct
    const settings = this.getSettings();
    const currentTemp = parseFloat(settings.SetTemperature);
    if (Math.abs(currentTemp - temp) < 0.1) {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Temperature already matches, skipping command`);
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
      const updatedSettings = this.device.settings.map((setting) => {
        if (setting.name === 'SetTemperature') {
          return { ...setting, value: temp.toString() };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(
        `[${this.device.givenDisplayName}] Failed to set temperature:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setRotationSpeed(value: CharacteristicValue) {
    const speed = value as number;
    // Convert numeric speed to API text values
    // IMPORTANT: We use 1-6 instead of 0-5 because HomeKit treats rotation speed 0 as "turn off"
    const speedMap: Record<number, string> = {
      1: 'Auto', // Shifted from 0
      2: 'One', // Shifted from 1
      3: 'Two', // Shifted from 2
      4: 'Three', // Shifted from 3
      5: 'Four', // Shifted from 4
      6: 'Five', // Shifted from 5
    };
    const fanSpeedText = speedMap[speed] || 'Auto';

    // Don't send command if the fan speed is already correct
    const settings = this.getSettings();
    this.platform.debugLog(
      `[${this.device.givenDisplayName}] Set Fan Speed: ${speed} (${fanSpeedText}) - Current: ${settings.SetFanSpeed}, Power: ${settings.Power}`,
    );

    // Don't change fan speed when device is off (AC resets to Auto when powered off)
    if (settings.Power === 'False') {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Device is off, ignoring fan speed change`);
      return;
    }

    // Check if fan speed matches (handle both text format "Five" and numeric format "5")
    // Normalize API format ("0"/"Auto" are same, "1"/"One" are same, etc.)
    const normalizeSpeed = (s: string): string => {
      const map: Record<string, string> = {
        '0': 'Auto',
        '1': 'One',
        '2': 'Two',
        '3': 'Three',
        '4': 'Four',
        '5': 'Five',
      };
      return map[s] || s;
    };
    const currentSpeedMatches = normalizeSpeed(settings.SetFanSpeed) === normalizeSpeed(fanSpeedText);

    if (currentSpeedMatches) {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Fan speed already matches, skipping command`);
      return;
    }

    try {
      // Send only the changed field — see swing-button fix for rationale
      await this.platform.getAPI().controlDevice(this.device.id, {
        setFanSpeed: fanSpeedText,
      });

      // Optimistically update cached state immediately
      this.platform.debugLog(`[${this.device.givenDisplayName}] Fan speed command sent successfully, updating cache`);
      const updatedSettings = this.device.settings.map((setting) => {
        if (setting.name === 'SetFanSpeed') {
          return { ...setting, value: fanSpeedText };
        }
        return setting;
      });
      this.device.settings = updatedSettings;

      // Refresh device state after command (debounced to prevent API spam)
      this.scheduleRefresh();
    } catch (error) {
      this.platform.log.error(
        `[${this.device.givenDisplayName}] Failed to set fan speed:`,
        error instanceof Error ? error.message : String(error),
      );
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Update characteristics from device state
  private updateCharacteristics() {
    // Skip updates if we're waiting for a command verification refresh
    // This prevents periodic refreshes from overwriting optimistic updates before our own refresh executes
    if (this.pendingCommandRefresh) {
      this.platform.debugLog(
        `[${this.device.givenDisplayName}] Skipping updateCharacteristics - command verification refresh pending`,
      );
      return;
    }

    // Validate device data before updating
    if (!this.device?.settings || this.device.settings.length === 0) {
      this.platform.log.warn(
        `[${this.device?.givenDisplayName || 'Unknown'}] No device settings available, skipping update`,
      );
      return;
    }

    let settings: Record<string, string>;
    try {
      settings = this.getSettings();
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to parse device settings:`, error);
      return;
    }

    this.platform.debugLog(
      `[${this.device.givenDisplayName}] updateCharacteristics() called - Power='${settings.Power}', Mode='${settings.OperationMode}', Temp='${settings.RoomTemperature}'`,
    );

    // Push every cycle via sendEventNotification() — it bypasses updateValue()'s dedupe so
    // HomeKit receives a HAP event every refresh even when values are unchanged. Without this,
    // an OFF accessory (Active=0, State=INACTIVE) would never emit an event after initial
    // startup, and iOS latches "Not Responding" on silent bridges.

    const activeValue = settings.Power === 'True' ? 1 : 0;
    this.service.getCharacteristic(this.platform.Characteristic.Active).sendEventNotification(activeValue);

    const currentState = this.computeCurrentState(settings);
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .sendEventNotification(currentState);

    const targetState = this.computeTargetState(settings);
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .sendEventNotification(targetState);

    // Current temperature — forced heartbeat via sendEventNotification()
    const currentTemp = parseFloat(settings.RoomTemperature);
    const cachedTemp = this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value;
    if (currentTemp !== cachedTemp) {
      this.platform.debugLog(
        `[${this.device.givenDisplayName}] Temperature update: ${cachedTemp}°C -> ${currentTemp}°C`,
      );
    }
    const validCurrentTemp = Number.isNaN(currentTemp) ? ((cachedTemp as number) ?? 20) : currentTemp;
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .sendEventNotification(validCurrentTemp);

    if (this.temperatureSensor) {
      this.temperatureSensor
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .sendEventNotification(validCurrentTemp);
    }

    // Threshold temperatures
    const setTemp = parseFloat(settings.SetTemperature);
    const validSetTemp = Number.isNaN(setTemp) ? 20 : setTemp;

    const HOMEKIT_MIN_COOLING = 16;
    const HOMEKIT_MIN_HEATING = 10;

    if (this.heatingThreshold === undefined) {
      this.heatingThreshold = validSetTemp - 2;
      this.accessory.context.heatingThreshold = this.heatingThreshold;
    }
    if (this.coolingThreshold === undefined) {
      this.coolingThreshold = validSetTemp + 2;
      this.accessory.context.coolingThreshold = this.coolingThreshold;
    }

    const coolingTemp = Math.max(
      Math.max(this.device.capabilities.minTempCoolDry, HOMEKIT_MIN_COOLING),
      Math.min(this.device.capabilities.maxTempCoolDry, this.coolingThreshold),
    );
    this.service
      .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .sendEventNotification(coolingTemp);

    const heatingTemp = Math.max(
      Math.max(this.device.capabilities.minTempHeat, HOMEKIT_MIN_HEATING),
      Math.min(this.device.capabilities.maxTempHeat, this.heatingThreshold),
    );
    this.service
      .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .sendEventNotification(heatingTemp);

    // Fan speed
    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      const reverseSpeedMap: Record<string, number> = {
        Auto: 1,
        One: 2,
        Two: 3,
        Three: 4,
        Four: 5,
        Five: 6,
        '0': 1,
        '1': 2,
        '2': 3,
        '3': 4,
        '4': 5,
        '5': 6,
      };
      const speed = reverseSpeedMap[settings.SetFanSpeed] ?? 1;
      this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed).sendEventNotification(speed);
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
    this.refreshDebounceTimer = setTimeout(async () => {
      this.platform.debugLog(`[${this.device.givenDisplayName}] Debounced refresh executing`);
      this.refreshDebounceTimer = undefined;
      try {
        await this.platform.refreshDevice(this.device.id);
      } catch (error) {
        this.platform.log.debug(`[${this.device.givenDisplayName}] Debounced refresh failed:`, error);
      } finally {
        // Clear the pending command flag when our verification refresh completes
        if (this.pendingCommandRefresh) {
          clearTimeout(this.pendingCommandRefresh);
          this.pendingCommandRefresh = undefined;
        }
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
        '0': 'Auto',
        '1': 'One',
        '2': 'Two',
        '3': 'Three',
        '4': 'Four',
        '5': 'Five',
      };
      return numericToText[speed] || speed;
    };

    // Check if anything actually changed
    const tempChanged = oldSettings.RoomTemperature !== newSettings.RoomTemperature;
    const powerChanged = oldSettings.Power !== newSettings.Power;
    const modeChanged = oldSettings.OperationMode !== newSettings.OperationMode;
    const fanChanged = normalizeFanSpeed(oldSettings.SetFanSpeed) !== normalizeFanSpeed(newSettings.SetFanSpeed);

    // Log state changes at appropriate level
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
      // Only log power/mode/fan changes at info level (user-initiated actions)
      // Temperature fluctuations are normal and go to debug
      if (powerChanged || modeChanged || fanChanged) {
        this.platform.log.info(`[${device.givenDisplayName}] ${changes.join(', ')}`);
      } else {
        this.platform.debugLog(`[${device.givenDisplayName}] ${changes.join(', ')}`);
      }
    }

    this.device = device;
    this.accessory.context.device = device;
    this.updateCharacteristics();
  }
}
