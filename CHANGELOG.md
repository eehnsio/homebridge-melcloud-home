# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v1.0.0
[0.4.0-beta.1]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.4.0-beta.1
[0.2.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.2.0
[0.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.1.0
