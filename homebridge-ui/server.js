const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Handler to get device information
    this.onRequest('/devices', this.getDevices.bind(this));

    // Ready
    this.ready();
  }

  /**
   * Get all devices from the MELCloud Home API
   */
  async getDevices() {
    try {
      // Get the plugin config from Homebridge
      const pluginConfig = await this.getPluginConfig();

      if (!pluginConfig || !Array.isArray(pluginConfig) || pluginConfig.length === 0) {
        throw new Error('Plugin not configured');
      }

      const config = pluginConfig[0];

      // Validate credentials
      if (!config.email || !config.password) {
        throw new Error('Missing email or password in configuration');
      }

      // Import the MELCloudAPI
      // Note: We need to use the built version
      const { MELCloudAPI } = require('../dist/melcloud-api');

      // Create an API instance
      const api = new MELCloudAPI({
        email: config.email,
        password: config.password,
        debug: config.debug || false,
      });

      // Fetch user context
      const userContext = await api.getUserContext();

      // Process the data for the UI
      const buildings = userContext.buildings.map(building => ({
        name: building.name,
        timezone: building.timezone,
        devices: building.airToAirUnits.map(device => {
          const settings = this.parseSettings(device.settings);
          return {
            id: device.id,
            name: device.givenDisplayName,
            icon: device.displayIcon,
            isConnected: device.isConnected,
            rssi: device.rssi,
            power: settings.Power === 'True',
            operationMode: settings.OperationMode || 'Unknown',
            roomTemperature: settings.RoomTemperature || 'N/A',
            setTemperature: settings.SetTemperature || 'N/A',
            fanSpeed: settings.ActualFanSpeed || 'Unknown',
            capabilities: device.capabilities,
          };
        }),
      }));

      // Calculate statistics
      const allDevices = buildings.flatMap(b => b.devices);
      const totalDevices = allDevices.length;
      const connectedDevices = allDevices.filter(d => d.isConnected).length;

      return {
        totalDevices,
        connectedDevices,
        buildings,
        config: {
          refreshInterval: config.refreshInterval || 60,
          debug: config.debug || false,
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch devices: ${error.message}`);
    }
  }

  /**
   * Parse device settings array into an object
   */
  parseSettings(settings) {
    const parsed = {};
    for (const setting of settings) {
      parsed[setting.name] = setting.value;
    }
    return parsed;
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
