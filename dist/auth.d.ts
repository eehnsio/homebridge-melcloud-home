import { Logger } from 'homebridge';
export interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresAt: number;
}
export interface AuthConfig {
    email: string;
    password: string;
    debug?: boolean;
}
export declare class MELCloudOAuth {
    private readonly config;
    private readonly log?;
    private tokens?;
    private readonly cognitoConfig;
    constructor(config: AuthConfig, log?: Logger);
    /**
     * Generate PKCE code verifier and challenge
     */
    private generatePKCE;
    /**
     * Authenticate using email and password via AWS Cognito USER_PASSWORD_AUTH flow
     * This is a simplified flow for server-side applications
     */
    authenticate(): Promise<OAuthTokens>;
    /**
     * Initiate authentication with Cognito using username/password
     */
    private initiateAuth;
    /**
     * Refresh the access token using the refresh token
     */
    refreshAccessToken(): Promise<OAuthTokens>;
    /**
     * Make a request to AWS Cognito
     */
    private makeCognitoRequest;
    /**
     * Check if the current access token is expired or about to expire
     */
    isTokenExpired(bufferSeconds?: number): boolean;
    /**
     * Get the current access token, refreshing if necessary
     */
    getAccessToken(): Promise<string>;
    /**
     * Get the current ID token, refreshing if necessary
     */
    getIdToken(): Promise<string>;
    /**
     * Clear stored tokens (logout)
     */
    clearTokens(): void;
    /**
     * Get the current tokens (for storage/persistence)
     */
    getTokens(): OAuthTokens | undefined;
    /**
     * Set tokens (for loading from storage)
     */
    setTokens(tokens: OAuthTokens): void;
}
//# sourceMappingURL=auth.d.ts.map