# Deployment and rollback evidence

Use this runbook only with deployment authorization. It changes a remote Worker and may consume Workers AI quota during smoke verification; verify the Cloudflare account plan, usage, and billing safeguards first. The repository cannot guarantee zero billing or enforce account-level budgets.

## Deploy and verify

1. Capture the currently deployable versions before changing production:

   ```bash
   rtk npx wrangler versions list
   ```

2. Verify the candidate locally:

   ```bash
   rtk npm run check
   ```

   This is local evidence only. It does not call remote Workers AI or prove deployed persistence.

3. Deploy the authorized candidate:

   ```bash
   rtk npm run deploy
   ```

4. Run `rtk npm run smoke` with the interactive secret procedure from [smoke-test.md](./smoke-test.md), first against the workers.dev URL and then against the custom domain. Record the version ID, domain, command output without secrets, and request IDs.

## Roll back after smoke failure

If either smoke run fails, stop the rollout and roll back to the version captured in step 1:

Before changing the Worker version, gate the target on compatibility with the currently applied `KnowledgeBase` Durable Object migration and its persisted VFS, index, and journal data. A Worker rollback never reverses Durable Object migrations or stored data. Preserve and inspect that data as needed; never try to undo the migration, delete Durable Object storage, or reset the object as part of this rollback. If the earlier Worker cannot safely read the current schema, stop and use a compatible forward fix instead.

```bash
rtk npx wrangler rollback <VERSION_ID>
```

After rollback, re-run both unauthenticated and authorized `GET /api/health` checks using the smoke procedure. Confirm the unauthorized check returns `401` and the authorized check returns `{ "ok": true }`, then record the rollback version ID and request IDs. Do not claim restored persistence or Provider health from these health checks alone; schedule a separately authorized persistence verification after a later Worker/Durable Object activation.
