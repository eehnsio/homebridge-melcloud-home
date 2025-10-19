# MELCloud Home API Research

## Overview
MELCloud Home is a variant of the MELCloud platform for Mitsubishi AC units. This document tracks our reverse engineering findings.

## Key Differences from Original MELCloud

### Base URLs
- **Original MELCloud**: `https://app.melcloud.com`
- **MELCloud Home**: `https://melcloudhome.com`

### Subdomains Observed
- `ws.melcloudhome.com` - WebSocket/API endpoint
- `auth.melcloudhome.com` - Authentication
- `mobile.bff.melcloudhome.com` - Mobile Backend-for-Frontend

## API Endpoints Discovered

### Device Control
**Endpoint**: `PUT https://melcloudhome.com/api/ataunit/{device-id}`

**Example Device ID**: `415ac1f5-07a5-4e53-b9e5-d274b021eb09`

**Headers Required**:
```
Content-Type: application/json; charset=utf-8
X-CSRF: 1
Cookie: __Secure-monitorandcontrol=chunks-2; __Secure-monitorandcontrolC1=...; __Secure-monitorandcontrolC2=...
```

**Payload Structure** (Power Off):
```json
{
  "power": false,
  "operationMode": null,
  "setFanSpeed": null,
  "vaneHorizontalDirection": null,
  "vaneVerticalDirection": null,
  "setTemperature": null,
  "temperatureIncrementOverride": null,
  "inStandbyMode": null
}
```

**Payload Structure** (Power On):
```json
{
  "power": true,
  "operationMode": null,
  "setFanSpeed": null,
  "vaneHorizontalDirection": null,
  "vaneVerticalDirection": null,
  "setTemperature": null,
  "temperatureIncrementOverride": null,
  "inStandbyMode": null
}
```

## Authentication

### Cookie-Based Authentication
Uses ASP.NET Core authentication cookies:
- `__Secure-monitorandcontrol` (main cookie, value: "chunks-2")
- `__Secure-monitorandcontrolC1` (chunked cookie part 1 - large encrypted data)
- `__Secure-monitorandcontrolC2` (chunked cookie part 2 - large encrypted data)

### CSRF Protection
Requires `X-CSRF: 1` header on state-changing requests (PUT/POST)

## Additional Endpoints Discovered

### Authentication Flow
Uses **AWS Cognito** for authentication:
- **Cognito Login**: `https://live-melcloudhome.auth.eu-west-1.amazoncognito.com/login`
- **Client ID**: `3g4d5l5kivuqi7oia68gib7uso`
- **Callback**: `https://auth.melcloudhome.com/signin-oidc-meu`
- Uses PKCE (Proof Key for Code Exchange) flow
- After successful auth, redirects back to `https://melcloudhome.com/dashboard`

### API Endpoints

1. **GET /api/configuration**
   - Returns app configuration

2. **GET /bff/user?slide=false**
   - Backend-For-Frontend user endpoint
   - Returns user information

3. **GET /ws/token**
   - WebSocket authentication token

4. **GET /api/announcement/{language}**
   - e.g., `/api/announcement/sv-SE`

5. **GET /api/user/context**
   - User context information

6. **GET /api/user/systeminvites**
   - System invitations

### WebSocket Connection
**URL**: `wss://ws.melcloudhome.com/?hash={token}`
- Used for real-time device updates
- Token obtained from `/ws/token` endpoint

## Dashboard API Endpoints

These endpoints are called when loading the dashboard:

7. **GET /api/configuration**
   - Returns application configuration
   - Response includes app settings, feature flags, etc.

8. **GET /bff/user?slide=false**
   - Backend-for-Frontend user endpoint
   - Returns user profile information
   - Query param `slide=false` suggests UI state

9. **GET /ws/token**
   - Returns WebSocket authentication token
   - Token used to connect to `wss://ws.melcloudhome.com/?hash={token}`
   - Required for real-time device updates

10. **GET /api/announcement/{language-code}**
    - Returns announcements/notifications
    - Example: `/api/announcement/sv-SE` for Swedish
    - Language code format: ISO 639-1 + ISO 3166-1 (e.g., `en-US`, `sv-SE`)

11. **GET /api/user/context** ⭐ **PRIMARY ENDPOINT**
    - **This IS the device list endpoint - contains everything!**
    - Returns complete user profile, buildings, and all devices with current state
    - Called multiple times during dashboard navigation
    - No separate device list endpoint needed

12. **GET /api/user/systeminvites**
    - Returns pending system invitations
    - For shared access to other users' systems

## Data Model from `/api/user/context`

### Response Structure
```
{
  "id": "user-guid",
  "firstname": "string",
  "lastname": "string",
  "email": "string",
  "language": "sv",
  "country": "SE",
  "numberOfDevicesAllowed": 10,
  "numberOfBuildingsAllowed": 2,
  "buildings": [
    {
      "id": "building-guid",
      "name": "string",
      "timezone": "Europe/Stockholm",
      "airToAirUnits": [ /* ATA devices */ ],
      "airToWaterUnits": [ /* ATW devices */ ]
    }
  ],
  "guestBuildings": [],
  "scenes": []
}
```

### Air-to-Air Unit (ATA) Structure
```json
{
  "id": "415ac1f5-07a5-4e53-b9e5-d274b021eb09",
  "givenDisplayName": "Kök",
  "displayIcon": "DiningRoom",
  "settings": [
    { "name": "RoomTemperature", "value": "22" },
    { "name": "Power", "value": "True" },
    { "name": "OperationMode", "value": "Cool" },
    { "name": "ActualFanSpeed", "value": "Two" },
    { "name": "SetFanSpeed", "value": "0" },
    { "name": "VaneHorizontalDirection", "value": "Centre" },
    { "name": "VaneVerticalDirection", "value": "One" },
    { "name": "InStandbyMode", "value": "False" },
    { "name": "SetTemperature", "value": "23.5" },
    { "name": "IsInError", "value": "False" },
    { "name": "ErrorCode", "value": "" }
  ],
  "capabilities": {
    "isMultiSplitSystem": true,
    "isLegacyDevice": false,
    "hasStandby": true,
    "hasCoolOperationMode": true,
    "hasHeatOperationMode": true,
    "hasAutoOperationMode": true,
    "hasDryOperationMode": true,
    "hasAutomaticFanSpeed": true,
    "hasAirDirection": true,
    "hasSwing": true,
    "hasExtendedTemperatureRange": true,
    "hasEnergyConsumedMeter": true,
    "numberOfFanSpeeds": 5,
    "minTempCoolDry": 16,
    "maxTempCoolDry": 31,
    "minTempHeat": 10,
    "maxTempHeat": 31,
    "minTempAutomatic": 16,
    "maxTempAutomatic": 31,
    "hasDemandSideControl": true,
    "hasHalfDegreeIncrements": true,
    "supportsWideVane": true
  },
  "rssi": -35,
  "isConnected": true,
  "connectedInterfaceIdentifier": "282e893ad9c4",
  "systemId": "system-guid"
}
```

## Discovered Value Mappings

### Operation Modes
From context response:
- `"Cool"` - Cooling mode
- `"Heat"` - Heating mode (capability: `hasCoolOperationMode`)
- `"Auto"` - Automatic mode (capability: `hasAutoOperationMode`)
- `"Dry"` - Dry/Dehumidify mode (capability: `hasDryOperationMode`)
- `"Fan"` - Fan only mode (inferred from old API)

### Fan Speed Values
**SetFanSpeed** (numeric values 0-5):
- `"0"` - Auto
- `"1"` - Speed 1 (Quiet)
- `"2"` - Speed 2 (Weak)
- `"3"` - Speed 3 (Medium)
- `"4"` - Speed 4 (Strong)
- `"5"` - Speed 5 (Very Strong)

**ActualFanSpeed** (text values):
- `"Auto"` - Automatic
- `"One"` - Speed 1
- `"Two"` - Speed 2
- `"Three"` - Speed 3
- `"Four"` - Speed 4
- `"Five"` - Speed 5

### Vane Horizontal Direction
- `"Centre"` - Center position
- `"Left"` - Left position
- `"LeftCentre"` - Left-center position
- `"Right"` - Right position
- `"RightCentre"` - Right-center position
- `"Split"` - Split mode
- `"Swing"` - Swing mode

### Vane Vertical Direction
- `"Auto"` - Automatic
- `"One"` through `"Five"` - Positions 1-5
- `"Swing"` - Swing mode

### Display Icons
- `"DiningRoom"`
- `"Bedroom"`
- `"LivingRoom"`
- `"Office"`
- `"Bathroom"`
- etc.

## Comparison with Old MELCloud API

### Old MELCloud (`app.melcloud.com`)
**Base URL**: `https://app.melcloud.com/Mitsubishi.Wifi.Client`

**Authentication**:
- Endpoint: `POST /Login/ClientLogin`
- Uses email/password in POST body
- Returns `ContextKey` used as `X-MitsContextKey` header
- Simple token-based auth

**Device List**:
- Endpoint: `GET /User/ListDevices`
- Returns hierarchical structure: Buildings → Floors → Areas → Devices
- Requires `X-MitsContextKey` header

**Device Control**:
- Endpoint: `POST /Device/SetAta` (for Air-to-Air)
- Sends full device state
- Uses `EffectiveFlags` bitmask to indicate changed fields

### New MELCloud Home (`melcloudhome.com`)
**Base URL**: `https://melcloudhome.com`

**Authentication**:
- Uses AWS Cognito OAuth 2.0 with PKCE
- Session cookies (chunked ASP.NET Core cookies)
- Much more complex than old API

**Device List**:
- Endpoint: `GET /api/user/context`
- Returns flat structure: Buildings → airToAirUnits/airToWaterUnits
- Settings as name/value pairs instead of direct properties

**Device Control**:
- Endpoint: `PUT /api/ataunit/{device-id}`
- Sends only changed fields (nulls for unchanged)
- Requires `X-CSRF: 1` header
- Uses camelCase property names

## TODO: Still to Discover

- [x] Device list endpoint → `/api/user/context`
- [x] Operation mode values → Documented above
- [x] Fan speed values → Documented above
- [x] Vane direction values → Documented above
- [x] Device capabilities → In `capabilities` object
- [ ] Complete authentication flow (AWS Cognito)
- [ ] WebSocket protocol for real-time updates
- [ ] Energy consumption endpoints
- [ ] Schedule management
- [ ] Scene management
- [ ] Temperature update payload variations

## Authentication Details

### Cookie Structure
MELCloud Home uses ASP.NET Core chunked cookies:
- `__Secure-monitorandcontrol=chunks-2` - Indicates 2 cookie chunks
- `__Secure-monitorandcontrolC1` - First chunk (large encrypted session data)
- `__Secure-monitorandcontrolC2` - Second chunk (continuation of session data)

The chunked approach is used because the session data exceeds browser cookie size limits (typically 4KB).

### AWS Cognito Authentication Flow
1. User initiates login on `https://melcloudhome.com`
2. Redirects to AWS Cognito: `https://live-melcloudhome.auth.eu-west-1.amazoncognito.com/login`
3. Cognito Client ID: `3g4d5l5kivuqi7oia68gib7uso`
4. Uses PKCE (Proof Key for Code Exchange) for OAuth 2.0
5. After successful auth, callback to: `https://auth.melcloudhome.com/signin-oidc-meu`
6. Sets session cookies and redirects to: `https://melcloudhome.com/dashboard`

## Notes

- API uses GUID-style device IDs (not numeric like original MELCloud)
- Payload only includes fields being changed (others set to null)
- Uses modern secure cookies (`__Secure-` prefix) with chunking for large sessions
- All state-changing requests require `X-CSRF: 1` header
- All requests include standard browser headers for CORS compliance
