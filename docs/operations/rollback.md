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

4. Upload the exact locally reviewed code, configuration, and assets as a non-deployed emergency version. Strict mode stops if the remote Worker changed after the review baseline:

   ```bash
   rtk npx wrangler versions upload --strict --message "Forward-compatible emergency rollback"
   ```

5. Record the exact returned ID as `<EMERGENCY_VERSION_ID>` and inspect that version before requesting separate deployment authorization:

   ```bash
   rtk npx wrangler versions view <EMERGENCY_VERSION_ID>
   ```

6. With separate authorization, deploy only that inspected version ID:

   ```bash
   rtk npx wrangler versions deploy <EMERGENCY_VERSION_ID>@100% --yes
   ```

7. Verify the custom-domain browser flow: anonymous login, bootstrap admin, separate contributor, disabled contributor rejection, and logout. Then use the signed procedure in [smoke-test.md](./smoke-test.md). Record the version ID, redacted output, domain, and request IDs. Confirm production and preview workers.dev URLs remain disabled; do not smoke them.

## Rollback safety

If browser or signed automation validation fails, stop the rollout. Before changing a Worker version, confirm the target can read the currently applied D1 schema and the persisted `KnowledgeBase` Durable Object migration `v1`, VFS, index, and journal data.

Never reverse D1 migration `0002`, delete D1 rows, delete Durable Object storage, reset the object, or remove Durable Object data. A Worker rollback does not undo either D1 migration or Durable Object state. If the prior Worker is not schema-compatible, do not roll it back: make a forward-compatible fix instead.

Every persisted `github:<id>` subject makes the old Access-based Worker unsafe: this includes subjects on newly created GitHub members as well as subjects written by an identity link. The old Worker cannot authenticate either category. Use the reviewed forward-compatible emergency upload above, which reads the current D1 schema and preserves all GitHub identities; do not select or directly redeploy the old Access build as a recovery target.

After an authorized emergency deployment, repeat the GitHub browser checks and the signed smoke procedure, then record the emergency version ID and redacted request IDs. These checks do not prove restored remote D1 contents, Durable Object persistence, or Workers AI health; schedule those separately with authorization.
