# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.1]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.1
[1.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.1.0
[1.0.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.0.0
[0.4.0-beta.1]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.4.0-beta.1
[0.2.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.2.0
[0.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.1.0
