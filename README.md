# Homebridge MELCloud Home

[![npm version](https://badgen.net/npm/v/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![npm downloads](https://badgen.net/npm/dt/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![Homebridge](https://badgen.net/badge/homebridge/v1%20%7C%20v2/purple)](https://github.com/homebridge/homebridge)

Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (`melcloudhome.com`).

## Features

- 🔐 **Simple authentication** - Copy cookies from your browser
- 🌡️ Full climate control (heat, cool, auto modes)
- 💨 Fan speed control (0-5 speeds + auto)
- 📊 Real-time temperature monitoring
- 🔄 Automatic device discovery
- ⚡ Fast response times (2-second state refresh after control)
- 🏠 Native HomeKit integration
- 🔄 Background state sync (keeps cookies alive)
- ✅ Homebridge v1 & v2 compatible

## Compatibility

- ✅ **MELCloud Home** (melcloudhome.com) - This plugin
- ❌ **Original MELCloud** (app.melcloud.com) - Use [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) instead

## Installation

### Via Homebridge UI (Recommended)

1. Open Homebridge Config UI X
2. Go to the **Plugins** tab
3. Search for `homebridge-melcloud-home`
4. Click **Install**
5. Click **Settings** (gear icon) to configure
6. Follow the cookie setup instructions in the settings UI
7. Restart Homebridge

### Via npm

```bash
npm install -g homebridge-melcloud-home
```

## Configuration

### Easy Setup via Custom UI

1. In Homebridge UI, find **MELCloud Home** under Plugins
2. Click the **Settings** button (gear icon)
3. Follow the step-by-step instructions to get your cookies:
   - Log into https://melcloudhome.com
   - Open browser Developer Tools (F12)
   - Copy the two cookie values
   - Paste them into the form
4. Click **Save Cookies**
5. Restart Homebridge

### Manual config.json Setup

If you prefer to edit `config.json` directly:

```json
{
  "platforms": [
    {
      "platform": "MELCloudHome",
      "name": "MELCloud Home",
      "cookieC1": "your_cookie_c1_value_here",
      "cookieC2": "your_cookie_c2_value_here",
      "refreshInterval": 60,
      "debug": false
    }
  ]
}
```

#### How to get cookies manually:

1. Open https://melcloudhome.com and log in
2. Press `F12` to open Developer Tools
3. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
4. Expand **Cookies** → **https://melcloudhome.com**
5. Find `__Secure-monitorandcontrolC1` and copy its **Value**
6. Find `__Secure-monitorandcontrolC2` and copy its **Value**
7. Paste these values into your config.json

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `MELCloudHome` |
| `name` | Yes | - | Name for the platform |
| `cookieC1` | Yes | - | Session cookie C1 from browser |
| `cookieC2` | Yes | - | Session cookie C2 from browser |
| `refreshInterval` | No | `60` | How often to poll for updates (seconds) |
| `debug` | No | `false` | Enable debug logging |

## HomeKit Features

Each AC unit appears as a **Heater Cooler** accessory with:

- **Power**: Turn on/off
- **Mode**: Auto, Heat, Cool (Dry and Fan modes not available in HomeKit)
- **Target Temperature**: Set desired temperature (supports 0.5° increments if device capable)
- **Current Temperature**: Real-time room temperature monitoring
- **Fan Speed**: Control fan speed (0=Auto, 1-5=Speed levels)

### How It Works

1. **Instant Control**: Commands are sent immediately when you make changes in HomeKit
2. **Quick Feedback**: Device state refreshes 2 seconds after you send a command
3. **Background Sync**: All devices refresh every 60 seconds (configurable) to stay in sync
4. **Cookie Persistence**: Cookies stay valid as long as the plugin keeps polling (every 60 seconds)
5. **Multi-room Support**: All devices in your MELCloud Home account are discovered automatically

## Troubleshooting

### Authentication Issues

**Symptoms**: "HTTP 401 Unauthorized" errors in logs, devices not responding

**Solution**:
1. Your cookies may have expired
2. Open the plugin Settings in Homebridge UI
3. Follow the instructions to get fresh cookies from your browser
4. Paste them and save
5. Restart Homebridge

The cookies will stay valid as long as Homebridge keeps running and polling the API!

### Devices Not Appearing

**Check these items**:
- ✅ Verify your devices appear on https://melcloudhome.com
- ✅ Check Homebridge logs for discovery errors
- ✅ Ensure your cookies are correct and not expired
- ✅ Try enabling `debug: true` in config for detailed logs
- ✅ Restart Homebridge after making config changes

### Slow State Updates

If HomeKit doesn't reflect device changes quickly:
- State refreshes every 60 seconds by default
- Reduce `refreshInterval` to 30 or 15 seconds for faster updates (uses more API calls)
- After controlling a device, state refreshes automatically after 2 seconds

### Request Timeouts

If you see "Request timeout" errors:
- Check your internet connection
- Verify https://melcloudhome.com is accessible
- The plugin uses a 10-second timeout for API requests
- Temporary network issues will resolve on the next refresh cycle

## Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

## Changelog

### v0.2.0
- ✅ Simplified to manual cookie authentication (proven, reliable method)
- ✅ Added custom UI for easy cookie setup
- ✅ Fixed fan speed display (NaN issue)
- ✅ Added Homebridge v2 compatibility
- ✅ Support for Node.js 18, 20, and 22
- ✅ Reduced package size by 39% (73kB)
- ✅ Removed complex OAuth code
- ✅ Cleaner, more maintainable codebase

### v0.1.0
- ✅ Initial release
- ✅ Device discovery and automatic registration
- ✅ Full climate control (power, temperature, mode, fan speed)
- ✅ Real-time state synchronization

## Acknowledgments

This plugin was inspired by [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) by grzegorz914. MELCloud Home uses a completely different API, requiring a ground-up rewrite. Thank you to the original author for the excellent Homebridge integration patterns!

## License

Apache-2.0

## Support

- 🐛 [Report Issues](https://github.com/eehnsio/homebridge-melcloud-home/issues)
- 💬 [Discussions](https://github.com/eehnsio/homebridge-melcloud-home/discussions)
- ⭐ Star this repo if you find it useful!
