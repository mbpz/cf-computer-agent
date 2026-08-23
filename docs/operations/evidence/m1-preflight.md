| Gate | Required evidence | Status |
| --- | --- | --- |
| Local full gate | command, date, commit, counts | pass; `docs/operations/evidence/m1-release-2026-08-23.md` |
| OAuth callback | date, version ID, redacted request ID | PASS; `a2f6d391fdf2ddbf`, deployed `ce88dab4-e452-4225-adf5-abfab7adb704` |
| Signed automation | success and bad-signature request IDs | pass; `docs/operations/evidence/m1-release-2026-08-23.md` |
| Disabled contributor | rejected session request ID | PASS; `a2f620ffd82284b2` (`MEMBER_DISABLED`) |
| DO reactivation | before/after read request IDs | PASS; `a2f6cd84bfbf0713` → `a2f6cfae5e92f325`, same 4-record hash |
| workers.dev | production and preview disabled screenshot/export | PASS; Dashboard switches both `aria-checked=false` |
