"use strict";
/**
 * OAuth Helper - Automatic Token Management
 *
 * This module handles automatic OAuth token acquisition using email/password.
 * It uses User-Agent spoofing to mimic the mobile app and automatically
 * obtains and refreshes tokens without user intervention.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthHelper = void 0;
const https_1 = __importDefault(require("https"));
const crypto_1 = __importDefault(require("crypto"));
const MOBILE_USER_AGENT = 'MonitorAndControl.App.Mobile/35 CFNetwork/3860.100.1 Darwin/25.0.0';
const CLIENT_ID = 'homemobile';
const REDIRECT_URI = 'melcloudhome://';
const SCOPE = 'openid profile email offline_access IdentityServerApi';
const TOKEN_ENDPOINT = 'https://auth.melcloudhome.com/connect/token';
const AUTHORIZE_ENDPOINT = 'https://auth.melcloudhome.com/connect/authorize';
class OAuthHelper {
    constructor(log) {
        this.log = log;
    }
    /**
     * Generate PKCE code verifier and challenge
     */
    generatePKCE() {
        const verifier = crypto_1.default.randomBytes(32).toString('base64url');
        const challenge = crypto_1.default.createHash('sha256')
            .update(verifier)
            .digest('base64url');
        return { verifier, challenge };
    }
    /**
     * Generate random state for CSRF protection
     */
    generateState() {
        return crypto_1.default.randomBytes(32).toString('hex');
    }
    /**
     * Make HTTPS request and return response body (follows redirects)
     */
    async httpsRequest(url, options, body, redirectCount = 0) {
        if (redirectCount > 10) {
            throw new Error('Too many redirects');
        }
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const reqOptions = {
                ...options,
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
            };
            const req = https_1.default.request(reqOptions, (res) => {
                // Handle redirects
                if (res.statusCode === 302 || res.statusCode === 301) {
                    const location = res.headers.location;
                    if (location) {
                        this.log.debug(`Following redirect to: ${location}`);
                        const redirectUrl = location.startsWith('http')
                            ? location
                            : `https://${urlObj.hostname}${location}`;
                        // Follow redirect
                        this.httpsRequest(redirectUrl, options, undefined, redirectCount + 1)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    /**
     * Get authorization URL and extract CSRF token
     */
    async getLoginPage(authUrl) {
        this.log.debug('Getting login page...');
        // We need to capture cookies during redirects
        let cookies = [];
        const response = await this.httpsRequestWithCookies(authUrl, {
            method: 'GET',
            headers: {
                'User-Agent': MOBILE_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        }, undefined, 0, cookies);
        // Log a snippet of the HTML to see the form structure
        const formSnippet = response.html.match(/<form[^>]*>[\s\S]{0,800}/);
        if (formSnippet) {
            this.log.debug(`Form HTML preview: ${formSnippet[0].replace(/\s+/g, ' ').substring(0, 500)}`);
        }
        // Extract CSRF token
        const csrfMatch = response.html.match(/name="_csrf"\s+value="([^"]+)"/);
        if (!csrfMatch) {
            this.log.error('Could not find CSRF token in HTML');
            this.log.error(`HTML preview: ${response.html.substring(0, 1000)}`);
            throw new Error('Could not extract CSRF token from login page');
        }
        // Use the final URL we landed on after redirects (same as curl script does)
        // This is the Cognito login page URL we should POST to
        const loginUrl = response.finalUrl;
        this.log.debug(`Login page URL: ${loginUrl.substring(0, 200)}...`);
        return {
            html: response.html,
            loginUrl,
            csrf: csrfMatch[1],
            cookies: response.cookies.join('; '),
        };
    }
    /**
     * Make HTTPS request with cookie tracking
     */
    async httpsRequestWithCookies(url, options, body, redirectCount = 0, cookies = []) {
        if (redirectCount > 10) {
            throw new Error('Too many redirects');
        }
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const reqOptions = {
                ...options,
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
            };
            // Add cookies if we have them
            if (cookies.length > 0) {
                if (!reqOptions.headers) {
                    reqOptions.headers = {};
                }
                reqOptions.headers['Cookie'] = cookies.join('; ');
            }
            const req = https_1.default.request(reqOptions, (res) => {
                // Capture Set-Cookie headers
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    setCookie.forEach(cookie => {
                        const cookieName = cookie.split('=')[0];
                        // Replace existing cookie with same name
                        const existingIndex = cookies.findIndex(c => c.startsWith(cookieName + '='));
                        if (existingIndex >= 0) {
                            cookies[existingIndex] = cookie.split(';')[0];
                        }
                        else {
                            cookies.push(cookie.split(';')[0]);
                        }
                    });
                }
                // Handle redirects
                if (res.statusCode === 302 || res.statusCode === 301) {
                    const location = res.headers.location;
                    if (location) {
                        this.log.debug(`Following redirect to: ${location}`);
                        const redirectUrl = location.startsWith('http')
                            ? location
                            : `https://${urlObj.hostname}${location}`;
                        // Follow redirect with cookies
                        this.httpsRequestWithCookies(redirectUrl, options, undefined, redirectCount + 1, cookies)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ html: data, cookies, finalUrl: url }));
            });
            req.on('error', reject);
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    /**
     * Submit login credentials and extract authorization code
     */
    async submitLogin(loginUrl, csrf, email, password, cookies) {
        this.log.debug('Submitting login credentials...');
        this.log.debug(`Login URL: ${loginUrl.substring(0, 200)}...`);
        this.log.debug(`CSRF token: ${csrf.substring(0, 50)}...`);
        this.log.debug(`Cookies being sent: ${cookies.substring(0, 200)}...`);
        const formData = new URLSearchParams({
            _csrf: csrf,
            username: email,
            password: password,
        });
        // We need to manually follow redirects and extract the callback URL
        return new Promise((resolve, reject) => {
            const urlObj = new URL(loginUrl);
            const req = https_1.default.request({
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'User-Agent': MOBILE_USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': formData.toString().length,
                    'Cookie': cookies,
                    'Origin': 'https://live-melcloudhome.auth.eu-west-1.amazoncognito.com',
                    'Referer': loginUrl,
                },
            }, (res) => {
                this.log.debug(`Login POST response: ${res.statusCode}`);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    // Look for redirect to melcloudhome://
                    const locationHeader = res.headers.location;
                    if (locationHeader) {
                        this.log.debug(`Got redirect to: ${locationHeader.substring(0, 200)}...`);
                    }
                    if (locationHeader && locationHeader.startsWith('melcloudhome://')) {
                        // Extract authorization code from callback URL
                        const codeMatch = locationHeader.match(/[?&]code=([^&]+)/);
                        if (codeMatch) {
                            resolve(codeMatch[1]);
                            return;
                        }
                    }
                    // Check for form_post response (HTML with hidden form)
                    // Cognito returns an HTML page with a form that auto-submits
                    const formCodeMatch = data.match(/name="code"\s+value="([^"]+)"/);
                    const formStateMatch = data.match(/name="state"\s+value="([^"]+)"/);
                    const formActionMatch = data.match(/action="([^"]+)"/);
                    if (formCodeMatch && formStateMatch && formActionMatch) {
                        this.log.debug('Found form_post response, submitting to callback endpoint...');
                        // Submit the form to complete the OAuth flow
                        this.submitFormPost(formActionMatch[1], formCodeMatch[1], formStateMatch[1], cookies)
                            .then(code => resolve(code))
                            .catch(err => reject(err));
                        return;
                    }
                    // Check response body for melcloudhome:// URL (might be in JavaScript)
                    const bodyCodeMatch = data.match(/melcloudhome:\/\/[^"'\s]*[?&]code=([^&"'\s]+)/);
                    if (bodyCodeMatch) {
                        this.log.debug('Found authorization code in response body');
                        resolve(bodyCodeMatch[1]);
                        return;
                    }
                    // Check if we need to follow another redirect
                    if (locationHeader && (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 303)) {
                        // Follow redirect chain
                        this.followRedirects(locationHeader, 0, cookies)
                            .then(code => resolve(code))
                            .catch(err => reject(err));
                        return;
                    }
                    // Check for error in response
                    if (data.includes('error') || data.includes('invalid') || data.includes('Error')) {
                        this.log.error(`Login failed with error in response body`);
                        this.log.error(`Body preview: ${data.substring(0, 800)}`);
                        reject(new Error('Login failed - check credentials or see error above'));
                        return;
                    }
                    // Log details before failing
                    this.log.error('No authorization code found in login response');
                    this.log.error(`Status: ${res.statusCode}, Location: ${locationHeader || 'none'}`);
                    this.log.error(`Body preview: ${data.substring(0, 800)}`);
                    reject(new Error('No authorization code found in response'));
                });
            });
            req.on('error', reject);
            req.write(formData.toString());
            req.end();
        });
    }
    /**
     * Submit form_post data to the callback endpoint
     */
    async submitFormPost(actionUrl, code, state, cookies) {
        this.log.debug(`Submitting form_post to: ${actionUrl.substring(0, 100)}...`);
        const formData = new URLSearchParams({
            code: code,
            state: state,
        });
        return new Promise((resolve, reject) => {
            const urlObj = new URL(actionUrl);
            const req = https_1.default.request({
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'User-Agent': MOBILE_USER_AGENT,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': formData.toString().length,
                    'Cookie': cookies,
                    'Origin': 'https://live-melcloudhome.auth.eu-west-1.amazoncognito.com',
                    'Referer': urlObj.origin,
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const locationHeader = res.headers.location;
                    // Check for direct redirect with code
                    if (locationHeader && locationHeader.startsWith('melcloudhome://')) {
                        const codeMatch = locationHeader.match(/[?&]code=([^&]+)/);
                        if (codeMatch) {
                            this.log.debug('Got authorization code from form_post callback');
                            resolve(codeMatch[1]);
                            return;
                        }
                    }
                    // Follow any redirects
                    if (locationHeader && (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 303)) {
                        this.log.debug(`Following redirect from form_post: ${locationHeader.substring(0, 100)}...`);
                        this.followRedirects(locationHeader, 0)
                            .then(code => resolve(code))
                            .catch(err => reject(err));
                        return;
                    }
                    // Check response body for code
                    const bodyCodeMatch = data.match(/melcloudhome:\/\/[^"'\s]*[?&]code=([^&"'\s]+)/);
                    if (bodyCodeMatch) {
                        this.log.debug('Found authorization code in form_post callback body');
                        resolve(bodyCodeMatch[1]);
                        return;
                    }
                    this.log.error('No authorization code found in form_post callback');
                    this.log.error(`Status: ${res.statusCode}, Location: ${locationHeader || 'none'}`);
                    this.log.error(`Body preview: ${data.substring(0, 500)}`);
                    reject(new Error('No authorization code found in form_post callback'));
                });
            });
            req.on('error', reject);
            req.write(formData.toString());
            req.end();
        });
    }
    /**
     * Follow redirect chain to get authorization code
     */
    async followRedirects(url, depth, cookies) {
        if (depth > 10) {
            throw new Error('Too many redirects');
        }
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const headers = {
                'User-Agent': MOBILE_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            };
            if (cookies) {
                headers['Cookie'] = cookies;
            }
            const req = https_1.default.request({
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers,
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const locationHeader = res.headers.location;
                    // Check for direct redirect with code
                    if (locationHeader && locationHeader.startsWith('melcloudhome://')) {
                        const codeMatch = locationHeader.match(/[?&]code=([^&]+)/);
                        if (codeMatch) {
                            resolve(codeMatch[1]);
                            return;
                        }
                    }
                    // Check for form_post response (HTML with hidden form)
                    // Cognito returns an HTML page with a form that auto-submits
                    const formCodeMatch = data.match(/name="code"\s+value="([^"]+)"/);
                    if (formCodeMatch) {
                        this.log.debug('Found authorization code in form_post response');
                        resolve(formCodeMatch[1]);
                        return;
                    }
                    // Check response body for melcloudhome:// URL (might be in JavaScript)
                    const bodyCodeMatch = data.match(/melcloudhome:\/\/[^"'\s]*[?&]code=([^&"'\s]+)/);
                    if (bodyCodeMatch) {
                        this.log.debug('Found authorization code in response body');
                        resolve(bodyCodeMatch[1]);
                        return;
                    }
                    // Follow standard redirect
                    if (locationHeader && (res.statusCode === 302 || res.statusCode === 301)) {
                        const redirectUrl = locationHeader.startsWith('http')
                            ? locationHeader
                            : `https://${urlObj.hostname}${locationHeader}`;
                        this.log.debug(`Following redirect (depth ${depth + 1}): ${redirectUrl.substring(0, 100)}...`);
                        this.followRedirects(redirectUrl, depth + 1, cookies)
                            .then(code => resolve(code))
                            .catch(err => reject(err));
                        return;
                    }
                    this.log.error(`No authorization code found at depth ${depth}`);
                    this.log.error(`Status: ${res.statusCode}, Location: ${locationHeader || 'none'}`);
                    this.log.error(`Body preview: ${data.substring(0, 800)}`);
                    reject(new Error(`Failed to get authorization code at depth ${depth}`));
                });
            });
            req.on('error', reject);
            req.end();
        });
    }
    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code, codeVerifier) {
        this.log.debug('Exchanging authorization code for tokens...');
        const tokenData = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: codeVerifier,
        });
        const response = await this.httpsRequest(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': tokenData.toString().length,
                'Authorization': 'Basic aG9tZW1vYmlsZTo=', // base64(homemobile:)
            },
        }, tokenData.toString());
        const tokens = JSON.parse(response);
        if (tokens.error) {
            throw new Error(`Token exchange failed: ${tokens.error_description || tokens.error}`);
        }
        return {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
            idToken: tokens.id_token,
        };
    }
    /**
     * Get OAuth tokens using email and password
     *
     * This method automatically handles the entire OAuth flow:
     * 1. Generates PKCE challenge
     * 2. Gets login page with spoofed User-Agent
     * 3. Submits credentials
     * 4. Extracts authorization code
     * 5. Exchanges code for tokens
     *
     * @param email User's MELCloud email
     * @param password User's MELCloud password
     * @returns OAuth tokens including refresh token
     */
    async getTokensWithCredentials(email, password) {
        try {
            this.log.info('Obtaining OAuth tokens automatically...');
            // Step 1: Generate PKCE
            const pkce = this.generatePKCE();
            const state = this.generateState();
            // Step 2: Build authorization URL
            const authUrl = new URL(AUTHORIZE_ENDPOINT);
            authUrl.searchParams.set('client_id', CLIENT_ID);
            authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', SCOPE);
            authUrl.searchParams.set('code_challenge', pkce.challenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            // Step 3: Get login page and CSRF token
            const loginPage = await this.getLoginPage(authUrl.toString());
            // Step 4: Submit login and get authorization code
            const authCode = await this.submitLogin(loginPage.loginUrl, loginPage.csrf, email, password, loginPage.cookies);
            // Step 5: Exchange code for tokens
            const tokens = await this.exchangeCodeForTokens(authCode, pkce.verifier);
            this.log.info('✓ Successfully obtained OAuth tokens');
            return tokens;
        }
        catch (error) {
            this.log.error('Failed to obtain OAuth tokens:', error);
            throw error;
        }
    }
}
exports.OAuthHelper = OAuthHelper;
//# sourceMappingURL=oauth-helper.js.map