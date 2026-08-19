# GitHub OAuth deployment runbook

This runbook separates local evidence from actions that change GitHub or Cloudflare. Do not create the OAuth App, write a secret, apply a remote migration, deploy, or run a remote smoke test without explicit authorization.

## Fixed production values

Create a GitHub OAuth App with these exact values:

- Application name: `Memory Garden`
- Homepage URL: `https://memory.crgmhrc.asia`
- Authorization callback URL: `https://memory.crgmhrc.asia/auth/github/callback`

The GitHub Client ID and automation client ID are identifiers, not credentials. The GitHub client secret, bootstrap and allowlist email configuration, automation secret, and APP token are sensitive. Do not commit any production value to `wrangler.jsonc`, `config/types.env`, `.dev.vars`, shell arguments, transcripts, logs, browser code, or audit metadata. The checked-in values in `config/types.env` are fake type-generation inputs only.

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

3. Enter every Worker setting interactively; no secret value belongs in the command line. The ID commands are included for a uniform account-configuration workflow even though the identifiers are not confidential.

   ```bash
   rtk npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
   rtk npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
   rtk npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL
   rtk npx wrangler secret put ALLOWED_MEMBER_EMAILS
   rtk npx wrangler secret put AUTOMATION_CLIENT_ID
   rtk npx wrangler secret put AUTOMATION_SECRET
   rtk npx wrangler secret put APP_TOKEN
   ```

4. Deploy only the reviewed candidate:

   ```bash
   rtk npm run deploy
   ```

5. At `https://memory.crgmhrc.asia`, record redacted evidence for each check: anonymous login starts only at `/auth/github`; the bootstrap allowlisted email becomes the sole active admin; a separate allowlisted email is a contributor; a disabled contributor is rejected; and `POST /auth/logout` clears the session.
6. Run the separately authorized signed automation check in [smoke-test.md](./smoke-test.md). It is limited to legacy health, note, search, and chat routes and is never an administrator.
7. Only after every preceding check passes, remove obsolete Cloudflare Access secret values from the deployment account. Access policies and service-token credentials are not part of the GitHub OAuth runtime.

## Evidence boundary

Local tests prove generated bindings, TypeScript, deterministic D1/Worker behavior, the signed smoke contract, and dry-run configuration. They do not prove OAuth registration, OAuth callback handling by GitHub, remote migration state, secret writes, custom-domain routing, deployed worker settings, Durable Object recovery, Workers AI availability, or production smoke behavior. Record the operator, date, deployed Worker version, redacted request IDs, and the results of each authorized check in release evidence.
