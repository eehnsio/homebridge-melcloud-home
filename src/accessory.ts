import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { MELCloudHomePlatform } from './platform';
import { AirToAirUnit, MELCloudAPI } from './melcloud-api';

export class MELCloudAccessory {
  private service: Service;
  private device: AirToAirUnit;

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

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: this.device.capabilities.minTempCoolDry,
        maxValue: this.device.capabilities.maxTempCoolDry,
        minStep: this.device.capabilities.hasHalfDegreeIncrements ? 0.5 : 1,
      })
      .onGet(this.getCoolingThresholdTemperature.bind(this))
      .onSet(this.setCoolingThresholdTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: this.device.capabilities.minTempHeat,
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

    // Update device state from cache
    this.updateCharacteristics();
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
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Active:`, power);

    try {
      await this.platform.getAPI().controlDevice(this.device.id, {
        power,
        operationMode: null,
        setFanSpeed: null,
        vaneHorizontalDirection: null,
        vaneVerticalDirection: null,
        setTemperature: null,
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });
      // Refresh device state after 2 seconds
      setTimeout(() => this.platform.refreshDevice(this.device.id), 2000);
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
      // Refresh device state after 2 seconds
      setTimeout(() => this.platform.refreshDevice(this.device.id), 2000);
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
      // Refresh device state after 2 seconds
      setTimeout(() => this.platform.refreshDevice(this.device.id), 2000);
    } catch (error) {
      this.platform.log.error(`[${this.device.givenDisplayName}] Failed to set temperature:`, error);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  // Rotation Speed (Fan Speed)
  async getRotationSpeed(): Promise<CharacteristicValue> {
    const settings = this.getSettings();
    return parseInt(settings.SetFanSpeed);
  }

  async setRotationSpeed(value: CharacteristicValue) {
    this.platform.log.info(`[${this.device.givenDisplayName}] Set Fan Speed:`, value);

    try {
      await this.platform.getAPI().controlDevice(this.device.id, {
        power: null,
        operationMode: null,
        setFanSpeed: value as number,
        vaneHorizontalDirection: null,
        vaneVerticalDirection: null,
        setTemperature: null,
        temperatureIncrementOverride: null,
        inStandbyMode: null,
      });
      // Refresh device state after 2 seconds
      setTimeout(() => this.platform.refreshDevice(this.device.id), 2000);
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

    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentTemperature,
      parseFloat(settings.RoomTemperature),
    );

    // Validate cooling threshold temperature
    const setTemp = parseFloat(settings.SetTemperature);
    const coolingTemp = Math.max(
      this.device.capabilities.minTempCoolDry,
      Math.min(this.device.capabilities.maxTempCoolDry, setTemp),
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.CoolingThresholdTemperature,
      coolingTemp,
    );

    // Validate heating threshold temperature
    const heatingTemp = Math.max(
      this.device.capabilities.minTempHeat,
      Math.min(this.device.capabilities.maxTempHeat, setTemp),
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.HeatingThresholdTemperature,
      heatingTemp,
    );

    if (this.device.capabilities.numberOfFanSpeeds > 0) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.RotationSpeed,
        parseInt(settings.SetFanSpeed),
      );
    }
  }

  // Public method to update device state from platform refresh
  public updateFromDevice(device: AirToAirUnit) {
    this.device = device;
    this.accessory.context.device = device;
    this.updateCharacteristics();
  }
}
