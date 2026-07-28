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

- Power, temperature (0.5° steps) and mode (Heat, Cool, Auto)
- Fan speed (Auto + 5 levels)
- Automatic device discovery
- Temperature sensor per unit, for automations (optional)
- Fan speed and swing as separate switches (optional)
- Stays signed in when MELCloud drops the login (optional)
- Homebridge v1 & v2 compatible

## Important: MELCloud vs MELCloud Home

This plugin is **only** for MELCloud Home (melcloudhome.com). If you use the original MELCloud (app.melcloud.com), you need a different plugin like [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control).

Not sure which one you have? Check which website you log into - if it's melcloudhome.com, you're in the right place.

## Installation

Search for `homebridge-melcloud-home` in the Homebridge plugins tab and click Install,
or install it from the command line:

```bash
npm install -g homebridge-melcloud-home
```

## Setup

1. Click the plugin's **Settings** button (⚙️)
2. Enter your MELCloud email and password, then click "Login and Get Token"
3. Click "Save Token" when it appears
4. Adjust the settings below if you want — they save automatically
5. Restart Homebridge

Your devices appear in HomeKit automatically.

### Authentication

You sign in once with your MELCloud account and the plugin keeps a token from then on.
Your password is not stored unless you opt in.

Every few weeks MELCloud revokes the login, for reasons outside the plugin's control. Your
ACs then show as "Not Responding" until you sign in again — unless you enable **"Stay
signed in"**, which saves your email and password on your Homebridge server, encrypted and
outside `config.json`, so the plugin can sign back in by itself. It is off by default, and
unticking it deletes them.

It is not protection against someone who already has access to your server: the plugin has
to be able to decrypt unattended in order to sign in for you.

### Configuration

All settings can be configured through the custom UI - click the Settings (⚙️) button on the plugin.

| Setting | Description | Default |
|---------|-------------|---------|
| `refreshInterval` | How often to poll for device changes, 10-3600 seconds. | 30 |
| `debug` | Detailed logging for troubleshooting. | false |
| `exposeTemperatureSensor` | A separate temperature sensor per unit, for automations. | true |
| `fanSpeedButtons` | Fan speeds as switches: `none`, `simple` (Auto/Quiet/Max) or `all` (Auto, 1-5). | `none` |
| `vaneControl` | Swing as a switch: `none` or `buttons`. | `none` |
| `authAuditLog` | Records failed logins to a file so connection problems can be diagnosed. | true |

"Stay signed in" has no config key — it lives on the settings page, deliberately outside `config.json`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## License

Apache-2.0

## Issues & Contributions

Found a bug? Have an idea? [Open an issue](https://github.com/eehnsio/homebridge-melcloud-home/issues) on GitHub.
