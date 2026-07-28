/**
 * Encrypted storage for the MELCloud email/password, used only to sign in again
 * after MELCloud revokes a refresh-token family (`invalid_grant`).
 *
 * What this protects against, honestly:
 *
 * - Accidental disclosure. Users paste `config.json` into GitHub issues, post
 *   screenshots of the settings panel, and upload `hb-service` backups to cloud
 *   drives. Keeping the password out of config.json and encrypted at rest makes
 *   all of that harmless. This is the risk that actually materialises.
 * - Backups leaving the machine. Where a machine id is available the key is
 *   bound to it, so a copied storage directory cannot be decrypted elsewhere.
 *   Restoring onto a new machine loses the credentials and falls back to a
 *   manual login — a benign, explainable failure.
 *
 * What it does NOT protect against: anyone who can already read files as the
 * Homebridge user. An unattended service must be able to decrypt without a
 * human, so the key necessarily lives on the same box. That is inherent, not a
 * shortcoming of this implementation, and the UI says so in plain words.
 *
 * Note the refresh token in config.json is itself a bearer credential with full
 * account access. The password is protected more carefully because it is
 * permanent and likely reused elsewhere, whereas a token expires on its own and
 * dies with the next login.
 */
export interface Credentials {
    email: string;
    password: string;
}
export declare class CredentialStore {
    private readonly warn;
    private readonly credentialsFile;
    private readonly keyFile;
    constructor(storagePath: string, warn?: (message: string) => void);
    has(): Promise<boolean>;
    save({ email, password }: Credentials): Promise<void>;
    /**
     * Decrypt the stored credentials, or null when there are none / they cannot be
     * read. Never throws: a failure here must degrade to "ask the user to log in",
     * never break the refresh loop.
     */
    load(): Promise<Credentials | null>;
    clear(): Promise<void>;
    /** Machine id as key salt, when the platform has one. */
    private readMachineId;
    private readOrCreateKeyMaterial;
    private deriveKey;
}
//# sourceMappingURL=credential-store.d.ts.map