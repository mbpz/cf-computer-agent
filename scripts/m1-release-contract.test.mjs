import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const verifierPath = new URL("./verify-m1-migrations.mjs", import.meta.url).pathname;
const docsVerifierPath = new URL("./verify-m1-docs.mjs", import.meta.url).pathname;
const runbookPath = new URL("../docs/operations/m1-release.md", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);
const checklistPath = new URL("../docs/product/ai-knowledge-base-checklist.md", import.meta.url);
const reportPath = new URL("../.superpowers/sdd/2026-08-21-m1-single-source-knowledge-loop/task-11-report.md", import.meta.url);
const expectedMigrations = [
  ["0001_phase1_control_plane.sql", "3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929"],
  ["0002_github_auth.sql", "b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1"],
  ["0003_m1_knowledge_loop.sql", "cfbccb43485043ad2d125f0e6b8238b1e311c18abe12ddeb6bcc8b79e4bb74a3"],
  ["0004_m1_gate_completion.sql", "7a45d9a22dd33fd3cb3c5153f3f60ffc5c3efe5748bb1cea54940843f22c2890"],
];
const requiredEvidenceBlocks = [
  ["migration-hash-verification", "rtk npm run verify:m1:migrations -- --files"],
  ["pre-ledger-capture", 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"'],
  ["pre-ledger-verification", 'rtk npm run verify:m1:migrations -- --ledger-before "$M1_LEDGER_FILE"'],
  ["legacy-pending-capture", 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT count(*) AS legacy_review_pending_without_source_versions FROM submissions WHERE status = \'review_pending\'" --json > "$M1_PENDING_FILE"'],
  ["legacy-pending-verification", 'rtk npm run verify:m1:migrations -- --legacy-pending "$M1_PENDING_FILE"'],
  ["migration-apply", "rtk npm run db:migrate:remote"],
  ["post-ledger-capture", 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"'],
  ["post-ledger-verification", 'rtk npm run verify:m1:migrations -- --ledger-after "$M1_LEDGER_FILE"'],
  ["version-upload", 'rtk npx wrangler versions upload --secrets-file "$M1_SECRETS_FILE" --strict --message "M1 trusted knowledge release candidate"'],
  ["version-id-precondition", 'test -n "${M1_VERSION_ID:-}"'],
  ["version-inspect", 'rtk npx wrangler versions view "${M1_VERSION_ID}"'],
  ["version-deploy", 'rtk npx wrangler versions deploy "${M1_VERSION_ID}@100%" --yes'],
  ["invalid-signature-probe", "rtk npm run probe:automation:invalid"],
  ["admin-forbidden-probe", "rtk npm run probe:automation:admin-forbidden"],
];
const forbiddenRunbookCommands = [
  "rtk npx wrangler d1 migrations list memory-garden-control-plane --remote",
  "rtk npx wrangler secret put AUTOMATION_SECRET",
  "rtk npx wrangler versions secret bulk secrets.json",
  "rtk npx wrangler deploy",
  "rtk npm run deploy",
  "rtk npx wrangler rollback",
  "rtk npx wrangler d1 time-travel restore memory-garden-control-plane --timestamp 2026-08-21T00:00:00Z",
  'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "DELETE FROM submissions"',
];

function evidenceBlock(id, command) {
  return `M1 evidence command: \`${id}\`\n\`\`\`bash\n${command}\n\`\`\``;
}

function runVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath, ...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

function runDocsVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [docsVerifierPath, ...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

function ledger(names) {
  return [{
    results: names.map((name, index) => ({
      id: index + 1,
      name,
      applied_at: `2026-08-${String(19 + index).padStart(2, "0")}T00:00:00.000Z`,
    })),
    success: true,
    meta: { rows_read: names.length, rows_written: 0 },
  }];
}

async function withLedger(value, callback) {
  const directory = await mkdtemp(join(tmpdir(), "m1-ledger-contract-"));
  const path = join(directory, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withTextFile(prefix, value, callback) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const path = join(directory, "fixture.md");
  try {
    await writeFile(path, value, { mode: 0o600 });
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runSecretCleanupContract(runbook, forceFailure) {
  const cleanupFunction = runbook.match(/^cleanup_m1_secret_bundle\(\) \{[\s\S]*?^\}/mu)?.[0];
  const postUpload = runbook.match(/```bash\n(M1_UPLOAD_STATUS=\$\?[\s\S]*?)\n```/u)?.[1];
  assert.ok(cleanupFunction, "cleanup function missing");
  assert.ok(postUpload, "post-upload cleanup block missing");
  const directory = await mkdtemp(join(tmpdir(), "m1-secret-cleanup-contract-"));
  const secretFile = join(directory, "worker-secrets.json");
  const attemptsFile = join(tmpdir(), `m1-secret-cleanup-attempts-${process.pid}-${Date.now()}`);
  await writeFile(secretFile, "protected", { mode: 0o600 });
  const script = `
rtk() {
  printf '%s\\n' "$1" >> "$M1_ATTEMPTS_FILE"
  if [ "$M1_FORCE_CLEANUP_FAILURE" = "1" ] && { [ "$1" = "rm" ] || [ "$1" = "rmdir" ]; }; then
    return 70
  fi
  command "$@"
}
${cleanupFunction}
trap cleanup_m1_secret_bundle EXIT HUP INT TERM
true
${postUpload}
`;
  try {
    const result = spawnSync("bash", [], {
      env: {
        ...process.env,
        M1_SECRETS_DIR: directory,
        M1_SECRETS_FILE: secretFile,
        M1_ATTEMPTS_FILE: attemptsFile,
        M1_FORCE_CLEANUP_FAILURE: forceFailure ? "1" : "0",
      },
      input: script,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const attempts = await readFile(attemptsFile, "utf8").catch(() => "");
    const fileRemains = await access(secretFile).then(() => true, () => false);
    const directoryRemains = await access(directory).then(() => true, () => false);
    return { result, attempts, fileRemains, directoryRemains };
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(attemptsFile, { force: true });
  }
}

test("pins the reviewed bytes of all four forward migrations", async () => {
  for (const [name, expectedHash] of expectedMigrations) {
    const bytes = await readFile(new URL(`../migrations/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, name);
  }
  const result = await runVerifier(["--files"]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^\[pass\] migration-files count=4$/mu);
});

test("fails closed when an unexpected local migration file is present", async () => {
  const extraMigration = new URL("../migrations/0005_unreviewed.sql", import.meta.url);
  try {
    await writeFile(extraMigration, "SELECT 1;\n", { mode: 0o600 });
    const result = await runVerifier(["--files"]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /^\[fail\] migration-files$/mu);
  } finally {
    await rm(extraMigration, { force: true });
  }
});

test("accepts only the exact pre-0004 and post-0004 Wrangler ledger states", async () => {
  const names = expectedMigrations.map(([name]) => name);
  await withLedger(ledger(names.slice(0, 3)), async (path) => {
    const result = await runVerifier(["--ledger-before", path]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^\[pass\] migration-ledger phase=before names=0001_phase1_control_plane.sql,0002_github_auth.sql,0003_m1_knowledge_loop.sql$/mu);
  });
  await withLedger(ledger(names), async (path) => {
    const result = await runVerifier(["--ledger-after", path]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^\[pass\] migration-ledger phase=after names=0001_phase1_control_plane.sql,0002_github_auth.sql,0003_m1_knowledge_loop.sql,0004_m1_gate_completion.sql$/mu);
  });
});

test("accepts only a zero legacy review_pending preflight result", async () => {
  await withLedger([{
    results: [{ legacy_review_pending_without_source_versions: 0 }],
    success: true,
    meta: { rows_read: 1, rows_written: 0 },
  }], async (path) => {
    const result = await runVerifier(["--legacy-pending", path]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^\[pass\] legacy-pending count=0$/mu);
  });

  for (const value of [
    [{ results: [{ legacy_review_pending_without_source_versions: 1 }], success: true }],
    [{ results: [{ legacy_review_pending_without_source_versions: "0" }], success: true }],
    [{ results: [{ legacy_review_pending_without_source_versions: 0, id: "leak" }], success: true }],
    [{ results: [], success: true }],
  ]) {
    await withLedger(value, async (path) => {
      const result = await runVerifier(["--legacy-pending", path]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /^\[fail\] legacy-pending$/mu);
      assert.doesNotMatch(result.output, /legacy_review_pending_without_source_versions|leak/u);
    });
  }
});

test("fails closed on missing, renamed, extra, reordered, or malformed ledger rows", async () => {
  const names = expectedMigrations.map(([name]) => name);
  const invalidLedgers = [
    ledger(names.slice(0, 1)),
    ledger([names[0], "0002_changed.sql"]),
    ledger([...names, "0004_unreviewed.sql"]),
    ledger([names[1], names[0]]),
    [{ results: [{ id: 1, name: names[0] }], success: true }],
    [{ results: ledger(names).at(0).results, success: false }],
    { results: [] },
  ];
  for (const value of invalidLedgers) {
    await withLedger(value, async (path) => {
      const before = await runVerifier(["--ledger-before", path]);
      const after = await runVerifier(["--ledger-after", path]);
      assert.equal(before.code, 1, before.output);
      assert.equal(after.code, 1, after.output);
      assert.match(`${before.output}\n${after.output}`, /\[fail\] migration-ledger/u);
      assert.doesNotMatch(`${before.output}\n${after.output}`, /applied_at|rows_read|rows_written/u);
    });
  }
  await withLedger(ledger(names), async (path) => {
    const before = await runVerifier(["--ledger-before", path]);
    const after = await runVerifier(["--ledger-after", path]);
    assert.equal(before.code, 1, before.output);
    assert.equal(after.code, 0, after.output);
    assert.match(before.output, /^\[fail\] migration-ledger$/mu);
  });
});

test("runbook executable contract proves provenance, ledger, and probe commands", async () => {
  const [runbook, packageJson, wrangler] = await Promise.all([
    readFile(runbookPath, "utf8"),
    readFile(packagePath, "utf8").then(JSON.parse),
    readFile(wranglerPath, "utf8").then(JSON.parse),
  ]);
  const verified = await runDocsVerifier(["--runbook", runbookPath.pathname]);
  assert.equal(verified.code, 0, verified.output);
  assert.match(verified.output, /^\[pass\] m1-runbook evidence_blocks=14$/mu);
  assert.equal(wrangler.d1_databases[0].database_name, "memory-garden-control-plane");
  assert.equal(wrangler.d1_databases[0].migrations_dir, "migrations");
  assert.equal(wrangler.d1_databases[0].migrations_table, undefined);
  assert.equal(packageJson.scripts["verify:m1:migrations"], "node scripts/verify-m1-migrations.mjs");
  assert.equal(packageJson.scripts["verify:m1:docs"], "node scripts/verify-m1-docs.mjs --all");
  assert.equal(packageJson.scripts["probe:automation:invalid"], "node scripts/automation-probe.mjs --invalid-health");
  assert.equal(packageJson.scripts["probe:automation:admin-forbidden"], "node scripts/automation-probe.mjs --admin-forbidden");
  assert.match(packageJson.scripts["test:m1"], /npm run test:ops:m1/u);
  assert.match(packageJson.scripts["test:smoke"], /automation-probe\.test\.mjs/u);
  assert.ok(runbook.includes("Reviewed SHA-256"));
});

test("secret cleanup failure fails the release stage and leaves the EXIT trap armed", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const clean = await runSecretCleanupContract(runbook, false);
  assert.equal(clean.result.status, 0, clean.result.stderr);
  assert.equal(clean.fileRemains, false);
  assert.equal(clean.directoryRemains, false);

  const failed = await runSecretCleanupContract(runbook, true);
  assert.notEqual(failed.result.status, 0, failed.result.stderr);
  assert.equal(failed.fileRemains, true);
  assert.equal(failed.directoryRemains, true);
  assert.ok(failed.attempts.trim().split("\n").length >= 4, "EXIT trap did not retry protected cleanup");

  const mutated = runbook.replace(
    'test "$M1_CLEANUP_STATUS" -eq 0 || exit "$M1_CLEANUP_STATUS"',
    "true # mutation: ignore cleanup failure",
  );
  assert.notEqual(mutated, runbook, "cleanup failure assertion missing");
  const mutation = await runSecretCleanupContract(mutated, true);
  assert.equal(mutation.result.status, 0, mutation.result.stderr);
});

test("runbook contract does not accept required commands moved into HTML or shell comments", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  for (const [, command] of requiredEvidenceBlocks) {
    assert.ok(runbook.includes(command), `fixture missing required command: ${command}`);
    for (const commented of [`# ${command}`, `<!-- ${command} -->`]) {
      const mutated = runbook.replaceAll(command, commented);
      assert.notEqual(mutated, runbook);
      await withTextFile("m1-runbook-comment-", mutated, async (path) => {
        const result = await runDocsVerifier(["--runbook", path]);
        assert.equal(result.code, 1, `${commented}\n${result.output}`);
        assert.match(result.output, /^\[fail\] m1-runbook$/mu);
      });
    }
  }
});

test("runbook contract rejects executable forbidden commands but ignores illustrations", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  for (const command of forbiddenRunbookCommands) {
    await withTextFile("m1-runbook-forbidden-", `${runbook}\n\`\`\`bash\n${command}\n\`\`\`\n`, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, `${command}\n${result.output}`);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }

  const illustrative = `${runbook}\nIllustration only: ${forbiddenRunbookCommands.join("; ")}\n\`\`\`bash\n${forbiddenRunbookCommands.map((command) => `# ${command}`).join("\n")}\n\`\`\`\n\`\`\`sh\n${forbiddenRunbookCommands.join("\n")}\n\`\`\`\n`;
  await withTextFile("m1-runbook-illustrative-", illustrative, async (path) => {
    const result = await runDocsVerifier(["--runbook", path]);
    assert.equal(result.code, 0, result.output);
  });
});

test("runbook contract scans the first info-string word with ASCII-insensitive shell names", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const forbidden = "rtk npx wrangler deploy";
  const openings = [
    "```bash title=release",
    "```zsh linenums",
    "```BASH",
    "```ZsH title=release",
    "```   bash title=release",
    "~~~\tzSh\tlinenums",
  ];
  for (const opening of openings) {
    const marker = opening[0];
    const length = opening.match(/^[`~]+/u)?.[0].length ?? 3;
    const closing = marker.repeat(length);
    const fixture = `${runbook}\n${opening}\n${forbidden}\n${closing}\n`;
    await withTextFile("m1-runbook-info-string-", fixture, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, `${opening}\n${result.output}`);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("mandatory evidence fences retain bare lowercase shell info strings", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const probe = "rtk npm run probe:automation:invalid";
  const block = evidenceBlock("invalid-signature-probe", probe);
  const openings = ["```bash title=release", "```BASH", "```   bash"];
  assert.ok(runbook.includes(block));
  for (const opening of openings) {
    const mutation = runbook.replace(block, block.replace("```bash", opening));
    await withTextFile("m1-runbook-mandatory-info-", mutation, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, `${opening}\n${result.output}`);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("runbook contract rejects all CommonMark raw HTML block types", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const block = evidenceBlock("invalid-signature-probe", "rtk npm run probe:automation:invalid");
  const contexts = [
    ["script", `<script>\n${block}\n</script>`],
    ["pre", `<pre>\n${block}\n</pre>`],
    ["style", `<style>\n${block}\n</style>`],
    ["textarea", `<textarea>\n${block}\n</textarea>`],
    ["comment", `<!--\n${block}\n-->`],
    ["processing", `<?release\n${block}\n?>`],
    ["declaration", `<!RELEASE\n${block}\n>`],
    ["cdata", `<![CDATA[\n${block}\n]]>`],
    ["block-tag", `<details>\n${block}\n</details>`],
    ["representative-block-tag", `<div class="release">\n${block}\n</div>`],
    ["complete-tag", `<release-proof>\n${block}\n</release-proof>`],
  ];
  assert.ok(runbook.includes(block));
  for (const [label, wrapped] of contexts) {
    const mutation = runbook.replace(block, wrapped);
    await withTextFile("m1-runbook-raw-html-type-", mutation, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, `${label}\n${result.output}`);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("every required block fails when nested in disallowed raw HTML", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const wrappers = [
    (block) => `<script>\n${block}\n</script>`,
    (block) => `<details>\n${block}\n</details>`,
    (block) => `<!--\n${block}\n-->`,
    (block) => `<div>\n${block}\n</div>`,
    (block) => `<release-proof>\n${block}\n</release-proof>`,
  ];
  for (const [id, command] of requiredEvidenceBlocks) {
    const block = evidenceBlock(id, command);
    assert.ok(runbook.includes(block), id);
    for (const wrap of wrappers) {
      const mutation = runbook.replace(block, wrap(block));
      await withTextFile("m1-runbook-required-raw-html-", mutation, async (path) => {
        const result = await runDocsVerifier(["--runbook", path]);
        assert.equal(result.code, 1, `${id}\n${result.output}`);
        assert.match(result.output, /^\[fail\] m1-runbook$/mu);
      });
    }
  }
});

test("angle prose and shell comparisons do not become raw HTML", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const benign = `${runbook}\nA prose comparison keeps 3 < 5 and 8 > 2; the literal \`<M1_VERSION_ID>\` is not a tag.\n\n\`\`\`bash\nif [[ "alpha" < "beta" && "omega" > "beta" ]]; then\n  printf '%s\\n' '<details>'\nfi\n\`\`\`\n`;
  await withTextFile("m1-runbook-angle-prose-", benign, async (path) => {
    const result = await runDocsVerifier(["--runbook", path]);
    assert.equal(result.code, 0, result.output);
  });
});

test("runbook contract removes shell continuations at every forbidden token boundary", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  for (const command of forbiddenRunbookCommands) {
    for (const token of command.matchAll(/\S+/gu)) {
      for (let offset = 1; offset < token[0].length; offset += 1) {
        const boundary = token.index + offset;
        const split = `${command.slice(0, boundary)}\\\n${command.slice(boundary)}`;
        await withTextFile("m1-runbook-token-split-", `${runbook}\n\`\`\`bash\n${split}\n\`\`\`\n`, async (path) => {
          const result = await runDocsVerifier(["--runbook", path]);
          assert.equal(result.code, 1, `${split}\n${result.output}`);
          assert.match(result.output, /^\[fail\] m1-runbook$/mu);
        });
      }
    }
  }
});

test("runbook contract recognizes indented backtick and tilde executable fences", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const forbidden = "rtk npx wrangler deploy";
  const fixtures = [
    `${runbook}\n   \`\`\`bash\n${forbidden}\n   \`\`\`\n`,
    `${runbook}\n  ~~~~zsh\n${forbidden}\n  ~~~~\n`,
  ];
  for (const fixture of fixtures) {
    await withTextFile("m1-runbook-indented-fence-", fixture, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("runbook contract rejects required commands hidden in shell constructs", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const probe = "rtk npm run probe:automation:invalid";
  const mutations = [
    runbook.replace(probe, ["printf '%s\\n' \\", `  ${probe}`].join("\n")),
    runbook.replace(probe, `rtk cat <<'M1_PROBE'\n${probe}\nM1_PROBE`),
  ];
  for (const mutated of mutations) {
    assert.notEqual(mutated, runbook);
    await withTextFile("m1-runbook-shell-construct-", mutated, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("runbook contract requires a top-level fence containing only the exact command", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const probe = "rtk npm run probe:automation:invalid";
  const block = evidenceBlock("invalid-signature-probe", probe);
  const replacements = [
    evidenceBlock("invalid-signature-probe", `if false; then\n  ${probe}\nfi`),
    evidenceBlock("invalid-signature-probe", `run_probe() {\n  ${probe}\n}`),
    evidenceBlock("invalid-signature-probe", `result="$(\n  ${probe}\n)"`),
    evidenceBlock("invalid-signature-probe", `{ ${probe}; }`),
    evidenceBlock("invalid-signature-probe", `true && ${probe}`),
    ["  ````text", block, "  ````"].join("\n"),
  ];
  assert.ok(runbook.includes(block));
  for (const replacement of replacements) {
    const mutation = runbook.replace(block, replacement);
    assert.notEqual(mutation, runbook);
    await withTextFile("m1-runbook-exact-fence-", mutation, async (path) => {
      const result = await runDocsVerifier(["--runbook", path]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /^\[fail\] m1-runbook$/mu);
    });
  }
});

test("every required command is placeholder-free syntax in bash and zsh", () => {
  const environment = {
    ...process.env,
    M1_LEDGER_FILE: "/tmp/m1-ledger.json",
    M1_SECRETS_FILE: "/tmp/m1-secrets.json",
    M1_VERSION_ID: "00000000-0000-0000-0000-000000000000",
  };
  for (const [, command] of requiredEvidenceBlocks) {
    assert.doesNotMatch(command, /<M1_[A-Z_]+>/u, command);
    for (const shell of ["bash", "zsh"]) {
      const parsed = spawnSync(shell, ["-n"], {
        env: environment,
        input: `${command}\n`,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.equal(parsed.error, undefined, `${shell}: ${command}`);
      assert.equal(parsed.status, 0, `${shell}: ${command}\n${parsed.stderr}`);
    }
  }
});

test("runbook contract normalizes continuations before rejecting forbidden commands", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const splitDeploy = ["rtk npx wrangler \\", "  deploy"].join("\n");
  const mutation = `${runbook}\n\`\`\`bash\n${splitDeploy}\n\`\`\`\n`;
  await withTextFile("m1-runbook-split-forbidden-", mutation, async (path) => {
    const result = await runDocsVerifier(["--runbook", path]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /^\[fail\] m1-runbook$/mu);
  });
});

test("runbook contract rejects a probe moved before migration verification", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  const probeBlock = evidenceBlock("invalid-signature-probe", "rtk npm run probe:automation:invalid");
  const verifierBlock = evidenceBlock("migration-hash-verification", "rtk npm run verify:m1:migrations -- --files");
  assert.ok(runbook.includes(probeBlock));
  assert.ok(runbook.includes(verifierBlock));
  const withoutProbe = runbook.replace(probeBlock, "");
  const mutation = withoutProbe.replace(verifierBlock, `${probeBlock}\n\n${verifierBlock}`);
  assert.notEqual(mutation, runbook);
  await withTextFile("m1-runbook-order-", mutation, async (path) => {
    const result = await runDocsVerifier(["--runbook", path]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /^\[fail\] m1-runbook$/mu);
  });
});

test("derives exact M1 atom and gate truth and verifies report list cardinality", async () => {
  const baseline = await runDocsVerifier(["--truth", checklistPath.pathname, reportPath.pathname]);
  assert.equal(baseline.code, 0, baseline.output);
  assert.match(baseline.output, /^\[pass\] m1-truth atoms=76 checked=53 unchecked=23 gates=1 unchecked_items=24$/mu);

  const [checklist, report] = await Promise.all([
    readFile(checklistPath, "utf8"),
    readFile(reportPath, "utf8"),
  ]);
  const reportMutations = [
    report.replace("53 checked + 23 unchecked", "53 checked + 24 unchecked"),
    report.replace("- `OPS-015`.", ""),
  ];
  for (const mutatedReport of reportMutations) {
    assert.notEqual(mutatedReport, report);
    await withTextFile("m1-report-truth-", mutatedReport, async (path) => {
      const result = await runDocsVerifier(["--truth", checklistPath.pathname, path]);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /^\[fail\] m1-truth$/mu);
    });
  }

  const mutatedChecklist = checklist.replace("- [ ] `OPS-015` P0/M1", "- [x] `OPS-015` P0/M1");
  assert.notEqual(mutatedChecklist, checklist);
  await withTextFile("m1-checklist-truth-", mutatedChecklist, async (path) => {
    const result = await runDocsVerifier(["--truth", path, reportPath.pathname]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /^\[fail\] m1-truth$/mu);
  });
});
