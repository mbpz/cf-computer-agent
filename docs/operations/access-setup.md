# GitHub, Cloudflare Access, and D1 setup

Perform these production changes only with explicit authorization. This is the required order: protect the custom domain with Access before deploying the Phase 1 Worker, so the deployment does not create an unprotected exposure window. Do not use the workers.dev or preview URLs: the checked-in Worker configuration sets both to disabled.

Replace angle-bracket placeholders in the dashboard; do not place any real value in this repository, a command argument, or a transcript.

## 1. Prepare the custom domain and GitHub OAuth App

1. Ensure `memory.crgmhrc.asia` is a proxied hostname in the intended Cloudflare zone.
2. In GitHub, create an OAuth App for this Access connection. Set:
   - Application name: `Memory Garden Access`.
   - Homepage URL: `https://memory.crgmhrc.asia`.
   - Authorization callback URL: `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/callback`.
3. Save the GitHub Client ID and generate the client secret only in the approved secret store. The callback is the Zero Trust team callback, not the Worker/custom-domain URL.

## 2. Configure and test the GitHub IdP

1. In Cloudflare Zero Trust, go to **Integrations > Identity providers > Add new identity provider** and select **GitHub**.
2. Enter the GitHub OAuth App client ID and client secret, save, then use the dashboard’s **Test** action. Complete a GitHub login with an intended allowlisted account before continuing.
3. Record only the successful test date and operator in release evidence—not GitHub tokens, OAuth code values, client secrets, or cookies.

## 3. Create the self-hosted Access application and policies

1. In Zero Trust, go to **Access controls > Applications > Add an application > Self-hosted**. Add the public hostname `memory.crgmhrc.asia`; select the GitHub IdP; set the intended session duration; save the application.
2. Add an **Allow** policy for the explicit intended email addresses. Keep the list deliberately small; this policy is for interactive browser members only.
3. Create a Service Token for smoke automation and store its client ID and client secret in the approved secret manager.
4. Add a second, separate **Service Auth** policy to the same application: Include the exact Service Token created in step 3. Do not put the Service Token in the email Allow policy and do not use an Allow policy as a substitute for Service Auth. Access supplies a signed application token to the origin after successful service authentication; the Worker validates its signature, issuer, audience, expiry, and documented service-token claim shape rather than trusting incoming Service Token headers. See Cloudflare’s [Application token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).
5. Copy the application **Audience (AUD) tag**. This exact tag is required by the Worker’s `ACCESS_AUD` secret. Test in a private browser: an allowlisted user can authenticate through GitHub; an unallowlisted user is denied; an unauthenticated visit redirects to Access.

## 4. Provision D1 and configure Worker secrets

The D1 database ID already present in `wrangler.jsonc` is a non-secret binding identifier for the already-created target database. Do not create another database. With separate explicit authorization, apply the append-only migrations with `rtk npm run db:migrate:remote`, then verify the resulting schema and seed rows using the approved operational procedure. Never run that remote command as part of local checks.

Set these Worker secrets interactively through Wrangler only after the Access application and audience tag exist:

```bash
rtk npx wrangler secret put ACCESS_TEAM_DOMAIN
rtk npx wrangler secret put ACCESS_AUD
rtk npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL
rtk npx wrangler secret put APP_TOKEN
```

Use the full Access team host without `https://` for `ACCESS_TEAM_DOMAIN` (for example, `your-team.cloudflareaccess.com`), the copied audience tag for `ACCESS_AUD`, and the one intended bootstrap administrator email for `BOOTSTRAP_ADMIN_EMAIL`. Retain the existing APP token as an approved secret; it remains a second, Worker-side automation check. Do not put any of these values in `wrangler.jsonc`, generated type files, `.dev.vars`, shell history, source code, tests, logs, or audit metadata.

## 5. Deploy, verify, and preserve rollback safety

1. Confirm local `rtk npm run check` passes.
2. Deploy only after explicit authorization. The custom domain should already be Access-protected.
3. Have the bootstrap email log in first; it must become the sole active admin. Have another allowlisted email log in; it must become an active contributor. Disable that contributor through the admin flow and verify the application rejects subsequent use despite Access still permitting the email.
4. Use the Service Token client ID/secret plus APP token only through [smoke-test.md](./smoke-test.md). Confirm the smoke uses no admin API.
5. In the Workers dashboard, verify both the production workers.dev URL and the preview URL are disabled. The repository config and local test only prove intent; record the dashboard check as remote evidence.
6. If rollback is needed, follow [rollback.md](./rollback.md). Preserve Access, D1, and Durable Object state; migrations are append-only and Worker rollback must be schema-compatible.

## Evidence boundary

Until the preceding authorized actions are performed and recorded, the repository proves only local code, configuration intent, and contract tests. It does not prove remote D1 migrations, GitHub IdP login, Access policy behavior, Service Token authentication, workers.dev disablement in the deployed account, custom-domain routing, Durable Object recovery, or Workers AI behavior.
