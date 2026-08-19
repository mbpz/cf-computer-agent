# GitHub OAuth deployment runbook

This runbook separates local evidence from actions that change GitHub or Cloudflare. Do not create the OAuth App, write a secret, apply a remote migration, deploy, or run a remote smoke test without explicit authorization.

## Fixed production values

Create a GitHub OAuth App with these exact values:

- Application name: `Memory Garden`
- Homepage URL: `https://memory.crgmhrc.asia`
- Authorization callback URL: `https://memory.crgmhrc.asia/auth/github/callback`

The GitHub Client ID and automation client ID are identifiers, not credentials. The GitHub client secret, bootstrap and allowlist email configuration, automation secret, and APP token are sensitive. `ALLOWED_MEMBER_EMAILS` is a nonempty comma-separated list of unique valid canonical emails: trim and lowercase every entry; reject empty entries and duplicates after that canonicalization; each address is at most 254 visible-ASCII characters with exactly one `@`, a 1–64-character local part, and a dot-containing domain that neither starts nor ends with a dot. `BOOTSTRAP_ADMIN_EMAIL` must itself be a valid canonical email and must be included in that list. `AUTOMATION_SECRET` and `APP_TOKEN` each need at least 32 independently random bytes; the commands below generate 48 bytes for each. Do not commit any production value to `wrangler.jsonc`, `config/types.env`, `.dev.vars`, shell arguments, transcripts, logs, browser code, or audit metadata. The checked-in values in `config/types.env` are fake type-generation inputs only.

The existing D1 binding ID is a non-secret identifier for the intended `memory-garden-control-plane` database. Do not create another database. Keep `workers_dev: false`, `preview_urls: false`, the `KnowledgeBase` Durable Object migration `v1`, and the asset Worker-first configuration unchanged.

## Local-only verification

These commands make no GitHub or production request. The local D1 migration is disposable evidence only; it does not apply migration `0002` to the target database.

```bash
rtk npm run db:migrate:local
rtk npm run check
rtk npm audit --omit=dev
```

## Authorized remote rollout

Run this section only after the operator has explicitly authorized each remote action and has an approved secret store available.

1. Create the OAuth App with the fixed values above. Store its client secret only in the approved secret store.
2. Apply append-only D1 migration `0002` before deploying a Worker that requires its tables:

   ```bash
   rtk npm run db:migrate:remote
   ```

3. Create one non-deployed secret-bearing Worker version. Do **not** use plain `wrangler secret put`: it immediately deploys each setting and can expose a partially configured production version. Create the temporary directory outside this repository, restrict both directory and file permissions, and keep shell tracing disabled. The random-generation commands feed generated values directly into hidden variables, so they do not print in CI logs or terminal output. Do not use a `.dev.vars` or dotenv file for this bundle: it must be JSON so `#`, quotes, backslashes, and commas round-trip through `JSON.stringify` without dotenv parsing.

   ```bash
   set +x
   SECRETS_DIR="$(mktemp -d -t memory-garden-oauth.XXXXXX)"
   chmod 700 "$SECRETS_DIR"
   SECRETS_FILE="$SECRETS_DIR/worker-secrets.json"
   : > "$SECRETS_FILE"
   chmod 600 "$SECRETS_FILE"

   cleanup_secret_bundle() {
     unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
     rm -f "$SECRETS_FILE"
     rmdir "$SECRETS_DIR"
   }
   trap cleanup_secret_bundle EXIT HUP INT TERM

   read -r GITHUB_OAUTH_CLIENT_ID
   read -rs GITHUB_OAUTH_CLIENT_SECRET
   read -rs BOOTSTRAP_ADMIN_EMAIL
   read -rs ALLOWED_MEMBER_EMAILS
   read -r AUTOMATION_CLIENT_ID
   IFS= read -r -s AUTOMATION_SECRET < <(openssl rand -base64 48)
   IFS= read -r -s APP_TOKEN < <(openssl rand -base64 48)
   GITHUB_OAUTH_CLIENT_ID="$GITHUB_OAUTH_CLIENT_ID" \
   GITHUB_OAUTH_CLIENT_SECRET="$GITHUB_OAUTH_CLIENT_SECRET" \
   BOOTSTRAP_ADMIN_EMAIL="$BOOTSTRAP_ADMIN_EMAIL" \
   ALLOWED_MEMBER_EMAILS="$ALLOWED_MEMBER_EMAILS" \
   AUTOMATION_CLIENT_ID="$AUTOMATION_CLIENT_ID" \
   AUTOMATION_SECRET="$AUTOMATION_SECRET" \
   APP_TOKEN="$APP_TOKEN" \
   node -e '
     const keys = ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "BOOTSTRAP_ADMIN_EMAIL", "ALLOWED_MEMBER_EMAILS", "AUTOMATION_CLIENT_ID", "AUTOMATION_SECRET", "APP_TOKEN"];
     const bundle = Object.fromEntries(keys.map((key) => {
       const value = process.env[key];
       if (!value) throw new Error(`Missing ${key}`);
       return [key, value];
     }));
     process.stdout.write(`${JSON.stringify(bundle)}\n`);
   ' > "$SECRETS_FILE"
   SERIALIZE_STATUS=$?
   unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
   test "$SERIALIZE_STATUS" -eq 0 || exit "$SERIALIZE_STATUS"

   rtk npx wrangler versions secret bulk "$SECRETS_FILE" --message "GitHub OAuth configuration"
   BULK_STATUS=$?
   cleanup_secret_bundle
   trap - EXIT HUP INT TERM
   test "$BULK_STATUS" -eq 0
   ```

   Record the version ID returned by `versions secret bulk` as `<VERSION_ID>` in restricted release evidence. The returned version is not serving traffic yet. Before deployment, inspect the exact version and current rollout; do not paste secret values into evidence.

   ```bash
   rtk npx wrangler versions view <VERSION_ID>
   rtk npx wrangler versions list
   ```

4. Deploy the reviewed version exactly once and only with separate authorization:

   ```bash
   rtk npx wrangler versions deploy <VERSION_ID>@100% --yes
   ```

5. At `https://memory.crgmhrc.asia`, record redacted evidence for each check: anonymous login starts only at `/auth/github`; the bootstrap allowlisted email becomes the sole active admin; a separate allowlisted email is a contributor; a disabled contributor is rejected; and `POST /auth/logout` clears the session.
6. Run the separately authorized signed automation check in [smoke-test.md](./smoke-test.md). It is limited to legacy health, note, search, and chat routes and is never an administrator.
7. Only after every preceding check passes, make a separate authorized cleanup version for the obsolete Worker secrets. Each delete creates a non-deployed version; retain the final returned version ID as `<ACCESS_CLEANUP_VERSION_ID>`, inspect it, then deploy only that final version once. Do not remove CI credentials in this step.

   ```bash
   rtk npx wrangler versions secret delete ACCESS_TEAM_DOMAIN
   rtk npx wrangler versions secret delete ACCESS_AUD
   rtk npx wrangler versions view <ACCESS_CLEANUP_VERSION_ID>
   rtk npx wrangler versions deploy <ACCESS_CLEANUP_VERSION_ID>@100% --yes
   ```

8. Only after the deployed GitHub browser flow and signed smoke remain verified, separately authorize removal of the CI/GitHub `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` secret or variable entries. Those CI credentials are outside Worker version management and must not be removed by the Worker cleanup workflow.

## Evidence boundary

Local tests prove generated bindings, TypeScript, deterministic D1/Worker behavior, the signed smoke contract, and dry-run configuration. They do not prove OAuth registration, OAuth callback handling by GitHub, remote migration state, secret writes, custom-domain routing, deployed worker settings, Durable Object recovery, Workers AI availability, or production smoke behavior. Record the operator, date, deployed Worker version, redacted request IDs, and the results of each authorized check in release evidence.
