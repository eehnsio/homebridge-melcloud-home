/**
 * OAuth Helper - Automatic Token Management
 *
 * This module handles automatic OAuth token acquisition using email/password.
 * It uses User-Agent spoofing to mimic the mobile app and automatically
 * obtains and refreshes tokens without user intervention.
 */
import { Logger } from 'homebridge';
interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    idToken?: string;
}
export declare class OAuthHelper {
    private readonly log;
    constructor(log: Logger);
    /**
     * Generate PKCE code verifier and challenge
     */
    private generatePKCE;
    /**
     * Generate random state for CSRF protection
     */
    private generateState;
    /**
     * Make HTTPS request and return response body (follows redirects)
     */
    private httpsRequest;
    /**
     * Get authorization URL and extract CSRF token
     */
    private getLoginPage;
    /**
     * Make HTTPS request with cookie tracking
     */
    private httpsRequestWithCookies;
    /**
     * Submit login credentials and extract authorization code
     */
    private submitLogin;
    /**
     * Submit form_post data to the callback endpoint
     */
    private submitFormPost;
    /**
     * Follow redirect chain to get authorization code
     */
    private followRedirects;
    /**
     * Exchange authorization code for tokens
     */
    private exchangeCodeForTokens;
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
    getTokensWithCredentials(email: string, password: string): Promise<OAuthTokens>;
}
export {};
//# sourceMappingURL=oauth-helper.d.ts.map