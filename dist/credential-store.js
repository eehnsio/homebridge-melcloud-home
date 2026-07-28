"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialStore = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/** Present on systemd hosts (the Homebridge LXC included); absent on macOS. */
const MACHINE_ID_PATHS = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
const KEY_BYTES = 32;
const IV_BYTES = 12;
const FILE_MODE = 0o600;
const HKDF_INFO = 'melcloud-home-credentials';
class CredentialStore {
    constructor(storagePath, warn = () => { }) {
        this.warn = warn;
        this.credentialsFile = node_path_1.default.join(storagePath, 'melcloud-credentials.json');
        this.keyFile = node_path_1.default.join(storagePath, 'melcloud-credentials.key');
    }
    async has() {
        try {
            await node_fs_1.default.promises.access(this.credentialsFile);
            return true;
        }
        catch {
            return false;
        }
    }
    async save({ email, password }) {
        const machineId = this.readMachineId();
        const key = this.deriveKey(await this.readOrCreateKeyMaterial(), machineId);
        const iv = node_crypto_1.default.randomBytes(IV_BYTES);
        const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ email, password }), 'utf8'), cipher.final()]);
        const payload = {
            v: 1,
            boundToMachine: machineId !== null,
            iv: iv.toString('base64'),
            tag: cipher.getAuthTag().toString('base64'),
            data: ciphertext.toString('base64'),
        };
        await node_fs_1.default.promises.writeFile(this.credentialsFile, JSON.stringify(payload), { mode: FILE_MODE });
        // writeFile only applies mode when creating; enforce it on overwrite too.
        await node_fs_1.default.promises.chmod(this.credentialsFile, FILE_MODE);
    }
    /**
     * Decrypt the stored credentials, or null when there are none / they cannot be
     * read. Never throws: a failure here must degrade to "ask the user to log in",
     * never break the refresh loop.
     */
    async load() {
        let payload;
        try {
            payload = JSON.parse(await node_fs_1.default.promises.readFile(this.credentialsFile, 'utf8'));
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                this.warn(`Could not read saved MELCloud credentials: ${error.message}`);
            }
            return null;
        }
        try {
            const material = await node_fs_1.default.promises.readFile(this.keyFile);
            const key = this.deriveKey(material, payload.boundToMachine ? this.readMachineId() : null);
            const decipher = node_crypto_1.default.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
            decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
            const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
            const credentials = JSON.parse(plaintext.toString('utf8'));
            if (typeof credentials?.email === 'string' && typeof credentials?.password === 'string') {
                return credentials;
            }
            this.warn('Saved MELCloud credentials are malformed — log in again to replace them.');
        }
        catch {
            // Wrong key, tampered file, or a storage directory restored onto a
            // different machine. Deliberately not cleared: the user may be able to
            // restore the key file, and silently deleting credentials would be worse
            // than asking them to log in once.
            this.warn(payload.boundToMachine
                ? 'Saved MELCloud credentials could not be decrypted. They are bound to the machine that saved them — if this is a restored backup, log in again to re-save them.'
                : 'Saved MELCloud credentials could not be decrypted. Log in again to replace them.');
        }
        return null;
    }
    async clear() {
        await node_fs_1.default.promises.rm(this.credentialsFile, { force: true });
        await node_fs_1.default.promises.rm(this.keyFile, { force: true });
    }
    /** Machine id as key salt, when the platform has one. */
    readMachineId() {
        for (const candidate of MACHINE_ID_PATHS) {
            try {
                const id = node_fs_1.default.readFileSync(candidate, 'utf8').trim();
                if (id) {
                    return Buffer.from(id, 'utf8');
                }
            }
            catch {
                // Try the next location.
            }
        }
        return null;
    }
    async readOrCreateKeyMaterial() {
        try {
            const existing = await node_fs_1.default.promises.readFile(this.keyFile);
            if (existing.length >= KEY_BYTES) {
                return existing;
            }
        }
        catch {
            // Fall through and create one.
        }
        const material = node_crypto_1.default.randomBytes(KEY_BYTES);
        await node_fs_1.default.promises.writeFile(this.keyFile, material, { mode: FILE_MODE });
        await node_fs_1.default.promises.chmod(this.keyFile, FILE_MODE);
        return material;
    }
    deriveKey(material, machineId) {
        return Buffer.from(node_crypto_1.default.hkdfSync('sha256', material, machineId ?? Buffer.alloc(0), HKDF_INFO, KEY_BYTES));
    }
}
exports.CredentialStore = CredentialStore;
//# sourceMappingURL=credential-store.js.map