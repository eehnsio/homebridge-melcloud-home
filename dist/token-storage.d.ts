import { Logger } from 'homebridge';
import { OAuthTokens } from './auth';
export declare class TokenStorage {
    private readonly storagePath;
    private readonly log?;
    constructor(storagePath: string, log?: Logger);
    /**
     * Save tokens to disk
     */
    saveTokens(tokens: OAuthTokens): Promise<void>;
    /**
     * Load tokens from disk
     */
    loadTokens(): Promise<OAuthTokens | null>;
    /**
     * Clear stored tokens
     */
    clearTokens(): Promise<void>;
    /**
     * Check if tokens exist in storage
     */
    hasTokens(): boolean;
}
//# sourceMappingURL=token-storage.d.ts.map