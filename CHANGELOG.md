# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.7] - 2025-10-26

### Fixed
- **HomeKit settings panel error** - Fixed "settings couldn't be set" error when settings panel is open during periodic refresh
  - `updateCharacteristics()` now only updates characteristics when values actually change
  - Prevents unsolicited HomeKit updates that are interpreted as errors when settings panel is active
  - Previously updated all characteristics every 30 seconds regardless of value changes

## [1.1.6] - 2025-10-25

### Fixed
- **Critical: Temperature threshold handling** - Fixed multiple issues with temperature control in non-AUTO modes
  - **Display bug**: Was showing cached AUTO mode threshold instead of actual device target
  - **Setter bug**: Temperature setters calculated midpoint in all modes (e.g., user sets 22°C → device gets 21.25°C)
  - **State display bug**: Always showed HEATING/COOLING even when idle
  - Now correctly:
    - Shows actual device setpoint in COOL/HEAT modes
    - Sets exact temperature specified by user (no midpoint calculation)
    - Shows IDLE state when room temp matches target
    - Only shows HEATING when room < target in HEAT mode
    - Only shows COOLING when room > target in COOL mode
  - AUTO mode behavior unchanged (midpoint calculation still works correctly)

## [1.1.5] - 2025-10-25

### Fixed
- **AUTO mode temperature control** - Fixed confusing UX when setting temperature range in HomeKit
  - HomeKit shows heating/cooling threshold range (e.g., "Keep between 20°C - 24°C")
  - MELCloud API only accepts single setpoint temperature
  - Plugin now calculates midpoint from range and sends to device
  - Example: Range 20-24°C → sends 22°C to device
  - Device will heat below ~21°C and cool above ~23°C (based on internal hysteresis)
  - Eliminates erratic behavior from rapid heating/cooling threshold changes
  - Temperature range preferences now persist across Homebridge restarts
- **AUTO mode state display** - HomeKit now correctly shows heating/cooling state in AUTO mode
  - Infers state based on room temperature vs target setpoint
  - Shows orange (HEATING) when room < target - 1°C
  - Shows blue (COOLING) when room > target + 1°C
  - Shows idle when within ±1°C of target
- **Default refresh interval** - Fixed remaining hardcoded 300s defaults to 30s (aligns with v1.1.3)
- **FAN and DRY mode support** - Now correctly handles FAN and DRY operation modes
  - Both modes display as IDLE (neither heating nor cooling)
  - Note: FAN/DRY modes can only be set via MELCloud app or physical remote (HomeKit limitation)

### Changed
- Temperature thresholds now tracked separately in AUTO mode for better UX
- Thresholds stored in accessory context for persistence across restarts
- Added clear logging showing range → midpoint calculation
- Current state intelligently inferred in AUTO mode using 1°C hysteresis

## [1.1.4] - 2025-10-25

### Fixed
- **Critical: Plugin fails after changing settings and restarting** - Implemented automatic refresh token persistence to config when tokens rotate
  - MELCloud API rotates refresh tokens on each access token refresh for security
  - Previously, rotated tokens were only stored in memory and lost on restart
  - Old (invalidated) tokens from config would cause `HTTP 400: invalid_grant` errors
  - Now automatically saves new refresh tokens to config.json via ConfigManager
- Added documentation to prevent settings from accidentally removing refresh token

### Technical
- Added `onTokenRefresh` callback to `MELCloudConfig` interface
- MELCloud API now notifies platform when refresh tokens rotate
- Platform automatically persists new tokens using existing ConfigManager
- Refresh token survival guaranteed across restarts and config changes

## [1.1.3] - 2025-10-25

### Fixed
- **Critical: Temperature sync not working** - Changed from `updateCharacteristic()` to `updateValue()` to force HomeKit to recognize temperature changes
- **Critical: Refresh not working for new accessories** - Fixed bug where newly created accessories weren't added to the accessories array
- **Auto mode not working** - API uses "Automatic" instead of "Auto" for operation mode
- **Fan speed false changes** - Normalized fan speed values (API alternates between "0" and "Auto" for auto mode)
- **CI build failure** - Corrected Homebridge dependency version (was trying to use non-existent v2.0.0)

### Changed
- **Default refresh interval changed from 300s to 30s** - Much more responsive to changes made via MELCloud app or physical remote
- **Improved debug logging** - Added `debugLog()` helper that respects `config.debug` flag and shows at INFO level (no `-D` flag needed)
- Refresh interval now configurable from 10-3600 seconds (was 30-3600)

### Added
- Complete custom UI with all settings included (refresh interval, debug mode)
- Auto-save for settings (no manual save button needed)
- Comprehensive debug logging for troubleshooting without requiring Homebridge debug mode
- Enhanced change detection logging (shows what changed: temp, power, mode, fan)

### Technical
- Settings now preserved when changing them (no more lost tokens)
- Debug logs use INFO level when `config.debug` is enabled
- GitHub Actions auto-publish workflow with changelog generation
- Fan speed normalization to prevent false change notifications

## [1.1.2] - 2025-10-25 [UNPUBLISHED]

Internal development version with iterative fixes, superseded by v1.1.3.

## [1.1.1] - 2025-10-25

### Fixed
- **Critical: HomeKit UI not updating after commands** - Implemented optimistic updates to immediately reflect state changes in HomeKit without waiting for API confirmation
- **Issue #4 (Recreated)**: HomeKit showing devices as OFF when they are physically ON - Added pre-refresh before state changes to sync with actual device state
- Temperature threshold validation warnings at startup - Now sets safe default values before applying props to prevent validation errors on cached values
- Periodic refresh logs not visible - Changed refresh interval logging from debug to info level for better visibility

### Changed
- Improved immediate feedback when controlling devices - HomeKit UI now updates instantly instead of waiting 500ms-2s for API confirmation
- All setter functions (power, mode, temperature, fan speed) now use optimistic updates for responsive UI
- Enhanced state change logging to show actual changes (Power: OFF -> ON) instead of just current values
- Periodic refresh now logs summary info (device count, success/failure) at info level while detailed state logs remain at debug level

### Technical
- Implemented optimistic state updates: cached device state updates immediately after successful API calls
- Added pre-command refresh in setActive() to detect manual changes made outside HomeKit
- Characteristic updates now happen synchronously after API calls instead of relying solely on periodic refresh
- Temperature characteristics now set safe default values before applying props to avoid validation warnings

## [1.1.0] - 2025-10-24

### Added
- Enhanced DEBUG-level logging for better visibility when troubleshooting device updates
- Temperature change tracking showing old → new values (requires debug mode)
- Immediate test refresh on startup to verify functionality
- Refresh interval ID logging for troubleshooting
- API test script (`npm test`) for manual API testing and debugging
- Watch mode in test script (`npm test -- --watch`) to monitor temperature changes in real-time

### Changed
- **Default refresh interval increased from 90s to 300s (5 minutes)** - Temperature readings change slowly, reducing unnecessary API calls by ~70% while maintaining practical monitoring
- Maximum configurable refresh interval increased from 600s to 3600s (1 hour)
- Refresh token field now displays as password field (masked) in config UI for better security
- Improved config schema descriptions with clearer guidance on refresh intervals

### Fixed
- **Issue #5**: Temperature values now update correctly - Enhanced logging reveals polling is working as expected; MELCloud API has server-side caching
- Refresh token field marked as required to prevent accidental clearing when editing config
- Added prominent warnings (⚠️) to prevent users from manually clearing the token field

### Technical
- Added detailed DEBUG-level logging for device refresh operations and temperature updates
- Added immediate refresh execution on startup for faster initial state sync
- Enhanced debug logging shows cached vs new values for temperature characteristics
- Refresh interval ID now logged for troubleshooting timing issues

## [1.0.1] - 2025-10-22

### Fixed
- Login button accessibility for HTTP connections (Issue #3)

### Changed
- Moved API documentation to `.archive/` directory
- Updated security policy

### Security
- Added npm security improvements

## [1.0.0] - 2025-10-22

Major stability and reliability improvements with proper Homebridge integration patterns.

### Added
- Custom plugin UI with OAuth 2.0 browser-based login flow
- Debounced refresh mechanism to prevent API spam (2s for settings, 500ms for power)
- Automatic token refresh before each API call with 5-minute buffer
- Long-lived sessions with automatic token management

### Changed
- **BREAKING**: Config save now uses Homebridge client-side API (`homebridge.updatePluginConfig()`)
  - Fixes race conditions where config wouldn't save
  - Proper integration with Homebridge config management
- Fan speed range shifted from 0-5 to 1-6 to prevent HomeKit treating speed 0 as "off"
  - Auto is now rotation speed 1 instead of 0
- Updated README with clearer, more user-friendly setup instructions
- Improved error handling and logging throughout

### Fixed
- **Fan speed Auto turning device off** - HomeKit was interpreting rotation speed 0 as power off
- **Config not saving** - Now uses proper Homebridge client-side API instead of direct file writes
- **"Cannot save" errors in HomeKit** - Eliminated by debouncing rapid command refreshes
- **API rate limiting** - Reduced API calls significantly with smart debouncing

### Technical
- OAuth tokens refresh automatically with 5-minute expiry buffer
- Debounced refresh cancels pending refreshes when new commands arrive
- Client-side config save using `homebridge.updatePluginConfig()` and `homebridge.savePluginConfig()`
- Refresh tokens rotate on each access token refresh (security best practice)

### Migration Notes
If upgrading from 0.x versions:
1. Uninstall old version
2. Install v1.0.0
3. Re-authenticate using new OAuth flow in plugin settings
4. Configuration will migrate from cookies to `refreshToken` automatically

---

## [0.4.0-beta.1] - 2025-10-21 [DEPRECATED]

### Added
- OAuth refresh token authentication (more reliable than cookies)
- One-click authentication via Homebridge UI
- Automatic token refresh
- Mobile BFF API support
- Full OAuth PKCE flow implementation

### Changed
- Redesigned Homebridge UI settings page
- Updated config schema to prioritize `refreshToken`
- Enhanced API client for both OAuth and cookie auth

---

## [0.2.0] - 2025-10-19 [DEPRECATED]

### Added
- OAuth 2.0 authentication with AWS Cognito
- Automatic token refresh mechanism
- Custom UI for Homebridge Config UI X
- Device dashboard with real-time status

### Changed
- **BREAKING**: Replaced cookies with email/password OAuth flow

---

## [0.1.0] - 2025-10-19 [DEPRECATED]

Initial release with cookie-based authentication.

### Added
- Automatic device discovery
- Power, temperature, mode, and fan speed control
- Real-time monitoring
- Cookie-based authentication

---

[1.1.7]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.7
[1.1.6]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.6
[1.1.5]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.5
[1.1.4]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.4
[1.1.3]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.3
[1.1.1]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.1
[1.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.0
[1.0.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.0.0
[0.4.0-beta.1]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.4.0-beta.1
[0.2.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.2.0
[0.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.1.0
