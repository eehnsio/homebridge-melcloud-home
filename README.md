# Homebridge MELCloud Home

[![npm version](https://badgen.net/npm/v/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)
[![npm downloads](https://badgen.net/npm/dt/homebridge-melcloud-home)](https://www.npmjs.com/package/homebridge-melcloud-home)

Homebridge plugin for Mitsubishi Electric Air Conditioners using the **MELCloud Home** platform (`melcloudhome.com`).

## Features

- 🔐 **OAuth 2.0 authentication** - No more cookie expiration!
- 🌡️ Full climate control (heat, cool, auto modes)
- 💨 Fan speed control (0-5 speeds + auto)
- 📊 Real-time temperature monitoring
- 🔄 Automatic device discovery
- ⚡ Fast response times (2-second state refresh after control)
- 🏠 Native HomeKit integration
- 🔄 Background state sync (configurable interval)

## Compatibility

- ✅ **MELCloud Home** (melcloudhome.com) - This plugin
- ❌ **Original MELCloud** (app.melcloud.com) - Use [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) instead

## Installation

### Option 1: Install via Homebridge UI (Recommended)

1. Open Homebridge Config UI X
2. Go to the **Plugins** tab
3. Search for `homebridge-melcloud-home`
4. Click **Install**
5. Configure the plugin (see Configuration section below)
6. Restart Homebridge

### Option 2: Install via npm

```bash
npm install -g homebridge-melcloud-home
```

Then add the platform configuration to your `config.json` (see Configuration section below).

### Option 3: Manual Installation (Local Development)

```bash
# Clone the repository
git clone https://github.com/eehnsio/homebridge-melcloud-home.git
cd homebridge-melcloud-home

# Install dependencies and build
npm install
npm run build

# Install locally in Homebridge
cd /var/lib/homebridge  # Or your Homebridge directory
npm install /path/to/homebridge-melcloud-home

# Restart Homebridge
```

## Configuration

### Config.json Setup

Add this platform configuration to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "MELCloudHome",
      "name": "MELCloud Home",
      "email": "your.email@example.com",
      "password": "your_password",
      "refreshInterval": 60,
      "debug": false
    }
  ]
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | - | Must be `MELCloudHome` |
| `name` | Yes | - | Name for the platform |
| `email` | Yes | - | Your MELCloud Home account email |
| `password` | Yes | - | Your MELCloud Home account password |
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
4. **Multi-room Support**: All devices in your MELCloud Home account are discovered automatically

## Troubleshooting

### Authentication Issues

**Symptoms**: "Authentication failed" or "HTTP 401 Unauthorized" errors in logs

**Solution**:
1. Verify your email and password are correct
2. Try logging into https://melcloudhome.com with the same credentials
3. If you changed your password, update the plugin configuration
4. The plugin uses OAuth 2.0 and automatically refreshes tokens - no manual intervention needed!

### Devices Not Appearing

**Check these items**:
- ✅ Verify your devices appear on https://melcloudhome.com
- ✅ Check Homebridge logs for discovery errors
- ✅ Ensure your credentials are correct
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

### API Research

See [API_RESEARCH.md](./API_RESEARCH.md) and [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for detailed API documentation.

### Testing

```bash
# Test API directly
npm test

# Build TypeScript
npm run build

# Watch for changes
npm run watch
```

### Project Status

**v0.1.0 - Current Release** ✅
- [x] API reverse engineering
- [x] Device discovery and automatic registration
- [x] Power on/off control
- [x] Temperature control (with 0.5° increment support)
- [x] Mode switching (Auto/Heat/Cool)
- [x] Fan speed control (0-5 speeds)
- [x] Real-time state synchronization
- [x] Fast response times (2-second post-control refresh)
- [x] Configurable background sync interval
- [x] HTTP timeout handling
- [x] Error handling and recovery

**v0.2.0 - In Progress** 🚧
- [x] OAuth 2.0 authentication (eliminate cookie expiration)
- [ ] WebSocket real-time updates (instant state changes)
- [ ] Advanced settings UI in Homebridge Config UI X
- [ ] Support for schedules and scenes
- [ ] Energy consumption monitoring (if available in API)

## Acknowledgments

This plugin was inspired by [homebridge-melcloud-control](https://github.com/grzegorz914/homebridge-melcloud-control) by grzegorz914. MELCloud Home uses a completely different API, requiring a ground-up rewrite. Thank you to the original author for the excellent Homebridge integration patterns!

## License

Apache-2.0

## Support

- 🐛 [Report Issues](https://github.com/eehnsio/homebridge-melcloud-home/issues)
- 💬 [Discussions](https://github.com/eehnsio/homebridge-melcloud-home/discussions)
- ⭐ Star this repo if you find it useful!
