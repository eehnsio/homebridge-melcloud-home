# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (melcloudhome.com). It enables HomeKit control of AC units through OAuth-based authentication with the MELCloud Home API.

**Important:** This plugin is specifically for MELCloud Home (melcloudhome.com), NOT the older MELCloud (app.melcloud.com). The APIs are completely different.

## Build & Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development (auto-rebuild on changes)
npm run watch

# Test API connectivity
npm test
```

## Release Process

**Releases are automated via GitHub Actions** - DO NOT manually run `npm publish`.

### Publishing a New Release

1. **Update version**: Edit `package.json` version field (e.g., `1.1.6` → `1.1.7`)
2. **Update CHANGELOG.md**: Add new version entry with changes
3. **Build**: Run `npm run build` to compile TypeScript
4. **Commit changes**: `git add package.json CHANGELOG.md && git commit -m "Release vX.X.X"`
5. **Create tag**: `git tag -a vX.X.X -m "Release vX.X.X - Description"`
6. **Push**: `git push && git push --tags`

### Automated Workflow (`.github/workflows/publish.yml`)

When a tag starting with `v` is pushed:
1. **Triggers automatically** on tag push (e.g., `v1.1.7`)
2. **Builds the package** (`npm ci && npm run build`)
3. **Publishes to npm** with provenance (`npm publish --provenance --access public`)
   - Stable releases (no beta/alpha/rc): Published as `latest` tag
   - Pre-releases (contains beta/alpha/rc): Published as `beta` tag
4. **Creates GitHub Release** with auto-generated changelog from git commits
5. **Uses npm token** from repository secrets (`NPM_TOKEN`)

### Important Notes

- **Never run `npm publish` manually** - The GitHub Action handles this
- **Always create annotated tags** (`git tag -a`) not lightweight tags
- **Tag format must be `vX.X.X`** (e.g., `v1.1.7`, `v2.0.0-beta.1`)
- **Provenance is automatic** - GitHub Actions provides attestation for supply chain security
- The workflow has `id-token: write` permission for npm provenance

## Architecture Overview

### Entry Point & Registration
- `src/index.ts` - Registers the platform with Homebridge
- Platform name: `MELCloudHome`
- Plugin name: `homebridge-melcloud-home`

### Core Components

#### 1. Platform (`src/platform.ts`)
The main platform class that implements Homebridge's `DynamicPlatformPlugin`:
- **Initialization**: Waits for Homebridge's `didFinishLaunching` event before initializing
- **Authentication**: Uses OAuth refresh tokens (stored in config) to obtain access tokens
- **Device Discovery**: Fetches all devices via `MELCloudAPI.getAllDevices()` and creates/updates accessories
- **Accessory Management**: Maintains two collections:
  - `accessories[]` - PlatformAccessory instances (for Homebridge)
  - `accessoryInstances` - Map of MELCloudAccessory instances (for control logic)
- **Periodic Refresh**: Polls MELCloud API at configurable intervals (default 30s) to sync state changes from external sources (MELCloud app, physical remote)
- **Debug Logging**: Custom `debugLog()` helper that respects `config.debug` flag and logs at INFO level (visible without `-D` flag)

#### 2. Accessory (`src/accessory.ts`)
Implements HomeKit HeaterCooler service for each AC unit:
- **Optimistic Updates**: Immediately updates cached state and HomeKit UI after API commands for responsive UX
- **Debounced Refresh**: Uses 2-second debounce timer to prevent API spam when user changes multiple settings rapidly
- **State Management**:
  - Power control with pre-refresh to detect manual changes
  - Mode switching (Heat/Cool/Auto/Fan/Dry) with pending mode storage when device is off
  - Temperature thresholds with HomeKit validation (min 16°C cooling, 10°C heating)
  - Fan speed mapped to 1-6 range (0 would be treated as "off" by HomeKit)
- **AUTO Mode Temperature Handling**:
  - HomeKit shows heating/cooling threshold range (e.g., "Keep between 20°C - 24°C")
  - MELCloud API only accepts single setpoint temperature
  - Plugin calculates midpoint: (heatingThreshold + coolingThreshold) / 2
  - Thresholds stored in `accessory.context` for persistence across restarts
  - Example: User sets 20-24°C → sends 22°C to device
- **AUTO Mode State Display**:
  - Infers heating/cooling state based on room temp vs target
  - Shows HEATING when room < target - 1°C (orange in HomeKit)
  - Shows COOLING when room > target + 1°C (blue in HomeKit)
  - Shows IDLE when within ±1°C of target
- **FAN/DRY Mode Support**:
  - Both modes display as IDLE (neither heating nor cooling)
  - Can only be set via MELCloud app or physical remote (HomeKit limitation)
- **Change Detection**: Logs state changes with old→new value comparisons
- **Special Handling**:
  - Fan speed normalization (API alternates between "0" and "Auto")
  - Mode stored when device is off (MELCloud API rejects mode changes when powered off)
  - Temperature validation and clamping to prevent HomeKit warnings

#### 3. MELCloud API Client (`src/melcloud-api.ts`)
Handles all MELCloud Home API communication:
- **OAuth Flow**:
  - Uses refresh token to obtain access tokens
  - Automatically refreshes tokens when expired (5-minute buffer)
  - Rotates refresh tokens on each access token refresh (security best practice)
- **Authentication**: Uses mobile app client credentials (`homemobile` client ID)
- **API Endpoints**:
  - `mobile.bff.melcloudhome.com/context` - Get user context and devices
  - `mobile.bff.melcloudhome.com/monitor/ataunit/:id` - Control device (PUT)
  - `auth.melcloudhome.com/connect/token` - Token refresh
- **Retry Logic**: Automatically retries requests with 401 errors after forcing token refresh
- **User-Agent**: Spoofs mobile app user agent for API compatibility

#### 4. Custom Homebridge UI (`homebridge-ui/`)
Server-side and client-side UI for OAuth authentication:
- **Browser-Based OAuth**: Opens MELCloud login in browser, extracts authorization code from callback URL
- **PKCE Flow**: Implements RFC 7636 PKCE (Proof Key for Code Exchange) for secure OAuth
- **Redirect Handling**: Captures `melcloudhome://` callback URL (intended for mobile app) and extracts authorization code
- **Form Auto-Submission**: Automatically handles OIDC form_post responses during OAuth flow
- **Token Exchange**: Exchanges authorization code for refresh token
- **Config Management**: Uses Homebridge client-side API (`homebridge.updatePluginConfig()`) to save tokens

### Key Implementation Details

#### Temperature Synchronization
- Uses `updateValue()` instead of `updateCharacteristic()` to force HomeKit to recognize temperature changes
- Essential for ensuring temperature updates from MELCloud are reflected in HomeKit

#### Fan Speed Mapping
- API uses text values: "Auto", "One", "Two", "Three", "Four", "Five" (also numeric 0-5)
- HomeKit uses numeric 0-N but treats 0 as "turn off"
- **Solution**: Shift range to 1-6 (Auto=1, One=2, ..., Five=6) to prevent accidental power-off

#### Refresh Mechanism
- **Periodic refresh**: Platform-level polling at user-configurable interval (10-3600s, default 30s)
- **Post-command refresh**: Debounced 2s delay after user commands to verify success
- **Pre-command refresh**: Before power state changes to detect manual adjustments

#### API Operation Mode Quirk
- API accepts and returns "Automatic" (not "Auto") for auto mode
- Must use exact string "Automatic" in API calls

#### Accessories Array Management
- **Critical**: When creating new accessories, must add to `accessories[]` array immediately
- Bug in v1.1.2 where new accessories weren't added, causing refresh to fail for newly discovered devices

## Configuration Schema

Located in `config.schema.json`:
- `refreshToken` (required): OAuth refresh token obtained via custom UI
- `refreshInterval` (optional): Polling interval in seconds (10-3600, default 30)
- `debug` (optional): Enable detailed logging without `-D` flag

## Testing

The `test-api-improved.js` script (run via `npm test`) can be used to:
- Test API connectivity and authentication
- Fetch and display device information
- Monitor temperature changes in real-time with `--watch` flag

## Common Issues & Solutions

### Temperature Updates Not Working
- **Cause**: Using `updateCharacteristic()` doesn't force HomeKit sync
- **Solution**: Use `updateValue()` to force HomeKit to recognize changes (src/accessory.ts:478)

### New Accessories Not Refreshing
- **Cause**: Forgetting to add new accessories to `accessories[]` array
- **Solution**: Always push new accessories to array after creation (src/platform.ts:112)

### Fan Speed Causing Power Off
- **Cause**: HomeKit treats rotation speed 0 as "turn off"
- **Solution**: Shift fan speed range to 1-6 instead of 0-5 (src/accessory.ts:367-387)

### Mode Changes When Device is Off
- **Cause**: MELCloud API rejects mode changes when device is powered off (HTTP 400)
- **Solution**: Store pending mode and apply when device powers on (src/accessory.ts:256-260)

## Node & Homebridge Compatibility

- Node: `^20.0.0 || ^22.0.0`
- Homebridge: `^1.6.0` (v1 & v2 compatible)
- TypeScript: `^5.0.0` (ES2020 target, CommonJS modules)

## File Structure

```
src/
  ├── index.ts           # Platform registration entry point
  ├── platform.ts        # Main platform class (discovery, refresh, accessory management)
  ├── accessory.ts       # HeaterCooler accessory implementation (control logic)
  ├── melcloud-api.ts    # API client with OAuth authentication
  ├── settings.ts        # Constants (PLUGIN_NAME, PLATFORM_NAME)
  ├── config-manager.ts  # Config reading/writing utilities
  └── oauth-helper.ts    # OAuth flow helpers
homebridge-ui/
  ├── server.js          # Custom UI backend (OAuth flow handler)
  └── public/index.html  # Custom UI frontend
config.schema.json       # Plugin configuration schema for Homebridge UI
```

## Development Patterns

### Adding New Device Features
1. Check `DeviceCapabilities` in `melcloud-api.ts` for device support
2. Add characteristic handlers in `accessory.ts` constructor
3. Implement getter/setter methods following existing patterns (optimistic updates + debounced refresh)
4. Update `updateCharacteristics()` to sync new characteristics during refresh
5. Test with both HomeKit commands and MELCloud app changes

### Modifying API Communication
1. All API calls go through `MELCloudAPI.makeRequest()` which handles auth automatically
2. Always use Bearer token authentication with mobile BFF API
3. Include proper User-Agent for mobile app compatibility
4. Handle 401 errors gracefully (automatic retry with token refresh)

### Debugging
- Enable `debug: true` in plugin config for verbose logging at INFO level (no `-D` flag needed)
- Logs include: device state changes, API calls, refresh operations, characteristic updates
- Check Homebridge logs for `[DEBUG]` prefixed messages when troubleshooting
- Homebridge is hosted on another device in my setup, so I need to build/pack it to test locally. always do this when we are preparing new changes