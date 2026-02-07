const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const crypto = require('crypto');
const https = require('https');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Handler to save email/password and get token automatically
    this.onRequest('/login-with-credentials', this.loginWithCredentials.bind(this));

    // Ready
    this.ready();
  }

  /**
   * Login with email/password and automatically obtain OAuth token
   * Uses the proven bash script approach
   */
  async loginWithCredentials(payload) {
    try {
      console.log('[MELCloudHome UI] Login with credentials request received');
      const { email, password } = payload;

      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      console.log('[MELCloudHome UI] Attempting OAuth login for:', email);

      // Use the automated curl approach (proven to work)
      const tokens = await this.getTokensViaCurl(email, password);
      console.log('[MELCloudHome UI] OAuth tokens obtained successfully');

      return {
        success: true,
        message: 'Login successful! Refresh token obtained.',
        refreshToken: tokens.refreshToken,
        instructions: 'Copy the token below and paste it in the "Refresh Token" field in the plugin configuration, then click Save.'
      };
    } catch (error) {
      console.error('[MELCloudHome UI] Login error:', error);
      console.error('[MELCloudHome UI] Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Login failed. Please check your credentials.'
      };
    }
  }

  /**
   * Get OAuth tokens using curl-based approach (like get-token-curl.sh)
   * This is the proven method that works with User-Agent spoofing
   */
  async getTokensViaCurl(email, password) {
    // Use Safari user agent - the mobile app opens OAuth in a Safari WebView, not via CFNetwork
    const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
    const CLIENT_ID = 'homemobile';
    const REDIRECT_URI = 'melcloudhome://';
    const SCOPE = 'openid profile email offline_access IdentityServerApi';

    // Generate PKCE (RFC 7636 compliant - base64url encoding)
    // Base64url: replace + with -, / with _, remove = padding
    const codeVerifier = crypto.randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const codeChallenge = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const state = crypto.randomBytes(32).toString('hex');

    // Build auth URL
    const authUrl = `https://auth.melcloudhome.com/connect/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(SCOPE)}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256&` +
      `state=${state}`;

    console.log('[OAuth cURL] Step 1: Getting login page...');

    // Step 1: Get login page and follow redirects (mimics curl -L)
    const { html: loginPage, cookies, finalUrl } = await this.curlRequest(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': MOBILE_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Extract CSRF token
    const csrfMatch = loginPage.match(/name="_csrf"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      throw new Error('Could not extract CSRF token from login page');
    }
    const csrf = csrfMatch[1];
    console.log('[OAuth cURL] Found CSRF token');

    // Step 2: Submit login form
    console.log('[OAuth cURL] Step 2: Submitting credentials...');
    console.log('[OAuth cURL] Cookies before login POST:', cookies.length, 'cookies');
    const formData = `_csrf=${encodeURIComponent(csrf)}&username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;

    const { html: loginResponse, headers: loginHeaders, finalUrl: callbackUrl, cookies: updatedCookies } = await this.curlRequest(finalUrl, {
      method: 'POST',
      headers: {
        'User-Agent': MOBILE_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': formData.length,
        'Origin': 'https://live-melcloudhome.auth.eu-west-1.amazoncognito.com',
        'Referer': finalUrl,
      },
      body: formData,
      cookies: cookies, // Pass cookies array - will be maintained across all redirects
    });

    // After following all redirects, we should have a melcloudhome:// URL with the code
    if (!callbackUrl || !callbackUrl.startsWith('melcloudhome://')) {
      console.log('[OAuth cURL] ❌ Did not get melcloudhome:// redirect');
      console.log('[OAuth cURL] Final URL:', callbackUrl);
      console.log('[OAuth cURL] Response preview:', loginResponse.substring(0, 500));
      throw new Error('OAuth flow failed - did not receive app redirect. The signin-oidc-meu endpoint may have failed.');
    }

    // Validate state parameter to prevent CSRF attacks
    const stateMatch = callbackUrl.match(/[?&]state=([^&]+)/);
    if (!stateMatch || decodeURIComponent(stateMatch[1]) !== state) {
      throw new Error('OAuth state mismatch - possible CSRF attack');
    }

    // Extract the authorization code from melcloudhome://...?code=XXX
    const codeMatch = callbackUrl.match(/[?&]code=([^&]+)/);
    if (!codeMatch) {
      console.log('[OAuth cURL] ❌ melcloudhome:// URL has no code parameter');
      console.log('[OAuth cURL] URL:', callbackUrl);
      throw new Error('No authorization code in callback URL');
    }

    const authCode = codeMatch[1];
    console.log('[OAuth cURL] ✓ Got authorization code!');

    console.log('[OAuth cURL] Step 3: Exchanging code for tokens...');

    // Step 3: Exchange code for tokens
    const tokenData = `grant_type=authorization_code&` +
      `code=${encodeURIComponent(authCode)}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `client_id=${CLIENT_ID}&` +
      `code_verifier=${encodeURIComponent(codeVerifier)}`;

    const tokenResponse = await this.curlRequest('https://auth.melcloudhome.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic aG9tZW1vYmlsZTo=',
      },
      body: tokenData,
      followRedirects: false,
    });

    let tokens;
    try {
      tokens = JSON.parse(tokenResponse.html);
    } catch {
      throw new Error('Token exchange failed - invalid JSON response from token endpoint');
    }

    if (!tokens.refresh_token) {
      throw new Error('Token exchange failed - no refresh token in response');
    }

    console.log('[OAuth cURL] Success! Refresh token obtained');

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    };
  }

  /**
   * Make HTTP request with cookie tracking (like curl -b/-c)
   * Simplified version matching test-oauth-local.js exactly
   */
  async curlRequest(url, options) {
    const cookieJar = options.cookies || [];

    // Helper: Parse Set-Cookie header
    function parseCookie(setCookieHeader, requestUrl) {
      const urlObj = new URL(requestUrl);
      const parts = setCookieHeader.split(';').map(p => p.trim());
      const eqIndex = parts[0].indexOf('=');
      const name = parts[0].substring(0, eqIndex);
      const value = parts[0].substring(eqIndex + 1);

      const cookie = { name, value, domain: urlObj.hostname, path: '/', expires: null };

      for (let i = 1; i < parts.length; i++) {
        const [key, val] = parts[i].split('=').map(p => p?.trim());
        if (key.toLowerCase() === 'path') cookie.path = val || '/';
        if (key.toLowerCase() === 'domain') cookie.domain = val;
        if (key.toLowerCase() === 'expires') cookie.expires = new Date(val);
        if (key.toLowerCase() === 'max-age') {
          const maxAge = parseInt(val);
          cookie.expires = new Date(Date.now() + maxAge * 1000);
        }
      }

      return cookie;
    }

    // Helper: Update cookie jar with new cookies
    function updateCookieJar(setCookieHeaders, requestUrl) {
      if (!setCookieHeaders) return;
      const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

      headers.forEach(header => {
        const cookie = parseCookie(header, requestUrl);

        // Check if cookie should be deleted (expired)
        if (cookie.expires && cookie.expires < new Date()) {
          const index = cookieJar.findIndex(c => c.name === cookie.name && c.path === cookie.path);
          if (index !== -1) {
            cookieJar.splice(index, 1);
            console.log('[OAuth cURL] Deleted cookie:', cookie.name, 'path:', cookie.path);
          }
          return;
        }

        // Update or add cookie
        const index = cookieJar.findIndex(c => c.name === cookie.name && c.path === cookie.path && c.domain === cookie.domain);
        if (index !== -1) {
          cookieJar[index] = cookie;
        } else {
          cookieJar.push(cookie);
        }
      });
    }

    // Helper: Get cookies for a URL
    function getCookiesForUrl(url) {
      const urlObj = new URL(url);
      const now = new Date();

      const validCookies = cookieJar.filter(cookie => {
        // Check expiration
        if (cookie.expires && cookie.expires < now) return false;

        // Check domain
        if (!urlObj.hostname.endsWith(cookie.domain)) return false;

        // Check path
        if (!urlObj.pathname.startsWith(cookie.path)) return false;

        return true;
      });

      if (validCookies.length === 0) return null;
      return validCookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    return new Promise((resolve, reject) => {
      const MAX_REDIRECTS = 10;
      let redirectCount = 0;
      let currentUrl = url;
      let previousUrl = null;
      let keepCognitoReferer = false;

      async function makeRequest() {
        const urlObj = new URL(currentUrl);

        // For redirects, change POST to GET
        const method = (redirectCount > 0) ? 'GET' : (options.method || 'GET');

        // Strip Cognito URLs to origin only for Referer
        let refererUrl = previousUrl;
        if (refererUrl && refererUrl.includes('amazoncognito.com')) {
          const refererUrlObj = new URL(refererUrl);
          refererUrl = `${refererUrlObj.origin}/`;
        }

        // Determine cross-site
        const effectivePreviousUrl = keepCognitoReferer && previousUrl ? previousUrl : (previousUrl || currentUrl);
        const isCrossSite = previousUrl && redirectCount > 0 &&
          new URL(effectivePreviousUrl).hostname !== urlObj.hostname;

        const headers = redirectCount > 0
          ? {
              'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Sec-Fetch-Site': isCrossSite ? 'cross-site' : 'same-origin',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Dest': 'document',
              'Priority': 'u=0, i',
              ...(refererUrl && { 'Referer': refererUrl }),
            }
          : { ...options.headers };

        const reqOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method,
          headers,
        };

        // Add cookies
        const cookieHeader = getCookiesForUrl(currentUrl);
        if (cookieHeader) {
          reqOptions.headers['Cookie'] = cookieHeader;
        }

        // Debug for ExternalLogin/Callback
        if (currentUrl.includes('ExternalLogin/Callback')) {
          console.log('[OAuth cURL] ⚠️  ExternalLogin/Callback Request:');
          console.log('[OAuth cURL] URL:', currentUrl);
          console.log('[OAuth cURL] Method:', method);
          console.log('[OAuth cURL] Redirect count:', redirectCount);
          console.log('[OAuth cURL] Previous URL:', previousUrl?.substring(0, 100));
          console.log('[OAuth cURL] Referer URL:', refererUrl?.substring(0, 100));
          console.log('[OAuth cURL] Is cross-site:', isCrossSite);
          console.log('[OAuth cURL] Headers:', JSON.stringify(reqOptions.headers, null, 2));
        }

        const req = https.request(reqOptions, (res) => {
          updateCookieJar(res.headers['set-cookie'], currentUrl);

          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            // Handle redirects (unless explicitly disabled)
            if (options.followRedirects !== false && [301, 302, 303].includes(res.statusCode)) {
              if (redirectCount >= MAX_REDIRECTS) {
                return reject(new Error('Too many redirects'));
              }

              const location = res.headers.location;

              // Check if we got melcloudhome:// redirect
              if (location && location.startsWith('melcloudhome://')) {
                console.log('[OAuth cURL] ✓ Got melcloudhome:// redirect!');
                return resolve({
                  statusCode: res.statusCode,
                  headers: res.headers,
                  html: data,
                  cookies: cookieJar,
                  finalUrl: location,
                });
              }

              // Special handling for ExternalLogin/Callback (like test-oauth-local.js)
              if (location === '/ExternalLogin/Callback') {
                console.log('[OAuth cURL] signin-oidc-meu → ExternalLogin/Callback - KEEPING Cognito referer');
                keepCognitoReferer = true; // DON'T update previousUrl, keep Cognito URL
              } else {
                previousUrl = currentUrl; // Normal behavior: update previousUrl
                keepCognitoReferer = false;
              }

              currentUrl = location.startsWith('http') ? location : `https://${urlObj.hostname}${location}`;

              console.log('[OAuth cURL] Following redirect', redirectCount + 1, ':', currentUrl.substring(0, 100));

              redirectCount++;
              makeRequest();
            } else {
              // No redirect - check for meta refresh like test-oauth-local.js does
              console.log('[OAuth cURL] Response status:', res.statusCode, 'Length:', data.length);

              // Check for meta refresh redirect (NEW SERVER BEHAVIOR!)
              const metaRefreshMatch = data.match(/content="0;url=([^"]+)"/);
              if (metaRefreshMatch) {
                const redirectUrl = metaRefreshMatch[1]
                  .replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>');

                console.log('[OAuth cURL] Found meta refresh redirect, following it...');
                console.log('[OAuth cURL] Redirect URL:', redirectUrl);

                // Wait a tiny bit to simulate loading time
                setTimeout(() => {
                  // Handle both absolute and relative meta refresh URLs
                  const metaUrl = redirectUrl.startsWith('http')
                    ? redirectUrl
                    : `https://auth.melcloudhome.com${redirectUrl}`;

                  const metaReq = https.request({
                    hostname: 'auth.melcloudhome.com',
                    path: redirectUrl,
                    method: 'GET',
                    headers: {
                      'Host': 'auth.melcloudhome.com',
                      'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0',
                      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Referer': 'https://auth.melcloudhome.com/Redirect',  // Browser would send /Redirect as referer!
                      'Connection': 'keep-alive',
                      'Upgrade-Insecure-Requests': '1',
                      'Sec-Fetch-Site': 'same-origin',  // Same origin since both are auth.melcloudhome.com
                      'Sec-Fetch-Mode': 'navigate',
                      'Sec-Fetch-Dest': 'document',
                      'Priority': 'u=0, i',
                      'Cookie': getCookiesForUrl(metaUrl),
                    },
                  }, (metaRes) => {
                    console.log('[OAuth cURL] Meta refresh response status:', metaRes.statusCode);
                    console.log('[OAuth cURL] Meta refresh location:', metaRes.headers.location);

                    // Check if we got a redirect to melcloudhome://
                    if (metaRes.statusCode === 302 && metaRes.headers.location && metaRes.headers.location.startsWith('melcloudhome://')) {
                      const locationUrl = metaRes.headers.location;
                      console.log('[OAuth cURL] ✓ SUCCESS! Got melcloudhome:// redirect:', locationUrl.substring(0, 80));

                      return resolve({
                        statusCode: metaRes.statusCode,
                        headers: metaRes.headers,
                        html: '',
                        cookies: cookieJar,
                        finalUrl: locationUrl,
                      });
                    } else {
                      // Not a melcloudhome:// redirect, read body
                      let metaData = '';
                      metaRes.on('data', chunk => metaData += chunk);
                      metaRes.on('end', () => {
                        console.log('[OAuth cURL] ❌ Did not get melcloudhome:// redirect');
                        console.log('[OAuth cURL] Response length:', metaData.length);
                        console.log('[OAuth cURL] Response preview:', metaData.substring(0, 500));
                        reject(new Error('Did not get melcloudhome:// redirect from meta refresh'));
                      });
                    }
                  });

                  metaReq.on('error', reject);
                  metaReq.end();
                }, 100);
              } else {
                // No meta refresh, return final response
                resolve({
                  statusCode: res.statusCode,
                  headers: res.headers,
                  html: data,
                  cookies: cookieJar,
                  finalUrl: currentUrl,
                });
              }
            }
          });
        });

        req.on('error', reject);

        if (options.body) {
          req.write(options.body);
        }

        req.end();
      }

      makeRequest();
    });
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
