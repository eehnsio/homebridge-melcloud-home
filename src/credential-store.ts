import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

interface EncryptedFile {
  v: number;
  boundToMachine: boolean;
  /** Short hash of the salt used, so a later failure can name its own cause. */
  saltId?: string;
  iv: string;
  tag: string;
  data: string;
}

/** What `load()` found, for callers that want to report rather than sign in. */
export type CredentialStatus = 'none' | 'ok' | 'unreadable';

/** Present on systemd hosts (the Homebridge LXC included); absent on macOS. */
const MACHINE_ID_PATHS = ['/etc/machine-id', '/var/lib/dbus/machine-id'];

/**
 * Docker and Podman markers. Inside a container `/etc/machine-id` is baked into
 * the image, so it identifies the image build and not the machine: measured on
 * `homebridge/homebridge`, it is byte-identical across container recreation and
 * across every user of a tag, but *different in every weekly rebuild*. Salting
 * with it therefore bound saved credentials to an image version and broke them
 * on the next `docker pull`, while protecting nothing. See `readMachineId()`.
 */
const CONTAINER_MARKERS = ['/.dockerenv', '/run/.containerenv'];

const KEY_BYTES = 32;
const IV_BYTES = 12;
const FILE_MODE = 0o600;
const HKDF_INFO = 'melcloud-home-credentials';
const FORMAT_VERSION = 2;

export class CredentialStore {
  private readonly credentialsFile: string;
  private readonly keyFile: string;

  constructor(
    storagePath: string,
    private readonly warn: (message: string) => void = () => {},
  ) {
    this.credentialsFile = path.join(storagePath, 'melcloud-credentials.json');
    this.keyFile = path.join(storagePath, 'melcloud-credentials.key');
  }

  async has(): Promise<boolean> {
    try {
      await fs.promises.access(this.credentialsFile);
      return true;
    } catch {
      return false;
    }
  }

  async save({ email, password }: Credentials): Promise<void> {
    const machineId = this.readMachineId();
    const key = this.deriveKey(await this.readOrCreateKeyMaterial(), machineId);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ email, password }), 'utf8'), cipher.final()]);

    const payload: EncryptedFile = {
      v: FORMAT_VERSION,
      boundToMachine: machineId !== null,
      saltId: machineId ? fingerprint(machineId) : undefined,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: ciphertext.toString('base64'),
    };

    await fs.promises.writeFile(this.credentialsFile, JSON.stringify(payload), { mode: FILE_MODE });
    // writeFile only applies mode when creating; enforce it on overwrite too.
    await fs.promises.chmod(this.credentialsFile, FILE_MODE);
  }

  /**
   * Decrypt the stored credentials, or null when there are none / they cannot be
   * read. Never throws: a failure here must degrade to "ask the user to log in",
   * never break the refresh loop.
   */
  async load(): Promise<Credentials | null> {
    return this.decrypt(this.warn);
  }

  /**
   * Whether the stored credentials can actually be used, so the UI can say
   * "saved" only when that is true. `has()` answers a weaker question — the file
   * exists — and a file that no longer decrypts used to read as healthy for as
   * long as it took the token family to die.
   */
  async status(): Promise<CredentialStatus> {
    if (!(await this.has())) {
      return 'none';
    }
    return (await this.decrypt(() => {})) ? 'ok' : 'unreadable';
  }

  private async decrypt(warn: (message: string) => void): Promise<Credentials | null> {
    let payload: EncryptedFile;
    try {
      payload = JSON.parse(await fs.promises.readFile(this.credentialsFile, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        warn(`Could not read saved MELCloud credentials: ${(error as Error).message}`);
      }
      return null;
    }

    let material: Buffer;
    try {
      material = await fs.promises.readFile(this.keyFile);
    } catch (error) {
      // Its own message: a missing key file used to produce the same "could not
      // be decrypted" line as a changed salt, which made the two impossible to
      // tell apart in a bug report.
      const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'it is missing' : (error as Error).message;
      warn(
        `Saved MELCloud credentials cannot be used: the key file ${this.keyFile} — ${reason}. Log in again to re-save them.`,
      );
      return null;
    }

    for (const salt of this.candidateSalts(payload)) {
      const credentials = this.tryDecrypt(payload, material, salt);
      if (!credentials) {
        continue;
      }
      // Either an older format or a salt we would no longer choose. Rewrite it
      // now, while we hold the plaintext, so the next image update cannot strand
      // it and so a later failure has a salt fingerprint to point at.
      if (payload.v !== FORMAT_VERSION || !sameSalt(salt, this.readMachineId())) {
        try {
          await this.save(credentials);
        } catch (error) {
          warn(`Could not re-save MELCloud credentials in the current format: ${(error as Error).message}`);
        }
      }
      return credentials;
    }

    // Deliberately not cleared: the user may be able to restore the key file,
    // and silently deleting credentials would be worse than asking them to log
    // in once.
    warn(this.explainFailure(payload));
    return null;
  }

  /**
   * Salts worth trying, current format first. The extras exist so files written
   * by older versions still open: before v2 a containerised install salted with
   * the image's `/etc/machine-id`, and that value is still readable here as long
   * as the image has not been rebuilt.
   */
  private candidateSalts(payload: EncryptedFile): (Buffer | null)[] {
    const current = this.readMachineId();
    const candidates: (Buffer | null)[] = [current];

    if (payload.boundToMachine) {
      const raw = this.readMachineIdRaw();
      if (raw && !sameSalt(raw, current)) {
        candidates.push(raw);
      }
    } else if (current) {
      candidates.push(null);
    }
    return candidates;
  }

  private tryDecrypt(payload: EncryptedFile, material: Buffer, salt: Buffer | null): Credentials | null {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.deriveKey(material, salt),
        Buffer.from(payload.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
      const credentials = JSON.parse(plaintext.toString('utf8'));
      if (typeof credentials?.email === 'string' && typeof credentials?.password === 'string') {
        return credentials;
      }
    } catch {
      // Wrong salt, wrong key material, or a tampered file — try the next salt.
    }
    return null;
  }

  /** Say which of the several possible causes it actually was. */
  private explainFailure(payload: EncryptedFile): string {
    const prefix = 'Saved MELCloud credentials could not be decrypted.';

    if (payload.boundToMachine && this.inContainer()) {
      // The bug this version fixes: they were tied to the container image's
      // machine id, which is replaced whenever the image is rebuilt.
      return `${prefix} They were tied to the container image, which has since been updated — a known bug, fixed in this version. Log in again to re-save them; it will not happen again.`;
    }
    const saltNow = this.readMachineIdRaw();
    if (payload.boundToMachine && payload.saltId && saltNow && payload.saltId !== fingerprint(saltNow)) {
      return `${prefix} The machine id changed since they were saved, so this storage directory is not on the machine that wrote them. Log in again to re-save them.`;
    }
    if (payload.boundToMachine) {
      return `${prefix} They are bound to the machine that saved them — if this is a restored backup, log in again to re-save them.`;
    }
    return `${prefix} The key file ${this.keyFile} does not match them. Log in again to replace them.`;
  }

  async clear(): Promise<void> {
    await fs.promises.rm(this.credentialsFile, { force: true });
    await fs.promises.rm(this.keyFile, { force: true });
  }

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
  private readMachineId(): Buffer | null {
    return this.inContainer() ? null : this.readMachineIdRaw();
  }

  private inContainer(): boolean {
    return CONTAINER_MARKERS.some((marker) => fs.existsSync(marker));
  }

  /** The id as written on disk, whatever its provenance — for reading old files. */
  private readMachineIdRaw(): Buffer | null {
    for (const candidate of MACHINE_ID_PATHS) {
      try {
        const id = fs.readFileSync(candidate, 'utf8').trim();
        if (id) {
          return Buffer.from(id, 'utf8');
        }
      } catch {
        // Try the next location.
      }
    }
    return null;
  }

  private async readOrCreateKeyMaterial(): Promise<Buffer> {
    try {
      const existing = await fs.promises.readFile(this.keyFile);
      if (existing.length >= KEY_BYTES) {
        return existing;
      }
    } catch {
      // Fall through and create one.
    }
    const material = crypto.randomBytes(KEY_BYTES);
    await fs.promises.writeFile(this.keyFile, material, { mode: FILE_MODE });
    await fs.promises.chmod(this.keyFile, FILE_MODE);
    return material;
  }

  private deriveKey(material: Buffer, machineId: Buffer | null): Buffer {
    return Buffer.from(crypto.hkdfSync('sha256', material, machineId ?? Buffer.alloc(0), HKDF_INFO, KEY_BYTES));
  }
}

/** Enough to tell two salts apart in a log line; not a secret, and not reversible to one. */
function fingerprint(salt: Buffer): string {
  return crypto.createHash('sha256').update(salt).digest('hex').slice(0, 8);
}

function sameSalt(a: Buffer | null, b: Buffer | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.equals(b);
}
