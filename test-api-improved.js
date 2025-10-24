#!/usr/bin/env node
/**
 * MELCloud API Test Script
 *
 * This script allows you to manually test the MELCloud API and inspect responses.
 *
 * Usage:
 *   npm test                      # Interactive mode - shows formatted output
 *   npm test -- --save            # Save responses to JSON files
 *   npm test -- --raw             # Show raw JSON output
 *   npm test -- --watch           # Monitor temperature changes every 10s
 *
 * Configuration:
 *   The script reads from your Homebridge config.json automatically.
 *   Make sure you're authenticated before running this.
 */

const fs = require('fs');
const path = require('path');
const { MELCloudAPI } = require('./dist/melcloud-api');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

async function loadConfig() {
  // Try to load from Homebridge config
  const configPaths = [
    path.join(process.env.HOME || '', '.homebridge', 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      console.log(`${colors.dim}Loading config from: ${configPath}${colors.reset}\n`);
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);

      // Find MELCloud platform config
      const platform = config.platforms.find(p =>
        p.platform === 'homebridge-melcloud-home.MELCloudHome' ||
        p.platform === 'MELCloudHome'
      );

      if (platform) {
        return platform;
      }
    }
  }

  throw new Error('Could not find MELCloud platform configuration');
}

function formatTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

async function displayDeviceInfo(devices, options = {}) {
  const { raw = false, compact = false } = options;

  for (const device of devices) {
    const settings = MELCloudAPI.parseSettings(device.settings);

    if (compact) {
      console.log(`[${formatTimestamp()}] ${device.givenDisplayName}: ${settings.RoomTemperature}°C (Set: ${settings.SetTemperature}°C, Power: ${settings.Power})`);
      continue;
    }

    console.log(`${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Device: ${device.givenDisplayName}${colors.reset}`);
    console.log(`${colors.dim}ID: ${device.id}${colors.reset}`);
    console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    // Temperature Information
    console.log(`${colors.bright}${colors.yellow}🌡️  Temperature:${colors.reset}`);
    console.log(`  Current Room Temp:  ${colors.bright}${settings.RoomTemperature}°C${colors.reset}`);
    console.log(`  Set Temperature:    ${settings.SetTemperature}°C`);
    console.log(`  Outdoor Temp:       ${settings.OutdoorTemperature || 'N/A'}°C`);

    // Power & Mode
    console.log(`\n${colors.bright}${colors.green}⚡ Power & Mode:${colors.reset}`);
    console.log(`  Power:              ${settings.Power === 'True' ? colors.green + '●' : colors.red + '○'} ${settings.Power}${colors.reset}`);
    console.log(`  Operation Mode:     ${settings.OperationMode}`);
    console.log(`  Fan Speed:          ${settings.SetFanSpeed}`);

    // Capabilities
    console.log(`\n${colors.bright}${colors.cyan}🔧 Capabilities:${colors.reset}`);
    console.log(`  Half Degree Steps:  ${device.capabilities.hasHalfDegreeIncrements ? '✓' : '✗'}`);
    console.log(`  Temp Range (Cool):  ${device.capabilities.minTempCoolDry}°C - ${device.capabilities.maxTempCoolDry}°C`);
    console.log(`  Temp Range (Heat):  ${device.capabilities.minTempHeat}°C - ${device.capabilities.maxTempHeat}°C`);
    console.log(`  Fan Speeds:         ${device.capabilities.numberOfFanSpeeds}`);

    // Raw Settings (if requested)
    if (raw) {
      console.log(`\n${colors.dim}Raw Settings Array:${colors.reset}`);
      console.log(JSON.stringify(device.settings, null, 2));
    }

    console.log('');
  }
}

async function watchMode(api) {
  console.log(`${colors.bright}${colors.cyan}📊 Temperature Watch Mode${colors.reset}`);
  console.log(`${colors.dim}Polling every 10 seconds... (Press Ctrl+C to exit)${colors.reset}\n`);

  const previousTemps = new Map();

  while (true) {
    try {
      const devices = await api.getAllDevices();

      for (const device of devices) {
        const settings = MELCloudAPI.parseSettings(device.settings);
        const currentTemp = parseFloat(settings.RoomTemperature);
        const previousTemp = previousTemps.get(device.id);

        let indicator = '';
        if (previousTemp !== undefined) {
          if (currentTemp > previousTemp) {
            indicator = `${colors.red}↑ +${(currentTemp - previousTemp).toFixed(1)}°C${colors.reset}`;
          } else if (currentTemp < previousTemp) {
            indicator = `${colors.blue}↓ ${(currentTemp - previousTemp).toFixed(1)}°C${colors.reset}`;
          } else {
            indicator = `${colors.dim}→ no change${colors.reset}`;
          }
        }

        previousTemps.set(device.id, currentTemp);

        console.log(
          `[${formatTimestamp()}] ${colors.bright}${device.givenDisplayName}${colors.reset}: ` +
          `${currentTemp}°C (Set: ${settings.SetTemperature}°C) ${indicator}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      console.error(`${colors.red}Error:${colors.reset}`, error.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const saveToFile = args.includes('--save');
  const rawOutput = args.includes('--raw');
  const watchMode_enabled = args.includes('--watch');

  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   MELCloud API Test Script            ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════╝${colors.reset}\n`);

  try {
    // Load configuration
    const config = await loadConfig();

    console.log(`${colors.green}✓${colors.reset} Configuration loaded`);
    console.log(`${colors.dim}  Base URL: ${config.baseURL || 'https://mobile.bff.melcloudhome.com'}${colors.reset}`);
    console.log(`${colors.dim}  Auth method: ${config.refreshToken ? 'OAuth' : 'Cookies'}${colors.reset}\n`);

    // Initialize API
    const api = new MELCloudAPI(config);

    // Watch mode - continuous monitoring
    if (watchMode_enabled) {
      await watchMode(api);
      return;
    }

    // Test 1: Get User Context
    console.log(`${colors.bright}${colors.blue}[1/3]${colors.reset} Fetching user context...`);
    const context = await api.getUserContext();

    if (saveToFile) {
      fs.writeFileSync('test-context.json', JSON.stringify(context, null, 2));
      console.log(`${colors.green}✓${colors.reset} Saved to test-context.json`);
    }

    if (rawOutput) {
      console.log(JSON.stringify(context, null, 2));
    } else {
      console.log(`${colors.green}✓${colors.reset} Found ${context.buildings.length} building(s)`);
      for (const building of context.buildings) {
        console.log(`  ${colors.cyan}Building:${colors.reset} ${building.name}`);
        console.log(`  ${colors.dim}└─ ${building.airToAirUnits.length} air-to-air unit(s)${colors.reset}`);
      }
    }

    // Test 2: Get All Devices
    console.log(`\n${colors.bright}${colors.blue}[2/3]${colors.reset} Fetching all devices...`);
    const devices = await api.getAllDevices();

    if (saveToFile) {
      fs.writeFileSync('test-devices.json', JSON.stringify(devices, null, 2));
      console.log(`${colors.green}✓${colors.reset} Saved to test-devices.json`);
    }

    console.log(`${colors.green}✓${colors.reset} Found ${devices.length} device(s)\n`);

    // Test 3: Parse and Display Device Settings
    console.log(`${colors.bright}${colors.blue}[3/3]${colors.reset} Device Details:\n`);
    await displayDeviceInfo(devices, { raw: rawOutput });

    // Summary
    console.log(`${colors.bright}${colors.green}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.green}║   API Test Completed Successfully     ║${colors.reset}`);
    console.log(`${colors.bright}${colors.green}╚════════════════════════════════════════╝${colors.reset}\n`);

    if (saveToFile) {
      console.log(`${colors.dim}Output files created:${colors.reset}`);
      console.log(`  - test-context.json`);
      console.log(`  - test-devices.json\n`);
    }

    console.log(`${colors.dim}Available options:${colors.reset}`);
    console.log(`  --save   Export API responses to JSON files`);
    console.log(`  --raw    Show raw API responses`);
    console.log(`  --watch  Monitor temperature changes every 10s\n`);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}✗ Error:${colors.reset}`, error);
    if (error.stack) {
      console.error(`${colors.dim}${error.stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

main();
