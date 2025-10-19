# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by opening a private security advisory:

1. Go to the [Security tab](https://github.com/eehnsio/homebridge-melcloud-home/security)
2. Click "Report a vulnerability"
3. Provide details about the vulnerability

Or email me directly at: e.ehnsio@gmail.com

Please do not open a public issue for security vulnerabilities.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | ✅ Yes             |
| 0.1.x   | ❌ No longer supported |

## Security Considerations

This plugin requires MELCloud Home session cookies to function. These cookies:
- Are stored in your Homebridge `config.json`
- Should never be committed to git or shared publicly
- Are kept valid by regular API polling
- Can be refreshed at any time through the settings UI

**Never share your `config.json` file publicly as it contains your session cookies.**
