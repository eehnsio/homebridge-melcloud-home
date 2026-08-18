import { type AuthAuditLog } from './auth-audit-log';
export interface MELCloudConfig {
    refreshToken: string;
    debug?: boolean;
    onTokenRefresh?: (newRefreshToken: string) => Promise<void> | void;
    debugLog?: (message: string) => void;
    warnLog?: (message: string) => void;
    auditLog?: AuthAuditLog;
    /** ISO timestamp of the `family_start` anchor for the token family in use, if known. */
    familyStartedAt?: string;
}
export interface DeviceSetting {
    name: string;
    value: string;
}
export interface DeviceCapabilities {
    isMultiSplitSystem: boolean;
    isLegacyDevice: boolean;
    hasStandby: boolean;
    hasCoolOperationMode: boolean;
    hasHeatOperationMode: boolean;
    hasAutoOperationMode: boolean;
    hasDryOperationMode: boolean;
    hasAutomaticFanSpeed: boolean;
    hasAirDirection: boolean;
    hasSwing: boolean;
    hasExtendedTemperatureRange: boolean;
    hasEnergyConsumedMeter: boolean;
    numberOfFanSpeeds: number;
    minTempCoolDry: number;
    maxTempCoolDry: number;
    minTempHeat: number;
    maxTempHeat: number;
    minTempAutomatic: number;
    maxTempAutomatic: number;
    hasDemandSideControl: boolean;
    hasHalfDegreeIncrements: boolean;
    supportsWideVane: boolean;
}
export interface AirToAirUnit {
    id: string;
    givenDisplayName: string;
    displayIcon: string;
    settings: DeviceSetting[];
    capabilities: DeviceCapabilities;
    rssi: number;
    isConnected: boolean;
    connectedInterfaceIdentifier: string;
    systemId: string;
    isInError: boolean;
}
export interface Building {
    id: string;
    name: string;
    timezone: string;
    airToAirUnits: AirToAirUnit[];
}
export interface UserContext {
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    language: string;
    country: string;
    /** Buildings the account owns. */
    buildings: Building[];
    /** Buildings shared with the account through an invitation. Same shape as `buildings`. */
    guestBuildings?: Building[];
}
export interface DeviceCommand {
    power?: boolean | null;
    operationMode?: string | null;
    setFanSpeed?: string | null;
    vaneHorizontalDirection?: string | null;
    vaneVerticalDirection?: string | null;
    setTemperature?: number | null;
    temperatureIncrementOverride?: number | null;
    inStandbyMode?: boolean | null;
}
export declare class MELCloudAPI {
    private readonly config;
    private accessToken?;
    private tokenExpiry?;
    private currentRefreshToken?;
    private refreshPromise?;
    private readonly configTokenSuffix;
    private lastRotatedSuffix?;
    private lastPersistedSuffix?;
    private lastPersistedAt?;
    private readonly CLIENT_AUTH;
    private readonly httpsAgent;
    constructor(config: MELCloudConfig);
    /**
     * Build the self-contained context attached to a refresh_failure entry, so a
     * single log line is enough to tell whose side the failure is on: whether the
     * rejected token is the one we last persisted (MELCloud rejecting a valid
     * token) or a stale/never-saved one (our side / the UI never saved a login).
     *
     * `familyAgeDays` closes the loop on the other half of the diagnosis: how long
     * this token family survived before it was revoked, without having to correlate
     * the failure against a login you have to remember.
     */
    private failureContext;
    /**
     * Age of the current token family in days (2 decimals), or undefined when its
     * start was never recorded.
     */
    private familyAgeDays;
    /**
     * Take over the tokens from a fresh sign-in, replacing the dead family without
     * restarting Homebridge. The access token comes along so the next request does
     * not immediately spend a rotation on a token that was just issued.
     */
    adoptTokens(tokens: {
        refreshToken: string;
        accessToken: string;
        expiresIn: number;
    }, familyStartedAt: string): void;
    /**
     * Check if access token is expired or about to expire
     */
    private isTokenExpired;
    /**
     * Refresh the access token using the refresh token
     */
    private refreshAccessToken;
    /**
     * Ensure we have a valid access token
     */
    private ensureAuthenticated;
    private static readonly RETRYABLE_STATUS_CODES;
    private static readonly RETRYABLE_ERROR_CODES;
    private static readonly MAX_RETRIES;
    private makeRequest;
    private isRetryableError;
    private getRetryDelay;
    /**
     * Execute the actual HTTP request
     */
    private executeRequest;
    /**
     * Get user context including all devices
     */
    getUserContext(): Promise<UserContext>;
    /**
     * Control a device
     */
    controlDevice(deviceId: string, command: DeviceCommand): Promise<void>;
    /**
     * Get all air-to-air units from all buildings, both owned and shared.
     *
     * MELCloud Home puts units the account owns in `buildings` and units shared with it via an
     * invitation in `guestBuildings`. Both use the same shape and both accept control commands,
     * so an invited-only account must be treated exactly like an owner (issue #21).
     */
    getAllDevices(): Promise<AirToAirUnit[]>;
    /**
     * Parse device settings array into an object
     */
    static parseSettings(settings: DeviceSetting[]): Record<string, string>;
}
//# sourceMappingURL=melcloud-api.d.ts.map