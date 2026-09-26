#!/usr/bin/env node
/**
 * `melcloud-login` — obtain a MELCloud Home refresh token from a terminal.
 *
 * The plugin normally gets its token from the custom UI (`homebridge-ui/`), but
 * not every host can show it: HOOBS 5.1.8 has a hub bug that stops every plugin's
 * custom UI from loading (issue #23, see the HOOBS gotcha in CLAUDE.md), and
 * anyone running Homebridge headless has no UI either.
 *
 * This runs the exact same proven flow (`oauth-login.js`) from a shell and prints
 * the token to paste into `config.json`. It deliberately pulls in nothing beyond
 * the plugin's own code and Node builtins, so `npx -p homebridge-melcloud-home
 * melcloud-login` works on whatever Node the host happens to have.
 *
 * The token is portable — it can be generated on any machine. Saved credentials
 * are not: `CredentialStore` binds them to the host, so `--save-credentials` only
 * makes sense when run on the machine that runs Homebridge.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { recordFamilyStart } from './auth-audit-log';
import { CredentialStore } from './credential-store';
import { loginWithPassword } from './oauth-login';
import { PLATFORM_NAME } from './settings';

const USAGE = `melcloud-login — get a MELCloud Home refresh token for config.json

Usage:
  npx -p homebridge-melcloud-home melcloud-login [options]

Options:
  -e, --email <email>          MELCloud Home account email (prompted if omitted)
  -p, --password <password>    Account password (prompted if omitted — prefer the
                               prompt, an argument is visible in shell history)
  -d, --storage-path <dir>     Homebridge storage directory: the folder holding
                               config.json (e.g. ~/.homebridge, /var/lib/homebridge)
      --save-credentials       Also store the credentials, encrypted, in that
                               directory so the plugin can sign in again by itself
                               when MELCloud revokes the token. Must be run on the
                               machine that runs Homebridge — the files are bound
                               to it and cannot be copied elsewhere.
      --json                   Print the result as JSON instead of instructions
      --verbose                Log the OAuth flow (truncated) for troubleshooting
  -h, --help                   Show this help

The refresh token is as sensitive as your password. Treat it accordingly.`;

function parseOptions(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    options: {
      email: { type: 'string', short: 'e' },
      password: { type: 'string', short: 'p' },
      'storage-path': { type: 'string', short: 'd' },
      'save-credentials': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
}

/**
 * Prompt on the terminal, optionally without echoing. Written against readline
 * rather than a prompt library so the CLI stays dependency-free; the muted
 * Writable is the standard trick for hiding a password as it is typed.
 */
function prompt(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error(`No terminal to prompt on. Pass ${hidden ? '--password' : '--email'} instead.`));
      return;
    }

    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding as BufferEncoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) {
        process.stdout.write('\n');
      }
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main(): Promise<void> {
  const {
    email: emailArg,
    password: passwordArg,
    'storage-path': storagePath,
    'save-credentials': saveCredentials,
    json,
    verbose,
    help,
  } = parseOptions(process.argv.slice(2));

  if (help) {
    console.log(USAGE);
    return;
  }

  if (saveCredentials && !storagePath) {
    throw new Error('--save-credentials needs --storage-path (the folder holding config.json)');
  }

  if (storagePath) {
    if (!fs.existsSync(storagePath)) {
      throw new Error(`Storage path does not exist: ${storagePath}`);
    }
    if (!fs.existsSync(path.join(storagePath, 'config.json'))) {
      console.error(`Warning: no config.json in ${storagePath} — is that the right storage directory?`);
    }
  }

  const email = emailArg || (await prompt('MELCloud Home email: ', false));
  const password = passwordArg || (await prompt('Password: ', true));

  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  if (!json) {
    console.error('Signing in to MELCloud Home...');
  }

  // The flow logs whole request headers, session cookies included. Same redaction
  // the plugin applies before this ever reaches a terminal or a pasted log.
  const logger = verbose ? (...args: unknown[]) => console.error(String(args[0]).slice(0, 200)) : undefined;
  const tokens = await loginWithPassword(email, password, logger);

  // Dates the refresh-token family, as the custom UI does after a browser login.
  if (storagePath) {
    await recordFamilyStart(storagePath, tokens.refreshToken, 'oauth-cli');
  }
  // --save-credentials without --storage-path was rejected above.
  const credentialsSaved = saveCredentials && !!storagePath;
  if (credentialsSaved) {
    const store = new CredentialStore(storagePath, (message) => console.error(message));
    await store.save({ email, password });
  }

  if (json) {
    console.log(JSON.stringify({ refreshToken: tokens.refreshToken, credentialsSaved }, null, 2));
    return;
  }

  const block = {
    platform: PLATFORM_NAME,
    name: 'MELCloud Home',
    refreshToken: tokens.refreshToken,
  };

  console.log(`
Signed in. Add this to the "platforms" array in your config.json:

${JSON.stringify(block, null, 2)
  .split('\n')
  .map((line) => `    ${line}`)
  .join('\n')}

Then restart Homebridge. Keep the token as private as your password —
anyone holding it can control your units.`);

  if (credentialsSaved) {
    console.log(`
Credentials saved (encrypted) in ${storagePath}. The plugin will sign in
again on its own if MELCloud revokes the token. Delete melcloud-credentials.json
and melcloud-credentials.key there to undo this.`);
  }
}

main().catch((error: Error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
