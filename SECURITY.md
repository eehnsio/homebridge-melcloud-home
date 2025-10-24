# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Preferred:** Go to the [Security tab](https://github.com/eehnsio/homebridge-melcloud-home/security) and click "Report a vulnerability"
2. **Alternative:** Email me directly at e.ehnsio@gmail.com

Please do not open a public issue for security vulnerabilities.

I will respond to security reports within 48 hours and work to address confirmed vulnerabilities promptly.

## Supported Versions

Only the latest stable release receives security updates. Please always use the most recent version.

| Version | Supported          |
| ------- | ------------------ |
| Latest (1.x)   | ✅ Yes             |
| Older versions | ❌ No - Please upgrade |

## Security Considerations

### OAuth Authentication

This plugin uses OAuth 2.1 with PKCE (Proof Key for Code Exchange) for secure authentication:
- **Refresh tokens** are stored in your Homebridge `config.json`
- Tokens are automatically refreshed before expiration
- Authentication follows modern OAuth security standards
- PKCE provides protection against authorization code interception

### Protecting Your Credentials

**Important:** Never share your `config.json` file publicly as it contains your OAuth refresh token.

- ❌ Do not commit `config.json` to git repositories
- ❌ Do not share refresh tokens in issues or support requests
- ✅ Use `.gitignore` to exclude `config.json` from version control
- ✅ Rotate tokens if you suspect they may be compromised (re-login via Config UI)

### API Communication

- All API requests to MELCloud Home use HTTPS
- Tokens are transmitted securely
- Regular polling maintains session validity

### Best Practices

1. Keep the plugin updated to the latest version
2. Use strong passwords for your MELCloud account
3. Enable two-factor authentication on your MELCloud account if available
4. Restrict access to your Homebridge instance
5. Review the plugin's network requests if concerned about data privacy

## Package Integrity

This npm package is published with:
- **Two-factor authentication** required for all publishes
- **Provenance attestations** linking packages to source code
- **Verified publisher** with linked GitHub account

You can verify package integrity using:
```bash
npm audit signatures
```
