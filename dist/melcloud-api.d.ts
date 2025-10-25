export interface MELCloudConfig {
    refreshToken: string;
    debug?: boolean;
    onTokenRefresh?: (newRefreshToken: string) => void;
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
    buildings: Building[];
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
    private sessionValid;
    private lastAuthError?;
    private accessToken?;
    private tokenExpiry?;
    private currentRefreshToken?;
    private readonly CLIENT_AUTH;
    constructor(config: MELCloudConfig);
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
    private makeRequest;
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
     * Get all air-to-air units from all buildings
     */
    getAllDevices(): Promise<AirToAirUnit[]>;
    /**
     * Parse device settings array into an object
     */
    static parseSettings(settings: DeviceSetting[]): Record<string, string>;
}
//# sourceMappingURL=melcloud-api.d.ts.map