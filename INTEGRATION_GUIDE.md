# MELCloud Home Integration Guide

This guide explains how to integrate with the MELCloud Home API for building a Homebridge plugin or other automation.

## Quick Start

1. **Get Device List**: `GET /api/user/context`
2. **Control Device**: `PUT /api/ataunit/{device-id}` with JSON payload
3. **Authentication**: Use session cookies from browser (manual process for now)

## Core API Endpoints

### 1. Get User Context (Device List)

**Endpoint**: `GET /api/user/context`

**Headers Required**:
```
Cookie: __Secure-monitorandcontrol=chunks-2; __Secure-monitorandcontrolC1=...; __Secure-monitorandcontrolC2=...
X-CSRF: 1
```

**Response**: Contains everything you need:
- User profile
- All buildings
- All devices (in `buildings[].airToAirUnits[]`)
- Current device states (in `settings[]`)
- Device capabilities

**Key Data Structure**:
```javascript
{
  buildings: [
    {
      id: "building-guid",
      name: "Building Name",
      airToAirUnits: [
        {
          id: "device-guid",
          givenDisplayName: "Kitchen",
          settings: [
            { name: "Power", value: "True" },
            { name: "RoomTemperature", value: "22" },
            { name: "SetTemperature", value: "23.5" },
            { name: "OperationMode", value: "Cool" },
            // ... more settings
          ],
          capabilities: {
            hasCoolOperationMode: true,
            hasHeatOperationMode: true,
            numberOfFanSpeeds: 5,
            minTempCoolDry: 16,
            maxTempCoolDry: 31,
            // ... more capabilities
          }
        }
      ]
    }
  ]
}
```

### 2. Control Device

**Endpoint**: `PUT /api/ataunit/{device-id}`

**Headers Required**:
```
Cookie: [same as above]
X-CSRF: 1
Content-Type: application/json; charset=utf-8
```

**Payload** (only include fields you want to change):
```json
{
  "power": true,
  "operationMode": "Cool",
  "setFanSpeed": 3,
  "vaneHorizontalDirection": "Centre",
  "vaneVerticalDirection": "Auto",
  "setTemperature": 24,
  "temperatureIncrementOverride": null,
  "inStandbyMode": false
}
```

**Notes**:
- Set unchanged fields to `null`
- Or only send the fields you want to change
- Response: HTTP 200 on success

## Device Settings Reference

### Settings Array Format
Settings are returned as name/value pairs:
```javascript
settings.find(s => s.name === "Power").value  // "True" or "False"
```

### Available Settings

| Setting Name | Type | Example Values | Description |
|-------------|------|----------------|-------------|
| `Power` | Boolean String | `"True"`, `"False"` | Device on/off |
| `RoomTemperature` | Number String | `"22"` | Current room temperature |
| `SetTemperature` | Number String | `"23.5"` | Target temperature (supports 0.5 increments) |
| `OperationMode` | String | `"Cool"`, `"Heat"`, `"Auto"`, `"Dry"`, `"Fan"` | Operating mode |
| `ActualFanSpeed` | String | `"Auto"`, `"One"`, `"Two"`, `"Three"`, `"Four"`, `"Five"` | Current fan speed |
| `SetFanSpeed` | Number String | `"0"` (Auto), `"1"` to `"5"` | Desired fan speed |
| `VaneHorizontalDirection` | String | `"Centre"`, `"Left"`, `"Right"`, `"Swing"` | Horizontal vane position |
| `VaneVerticalDirection` | String | `"Auto"`, `"One"` to `"Five"`, `"Swing"` | Vertical vane position |
| `InStandbyMode` | Boolean String | `"True"`, `"False"` | Standby mode active |
| `IsInError` | Boolean String | `"True"`, `"False"` | Error state |
| `ErrorCode` | String | `""` or error code | Error code if in error |

## Control Payload Reference

### Power Control
```json
{ "power": true }   // Turn on
{ "power": false }  // Turn off
```

### Temperature Control
```json
{ "setTemperature": 24 }     // Set to 24°C
{ "setTemperature": 23.5 }   // Set to 23.5°C (if hasHalfDegreeIncrements)
```

**Temperature Ranges** (check `capabilities` object):
- Cool/Dry: `minTempCoolDry` to `maxTempCoolDry` (typically 16-31°C)
- Heat: `minTempHeat` to `maxTempHeat` (typically 10-31°C)
- Auto: `minTempAutomatic` to `maxTempAutomatic` (typically 16-31°C)

### Operation Mode
```json
{ "operationMode": "Cool" }  // Cooling
{ "operationMode": "Heat" }  // Heating
{ "operationMode": "Auto" }  // Automatic
{ "operationMode": "Dry" }   // Dehumidify
{ "operationMode": "Fan" }   // Fan only
```

**Check capabilities first**:
- `hasCoolOperationMode`
- `hasHeatOperationMode`
- `hasAutoOperationMode`
- `hasDryOperationMode`

### Fan Speed Control
```json
{ "setFanSpeed": 0 }  // Auto
{ "setFanSpeed": 1 }  // Quiet
{ "setFanSpeed": 2 }  // Low
{ "setFanSpeed": 3 }  // Medium
{ "setFanSpeed": 4 }  // High
{ "setFanSpeed": 5 }  // Very High
```

**Max value**: Check `capabilities.numberOfFanSpeeds` (typically 5)

### Vane Direction Control

**Horizontal**:
```json
{ "vaneHorizontalDirection": "Centre" }
{ "vaneHorizontalDirection": "Left" }
{ "vaneHorizontalDirection": "LeftCentre" }
{ "vaneHorizontalDirection": "Right" }
{ "vaneHorizontalDirection": "RightCentre" }
{ "vaneHorizontalDirection": "Split" }
{ "vaneHorizontalDirection": "Swing" }
```

**Vertical**:
```json
{ "vaneVerticalDirection": "Auto" }
{ "vaneVerticalDirection": "One" }    // Top position
{ "vaneVerticalDirection": "Two" }
{ "vaneVerticalDirection": "Three" }
{ "vaneVerticalDirection": "Four" }
{ "vaneVerticalDirection": "Five" }   // Bottom position
{ "vaneVerticalDirection": "Swing" }
```

**Check capabilities**:
- `hasAirDirection`
- `hasSwing`

### Combined Example
Turn on, set to cooling at 24°C with medium fan:
```json
{
  "power": true,
  "operationMode": "Cool",
  "setTemperature": 24,
  "setFanSpeed": 3,
  "vaneHorizontalDirection": null,
  "vaneVerticalDirection": null,
  "temperatureIncrementOverride": null,
  "inStandbyMode": null
}
```

## Capabilities Reference

The `capabilities` object tells you what each device supports:

```javascript
{
  // System info
  "isMultiSplitSystem": true,      // Part of multi-split system
  "isLegacyDevice": false,         // Modern device

  // Operation modes
  "hasCoolOperationMode": true,
  "hasHeatOperationMode": true,
  "hasAutoOperationMode": true,
  "hasDryOperationMode": true,
  "hasStandby": true,

  // Fan control
  "hasAutomaticFanSpeed": true,
  "numberOfFanSpeeds": 5,          // Max fan speed setting

  // Vane control
  "hasAirDirection": true,
  "hasSwing": true,
  "supportsWideVane": true,

  // Temperature limits (in Celsius)
  "minTempCoolDry": 16,
  "maxTempCoolDry": 31,
  "minTempHeat": 10,
  "maxTempHeat": 31,
  "minTempAutomatic": 16,
  "maxTempAutomatic": 31,
  "hasExtendedTemperatureRange": true,
  "hasHalfDegreeIncrements": true,

  // Advanced features
  "hasDemandSideControl": true,
  "hasEnergyConsumedMeter": true
}
```

## Device Status Properties

```javascript
{
  "id": "device-guid",
  "givenDisplayName": "Kitchen",
  "displayIcon": "DiningRoom",
  "isConnected": true,              // Device online status
  "isInError": false,               // Error state
  "rssi": -35,                      // WiFi signal strength (dBm)
  "timeZone": "Europe/Stockholm",
  "systemId": "system-guid",
  "connectedInterfaceIdentifier": "282e893ad9c4",  // MAC address
  "connectedInterfaceType": 0
}
```

## Authentication (Current Limitation)

MELCloud Home uses **AWS Cognito OAuth 2.0 with PKCE** flow, which is complex.

**Current Workaround** (for testing):
1. Log in to https://melcloudhome.com in a browser
2. Open DevTools → Network tab
3. Find any request to `/api/user/context`
4. Copy the Cookie header values:
   - `__Secure-monitorandcontrolC1`
   - `__Secure-monitorandcontrolC2`
5. Use these in your API calls

**Cookie Lifetime**: Unknown, likely 24 hours or session-based

**Future Work**: Need to implement full OAuth 2.0 PKCE flow:
- Client ID: `3g4d5l5kivuqi7oia68gib7uso`
- Authorization endpoint: `https://live-melcloudhome.auth.eu-west-1.amazoncognito.com/login`
- Token exchange with PKCE code verifier/challenge

## Testing with the Script

```bash
# Edit test-api-improved.js and add your cookies
node test-api-improved.js
```

The script will:
1. Fetch your device list
2. Display all devices with current states
3. Show device capabilities
4. Provide example control commands

## Homebridge Plugin Approach

For a Homebridge plugin, you'll need to:

1. **Periodic Polling**:
   - Call `/api/user/context` every 30-60 seconds
   - Parse the `settings[]` array for each device
   - Update HomeKit accessory states

2. **Control Commands**:
   - When HomeKit sends a command, call `PUT /api/ataunit/{id}`
   - Map HomeKit characteristics to API fields:
     - `On` → `power`
     - `TargetTemperature` → `setTemperature`
     - `CurrentHeatingCoolingState` / `TargetHeatingCoolingState` → `operationMode`
     - `RotationSpeed` → `setFanSpeed`

3. **Device Discovery**:
   - Parse `buildings[].airToAirUnits[]`
   - Create one accessory per device
   - Use `capabilities` to determine available features

4. **WebSocket (Optional)**:
   - Get token from `/ws/token`
   - Connect to `wss://ws.melcloudhome.com/?hash={token}`
   - Receive real-time updates instead of polling

## Example: Parsing Device State

```javascript
function parseDeviceState(unit) {
  // Convert settings array to object
  const settings = {};
  unit.settings.forEach(s => settings[s.name] = s.value);

  return {
    power: settings.Power === 'True',
    currentTemp: parseFloat(settings.RoomTemperature),
    targetTemp: parseFloat(settings.SetTemperature),
    mode: settings.OperationMode,
    fanSpeed: parseInt(settings.SetFanSpeed),
    actualFanSpeed: settings.ActualFanSpeed,
    vaneH: settings.VaneHorizontalDirection,
    vaneV: settings.VaneVerticalDirection,
    isError: settings.IsInError === 'True',
    errorCode: settings.ErrorCode
  };
}
```

## Common Issues

1. **HTTP 401 Unauthorized**: Cookies expired, get new ones from browser
2. **HTTP 403 Forbidden**: Missing `X-CSRF: 1` header
3. **Device not responding**: Check `isConnected` property
4. **Invalid temperature**: Check `capabilities` for min/max values
5. **Mode not working**: Check `has{Mode}OperationMode` in capabilities

## Next Steps

- [ ] Implement OAuth 2.0 PKCE authentication
- [ ] WebSocket protocol for real-time updates
- [ ] Energy consumption data endpoints
- [ ] Schedule management
- [ ] Fork homebridge-melcloud-control and adapt for MELCloud Home
