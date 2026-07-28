/**
 * MELCloud Home OAuth login (Authorization Code + PKCE, password grant via the
 * Cognito login form).
 *
 * This is the flow that has been proven against the live service — it is NOT a
 * clean-room implementation and should not be "tidied up" casually. The cookie
 * jar, the `Sec-Fetch-*` headers, the Referer rewriting, the special handling of
 * `/ExternalLogin/Callback`, and the meta-refresh hop were all arrived at by
 * trial against the real endpoints. Small deviations silently break the flow at
 * the signin-oidc-meu step. (An independent reimplementation lived in
 * src/oauth-helper.ts, never wired up, and lacked every one of those behaviours;
 * it was deleted rather than debugged.)
 *
 * Lives here in plain JS, byte-for-byte as it was validated, so both the custom
 * UI (homebridge-ui/server.js) and the plugin can use the same code path.
 */
export type OAuthTokens = {
    refreshToken: string;
    accessToken: string;
    expiresIn: number;
};
export function loginWithPassword(email: any, password: any, logger: any): Promise<{
    refreshToken: any;
    accessToken: any;
    expiresIn: any;
}>;
//# sourceMappingURL=oauth-login.d.ts.map