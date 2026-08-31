# Task 1 Report — Shared Dismissible Menu Contract

## Status

DONE

## Commit

Pending at report creation; the implementation and this report are committed together as the Task 1 change.

## Files

- `frontend/components/ui/dropdown-menu.tsx`
  - Replaced the details/summary implementation with a button trigger and context-owned controlled/uncontrolled state.
  - Added conditional content rendering, outside-pointer and completed-focus-leave dismissal, Escape focus restoration, keyboard opening focus, item keyboard traversal, and enabled-item selection dismissal.
- `test/unit/frontend-menu-keyboard.test.tsx`
  - Added Happy DOM behavior coverage for controlled opening, outside pointers, Escape/focus return, focus-leave dismissal, keyboard initial focus, enabled traversal, enabled selection, and disabled items.
- `test/unit/frontend-a11y.test.tsx`
  - Added static accessibility coverage for trigger/menu visibility and WAI-ARIA semantics.
- `test/unit/workspace-shell.test.tsx`
  - Updated the one obsolete assertion from the removed `SUMMARY` trigger tag to the required `BUTTON` tag; no account-menu behavior changed.

`frontend/lib/menu-keyboard.ts` was reviewed and retained: its existing Escape, Home, End, ArrowDown, and ArrowUp mapping is the precise semantics consumed by the primitive.

## RED Evidence

1. `rtk proxy npm run test:unit -- test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx`
   - Expected result: failures caused by the former always-rendered details content and lack of controlled state/outside dismissal.
   - Observed: 4 new menu tests failed: semantic visibility, controlled outside-pointer dismissal, Escape/keyboard behavior, and enabled-selection dismissal.

2. `rtk proxy npx vitest run test/unit/frontend-menu-keyboard.test.tsx -t 'focuses the first enabled item when a trigger opens from the keyboard' --silent`
   - Expected result: keyboard opening should fail while the primitive has no keyboard-open state.
   - Observed: failed with `AssertionError: expected null not to be null` for `[role="menu"]`.

The first sandboxed unit invocation was blocked before assertions by test-runner loopback/log permissions; the same commands were rerun through the approved local test environment to obtain the behavioral RED evidence.

## GREEN Evidence

- `rtk proxy npx vitest run test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-a11y.test.tsx test/unit/workspace-shell.test.tsx --silent`
  - 3 files passed; 28 tests passed.
- `rtk npm run typecheck`
  - Passed (`tsc --noEmit`).
- `rtk npm run test:i18n`
  - Passed: 13 tests.
- `rtk git diff --check`
  - Passed with no output.

## Self-review

- `DropdownMenu` accepts controlled `open`/`onOpenChange` and isolated-consumer `defaultOpen`; the trigger always renders and content returns `null` while closed.
- Context owns trigger/content refs. Escape restores the trigger focus, and detached refs are optional-chained.
- The document `pointerdown` listener exists only while open and ignores both trigger/content descendants; cleanup occurs on close and unmount.
- Focus leaving both trigger and content closes after the interaction completes. Keyboard opening focuses the first enabled item; Arrow/Home/End traversal excludes disabled items.
- An enabled item executes its supplied handler before closing. A disabled item prevents invocation and preserves open state.
- The trigger and content force `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, and `role="menuitem"` semantics after consumer props, preventing accidental contract overrides.
- Scope remains limited to the shared primitive and tests; no account-menu, top-bar quick-link, notification, or message implementation was added.

## Concerns

- Focused Worker-pool test runs emit pre-existing Wrangler warnings that AI bindings may access remote resources. They do not fail the run; all 28 selected tests passed.
