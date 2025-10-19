# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-10-19

### Added
- Initial release of homebridge-melcloud-home
- Automatic device discovery for all MELCloud Home devices
- Power on/off control
- Temperature control with support for 0.5° increments
- Mode switching (Auto, Heat, Cool)
- Fan speed control (0-5 speeds + auto)
- Real-time room temperature monitoring
- Fast state synchronization (2-second refresh after control)
- Configurable background state sync interval (default 60 seconds)
- HTTP request timeout handling (10 seconds)
- Cookie-based authentication
- Comprehensive error handling and recovery
- Debug logging option

### Supported
- Full HomeKit HeaterCooler accessory implementation
- Multi-device support
- Multi-building support
- Device capabilities detection
- Temperature validation based on device capabilities

### Known Limitations
- Cookie-based authentication requires manual cookie refresh when expired
- Dry and Fan modes not available in HomeKit (HomeKit limitation)
- No WebSocket support yet (polling only)
- No OAuth 2.0 support yet

### Technical Details
- Built with TypeScript
- Uses native Node.js HTTPS module (no external HTTP dependencies)
- Implements Homebridge Dynamic Platform API
- Follows Homebridge plugin best practices

## [0.2.0] - 2025-10-19

### Added
- 🔐 OAuth 2.0 authentication with AWS Cognito - eliminates cookie expiration
- 🔄 Automatic token refresh mechanism for seamless authentication
- 💾 Secure token storage with file-based persistence (600 permissions)
- 🎨 Custom UI for Homebridge Config UI X
- 📊 Device dashboard showing real-time status and statistics
- 🏠 Multi-building support in custom UI
- 📱 Beautiful Bootstrap 5-based settings interface
- ℹ️ Account overview with device counts and connection status
- 📡 Device details including RSSI, operation mode, temperatures

### Changed
- **BREAKING CHANGE**: Replaced cookie-based authentication with email/password OAuth 2.0 flow
  - Old config with `cookieC1` and `cookieC2` will no longer work
  - Update your config to use `email` and `password` instead
- Updated configuration schema to require email and password
- Improved API client with automatic OAuth token management
- Enhanced error handling for authentication failures

### Removed
- Cookie-based authentication support (no longer supported)

### Fixed
- Authentication persistence issues (tokens now auto-refresh)
- No more manual cookie updates needed

---

[0.2.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.2.0
[0.1.0]: https://github.com/eehnsio/homebridge-melcloud-home/releases/tag/v0.1.0
