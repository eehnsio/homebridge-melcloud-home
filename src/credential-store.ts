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

interface EncryptedFile {
  v: number;
  boundToMachine: boolean;
  iv: string;
  tag: string;
  data: string;
}

/** Present on systemd hosts (the Homebridge LXC included); absent on macOS. */
const MACHINE_ID_PATHS = ['/etc/machine-id', '/var/lib/dbus/machine-id'];

const KEY_BYTES = 32;
const IV_BYTES = 12;
const FILE_MODE = 0o600;
const HKDF_INFO = 'melcloud-home-credentials';

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
      v: 1,
      boundToMachine: machineId !== null,
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
    let payload: EncryptedFile;
    try {
      payload = JSON.parse(await fs.promises.readFile(this.credentialsFile, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.warn(`Could not read saved MELCloud credentials: ${(error as Error).message}`);
      }
      return null;
    }

    try {
      const material = await fs.promises.readFile(this.keyFile);
      const key = this.deriveKey(material, payload.boundToMachine ? this.readMachineId() : null);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
      const credentials = JSON.parse(plaintext.toString('utf8'));
      if (typeof credentials?.email === 'string' && typeof credentials?.password === 'string') {
        return credentials;
      }
      this.warn('Saved MELCloud credentials are malformed — log in again to replace them.');
    } catch {
      // Wrong key, tampered file, or a storage directory restored onto a
      // different machine. Deliberately not cleared: the user may be able to
      // restore the key file, and silently deleting credentials would be worse
      // than asking them to log in once.
      this.warn(
        payload.boundToMachine
          ? 'Saved MELCloud credentials could not be decrypted. They are bound to the machine that saved them — if this is a restored backup, log in again to re-save them.'
          : 'Saved MELCloud credentials could not be decrypted. Log in again to replace them.',
      );
    }
    return null;
  }

  async clear(): Promise<void> {
    await fs.promises.rm(this.credentialsFile, { force: true });
    await fs.promises.rm(this.keyFile, { force: true });
  }

  /** Machine id as key salt, when the platform has one. */
  private readMachineId(): Buffer | null {
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
