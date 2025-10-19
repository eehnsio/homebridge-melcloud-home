import crypto from 'crypto';
import https from 'https';
import { Logger } from 'homebridge';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number; // Unix timestamp
}

export interface AuthConfig {
  email: string;
  password: string;
  debug?: boolean;
}

interface CognitoTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

interface CognitoAuthResponse {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: {
    AccessToken: string;
    RefreshToken: string;
    IdToken: string;
    ExpiresIn: number;
  };
}

export class MELCloudOAuth {
  private readonly config: AuthConfig;
  private readonly log?: Logger;
  private tokens?: OAuthTokens;

  // AWS Cognito configuration for MELCloud Home
  private readonly cognitoConfig = {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_SRKbE9Nv7',
    clientId: '3g4d5l5kivuqi7oia68gib7uso',
    domain: 'live-melcloudhome.auth.eu-west-1.amazoncognito.com',
    authDomain: 'auth.melcloudhome.com',
    redirectUri: 'https://auth.melcloudhome.com/signin-oidc-meu',
  };

  constructor(config: AuthConfig, log?: Logger) {
    this.config = config;
    this.log = log;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    // Generate a random code verifier (43-128 characters)
    const verifier = crypto
      .randomBytes(32)
      .toString('base64url');

    // Create SHA256 hash of the verifier
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Authenticate using email and password via AWS Cognito USER_PASSWORD_AUTH flow
   * This is a simplified flow for server-side applications
   */
  async authenticate(): Promise<OAuthTokens> {
    if (this.log?.debug) {
      this.log.debug('[OAuth] Starting authentication...');
    }

    try {
      // For server-side authentication, we'll use Cognito's InitiateAuth API
      // with USER_PASSWORD_AUTH flow (requires app client to have this enabled)
      const authResult = await this.initiateAuth();

      if (!authResult.AuthenticationResult) {
        throw new Error('Authentication failed: No authentication result received');
      }

      const now = Date.now();
      this.tokens = {
        accessToken: authResult.AuthenticationResult.AccessToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken,
        idToken: authResult.AuthenticationResult.IdToken,
        expiresAt: now + (authResult.AuthenticationResult.ExpiresIn * 1000),
      };

      if (this.log?.debug) {
        this.log.debug('[OAuth] Authentication successful');
      }

      return this.tokens;
    } catch (error) {
      if (this.log) {
        this.log.error('[OAuth] Authentication failed:', error);
      }
      throw error;
    }
  }

  /**
   * Initiate authentication with Cognito using username/password
   */
  private async initiateAuth(): Promise<CognitoAuthResponse> {
    const authParameters = {
      USERNAME: this.config.email,
      PASSWORD: this.config.password,
    };

    const payload = JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.cognitoConfig.clientId,
      AuthParameters: authParameters,
    });

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: `cognito-idp.${this.cognitoConfig.region}.amazonaws.com`,
        port: 443,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Cognito authentication failed: ${res.statusCode} - ${body}`));
            return;
          }

          try {
            const response = JSON.parse(body) as CognitoAuthResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse Cognito response: ${error}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available. Please authenticate first.');
    }

    if (this.log?.debug) {
      this.log.debug('[OAuth] Refreshing access token...');
    }

    try {
      const payload = JSON.stringify({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: this.cognitoConfig.clientId,
        AuthParameters: {
          REFRESH_TOKEN: this.tokens.refreshToken,
        },
      });

      const response = await this.makeCognitoRequest(payload, 'AWSCognitoIdentityProviderService.InitiateAuth');

      if (!response.AuthenticationResult) {
        throw new Error('Token refresh failed: No authentication result received');
      }

      const now = Date.now();
      this.tokens = {
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: this.tokens.refreshToken, // Refresh token stays the same
        idToken: response.AuthenticationResult.IdToken,
        expiresAt: now + (response.AuthenticationResult.ExpiresIn * 1000),
      };

      if (this.log?.debug) {
        this.log.debug('[OAuth] Token refresh successful');
      }

      return this.tokens;
    } catch (error) {
      if (this.log) {
        this.log.error('[OAuth] Token refresh failed:', error);
      }
      throw error;
    }
  }

  /**
   * Make a request to AWS Cognito
   */
  private makeCognitoRequest(payload: string, target: string): Promise<CognitoAuthResponse> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: `cognito-idp.${this.cognitoConfig.region}.amazonaws.com`,
        port: 443,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': target,
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Cognito request failed: ${res.statusCode} - ${body}`));
            return;
          }

          try {
            const response = JSON.parse(body) as CognitoAuthResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse Cognito response: ${error}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Check if the current access token is expired or about to expire
   */
  isTokenExpired(bufferSeconds: number = 300): boolean {
    if (!this.tokens) {
      return true;
    }

    const now = Date.now();
    const expiryWithBuffer = this.tokens.expiresAt - (bufferSeconds * 1000);

    return now >= expiryWithBuffer;
  }

  /**
   * Get the current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      await this.authenticate();
    } else if (this.isTokenExpired()) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        // If refresh fails, try full authentication
        if (this.log) {
          this.log.warn('[OAuth] Token refresh failed, attempting full authentication');
        }
        await this.authenticate();
      }
    }

    if (!this.tokens) {
      throw new Error('Failed to obtain access token');
    }

    return this.tokens.accessToken;
  }

  /**
   * Get the current ID token, refreshing if necessary
   */
  async getIdToken(): Promise<string> {
    if (!this.tokens) {
      await this.authenticate();
    } else if (this.isTokenExpired()) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        // If refresh fails, try full authentication
        if (this.log) {
          this.log.warn('[OAuth] Token refresh failed, attempting full authentication');
        }
        await this.authenticate();
      }
    }

    if (!this.tokens) {
      throw new Error('Failed to obtain ID token');
    }

    return this.tokens.idToken;
  }

  /**
   * Clear stored tokens (logout)
   */
  clearTokens(): void {
    this.tokens = undefined;
  }

  /**
   * Get the current tokens (for storage/persistence)
   */
  getTokens(): OAuthTokens | undefined {
    return this.tokens;
  }

  /**
   * Set tokens (for loading from storage)
   */
  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }
}
