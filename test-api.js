#!/usr/bin/env node

/**
 * MELCloud Home API Test Script
 *
 * This script tests authentication and basic API calls to MELCloud Home
 * Run with: node test-api.js
 */

const https = require('https');

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  email: 'your-email@example.com',
  password: 'your-password',
  deviceId: '415ac1f5-07a5-4e53-b9e5-d274b021eb09', // Your device ID
};

// Store session cookies
let sessionCookies = '';

/**
 * Make HTTPS request helper
 */
function makeRequest(method, path, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'melcloudhome.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'DNT': '1',
        'Origin': 'https://melcloudhome.com',
        'Referer': 'https://melcloudhome.com/dashboard',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        ...extraHeaders,
      },
    };

    if (sessionCookies) {
      options.headers['Cookie'] = sessionCookies;
    }

    if (data) {
      options.headers['Content-Type'] = 'application/json; charset=utf-8';
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = https.request(options, (res) => {
      let body = '';

      // Capture cookies from response
      if (res.headers['set-cookie']) {
        const cookies = res.headers['set-cookie'].map(cookie => cookie.split(';')[0]);
        sessionCookies = cookies.join('; ');
        console.log('📝 Cookies received and stored');
      }

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? (body.startsWith('{') || body.startsWith('[') ? JSON.parse(body) : body) : null,
          };
          resolve(response);
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Step 1: Login (endpoint to be discovered)
 */
async function login() {
  console.log('\n🔐 Attempting login...');
  console.log('TODO: Need to discover login endpoint');

  // Possible endpoints to try:
  // - POST /api/login
  // - POST /api/auth/login
  // - POST /auth/login
  // - POST /login

  const loginData = {
    email: CONFIG.email,
    password: CONFIG.password,
  };

  try {
    // Example - this endpoint needs to be discovered
    const response = await makeRequest('POST', '/api/login', loginData);
    console.log('Login response:', response);
    return response.statusCode === 200;
  } catch (error) {
    console.error('Login failed:', error.message);
    return false;
  }
}

/**
 * Step 2: List devices (endpoint to be discovered)
 */
async function listDevices() {
  console.log('\n📋 Fetching device list...');
  console.log('TODO: Need to discover device list endpoint');

  // Possible endpoints to try:
  // - GET /api/ataunit
  // - GET /api/devices
  // - GET /api/user/devices

  try {
    const response = await makeRequest('GET', '/api/ataunit');
    console.log('Device list response:', JSON.stringify(response, null, 2));
    return response.body;
  } catch (error) {
    console.error('Failed to list devices:', error.message);
    return null;
  }
}

/**
 * Step 3: Get device status
 */
async function getDeviceStatus(deviceId) {
  console.log(`\n📊 Getting status for device ${deviceId}...`);

  try {
    const response = await makeRequest('GET', `/api/ataunit/${deviceId}`);
    console.log('Device status:', JSON.stringify(response, null, 2));
    return response.body;
  } catch (error) {
    console.error('Failed to get device status:', error.message);
    return null;
  }
}

/**
 * Step 4: Control device
 */
async function controlDevice(deviceId, command) {
  console.log(`\n🎛️  Sending command to device ${deviceId}...`);
  console.log('Command:', command);

  try {
    const response = await makeRequest(
      'PUT',
      `/api/ataunit/${deviceId}`,
      command,
      { 'X-CSRF': '1' }
    );
    console.log('Control response:', JSON.stringify(response, null, 2));
    return response.statusCode === 200;
  } catch (error) {
    console.error('Failed to control device:', error.message);
    return false;
  }
}

/**
 * Main test sequence
 */
async function main() {
  console.log('🚀 MELCloud Home API Test Script\n');
  console.log('=' .repeat(50));

  try {
    // Test 1: Login
    // const loginSuccess = await login();
    // if (!loginSuccess) {
    //   console.error('❌ Login failed. Cannot continue.');
    //   return;
    // }

    console.log('\n⚠️  Login endpoint not yet discovered.');
    console.log('⚠️  You need to manually set cookies for now.\n');

    // Test 2: List devices
    // await listDevices();

    // Test 3: Get specific device status
    // await getDeviceStatus(CONFIG.deviceId);

    // Test 4: Turn device off
    const turnOffCommand = {
      power: false,
      operationMode: null,
      setFanSpeed: null,
      vaneHorizontalDirection: null,
      vaneVerticalDirection: null,
      setTemperature: null,
      temperatureIncrementOverride: null,
      inStandbyMode: null,
    };

    console.log('\n📝 To test device control, you need to:');
    console.log('1. Set sessionCookies variable with your auth cookies');
    console.log('2. Uncomment the controlDevice call below');
    console.log('3. Run: node test-api.js\n');

    // await controlDevice(CONFIG.deviceId, turnOffCommand);

    // Test 5: Turn device on
    // await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    // const turnOnCommand = { ...turnOffCommand, power: true };
    // await controlDevice(CONFIG.deviceId, turnOnCommand);

  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Test script completed\n');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  makeRequest,
  login,
  listDevices,
  getDeviceStatus,
  controlDevice,
};
