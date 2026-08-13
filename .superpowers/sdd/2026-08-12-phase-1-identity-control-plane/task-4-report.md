# Task 4 Report: Principal resolution and capability policy

## Delivered contract

- `resolvePrincipal(request, env, dependencies)` selects the member flow whenever `Cf-Access-Jwt-Assertion` is present. It verifies the Access assertion, resolves the member lifecycle, and maps only authoritative member fields to a `MemberPrincipal`.
- Without that assertion, the resolver validates `APP_TOKEN` with the retained fixed-length SHA-256 digest comparison and returns the restricted `AutomationPrincipal`.
- Invalid or disabled asserted members propagate their Access/member error and never fall back to automation, even when a correct `APP_TOKEN` is also supplied.
- `capabilitiesFor` and `requireCapability` centralize the contributor/admin/automation matrix. Automation has exactly `legacy:read` and `legacy:write`.
- `verifyAutomationToken` replaces the Phase 0 blanket-helper implementation. Its `authorizeRequest` compatibility alias remains only so the current pre-Task-7 app composition typechecks; Task 7 must replace that blanket call with principal resolution plus route capabilities.

## TDD evidence

1. Added policy and principal tests before the corresponding implementation. The first focused run failed because the policy/principal modules and automation verifier export did not exist.
2. Implemented the minimum resolver, policy, and renamed token verifier.
3. The final focused unit run passed: 10 files, 70 tests. TypeScript typecheck also passed.

## Verification

```text
rtk npm run typecheck
rtk npm run test:unit -- --run test/unit/policy.test.ts test/unit/principal.test.ts test/unit/auth.test.ts
rtk git diff --check
```

The focused Vitest invocation emitted the existing local AI-binding warning but made no remote calls.
