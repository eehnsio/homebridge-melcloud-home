# Homebridge MELCloud Home

[![npm version](https://badgen.net/npm/v/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![npm downloads](https://badgen.net/npm/dt/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)

Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (melcloudhome.com).

## Background

I needed a way to control my Mitsubishi AC units through HomeKit, but the existing MELCloud plugins only worked with the old MELCloud platform (app.melcloud.com). My units use the newer MELCloud Home platform (melcloudhome.com), which has a completely different API.

So I built this plugin from scratch with the help of [Claude Code](https://claude.com/claude-code). It's been working well for my setup, but it's still relatively new - expect some rough edges and please report any issues you find!

## Support This Project

If this plugin saves you from manually adjusting your AC units, consider buying me a coffee!

☕ [Buy Me a Coffee](https://buymeacoffee.com/eehnsio)

## Credits

Thanks to [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) for inspiration on the Homebridge integration patterns, even though the APIs are completely different.

## Features

- Power on/off
- Temperature control (including 0.5° increments)
- Mode switching (Heat, Cool, Auto)
- Fan speed control (Auto + 5 speed levels)
- Real-time temperature monitoring
- Automatic device discovery
- **Long-lived sessions** - authenticate once, automatic token refresh keeps you connected
- Homebridge v1 & v2 compatible

## Important: MELCloud vs MELCloud Home

This plugin is **only** for MELCloud Home (melcloudhome.com). If you use the original MELCloud (app.melcloud.com), you need a different plugin like [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control).

Not sure which one you have? Check which website you log into - if it's melcloudhome.com, you're in the right place.

## Installation

### Via Homebridge UI (Easiest)

1. Search for `homebridge-melcloud-home` in the Homebridge plugins tab
2. Click Install
3. Click Settings (gear icon) after installation
4. Follow the instructions to copy your cookies from the browser
5. Restart Homebridge

### Via npm

```bash
npm install -g homebridge-melcloud-home
```

## Setup

1. Install the plugin via Homebridge UI
2. Click the **Settings** button
3. Click **"Open MELCloud Login"** and login with your credentials
4. Copy the callback URL from your browser console
5. Paste it back in the settings and click "Get Token"
6. Click "Save Token to Config"
7. Restart Homebridge

Your devices will appear in HomeKit automatically!

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions with screenshots.

### Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `refreshInterval` | How often to check device status (seconds). Temperature readings change slowly, so 5 minutes is typically sufficient. Lower values (60-120s) will poll more frequently but may hit MELCloud's server-side cache anyway. | 300 |
| `debug` | Show detailed logs for troubleshooting | false |

### Troubleshooting

Enable debug mode in plugin settings to see detailed logs. Common issues:

- **Temperature threshold warnings on startup**: This is normal! HomeKit validates initial device values and warns if they're outside acceptable ranges. The plugin automatically corrects these values.
- **Devices not appearing**: Verify you can log into melcloudhome.com with the same credentials
- **Login failed**: Make sure you're using MELCloud Home (not the old MELCloud)
- Still stuck? [Open an issue](https://github.com/eehnsio/homebridge-melcloud-home/issues)


## Development

```bash
npm install
npm run build
npm test
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## License

Apache-2.0

## Issues & Contributions

Found a bug? Have an idea? [Open an issue](https://github.com/eehnsio/homebridge-melcloud-home/issues) on GitHub.
