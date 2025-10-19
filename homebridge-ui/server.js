const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const fs = require('fs');
const path = require('path');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Handler to save cookies manually
    this.onRequest('/save-cookies', this.saveCookies.bind(this));

    // Ready
    this.ready();
  }

  /**
   * Save cookies manually provided by the user
   */
  async saveCookies(payload) {
    try {
      console.log('[MELCloudHome UI] Manual cookie save request received');
      const { cookieC1, cookieC2 } = payload;

      if (!cookieC1 || !cookieC2) {
        console.log('[MELCloudHome UI] Missing cookies');
        return { success: false, error: 'Both cookies are required' };
      }

      console.log('[MELCloudHome UI] Cookies received:', {
        cookieC1Length: cookieC1.length,
        cookieC2Length: cookieC2.length,
      });

      // Read the current config.json
      const configPath = path.join(this.homebridgeStoragePath, 'config.json');
      console.log('[MELCloudHome UI] Reading config from:', configPath);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Find the MELCloud Home platform config
      const platformIndex = config.platforms.findIndex(p => p.platform === 'MELCloudHome');
      console.log('[MELCloudHome UI] Platform index:', platformIndex);

      if (platformIndex >= 0) {
        // Update existing platform config
        console.log('[MELCloudHome UI] Updating existing platform config');
        config.platforms[platformIndex].cookieC1 = cookieC1;
        config.platforms[platformIndex].cookieC2 = cookieC2;
      } else {
        // Create new platform config
        console.log('[MELCloudHome UI] Creating new platform config');
        config.platforms.push({
          platform: 'MELCloudHome',
          name: 'MELCloud Home',
          cookieC1: cookieC1,
          cookieC2: cookieC2,
          refreshInterval: 60,
          debug: false,
        });
      }

      // Write the updated config back
      console.log('[MELCloudHome UI] Writing config back to file');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
      console.log('[MELCloudHome UI] Config saved successfully');

      return {
        success: true,
        message: 'Cookies saved successfully! Please restart Homebridge.'
      };
    } catch (error) {
      console.error('[MELCloudHome UI] Save cookies error:', error);
      console.error('[MELCloudHome UI] Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Failed to save cookies'
      };
    }
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
