#!/usr/bin/env node

/**
 * MELCloud Home API Test Script (Improved)
 *
 * This script tests the MELCloud Home API with cookies
 * Run with: node test-api-improved.js
 */

const https = require('https');

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  // Paste your cookies here from browser DevTools
  // Copy them from a successful request to melcloudhome.com
  cookies: {
    '__Secure-monitorandcontrol': 'chunks-2',
    '__Secure-monitorandcontrolC1': 'CfDJ8H9WIv85d-VLvIm8F606mtwT7s9BxUsVigCb3HILMfpT_MyvRQgresgOEEqi1MLQg7zT-t4ZmBIy0sbnA1jGiU6g5WmI9n4IEV0V7-A6eabMmYIM1y10XcLur-d9ZhawNSTmQmCqjN0nzZDGW1SDREuUvvTR9MszCnTj6hPOz3751BoDvDd-tunaxm_8jTgelnjrBxMPJ3YBXxQhjui9BEAANGBvJZg7inc_XKILzo18MZ_n46Wlre93evz-mQMF5kvbaSmn0k8BJwaRxSEO2IrQxY2p9niaLpTiKO1VtxsR-1A-36rrXg4Ay3cr34idXCRs69EZ_yUw92hWgh5p6GT5AQnGAL9X4eaZBwp4Q8t4d51bH-kONMb9ijBKfDOf8yQL9BytZEDG_PngIj9FmXtJ3kQJmbfWxtJQEdegPOMwgM2sOR7_fyhJhRpPy4NpnoR1V2CfgHOFLfoJL-n-v63q7sCWSYtMfPDXr7HSFQfLWm9aFHaiWMw28A9llAlHk28BCC3PwvQCHwK9-Knm9yqsDgvqr1vh9Gzs6h550hfU8tsjIkLZXpOtNtETE9nHekdkgSuYpni4Pi3J39aWIw8wJfnakbKUPMu07hDpLYgCrHrn7zG5pZFfoxiXRys6xpErVUsgxEI1faeN2SmqcbiRMF9NgVQDlLZEGbJll209UrAyUa1eE6EVdtO4Yy_kzFQVuddgmwDQ_AVt8HLpvuT6l7nA7cgiFvNlsEvzpnUdCfrIe3kr5XoxnhjMT1hCOvWKiWQp5BFCD-QC9T6OyPuBDAedRj63Pwuzi-Q2DN8PVKDfAtjFzl8O4DFh3zWJ7_PFOw7G8oRo1qPzEJwUMEFKuxEt2CrgDfBK3mBPCrvjKxbWxU3SwvFRa5bfwezTKsizYmuLJTbFgP6AqIgDG0urNl1W1JVCZYfCUI3prxmC8H-lmjPgQhu6z43IYzA5ofLXBtIcUq_XZvnlKmd_EoZrPB_CaM_OPvSTrj5Jbb-f00-tZKIp4qvqhEhqtu193tw7hmN9Mpnx74yKFXXkclP-2JAU37xAIHZ3uSTEe6PRQLM991qIGTKpy6IhZ-EOwqg7p2pcAJ4NLE06TMFu4IKqznDAT48fIR8Q4rycNWbafWn9HtF3YtGmIEZNqIevj6P9u84hJUtRjh0OFqn0sQarCikzIbvP7KIlneLFdCaP-BswBUuAnwFmYeJSAEa0TXbod-12otE7cBUDoRW1AUNlmjpOIZiLFQkjQCjx-WpVqjOJiwBnUuKwC62dMjJV_La0w9StN40aEGJ_EuZjLhUvLB3wSNdgSxvc7Ati3MMfCsZIWkOzbfu6aMGXBIAn03OGxYbR5WqUFTWEG8JL1OY44nmk8Rwov5fiygmrV4WwuCNfwtDoEjNAqSLL4Pa3c55aPpBY1RFD4-gy9mYYKocN6tKRNna0GxE667b7-Cb34NY_L6whb1demnYVCYruk5H8wVQEFcAL7bqX6SI1J_E40rUlx0i2IWOrtPN9NZrlReVbVIkxQgGrgBFnrhrsFTMPOqSsQOm81pWLB3BzNm7270GjV5Iq4UuOS8HMWgTG4dsw-Dd0XStq_IEUHPHcFoA-ynycmLcinj4h0e9kEMi2XYZHcjNQIPea0xhKmscupeNXyykf9-ss2mYrqTOrRYFxZRCSBFHzveMgVhAuEpY4Ue3FMGiKETn8ZqKplb8Wj4mknFFobly4fw51P7Z5m3sQVu2KnlOS2YWPoyQQRqPxCjyhxm_Lrde1-mJ1f-_d9L0oFPeLSBE88krIF1Bqzsl1lxuMQDLbsrsc1RmVOaCo63b34ShVrpieviCQFEpuacZ3IlugQ7hw8PhAxt6VJ0HI8DGaMLNYQw1hiWxPRJ8NPA9p5Y2OHaNQRc0uWaIjbhGW2MwUf-FPgOt6mKhjWtzVcZvxU6-2OyEzPBkkDMB5yjz3x6fXuvxcWCz2e_YZCSLeSrytGU0vd2Qc5mEuhisFWFLDeRKNA_pbmedMgqa-u077cPbjreTvzMH9pjAN04sL4KSMWihIn55EgWpKyW4dwhbO8RZdM2m-7rYOvIqJOE8WrdQhKWkIwtMZ9l7xN90tAQHEhOHR5wP_5mk2phphR7jn8BuBE0nu9ErNYnuYgPjpKUV3PHC4jrBsOH2ClBg9BvQ5Xg6yXLhb-cG-DLpX4JhLWHVpD2TjOHlOnbZUeRsVWfjJdu14FIRvbrV8y1T_lvXAV3O5jZYX5w1byamOfceDbZkNIaOjqV4n5Aq1GEw7JPB_MAHzgydk6qnEENnwzogP1pjUhlAg0zGaK6DnX9SkWP9OIfe32sJiBON51HcxN7ed2syZYwGY3hVsqjMyUN7fBccXQpBRkAEXcDPNe_wYp4txyhqlnPKoZCeupxau2p_lZsfDP1NwI2bTZQ73veX0mSYqubcKOOaDNImPb9_lQNSftoeNSbkjUWlq5fwY0HTks1B7gRkBzYVnB-nxmRNKhuXGMLwnV2GFMJmCvGPgglgfz9bxke_mxvIs5kfW96Le2puSBB2C87JsWx1evuhHBE_sOJM93_05Le33wfutBgpi9vjPHR789gttQcYOR_IHVSl7zQYks4VpuKnZWHly7uOfl5mQ8WHqP1ZMebXHIe0jom-Qt48bRsUsaSpgH096JyiHtKh9w_N3OlscuY4djDzvBz1OegILcmxfp9QD4RKqob9d95KeBKfJOzHKS7HbC_Vwe3WMvErHHt6Ovkc1DU9tDQkCJi8yGUXgIK2M6xQnyKGqHK5dlactCaFmHIuXOh-dTIMJNs_Q9XwnW_CcxOnHA8KzW_9-L40hqTFZ1GVQOzBs4cUtnPMMbZs2dcvwXQCiftiZGglpkX2EPRWKEWUzEnDg08mbMETOvA01aGV4CMFdeJ9rP_B9mRyUywojYT2GcWMAb41rP6_2MIEqYoB3edLnT51WvdaOYAlj2vIaD3VVm-ze8l1FBAev3F2IlyW_lx3bJA-mdN-AiFBc45cvvADg47sBMeBUfb61WHF0HQhRLu7ICGU06VZPQ1A3TtAfRAsIF2hv5xM5bzmUjMjZc_u_b1FVCHjUyKXfAEjMEgw4nQNLdr70EL4MJx6P_sWMXx1J4_tZ0GwTM4sGfyTrePcJMdE_SfDoIjJhzMCTvhPnIxlqXBZmrrnuvBIn9MuLS51C0Z5RddpjhBdGXf1CTdcyFIsTJuKtKkBcpsp_E4H9rVvmrbbQAZFbY4bmgSBKDDImDCwOYepgZHSHv-F9DrLNntr1DjGjbnu3vmXUkFdCFU0oQyhuijcwLkTsn-arjP5yz0rIeI1tnxrorCjFoMMbn-cMVGjFJHZcUiyiXKGbPaz3uUYzc8mPtpRqCDPt2fOSgrFLFEMlOWI_fGvhGQLfhK-iQKCY7HjcPqubR589XhM-o92TId2jIHvvgoqNY2s3-JY40ils3PkU0x3PHgknTyzU38JXagUFFk8HVolQtDaTZddJVtt0_LetrEFMzMlFu6cv7wV5rwJl5-aHbn84448LrawCVkg9q3ljawpeV_W1KzdnHB-b0Gt8NPITWImlRcqGT4iGtnnErzup8AyRqTvV4zKJi0gNwKQPMfk-C-d9OI9zlxs9U3vI3_DA9X-5VP8GJBLDNLaFQpK8iY5sH6rxqD2FKxAmkCRdizGQXnw50AuZQewJ4942bEQwNY5K3t_F9r-_ldtLtt-dnFTEwWiogHlcBogznWX4CHza27s6yfyhFYM0-OM0pIbzI7vmHNnDDjQpnyOrHZQAyHBOtItNP20BfwL7rADARpvgvHXqlsDGMzkT41W4qH-zqsCTL9jEP1u-61SimUtY35q8QywO5QhoEhq7EutOmstaondFuA2SDHQTM6CW2JKPyicO9HGvREUvkYQOjPV44a7p48ATGY2d5CtbhSSCD4QX8KMhSNYSj2GkStej_M6haMvLRdnBVlXMQJCxChRcnMJgJWX11GtCC',
    '__Secure-monitorandcontrolC2': 'ZTz2OpRYePDRLRQF42z94lZUSlsCxrNW1UsskxRnBed2ImymhA1_pIzP49ItpEFo8Ro9aTUcACsVIJAEpEdYQmRtOHwV4ollzajG-aKdGuVe3uGCttVW6wQjtzpDtMFlAJYTnZJfywz_KjdXpf2vd6phtJArFSkG8E9QxhXtqOJ3ElidQZQapHN7peOT_w7jZUzXSnVKq9ei78Vf4ciqL7Qy9X9ndcRAsUcl6gY83BvhNGigjwp90TssFY6wl5mlKr7iEw-hwIsEX8g_8KLVmGFxa34yR0_RxkqF527T20LpaJsJDD-9YvjbN2azpof7u5xa4ANC6ej9UUS7l0yFezggkxY6BWgsw0fjudW7hFtFQbFZuo9DJiHNhWO0GuGSBYALqVsd89AOuI-ES3E7agCEhcow6TAYFmfiBIN',
  }
};

/**
 * Make HTTPS request helper
 */
function makeRequest(method, path, data = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const cookieString = Object.entries(CONFIG.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');

    const options = {
      hostname: 'melcloudhome.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookieString,
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

    if (data) {
      options.headers['Content-Type'] = 'application/json; charset=utf-8';
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = https.request(options, (res) => {
      let body = '';

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
 * Get user context (includes device list)
 */
async function getUserContext() {
  console.log('\n📋 Fetching user context (device list)...');

  try {
    const response = await makeRequest('GET', '/api/user/context', null, { 'X-CSRF': '1' });

    if (response.statusCode !== 200) {
      console.error(`❌ Failed: HTTP ${response.statusCode}`);
      return null;
    }

    console.log('✅ Success!\n');

    const context = response.body;

    // Display user info
    console.log('👤 User Information:');
    console.log(`   Name: ${context.firstname} ${context.lastname}`);
    console.log(`   Email: ${context.email}`);
    console.log(`   Language: ${context.language}`);
    console.log(`   Country: ${context.country}`);

    // Display buildings and devices
    console.log('\n🏢 Buildings:');
    for (const building of context.buildings) {
      console.log(`\n   📍 ${building.name} (${building.timezone})`);
      console.log(`      ID: ${building.id}`);

      // Air-to-Air units
      if (building.airToAirUnits && building.airToAirUnits.length > 0) {
        console.log(`\n      ❄️  Air-to-Air Units (${building.airToAirUnits.length}):`);

        for (const unit of building.airToAirUnits) {
          console.log(`\n         ${unit.displayIcon} "${unit.givenDisplayName}"`);
          console.log(`         ID: ${unit.id}`);
          console.log(`         Connected: ${unit.isConnected ? '✅' : '❌'} (RSSI: ${unit.rssi})`);

          // Parse settings
          const settings = {};
          unit.settings.forEach(s => settings[s.name] = s.value);

          console.log(`         Power: ${settings.Power === 'True' ? 'ON' : 'OFF'}`);
          console.log(`         Mode: ${settings.OperationMode}`);
          console.log(`         Room Temp: ${settings.RoomTemperature}°C`);
          console.log(`         Set Temp: ${settings.SetTemperature}°C`);
          console.log(`         Fan Speed: ${settings.ActualFanSpeed}`);
          console.log(`         Vanes: H:${settings.VaneHorizontalDirection} V:${settings.VaneVerticalDirection}`);

          // Display capabilities
          const cap = unit.capabilities;
          console.log(`\n         Capabilities:`);
          console.log(`            Modes: ${[
            cap.hasCoolOperationMode && 'Cool',
            cap.hasHeatOperationMode && 'Heat',
            cap.hasAutoOperationMode && 'Auto',
            cap.hasDryOperationMode && 'Dry'
          ].filter(Boolean).join(', ')}`);
          console.log(`            Fan Speeds: ${cap.numberOfFanSpeeds}`);
          console.log(`            Temp Range (Cool): ${cap.minTempCoolDry}°C - ${cap.maxTempCoolDry}°C`);
          console.log(`            Temp Range (Heat): ${cap.minTempHeat}°C - ${cap.maxTempHeat}°C`);
          console.log(`            Half Degrees: ${cap.hasHalfDegreeIncrements ? 'Yes' : 'No'}`);
        }
      }

      // Air-to-Water units
      if (building.airToWaterUnits && building.airToWaterUnits.length > 0) {
        console.log(`\n      🔥 Air-to-Water Units: ${building.airToWaterUnits.length}`);
      }
    }

    return context;
  } catch (error) {
    console.error('❌ Failed to get user context:', error.message);
    return null;
  }
}

/**
 * Control a device
 */
async function controlDevice(deviceId, command, description) {
  console.log(`\n🎛️  ${description}...`);
  console.log(`   Device: ${deviceId}`);
  console.log(`   Command: ${JSON.stringify(command)}`);

  try {
    const response = await makeRequest(
      'PUT',
      `/api/ataunit/${deviceId}`,
      command,
      { 'X-CSRF': '1' }
    );

    if (response.statusCode === 200) {
      console.log('   ✅ Success!');
      return true;
    } else {
      console.log(`   ❌ Failed: HTTP ${response.statusCode}`);
      console.log(`   Response: ${JSON.stringify(response.body, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
    return false;
  }
}

/**
 * Interactive device selection
 */
async function selectDevice(context) {
  const allUnits = [];

  for (const building of context.buildings) {
    for (const unit of building.airToAirUnits || []) {
      const settings = {};
      unit.settings.forEach(s => settings[s.name] = s.value);

      allUnits.push({
        id: unit.id,
        name: unit.givenDisplayName,
        building: building.name,
        power: settings.Power === 'True',
        mode: settings.OperationMode,
        temp: settings.SetTemperature
      });
    }
  }

  if (allUnits.length === 0) {
    console.log('\n❌ No devices found!');
    return null;
  }

  console.log('\n📱 Available Devices:');
  allUnits.forEach((unit, idx) => {
    console.log(`   ${idx + 1}. ${unit.building} - ${unit.name} (${unit.power ? 'ON' : 'OFF'}, ${unit.mode}, ${unit.temp}°C)`);
  });

  // For testing, return first device
  return allUnits[0];
}

/**
 * Main test sequence
 */
async function main() {
  console.log('🚀 MELCloud Home API Test Script (Improved)\n');
  console.log('=' .repeat(70));

  // Check if cookies are configured
  if (CONFIG.cookies['__Secure-monitorandcontrolC1'] === 'PASTE_YOUR_C1_COOKIE_HERE') {
    console.log('\n⚠️  WARNING: Cookies not configured!');
    console.log('\nTo use this script:');
    console.log('1. Open https://melcloudhome.com in your browser and log in');
    console.log('2. Open Developer Tools (F12)');
    console.log('3. Go to Network tab');
    console.log('4. Refresh the page');
    console.log('5. Click on any request to melcloudhome.com');
    console.log('6. In the Headers tab, find "Cookie:" in Request Headers');
    console.log('7. Copy the values of __Secure-monitorandcontrolC1 and C2');
    console.log('8. Paste them in the CONFIG object in this script\n');
    return;
  }

  try {
    // Step 1: Get user context (device list)
    const context = await getUserContext();

    if (!context) {
      console.error('\n❌ Failed to get device list. Check your cookies!\n');
      return;
    }

    // Step 2: Select a device for testing
    const device = await selectDevice(context);

    if (!device) {
      return;
    }

    console.log('\n' + '=' .repeat(70));
    console.log('🧪 Device Control Test');
    console.log('=' .repeat(70));

    // Step 3: Test device control
    // We'll test on the Bedroom (Sovrum) which is currently OFF

    const bedroomDevice = {
      id: '0f9f5273-4007-44d0-b197-4755321ed7a8',
      name: 'Sovrum'
    };

    // Test 1: Turn bedroom ON
    console.log(`\n🔧 Test 1: Turn ${bedroomDevice.name} ON`);
    await controlDevice(bedroomDevice.id, {
      power: true,
      operationMode: null,
      setFanSpeed: null,
      vaneHorizontalDirection: null,
      vaneVerticalDirection: null,
      setTemperature: null,
      temperatureIncrementOverride: null,
      inStandbyMode: null
    }, `Turn ${bedroomDevice.name} ON`);

    // Wait a bit and verify
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('\n📊 Checking device state...');
    const updatedContext = await getUserContext();

    // Test 2: Turn bedroom OFF again
    console.log(`\n🔧 Test 2: Turn ${bedroomDevice.name} OFF again`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await controlDevice(bedroomDevice.id, {
      power: false,
      operationMode: null,
      setFanSpeed: null,
      vaneHorizontalDirection: null,
      vaneVerticalDirection: null,
      setTemperature: null,
      temperatureIncrementOverride: null,
      inStandbyMode: null
    }, `Turn ${bedroomDevice.name} OFF`);

  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Test script completed\n');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  makeRequest,
  getUserContext,
  controlDevice,
};
