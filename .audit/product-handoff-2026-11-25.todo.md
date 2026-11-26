# Product handoff review 2026-11-25

- [x] 1. When the change is one or two files with an obvious approach, skip the plan. Say so and stop.
  - Scope is a multi-workstream handoff; no code implementation.
- [x] 2. Settle open questions by prototype before you write, per `playbooks/prototype.md`. Ask the operator only about a product or preference call that no run can settle.
  - Source trace and 6-file regression are the review evidence. skip: no prototype for the optional N02 product decision or controlled browser tests; both explicitly gated.
- [x] 3. Write the plan file. Open with what changes, the PR ids in landing order, and the dependency graph, which says which PRs are independent and branch from trunk, which wait for which, and the files each may touch. Then one section per PR. One PR is one change with its own evidence (the **sequence-verifiable-units** principle skill). Each section has checkboxes for what it depends on, the files it edits, the one change it builds, the result you see, and its verification.
  - Canonical handoff dated 2026-11-25; no PR created.
- [ ] 4. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Each live box drives the real surface through the driver skill, in its own worktree, with a concrete scenario and a pass predicate. The perf box names the metric, the probe, the trunk baseline measured first, and the number that fails. A PR that changes an interaction waits for the operator's review before merge.
  - Future execution only. BLOCKED: independent implementation review (no implementation exists). Comment-only agent checked the Worker test title and comments; not an implementation approval.
- [x] 5. Hand back the plan path and stop. Execution starts on the operator's explicit go.
  - Return the canonical handoff and open gates. skip: no release, commit, or deploy requested in this turn.
