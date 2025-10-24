# MELCloud Home API Reference

This document consolidates our API research and discoveries for future reference.

## Table of Contents
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Device Control](#device-control)
- [Discovery Notes](#discovery-notes)

---

## Authentication

### OAuth 2.0 Flow

**Authorization Server:** `https://auth.melcloudhome.com`

**Token Endpoint:** `POST https://auth.melcloudhome.com/connect/token`

**Client Credentials:**
- Client ID: `homemobile`
- Client Secret: (empty - public client)
- Authorization Header: `Basic aG9tZW1vYmlsZTo=` (base64 of "homemobile:")

**Supported Grant Types:**
1. `authorization_code` - Initial login with PKCE
2. `refresh_token` - Token refresh

### Initial Login (Authorization Code + PKCE)

```http
POST /connect/token
Host: auth.melcloudhome.com
Authorization: Basic aG9tZW1vYmlsZTo=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri=melcloudhome://
&client_id=homemobile
&code_verifier={pkce_verifier}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "XXXXX-1",
  "id_token": "eyJ...",
  "scope": "openid profile email offline_access IdentityServerApi"
}
```

### Token Refresh

```http
POST /connect/token
Host: auth.melcloudhome.com
Authorization: Basic aG9tZW1vYmlsZTo=
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={current_refresh_token}
```

**Notes:**
- Access tokens expire in 1 hour (3600 seconds)
- Refresh tokens rotate on each refresh (new one provided)
- Use 5-minute buffer before expiry to refresh proactively

---

## API Endpoints

### Base URL

**Mobile BFF API:** `https://mobile.bff.melcloudhome.com`

**Authentication:** Bearer token in Authorization header
```http
Authorization: Bearer {access_token}
User-Agent: MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0
```

### Get User Context

```http
GET /api/usercontexts/mine
Host: mobile.bff.melcloudhome.com
Authorization: Bearer {access_token}
```

**Response:** Contains all buildings and devices
```json
{
  "id": "user-id",
  "firstname": "...",
  "lastname": "...",
  "email": "...",
  "buildings": [
    {
      "id": "building-id",
      "name": "My Home",
      "airToAirUnits": [...]
    }
  ]
}
```

### Control Device

```http
PUT /api/airtoairunits/{deviceId}
Host: mobile.bff.melcloudhome.com
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "power": true,
  "operationMode": "Heat",
  "setFanSpeed": "Three",
  "vaneHorizontalDirection": "Center",
  "vaneVerticalDirection": "Auto",
  "setTemperature": 21.5,
  "temperatureIncrementOverride": null,
  "inStandbyMode": null
}
```

**Operation Modes:** `Heat`, `Cool`, `Auto`, `Dry`, `Fan`

**Fan Speeds:** `Auto`, `One`, `Two`, `Three`, `Four`, `Five`

**Vane Directions:** `Auto`, `Left`, `Center`, `Right` (horizontal)
                     `Auto`, `Top`, `MidTop`, `Mid`, `MidBottom`, `Bottom` (vertical)

---

## Device Control

### Power States
- `true` - Device on
- `false` - Device off

### Temperature
- Range: Device-specific (typically 16-31°C)
- Supports 0.5° increments via `temperatureIncrementOverride`
- `temperatureIncrementOverride: 0` = 1.0° steps
- `temperatureIncrementOverride: 1` = 0.5° steps

### Fan Speed Mapping (HomeKit)

**API to HomeKit:**
- `Auto` → Rotation Speed 1
- `One` → Rotation Speed 2
- `Two` → Rotation Speed 3
- `Three` → Rotation Speed 4
- `Four` → Rotation Speed 5
- `Five` → Rotation Speed 6

**Note:** Range shifted to 1-6 because HomeKit treats rotation speed 0 as "turn off"

---

## Discovery Notes

### How We Found This

1. **APK Analysis** - Decompiled MELCloud Home Android APK to find:
   - Client ID: `homemobile`
   - API endpoints
   - User-Agent strings

2. **mitmproxy** - Captured iOS app traffic to discover:
   - Full OAuth flow
   - Token exchange process
   - Mobile BFF API (`mobile.bff.melcloudhome.com`)
   - Actual request/response formats

3. **OAuth Breakthrough** - Discovered PKCE implementation:
   - S256 code challenge method
   - State parameter validation
   - Redirect URI: `melcloudhome://`

### Key Discoveries

- **No client secret** - Public client (mobile app)
- **Token rotation** - New refresh token with each access token refresh
- **Mobile BFF** - Optimized mobile backend vs web API
- **User-Agent required** - Must match mobile app pattern
- **Bearer auth** - All API calls use access token

### Differences from Web API

The web interface (`app.melcloudhome.com`) uses different endpoints:
- Different authentication flow
- Different API structure
- This plugin uses the **mobile** API exclusively

---

## Rate Limiting

Based on testing:
- **Token refresh:** No observed limit (reasonable use)
- **Device control:** No hard limit observed
- **Status polling:** Recommended 60-120 seconds

**Best Practices:**
- Use debounced refresh (2s) for rapid commands
- Keep periodic polling ≥ 60 seconds
- Refresh tokens proactively (5min before expiry)

---

## Error Handling

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (token expired/invalid)
- `404` - Device not found
- `500` - Server error

### Retry Logic

**401 Unauthorized:**
1. Force token refresh
2. Retry request once
3. If still fails, re-authentication required

**Other Errors:**
- Log and report to user
- Don't retry automatically

---

## Security Notes

- Store refresh tokens securely (Homebridge config)
- Never log full tokens
- Tokens rotate automatically
- Access tokens expire in 1 hour
- Use HTTPS for all requests

---

## Reference Files

Historical research archived in `.archive/investigation/`:
- `API_RESEARCH.md` - Detailed API exploration
- `MITMPROXY_FINDINGS.md` - Network traffic analysis
- `OAUTH_BREAKTHROUGH.md` - OAuth implementation discovery
- `APK_ANALYSIS_SUMMARY.md` - Mobile app reverse engineering

---

**Last Updated:** 2025-10-22
**Plugin Version:** 1.0.0
