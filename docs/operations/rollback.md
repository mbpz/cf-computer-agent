# Deployment and rollback evidence

Use this runbook only with deployment authorization. It changes a remote Worker and can consume Workers AI quota during smoke verification. Confirm the Cloudflare plan, usage, billing safeguards, and that the Access application is already protecting the custom domain. The repository cannot enforce account budgets or zero billing.

## Deploy and verify

1. Confirm the [Access-first prerequisites](./access-setup.md) are complete: D1 binding points at the intended database, migrations are applied, GitHub IdP works, the custom domain has both email Allow and separate Service Auth policies, and the Access audience/secrets are set.
2. Capture the current Worker versions:

   ```bash
   rtk npx wrangler versions list
   ```

3. Run local verification:

   ```bash
   rtk npm run check
   ```

   This is local evidence only. It does not call Access, GitHub, remote D1, Workers AI, or prove deployed persistence.

4. Deploy the authorized candidate:

   ```bash
   rtk npm run deploy
   ```

5. Verify the custom-domain browser redirect/login and use the service-token procedure in [smoke-test.md](./smoke-test.md). Record the version ID, redacted output, domain, and request IDs. Also confirm production and preview workers.dev URLs remain disabled; do not smoke them.

## Roll back after smoke failure

If browser, automation, or smoke validation fails, stop the rollout and select the version captured in step 2. Before changing the Worker version, confirm that the rollback target can read the currently applied D1 schema and the persisted `KnowledgeBase` Durable Object migration `v1`, VFS, index, and journal data.

Do **not** reverse D1 migrations, delete D1 rows, delete Durable Object storage, reset the object, disable Access, or remove the Access audience/policies as part of a rollback. Worker rollback does not undo D1 migrations or Durable Object data. If the prior Worker is not schema-compatible, stop and make a compatible forward fix instead.

```bash
rtk npx wrangler rollback <VERSION_ID>
```

After rollback, verify Access still redirects unauthenticated custom-domain browser traffic, log in with the bootstrap admin, and rerun the authorized service-token smoke. Record the rollback version ID and request IDs. These checks do not prove restored remote D1 contents, Durable Object persistence, or Workers AI health; schedule those separately with authorization.
