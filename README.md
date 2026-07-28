# Homebridge MELCloud Home

[![npm version](https://img.shields.io/npm/v/homebridge-melcloud-home.svg)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-melcloud-home.svg)](https://www.npmjs.com/package/homebridge-melcloud-home)

Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (melcloudhome.com).

## Background

I needed a way to control my Mitsubishi AC units through HomeKit, but the existing MELCloud plugins only worked with the old MELCloud platform (app.melcloud.com). My units use the newer MELCloud Home platform (melcloudhome.com), which has a completely different API.

So I created this plugin with the help of [Claude Code](https://claude.com/claude-code).

## Support This Project

☕ [Buy Me a Coffee](https://buymeacoffee.com/eehnsio)

## Credits

Thanks to [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) for inspiration on the Homebridge integration patterns.

## Features

- Power on/off
- Temperature control (including 0.5° increments)
- Mode switching (Heat, Cool, Auto)
- Fan speed control (Auto + 5 speed levels)
- **Swing control** (optional) - exposed as a switch, because iOS HomeKit does not render a native swing control on the AC tile
- Real-time temperature monitoring
- Automatic device discovery
- **Fan speed buttons** (optional) - fan speeds as separate HomeKit switches
- **Stays signed in** (optional) - signs itself back in when MELCloud revokes the login
- **Lightweight** - no browser dependencies, no polling delays
- Homebridge v1 & v2 compatible

## Important: MELCloud vs MELCloud Home

This plugin is **only** for MELCloud Home (melcloudhome.com). If you use the original MELCloud (app.melcloud.com), you need a different plugin like [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control).

Not sure which one you have? Check which website you log into - if it's melcloudhome.com, you're in the right place.

## Installation

### Via Homebridge UI

1. Search for `homebridge-melcloud-home` in the Homebridge plugins tab
2. Click Install
3. Click Settings (gear icon) after installation
4. Enter your MELCloud email and password in Step 1
5. Click "Login and Get Token" - your token will be obtained automatically
6. Click "Save Token" in Step 2
7. Restart Homebridge

### Via npm

```bash
npm install -g homebridge-melcloud-home
```

## Setup

1. Install the plugin via Homebridge UI
2. Click the **Settings** button (⚙️)
3. **Step 1:** Enter your MELCloud email and password, then click "Login and Get Token"
4. **Step 2:** Your token will appear automatically - click "Save Token"
5. **Step 3:** Configure settings (refresh interval, debug mode, etc.) - they save automatically
6. Restart Homebridge

Your devices will appear in HomeKit automatically!

### Authentication

The plugin signs in with OAuth and then keeps a refresh token, which it exchanges for a
new one roughly every 55 minutes. Your password is not needed for that, and is not stored
unless you ask for it (see below).

**MELCloud sometimes revokes a login.** Every few weeks it rejects a refresh token it
issued itself less than an hour earlier (`invalid_grant`). There is no fixed interval —
measured lifetimes so far are ~18 days, ~22 days, and one login still healthy after 24.
The plugin sends the correct, freshly saved token in every case, so this is not something
it can prevent. When it happens your ACs show as "Not Responding" until you sign in again.

**"Stay signed in" (optional, off by default)** exists because of that. Tick it next to the
login form and your MELCloud email and password are saved on your Homebridge server,
encrypted, so the plugin can sign back in by itself instead of waiting for you. Unticking
it deletes them.

What the encryption does and does not do, plainly:

- The credentials are stored **outside `config.json`** — that file ends up in screenshots
  and pasted into GitHub issues.
- Encrypted with AES-256-GCM, files readable only by the Homebridge user, and where the
  system provides a machine id the key is tied to it — so a copied or restored backup
  cannot be decrypted on another machine. (Restoring onto a *new* machine means signing
  in once by hand.)
- It is **not** protection against someone who already has access to your Homebridge
  server. The plugin must be able to decrypt unattended in order to sign in for you.

If you leave it off, nothing changes: you sign in again from the settings page when
prompted, exactly as before.

### Configuration

All settings can be configured through the custom UI - click the Settings (⚙️) button on the plugin.

| Setting | Description | Default |
|---------|-------------|---------|
| `refreshInterval` | How often to check device status (seconds). With 30-second polling, changes from the MELCloud app or remote control are picked up quickly. Configurable from 10-3600 seconds. | 30 |
| `debug` | Enable detailed logging for troubleshooting. Shows all refresh data, API calls, and state changes without requiring Homebridge debug mode. | false |
| `exposeTemperatureSensor` | Add a separate temperature sensor for each AC unit that can be used in HomeKit automations. | true |
| `fanSpeedButtons` | Expose fan speeds as separate HomeKit switches: `none`, `simple` (Auto/Quiet/Max) or `all` (Auto, 1-5). | `none` |
| `vaneControl` | Swing control: `none`, or `buttons` for a single switch (ON = swing, OFF = auto). iOS has no native swing control on the AC tile. | `none` |
| `authAuditLog` | Record failed logins to `melcloud-auth-audit.log` in the Homebridge storage folder, so intermittent connection problems can be diagnosed. Only the last 8 characters of tokens are written — never a token itself, and never your password. | true |

"Stay signed in" is not a config key — it is set from the settings page, and the saved
credentials live outside `config.json` by design.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## License

Apache-2.0

## Issues & Contributions

Found a bug? Have an idea? [Open an issue](https://github.com/eehnsio/homebridge-melcloud-home/issues) on GitHub.
