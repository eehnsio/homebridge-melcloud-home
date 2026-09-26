/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'MELCloudHome';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-melcloud-home';

/**
 * The headless login (`src/login-cli.ts`, shipped as the `melcloud-login` bin).
 *
 * Every "sign in again" message names this as well as the settings page: the
 * settings page needs a host that implements the Homebridge custom-UI protocol,
 * and some don't — HOOBS 5.1.8 ships a hub bug that stops every plugin's
 * settings page from loading (fixed in 5.1.17, which as of 2026-09 is only in
 * HOOBS's pre-release channel; issue #23) — so users there would
 * otherwise be told to click a button they cannot see.
 */
export const LOGIN_COMMAND = 'npx -p homebridge-melcloud-home melcloud-login';

/** Both routes in one line, for single-line error messages. */
export const REAUTH_LINE = `Sign in again in the plugin settings, or run: ${LOGIN_COMMAND}`;

/** Both routes, for the multi-line log blocks. */
export const REAUTH_HINT = [
  'To sign in again, either:',
  '  A) Homebridge UI → Plugins → MELCloud Home → Settings (⚙️) → Login and Get Token',
  `  B) run \`${LOGIN_COMMAND}\` in a terminal, then paste the token it prints`,
  '     into config.json (for interfaces that cannot show the Settings page)',
];
