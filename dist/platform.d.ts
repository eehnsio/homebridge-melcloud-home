import type { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { type AirToAirUnit, MELCloudAPI } from './melcloud-api';
export declare class MELCloudHomePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    private readonly accessoryInstances;
    private readonly fanButtonInstances;
    private readonly vaneButtonInstances;
    private melcloudAPI?;
    private refreshInterval?;
    private refreshTimeout?;
    private configManager;
    private authAuditLog;
    private credentialStore;
    private consecutiveAuthFailures;
    private autoReauthAttempted;
    private lastAutoReauthAt;
    private static readonly AUTO_REAUTH_COOLDOWN_MS;
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * Debug logging helper - respects config.debug flag
     * When debug is enabled, logs at INFO level so it shows without -D flag
     */
    debugLog(message: string, ...args: unknown[]): void;
    /**
     * When did the refresh-token family currently in config.json come into being?
     *
     * Refresh tokens rotate every ~55 minutes, so the token in config says nothing
     * about the age of the grant behind it — only the browser login that created it
     * does, and that is written by the custom UI as a `family_start` entry. Reading
     * it here lets a later `invalid_grant` record how long the family lived.
     *
     * With no anchor in the log — plugin upgraded mid-family, or a token pasted in
     * by hand — bootstrap one now. That timestamp is a lower bound, not a login, so
     * it is tagged `plugin-start` to keep the two apart when reading the log.
     */
    private resolveFamilyStart;
    /**
     * Sign in again with saved credentials after MELCloud revoked the token family.
     *
     * MELCloud rejects a refresh token it issued itself every few weeks, at no
     * fixed interval (measured: 18.5 d, ~22.4 d, and one family still healthy at
     * 23.6 d). Nothing here can prevent that, so when the user has opted in to
     * saving their credentials the honest response is to mint a new family and
     * carry on rather than go "Not Responding" until they notice.
     *
     * Deliberately narrow. It fires only on a rejected *refresh token* — the exact
     * failure that kills a family — never on 401/403 from an expired access token
     * (already retried internally) and never on a 5xx or timeout, where signing in
     * repeatedly during a MELCloud outage would be the worst possible behaviour.
     * One attempt per dead family, plus a cooldown: a wrong password must never
     * become a login loop against Cognito.
     */
    private tryAutoReauth;
    /**
     * Initialize authentication - uses OAuth refresh token from Homebridge UI
     */
    private initializeAuthentication;
    configureAccessory(accessory: PlatformAccessory): void;
    private discoverDevices;
    private startRefreshInterval;
    private refreshAllDevices;
    getAPI(): MELCloudAPI;
    /**
     * Whether the cloud connection is currently usable. Returns false only once the
     * auth circuit breaker has tripped (3 consecutive auth failures, which also paused
     * the refresh loop) — i.e. the refresh token is dead and every request will fail
     * until the user re-logs in and restarts. Accessories read this to surface an
     * honest "Not Responding" from onGet when the cloud is genuinely gone, rather than
     * serving stale cached state that makes commands look like they worked.
     *
     * Deliberately gated on the *tripped* breaker (>= 3), NOT on transient 1–2 failures,
     * so a brief blip never false-latches "Not Responding" (the historical footgun).
     * Self-clears: a fresh process after restart starts at 0 = healthy.
     */
    isConnectionHealthy(): boolean;
    refreshDevice(_deviceId: string): Promise<void>;
    /**
     * Update all accessories (main AC, fan buttons, vane buttons) for a single device
     */
    private updateDeviceAccessories;
    /**
     * Schedule a debounced refresh of all devices
     * Called after button presses to sync state across all accessories
     */
    scheduleRefresh(): void;
    /**
     * Immediately update all fan buttons for a specific device
     * Called when a fan speed is changed to ensure mutual exclusivity
     */
    updateFanButtonsForDevice(device: AirToAirUnit): void;
    /**
     * Immediately update all vane buttons for a specific device
     * Called when vane position is changed to ensure mutual exclusivity
     */
    updateVaneButtonsForDevice(device: AirToAirUnit): void;
    /**
     * Update ALL buttons (fan + vane) for a device to keep caches in sync
     * This ensures that when one button type is pressed, all other buttons
     * have the correct device state for their next API call
     */
    updateAllButtonsForDevice(device: AirToAirUnit): void;
}
//# sourceMappingURL=platform.d.ts.map