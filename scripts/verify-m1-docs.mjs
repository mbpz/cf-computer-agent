import { readFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const runbookPath = new URL("docs/operations/m1-release.md", repositoryRoot);
const checklistPath = new URL("docs/product/ai-knowledge-base-checklist.md", repositoryRoot);
const reportPath = new URL(".superpowers/sdd/2026-08-21-m1-single-source-knowledge-loop/task-11-report.md", repositoryRoot);
const requiredEvidenceBlocks = [
  ["migration-hash-verification", "rtk npm run verify:m1:migrations -- --files"],
  ["pre-ledger-capture", 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"'],
  ["pre-ledger-verification", 'rtk npm run verify:m1:migrations -- --ledger-before "$M1_LEDGER_FILE"'],
  ["migration-apply", "rtk npm run db:migrate:remote"],
  ["post-ledger-capture", 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"'],
  ["post-ledger-verification", 'rtk npm run verify:m1:migrations -- --ledger-after "$M1_LEDGER_FILE"'],
  ["version-upload", 'rtk npx wrangler versions upload --secrets-file "$M1_SECRETS_FILE" --strict --message "M1 trusted knowledge release candidate"'],
  ["version-inspect", "rtk npx wrangler versions view <M1_VERSION_ID>"],
  ["version-deploy", "rtk npx wrangler versions deploy <M1_VERSION_ID>@100% --yes"],
  ["invalid-signature-probe", "rtk npm run probe:automation:invalid"],
  ["admin-forbidden-probe", "rtk npm run probe:automation:admin-forbidden"],
];
const forbiddenCommands = [
  /\brtk\s+npx\s+wrangler\s+d1\s+migrations\s+list(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+secret\s+put(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+versions\s+secret\s+bulk(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+deploy(?:\s|$)/iu,
  /\brtk\s+npm\s+run\s+deploy(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+rollback(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+d1\s+time-travel\s+restore(?:\s|$)/iu,
  /\brtk\s+npx\s+wrangler\s+d1\s+execute\b[^\n]*\b(?:DELETE|DROP|TRUNCATE)\b/iu,
];

async function verifyRunbook(path) {
  const markdown = removeHtmlComments(await readFile(path, "utf8"));
  const evidence = exactEvidenceBlocks(markdown);
  if (evidence.length !== requiredEvidenceBlocks.length
    || evidence.some((block, index) => block.id !== requiredEvidenceBlocks[index][0]
      || block.command !== requiredEvidenceBlocks[index][1])) {
    throw new Error("M1 evidence blocks are missing, malformed, duplicated, or out of order");
  }

  for (const body of executableFenceBodies(markdown)) {
    const withoutCommentLines = body.split(/\r?\n/u)
      .filter((line) => !/^\s*#/u.test(line))
      .join("\n");
    const normalized = withoutCommentLines.replace(/\\\r?\n[ \t]*/gu, " ");
    if (forbiddenCommands.some((pattern) => pattern.test(normalized))) {
      throw new Error("Forbidden executable command found");
    }
  }
  console.log(`[pass] m1-runbook evidence_blocks=${evidence.length}`);
}

function exactEvidenceBlocks(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const marker = /^M1 evidence command: `([a-z0-9-]+)`$/u.exec(lines[index]);
    if (!marker) continue;
    if (lines[index + 1] !== "```bash" || lines[index + 3] !== "```") {
      throw new Error("M1 evidence block must be one exact physical bash command line");
    }
    const command = lines[index + 2];
    if (!command || /^\s*#/u.test(command)) {
      throw new Error("M1 evidence block command is missing");
    }
    blocks.push({ id: marker[1], command });
    index += 3;
  }
  return blocks;
}

function executableFenceBodies(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const bodies = [];
  let fence = null;
  for (const line of lines) {
    if (fence === null) {
      const opening = /^(`{3,})[ \t]*(bash|zsh)[ \t]*$/u.exec(line);
      if (opening) fence = { delimiter: opening[1], lines: [] };
      continue;
    }
    if (line === fence.delimiter) {
      bodies.push(fence.lines.join("\n"));
      fence = null;
      continue;
    }
    fence.lines.push(line);
  }
  if (fence !== null) throw new Error("Unclosed executable Markdown fence");
  return bodies;
}

function removeHtmlComments(markdown) {
  let result = "";
  let cursor = 0;
  while (cursor < markdown.length) {
    const start = markdown.indexOf("<!--", cursor);
    if (start < 0) return result + markdown.slice(cursor);
    result += markdown.slice(cursor, start);
    const end = markdown.indexOf("-->", start + 4);
    if (end < 0) throw new Error("Unclosed HTML comment");
    cursor = end + 3;
  }
  return result;
}

async function verifyTruth(checklist, report) {
  const [checklistText, reportText] = await Promise.all([
    readFile(checklist, "utf8"),
    readFile(report, "utf8"),
  ]);
  const atoms = [...checklistText.matchAll(/^- \[([ x])\] `([A-Z]+-\d{3})` P0\/M1(?:\s|$)/gmu)]
    .map((match) => ({ checked: match[1] === "x", id: match[2] }));
  const atomIds = new Set(atoms.map(({ id }) => id));
  const checked = atoms.filter((atom) => atom.checked);
  const unchecked = atoms.filter((atom) => !atom.checked);
  const gates = [...checklistText.matchAll(/^- \[([ x])\] `GATE-M1`(?:\s|$)/gmu)];
  if (atoms.length !== 76
    || atomIds.size !== atoms.length
    || checked.length !== 53
    || unchecked.length !== 23
    || gates.length !== 1
    || gates[0][1] !== " ") {
    throw new Error("M1 checklist counts do not match the reviewed truth");
  }

  const summary = "Checklist totals: **76 P0/M1 atoms = 53 checked + 23 unchecked**. `GATE-M1` is one additional unchecked gate, so **24 items are unchecked including the gate**.";
  if (!reportText.includes(summary)
    || !reportText.includes("Twenty-three current P0/M1 atoms remain unchecked")) {
    throw new Error("M1 report count wording is stale");
  }
  const sectionStart = reportText.indexOf("## Checklist reconciliation");
  const sectionEnd = sectionStart < 0 ? -1 : reportText.indexOf("\n## ", sectionStart + 3);
  if (sectionStart < 0 || sectionEnd < 0) throw new Error("M1 report checklist section is missing");
  const listedIds = [...reportText.slice(sectionStart, sectionEnd).matchAll(/`([A-Z]+-\d{3})`/gu)]
    .map((match) => match[1]);
  const expectedIds = unchecked.map(({ id }) => id).sort();
  const actualIds = [...listedIds].sort();
  if (new Set(listedIds).size !== listedIds.length
    || actualIds.length !== expectedIds.length
    || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error("M1 report unchecked atom list does not match the checklist");
  }
  console.log(`[pass] m1-truth atoms=${atoms.length} checked=${checked.length} unchecked=${unchecked.length} gates=${gates.length} unchecked_items=${unchecked.length + gates.length}`);
}

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "--runbook" && args.length === 1) {
    await verifyRunbook(args[0]);
  } else if (mode === "--truth" && args.length === 2) {
    await verifyTruth(args[0], args[1]);
  } else if (mode === "--all" && args.length === 0) {
    await verifyRunbook(runbookPath);
    await verifyTruth(checklistPath, reportPath);
  } else {
    throw new Error("Invalid documentation verifier mode");
  }
} catch {
  const label = process.argv[2] === "--truth" ? "m1-truth" : "m1-runbook";
  console.error(`[fail] ${label}`);
  process.exitCode = 1;
}
