const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // OAuth state storage
    this.oauthState = {};

    // Handler to save email/password and get token automatically
    this.onRequest('/login-with-credentials', this.loginWithCredentials.bind(this));

    // Handler to process OAuth callback URL from browser
    this.onRequest('/process-oauth-callback', this.processOAuthCallback.bind(this));

    // Handler to save cookies manually (legacy - deprecated)
    this.onRequest('/save-cookies', this.saveCookies.bind(this));

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
      return {
        success: false,
        error: error.message || 'Login failed. Please check your credentials.'
      };
    }
  }

  /**
   * Process OAuth callback URL from browser-based login
   */
  async processOAuthCallback(payload) {
    try {
      const { callbackUrl, verifier, expectedState } = payload;

      if (!callbackUrl || !verifier) {
        return { success: false, error: 'Missing required parameters' };
      }

      console.log('[MELCloudHome UI] Processing OAuth callback URL');

      // Parse the callback URL
      const url = new URL(callbackUrl);

      // Extract code and state from URL
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code) {
        return { success: false, error: 'No authorization code found in URL' };
      }

      // Verify state if provided
      if (expectedState && state !== expectedState) {
        return { success: false, error: 'Invalid state parameter (security check failed)' };
      }

      console.log('[MELCloudHome UI] Authorization code received, exchanging for tokens...');

      // Exchange code for tokens
      const tokenData = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent('melcloudhome://')}&client_id=homemobile&code_verifier=${encodeURIComponent(verifier)}`;

      const tokenResponse = await this.curlRequest('https://auth.melcloudhome.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic aG9tZW1vYmlsZTo='
        },
        body: tokenData,
        followRedirects: false
      });

      const tokens = JSON.parse(tokenResponse.html);

      if (!tokens.refresh_token) {
        return { success: false, error: 'No refresh token in response' };
      }

      console.log('[MELCloudHome UI] ✓ Refresh token obtained!');

      // Return the token to the client
      // The client will call homebridge.updatePluginConfig() and homebridge.savePluginConfig()
      return {
        success: true,
        message: 'Refresh token obtained successfully',
        refreshToken: tokens.refresh_token,
        instructions: 'Token ready to save'
      };

    } catch (error) {
      console.error('[MELCloudHome UI] OAuth callback error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process OAuth callback'
      };
    }
  }


  /**
   * Save cookies manually provided by the user
   * DEPRECATED: This is legacy functionality, OAuth should be used instead
   */
  async saveCookies(payload) {
    try {
      console.log('[MELCloudHome UI] Manual cookie save request received (DEPRECATED)');
      const { cookieC1, cookieC2 } = payload;

      if (!cookieC1 || !cookieC2) {
        console.log('[MELCloudHome UI] Missing cookies');
        return { success: false, error: 'Both cookies are required' };
      }

      console.log('[MELCloudHome UI] Cookies received:', {
        cookieC1Length: cookieC1.length,
        cookieC2Length: cookieC2.length,
      });

      // Get current config or create new
      const currentConfig = await this.getPluginConfig();
      const platformConfig = currentConfig && currentConfig.length > 0
        ? { ...currentConfig[0] }
        : {
            platform: 'MELCloudHome',
            name: 'MELCloud Home',
            refreshInterval: 300,
            debug: false
          };

      // Add cookie properties
      platformConfig.cookieC1 = cookieC1;
      platformConfig.cookieC2 = cookieC2;

      console.log('[MELCloudHome UI] Updating plugin config via Homebridge API...');

      // Update and save using Homebridge API
      await this.updatePluginConfig([platformConfig]);
      await this.savePluginConfig();

      console.log('[MELCloudHome UI] ✓ Cookies saved successfully via Homebridge API');

      return {
        success: true,
        message: 'Cookies saved successfully! Please restart Homebridge.'
      };
    } catch (error) {
      console.error('[MELCloudHome UI] Save cookies error:', error);
      console.error('[MELCloudHome UI] Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Failed to save cookies'
      };
    }
  }

  /**
   * Get OAuth tokens using curl-based approach (like get-token-curl.sh)
   * This is the proven method that works with User-Agent spoofing
   */
  async getTokensViaCurl(email, password) {
    const MOBILE_USER_AGENT = 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0';
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
      `code_verifier=${codeVerifier}`;

    const tokenResponse = await this.curlRequest('https://auth.melcloudhome.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic aG9tZW1vYmlsZTo=',
      },
      body: tokenData,
      followRedirects: false,
    });

    const tokens = JSON.parse(tokenResponse.html);

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
   */
  async curlRequest(url, options) {
    const allCookies = options.cookies || [];
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 10;

    while (redirectCount <= maxRedirects) {
      const result = await new Promise((resolve, reject) => {
        const urlObj = new URL(currentUrl);

        // For redirects, change POST to GET and clean up headers
        const method = (redirectCount > 0) ? 'GET' : (options.method || 'GET');
        const headers = redirectCount > 0
          ? {
              'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            }
          : { ...options.headers };

        const reqOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method,
          headers,
        };

        // Add cookies
        if (allCookies.length > 0) {
          reqOptions.headers['Cookie'] = allCookies.join('; ');
          if (redirectCount === 0 && options.method === 'POST') {
            console.log('[OAuth cURL] POST request to:', currentUrl.substring(0, 80));
            console.log('[OAuth cURL] Sending cookies:', allCookies.length, 'cookies');
          }
        }

        const req = https.request(reqOptions, (res) => {
          // Capture Set-Cookie headers
          const setCookie = res.headers['set-cookie'];
          if (setCookie) {
            console.log('[OAuth cURL] Got', setCookie.length, 'cookies from', urlObj.hostname);
            setCookie.forEach(cookie => {
              const cookieName = cookie.split('=')[0];
              const existingIndex = allCookies.findIndex(c => c.startsWith(cookieName + '='));
              if (existingIndex >= 0) {
                allCookies[existingIndex] = cookie.split(';')[0];
              } else {
                allCookies.push(cookie.split(';')[0]);
              }
            });
          } else {
            console.log('[OAuth cURL] No Set-Cookie header from', urlObj.hostname, '(status:', res.statusCode, ')');
          }

          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (redirectCount > 0 && res.statusCode !== 301 && res.statusCode !== 302 && res.statusCode !== 303) {
              console.log('[OAuth cURL] Got response at depth', redirectCount, '- Status:', res.statusCode, 'Length:', data.length);
            }
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              html: data,
            });
          });
        });

        req.on('error', reject);

        if (options.body) {
          req.write(options.body);
        }

        req.end();
      });

      // Handle form_post responses (OIDC response_mode=form_post)
      // This is typically used by signin-oidc-meu to POST data to ExternalLogin/Callback
      // IMPORTANT: Only handle this for redirects (not the initial request) and only if it contains
      // OIDC-specific fields like 'code' and 'state', not login forms with 'username' and 'password'
      const isFormPostResponse = result.statusCode === 200 &&
        result.html.includes('<form') &&
        result.html.includes('action=') &&
        redirectCount > 0; // Only for redirect responses, not initial requests

      const isLoginForm = result.html.includes('name="_csrf"') || result.html.includes('name="username"');

      if (isFormPostResponse && !isLoginForm) {
        const actionMatch = result.html.match(/action="([^"]+)"/);
        const formMethod = result.html.match(/method="([^"]+)"/i);

        if (actionMatch && formMethod && formMethod[1].toUpperCase() === 'POST') {
          // Extract all hidden input fields from the form (handles both name-then-value and value-then-name orders)
          const inputMatches = [
            ...result.html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi),
            ...result.html.matchAll(/<input[^>]*value="([^"]*)"[^>]*name="([^"]+)"[^>]*>/gi),
          ];

          // Deduplicate and organize fields
          const fields = new Map();
          for (const match of inputMatches) {
            const name = match[1];
            const value = match[2];
            if (!fields.has(name)) {
              fields.set(name, value);
            }
          }

          if (fields.size > 0) {
            console.log('[OAuth cURL] Detected form_post response - extracting', fields.size, 'fields');

            // Build form data from all hidden inputs
            const formPairs = Array.from(fields.entries()).map(([name, value]) => {
              return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
            });
            const formBody = formPairs.join('&');

            // Determine the full action URL
            let actionUrl = actionMatch[1];
            // Decode HTML entities
            actionUrl = actionUrl.replace(/&amp;/g, '&');

            // Make it absolute if it's relative
            if (!actionUrl.startsWith('http')) {
              const baseUrl = new URL(currentUrl);
              if (actionUrl.startsWith('/')) {
                actionUrl = `${baseUrl.origin}${actionUrl}`;
              } else {
                actionUrl = `${baseUrl.origin}${baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)}${actionUrl}`;
              }
            }

            console.log('[OAuth cURL] Submitting form to:', actionUrl.substring(0, 80));

            // Submit the form as POST with proper headers
            // We need to make a NEW request (not a redirect) so reset our redirect-specific settings
            const formResult = await new Promise((resolve, reject) => {
              const urlObj = new URL(actionUrl);

              const reqOptions = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                  'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0',
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Content-Length': Buffer.byteLength(formBody),
                  'Origin': new URL(currentUrl).origin,
                  'Referer': currentUrl,
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                },
              };

              // Add cookies
              if (allCookies.length > 0) {
                reqOptions.headers['Cookie'] = allCookies.join('; ');
              }

              const req = https.request(reqOptions, (res) => {
                // Capture Set-Cookie headers
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                  console.log('[OAuth cURL] Form POST got', setCookie.length, 'cookies from', urlObj.hostname);
                  setCookie.forEach(cookie => {
                    const cookieName = cookie.split('=')[0];
                    const existingIndex = allCookies.findIndex(c => c.startsWith(cookieName + '='));
                    if (existingIndex >= 0) {
                      allCookies[existingIndex] = cookie.split(';')[0];
                    } else {
                      allCookies.push(cookie.split(';')[0]);
                    }
                  });
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                  resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    html: data,
                  });
                });
              });

              req.on('error', reject);
              req.write(formBody);
              req.end();
            });

            // Now handle the result of the form submission as if it was the next step
            // Check if it's a redirect
            if ((formResult.statusCode === 301 || formResult.statusCode === 302 || formResult.statusCode === 303) && formResult.headers.location) {
              const location = formResult.headers.location;

              // Check if this is a melcloudhome:// redirect
              if (location.startsWith('melcloudhome://')) {
                console.log('[OAuth cURL] ✓ Form submission led to melcloudhome:// redirect!');
                return {
                  html: formResult.html,
                  headers: formResult.headers,
                  cookies: allCookies,
                  finalUrl: location,
                };
              }

              // Regular redirect - follow it
              currentUrl = location.startsWith('http') ? location : `https://${new URL(actionUrl).hostname}${location}`;
              console.log('[OAuth cURL] Form submission redirected to:', currentUrl.substring(0, 100));
              redirectCount++;
              continue;
            }

            // Form submission didn't redirect - check the response
            console.log('[OAuth cURL] Form submission completed with status:', formResult.statusCode);
            if (formResult.statusCode !== 200) {
              console.log('[OAuth cURL] Form response preview:', formResult.html.substring(0, 500));
            }

            // Continue processing this response
            currentUrl = actionUrl;
            continue;
          }
        }
      }

      // Handle redirects
      if ((result.statusCode === 301 || result.statusCode === 302 || result.statusCode === 303) && result.headers.location) {
        const location = result.headers.location;

        // Check if this is a melcloudhome:// redirect - this is what we want!
        if (location.startsWith('melcloudhome://')) {
          console.log('[OAuth cURL] ✓ Caught melcloudhome:// redirect!');
          return {
            html: result.html,
            headers: result.headers,
            cookies: allCookies,
            finalUrl: location, // Return the melcloudhome:// URL with the code
          };
        }

        // Log if this is signin-oidc-meu for debugging
        if (currentUrl.includes('signin-oidc-meu')) {
          console.log('[OAuth cURL] signin-oidc-meu returned redirect to:', location.substring(0, 100));
          console.log('[OAuth cURL] Response status:', result.statusCode);
          console.log('[OAuth cURL] Response body length:', result.html.length);
          if (result.html.length > 0) {
            console.log('[OAuth cURL] Response body preview:', result.html.substring(0, 500));
          }
          if (result.html.includes('<form')) {
            console.log('[OAuth cURL] ⚠️  Response contains a form that needs to be submitted!');
          }
        }

        // Special handling for /Redirect endpoint - extract the RedirectUri parameter
        if (location.includes('/Redirect?RedirectUri=')) {
          const redirectMatch = location.match(/RedirectUri=([^&]+)/);
          if (redirectMatch) {
            const extractedUri = decodeURIComponent(redirectMatch[1]);
            console.log('[OAuth cURL] /Redirect endpoint detected, extracting RedirectUri:', extractedUri.substring(0, 100));

            // Check if the extracted URI is the melcloudhome:// callback
            if (extractedUri.startsWith('melcloudhome://')) {
              console.log('[OAuth cURL] ✓ Found melcloudhome:// redirect in RedirectUri parameter!');
              return {
                html: result.html,
                headers: result.headers,
                cookies: allCookies,
                finalUrl: extractedUri,
              };
            }

            // If it's a relative URL, make it absolute and follow it
            location = extractedUri.startsWith('http') ? extractedUri : `https://${new URL(currentUrl).hostname}${extractedUri}`;
            console.log('[OAuth cURL] Following extracted redirect:', location.substring(0, 100));
          }
        }

        // It's a regular HTTP redirect - follow it
        currentUrl = location.startsWith('http') ? location : `https://${new URL(currentUrl).hostname}${location}`;
        console.log('[OAuth cURL] Following redirect', redirectCount + 1, ':', currentUrl.substring(0, 100));
        console.log('[OAuth cURL] Cookies for next request:', allCookies.length);

        // Special handling for ExternalLogin/Callback - IdentityServer expects this as POST
        // when redirected from signin-oidc-meu
        if (location.includes('ExternalLogin/Callback') && redirectCount > 0) {
          console.log('[OAuth cURL] ⚠️  signin-oidc-meu redirected to ExternalLogin/Callback');
          console.log('[OAuth cURL] This should be a POST request, attempting to handle...');

          // Try making a POST request instead of GET
          const callbackUrl = location.startsWith('http') ? location : `https://${new URL(currentUrl).hostname}${location}`;

          const postResult = await new Promise((resolve, reject) => {
            const urlObj = new URL(callbackUrl);
            const reqOptions = {
              hostname: urlObj.hostname,
              path: urlObj.pathname + urlObj.search,
              method: 'POST',
              headers: {
                'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': '0',
                'Origin': new URL(currentUrl).origin,
                'Referer': currentUrl,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
            };

            if (allCookies.length > 0) {
              reqOptions.headers['Cookie'] = allCookies.join('; ');
              console.log('[OAuth cURL] Sending', allCookies.length, 'cookies with POST');
            }

            const req = https.request(reqOptions, (res) => {
              const setCookie = res.headers['set-cookie'];
              if (setCookie) {
                setCookie.forEach(cookie => {
                  const cookieName = cookie.split('=')[0];
                  const existingIndex = allCookies.findIndex(c => c.startsWith(cookieName + '='));
                  if (existingIndex >= 0) {
                    allCookies[existingIndex] = cookie.split(';')[0];
                  } else {
                    allCookies.push(cookie.split(';')[0]);
                  }
                });
              }

              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                resolve({
                  statusCode: res.statusCode,
                  headers: res.headers,
                  html: data,
                });
              });
            });

            req.on('error', reject);
            req.end();
          });

          console.log('[OAuth cURL] POST to ExternalLogin/Callback returned:', postResult.statusCode);
          if (postResult.headers.location) {
            console.log('[OAuth cURL] POST returned Location:', postResult.headers.location.substring(0, 150));
          }

          // Check if the POST resulted in a melcloudhome:// redirect
          if (postResult.headers.location && postResult.headers.location.startsWith('melcloudhome://')) {
            console.log('[OAuth cURL] ✓ POST led to melcloudhome:// redirect!');
            return {
              html: postResult.html,
              headers: postResult.headers,
              cookies: allCookies,
              finalUrl: postResult.headers.location,
            };
          }

          // If POST also failed, continue with normal flow
          console.log('[OAuth cURL] POST did not return melcloudhome:// redirect, trying GET...');
        }

        // Debug: Log cookies for ExternalLogin/Callback
        if (currentUrl.includes('ExternalLogin/Callback')) {
          console.log('[OAuth cURL] ⚠️  About to request ExternalLogin/Callback (GET)');
          console.log('[OAuth cURL] Cookies being sent:', allCookies.map(c => c.substring(0, 50)).join(', '));
        }

        redirectCount++;
        continue;
      }

      // No more redirects - but check if this is a /Redirect page with melcloudhome:// in the HTML
      if (currentUrl.includes('/Redirect') && result.html) {
        console.log('[OAuth cURL] Final page is /Redirect, checking HTML for melcloudhome:// URL...');

        // Look for melcloudhome:// in meta refresh tags
        const metaMatch = result.html.match(/content="[^"]*url=([^"]+)"/i);
        if (metaMatch && metaMatch[1].includes('melcloudhome://')) {
          console.log('[OAuth cURL] ✓ Found melcloudhome:// in meta refresh tag!');
          return {
            html: result.html,
            headers: result.headers,
            cookies: allCookies,
            finalUrl: metaMatch[1],
          };
        }

        // Look for melcloudhome:// in window.location assignments
        const jsMatch = result.html.match(/window\.location\s*=\s*["']([^"']+)["']/);
        if (jsMatch && jsMatch[1].includes('melcloudhome://')) {
          console.log('[OAuth cURL] ✓ Found melcloudhome:// in JavaScript!');
          return {
            html: result.html,
            headers: result.headers,
            cookies: allCookies,
            finalUrl: jsMatch[1],
          };
        }

        // Look for any melcloudhome:// URL in the HTML
        const anyMatch = result.html.match(/melcloudhome:\/\/[^"'\s<>]*/);
        if (anyMatch) {
          console.log('[OAuth cURL] ✓ Found melcloudhome:// URL in HTML!');
          return {
            html: result.html,
            headers: result.headers,
            cookies: allCookies,
            finalUrl: anyMatch[0],
          };
        }

        console.log('[OAuth cURL] /Redirect page HTML preview:', result.html.substring(0, 500));
      }

      // No more redirects, return final result
      return {
        html: result.html,
        headers: result.headers,
        cookies: allCookies,
        finalUrl: currentUrl,
      };
    }

    throw new Error('Too many redirects');
  }
}

// Start the server
(() => {
  return new PluginUiServer();
})();
