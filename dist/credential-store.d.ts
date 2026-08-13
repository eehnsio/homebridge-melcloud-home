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
 * - Backups leaving the machine. On a real host, where the machine id belongs to
 *   the install, the key is bound to it so a copied storage directory cannot be
 *   decrypted elsewhere. Restoring onto a new machine loses the credentials and
 *   falls back to a manual login — a benign, explainable failure. Containers are
 *   excluded from that binding on purpose (see `readMachineId()`): there the id
 *   is a property of the image, so it bought no protection and cost users their
 *   credentials on every image update.
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
/** What `load()` found, for callers that want to report rather than sign in. */
export type CredentialStatus = 'none' | 'ok' | 'unreadable';
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
    /**
     * Whether the stored credentials can actually be used, so the UI can say
     * "saved" only when that is true. `has()` answers a weaker question — the file
     * exists — and a file that no longer decrypts used to read as healthy for as
     * long as it took the token family to die.
     */
    status(): Promise<CredentialStatus>;
    private decrypt;
    /**
     * Salts worth trying, current format first. The extras exist so files written
     * by older versions still open: before v2 a containerised install salted with
     * the image's `/etc/machine-id`, and that value is still readable here as long
     * as the image has not been rebuilt.
     */
    private candidateSalts;
    private tryDecrypt;
    /** Say which of the several possible causes it actually was. */
    private explainFailure;
    clear(): Promise<void>;
    /**
     * Machine id as key salt, when it identifies the machine.
     *
     * Skipped in Docker/Podman, where the id comes from the image rather than the
     * host: it is a public constant shared by everyone running that tag, so it
     * binds nothing, and it changes with every image rebuild, so it silently
     * strands the credentials on a routine `docker pull`. Real hosts — bare metal,
     * VMs, LXC — generate the id once per install and keep it, so binding there
     * works and is kept.
     */
    private readMachineId;
    private inContainer;
    /** The id as written on disk, whatever its provenance — for reading old files. */
    private readMachineIdRaw;
    private readOrCreateKeyMaterial;
    private deriveKey;
}
//# sourceMappingURL=credential-store.d.ts.map