# GitHub OAuth deployment rollback

Use this runbook only with deployment authorization. Capture the current Worker versions before deploying, and keep the custom-domain release evidence separate from local test results.

## Authorized deploy and acceptance

1. Confirm the OAuth App uses the fixed homepage and callback in [github-oauth-setup.md](./github-oauth-setup.md), migration `0002` is applied, and all seven Worker settings are present without exposing their values.
2. Capture the current versions:

   ```bash
   rtk npx wrangler versions list
   ```

3. Run local verification before a remote change:

   ```bash
   rtk npm run check
   ```

4. Deploy the authorized candidate:

   ```bash
   rtk npm run deploy
   ```

5. Verify the custom-domain browser flow: anonymous login, bootstrap admin, separate contributor, disabled contributor rejection, and logout. Then use the signed procedure in [smoke-test.md](./smoke-test.md). Record the version ID, redacted output, domain, and request IDs. Confirm production and preview workers.dev URLs remain disabled; do not smoke them.

## Rollback safety

If browser or signed automation validation fails, stop the rollout. Before changing a Worker version, confirm the target can read the currently applied D1 schema and the persisted `KnowledgeBase` Durable Object migration `v1`, VFS, index, and journal data.

Never reverse D1 migration `0002`, delete D1 rows, delete Durable Object storage, reset the object, or remove Durable Object data. A Worker rollback does not undo either D1 migration or Durable Object state. If the prior Worker is not schema-compatible, do not roll it back: make a forward-compatible fix instead.

In particular, after a member has been linked to a `github:<id>` subject, the old Access-based Worker cannot authenticate that subject. Use a forward-compatible emergency Worker that reads the current D1 schema and preserves linked identities; do not select the old Access build as a recovery target.

```bash
rtk npx wrangler rollback <VERSION_ID>
```

After an authorized rollback, repeat the GitHub browser checks and the signed smoke procedure, then record the rollback version ID and redacted request IDs. These checks do not prove restored remote D1 contents, Durable Object persistence, or Workers AI health; schedule those separately with authorization.
