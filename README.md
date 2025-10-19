# Homebridge MELCloud Home

[![npm version](https://badgen.net/npm/v/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![npm downloads](https://badgen.net/npm/dt/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)

Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (melcloudhome.com).

## Background

I needed a way to control my Mitsubishi AC units through HomeKit, but the existing MELCloud plugins only worked with the old MELCloud platform (app.melcloud.com). My units use the newer MELCloud Home platform (melcloudhome.com), which has a completely different API.

So I built this plugin from scratch with the help of [Claude Code](https://claude.com/claude-code). It's been working well for my setup, but it's still relatively new - expect some rough edges and please report any issues you find!

## What Works

- Power on/off
- Temperature control (including 0.5° increments)
- Mode switching (Heat, Cool, Auto)
- Fan speed control (Auto + 5 speed levels)
- Real-time temperature monitoring
- Automatic device discovery
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

## Configuration

### Easy Way: Use the Settings UI

After installing the plugin in Homebridge:

1. Find MELCloud Home under Plugins
2. Click Settings (gear icon)
3. Follow the step-by-step guide to get your cookies:
   - Log into melcloudhome.com
   - Open Developer Tools (F12)
   - Copy the two cookie values shown
   - Paste them into the form
4. Save and restart Homebridge

### Manual Way: Edit config.json

Add this to your Homebridge config:

```json
{
  "platforms": [
    {
      "platform": "MELCloudHome",
      "name": "MELCloud Home",
      "cookieC1": "your_cookie_c1_here",
      "cookieC2": "your_cookie_c2_here",
      "refreshInterval": 60,
      "debug": false
    }
  ]
}
```

To get the cookies:
1. Log into melcloudhome.com in your browser
2. Press F12 to open Developer Tools
3. Go to Application tab (Chrome) or Storage tab (Firefox)
4. Look under Cookies → melcloudhome.com
5. Find `__Secure-monitorandcontrolC1` and copy its value
6. Find `__Secure-monitorandcontrolC2` and copy its value
7. Paste these into your config

The cookies stay valid as long as Homebridge keeps running and talking to the API (every 60 seconds by default).

### Config Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| platform | Yes | - | Must be "MELCloudHome" |
| name | Yes | - | Display name |
| cookieC1 | Yes | - | First session cookie |
| cookieC2 | Yes | - | Second session cookie |
| refreshInterval | No | 60 | Seconds between updates |
| debug | No | false | Extra logging |

## How It Works

Your AC units show up as Heater Cooler accessories in HomeKit with:
- Power control
- Temperature setting
- Mode selection (Auto/Heat/Cool)
- Fan speed (0=Auto, 1-5=speed levels)
- Current temperature display

When you change something in HomeKit, the plugin sends the command immediately and refreshes the state 2 seconds later to confirm. All devices also refresh every 60 seconds (or whatever you set) to catch changes made outside of HomeKit.

## Troubleshooting

### "No devices found" or HTTP 401 errors

Your cookies probably expired. Go back to the Settings UI, get fresh cookies from your browser, paste them in, and restart Homebridge.

The cookies should stay valid indefinitely as long as Homebridge is running and polling, but if you stopped Homebridge for a while or there was a network issue, you might need to refresh them.

### Devices appear but don't respond

- Check that they work on melcloudhome.com
- Try enabling debug mode in the config
- Check the Homebridge logs for errors
- Make sure your cookies are fresh

### Slow updates

State refreshes every 60 seconds by default. You can lower `refreshInterval` to 30 or 15 seconds for faster updates, but this means more API requests.

## Development

```bash
npm install
npm run build
npm test
```

## Changelog

**v0.2.0** (Current)
- Simplified authentication to use browser cookies (more reliable)
- Added custom UI for easier setup
- Fixed fan speed display bug
- Added Homebridge v2 support
- Smaller package size

**v0.1.0**
- Initial release
- Basic climate control
- Device discovery

## Support This Project

If this plugin saves you from manually adjusting your AC units, consider buying me a coffee!

☕ [Buy Me a Coffee](https://buymeacoffee.com/eehnsio)

## Credits

Thanks to [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) for inspiration on the Homebridge integration patterns, even though the APIs are completely different.

## License

Apache-2.0

## Issues & Contributions

Found a bug? Have an idea? [Open an issue](https://github.com/eehnsio/homebridge-melcloud-home/issues) on GitHub.
