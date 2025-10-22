# MELCloud Home Setup Guide

## Quick Start (Recommended Method)

### Browser-Based OAuth Login (One-Time Setup)

This is the easiest and most reliable way to set up the plugin.

#### Steps:

1. **Open Homebridge UI**
   - Go to the plugin settings for MELCloud Home

2. **Click "LOGIN VIA BROWSER"**
   - A new browser tab will open with the MELCloud login page

3. **Login with your MELCloud credentials**
   - Enter your email and password
   - The page will show "Redirecting to MelCloud Home..."

4. **Get the callback URL**
   - After logging in, you'll see an error page (this is expected!)
   - Press **F12** to open browser Developer Tools
   - Click the **Console** tab
   - Look for the red error message that says:
     ```
     Failed to launch 'melcloudhome://?code=...' because the scheme does not have a registered handler.
     ```
   - Click on the `melcloudhome://` URL in the error to select it
   - Copy the full URL (it will look like: `melcloudhome://?code=ABC123...&scope=...`)

5. **Paste the URL back in Homebridge UI**
   - Return to the Homebridge plugin settings page
   - Paste the URL into the text box
   - Click "Submit & Get Refresh Token"

6. **Done!**
   - Your refresh token will be automatically saved to the config
   - Restart Homebridge
   - Your devices will appear in HomeKit

### What Happens Next?

After this **one-time setup**:
- ✅ The plugin automatically refreshes your access token when it expires
- ✅ Your session stays active as long as tokens are refreshed
- ✅ No further user interaction needed
- ✅ Your devices sync automatically

---

## Troubleshooting

### "Failed to launch melcloudhome://" Error
This is **expected behavior**! The browser doesn't know how to handle the `melcloudhome://` URL scheme (it's used by the mobile app). Just copy the URL from the console as described above.

### Token Refresh Failing
If you see errors about token refresh:
- Try logging in again via browser to get a new refresh token
- Check that your MELCloud account is active
- Ensure you're using the email/password method (not Google/social login)

### Devices Not Appearing
- Restart Homebridge after adding the refresh token
- Check Homebridge logs for errors
- Verify your devices are visible in the MELCloud mobile app

---

## Security Notes

- ✅ Your refresh token is stored securely in Homebridge's config.json
- ✅ Your password is **never** stored
- ✅ The token can be revoked by logging out of MELCloud
- ✅ Tokens are refreshed automatically to maintain security

---

## How It Works

1. **One-Time Login**: Login once via browser
2. **Token Storage**: Refresh token is saved to your config
3. **Automatic Refresh**: Access token refreshes automatically when needed
4. **Device Control**: Control your devices via MELCloud API

Your login stays active as long as the token is refreshed regularly, which happens automatically in the background.
