import { readFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const runbookPath = new URL("docs/operations/m1-release.md", repositoryRoot);
const checklistPath = new URL("docs/product/ai-knowledge-base-checklist.md", repositoryRoot);
const reportPath = new URL(".superpowers/sdd/2026-08-21-m1-single-source-knowledge-loop/task-11-report.md", repositoryRoot);
const requiredCommands = [
  {
    line: "M1_MIGRATION_0001_SHA256='3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929'",
    count: 1,
  },
  {
    line: "M1_MIGRATION_0002_SHA256='b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1'",
    count: 1,
  },
  {
    line: "M1_MIGRATION_0003_SHA256='17d8ee1f49a0c87d40851a47f70d492617ed0972daeff54becad21a88af57f1d'",
    count: 1,
  },
  { line: "rtk npm run verify:m1:migrations -- --files", count: 2 },
  {
    line: 'rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "$M1_LEDGER_FILE"',
    count: 2,
  },
  { line: 'rtk npm run verify:m1:migrations -- --ledger-before "$M1_LEDGER_FILE"', count: 1 },
  { line: 'rtk npm run verify:m1:migrations -- --ledger-after "$M1_LEDGER_FILE"', count: 1 },
  { line: "rtk npm run probe:automation", count: 1 },
];
const forbiddenCommands = [
  /^rtk npx wrangler d1 migrations list(?:\s|$)/u,
  /^rtk npx wrangler secret put(?:\s|$)/u,
  /^rtk npx wrangler versions secret bulk(?:\s|$)/u,
  /^rtk npx wrangler deploy(?:\s|$)/u,
  /^rtk npm run deploy(?:\s|$)/u,
  /^rtk npx wrangler rollback(?:\s|$)/u,
  /^rtk npx wrangler d1 execute\b.*\b(?:DELETE|DROP|TRUNCATE)\b/iu,
];

async function verifyRunbook(path) {
  const commands = executableCommands(await readFile(path, "utf8"));
  for (const requirement of requiredCommands) {
    if (commands.filter((line) => line === requirement.line).length !== requirement.count) {
      throw new Error("Required executable command is missing or duplicated");
    }
  }
  if (commands.some((line) => forbiddenCommands.some((pattern) => pattern.test(line)))) {
    throw new Error("Forbidden executable command found");
  }

  const hashPositions = requiredCommands.slice(0, 3).map(({ line }) => commands.indexOf(line));
  const firstFileVerifier = commands.indexOf(requiredCommands[3].line);
  const whoami = commands.indexOf("rtk npx wrangler whoami");
  if (hashPositions.some((position) => position < 0 || position >= firstFileVerifier)
    || firstFileVerifier < 0
    || whoami < 0
    || firstFileVerifier >= whoami) {
    throw new Error("Migration provenance is not verified before remote identity inspection");
  }

  const ledgerQuery = requiredCommands[4].line;
  const firstLedgerQuery = commands.indexOf(ledgerQuery);
  const secondLedgerQuery = commands.lastIndexOf(ledgerQuery);
  const beforeVerifier = commands.indexOf(requiredCommands[5].line);
  const afterVerifier = commands.indexOf(requiredCommands[6].line);
  if (!(firstLedgerQuery < beforeVerifier
    && beforeVerifier < secondLedgerQuery
    && secondLedgerQuery < afterVerifier)) {
    throw new Error("Migration ledger queries and verifiers are out of order");
  }
  console.log(`[pass] m1-runbook executable_commands=${commands.length}`);
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

function executableCommands(markdown) {
  const lines = removeHtmlComments(markdown).split(/\r?\n/u);
  const commands = [];
  let fence = null;
  for (const line of lines) {
    if (fence === null) {
      const opening = /^\s*(`{3,}|~{3,})([^`~]*)$/u.exec(line);
      if (!opening) continue;
      const language = opening[2].trim();
      fence = {
        marker: opening[1][0],
        minimumLength: opening[1].length,
        executable: language === "bash" || language === "zsh",
      };
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length >= fence.minimumLength
      && [...trimmed].every((character) => character === fence.marker)) {
      fence = null;
      continue;
    }
    if (!fence.executable) continue;
    const command = stripShellComment(line).trim();
    if (command.length > 0) commands.push(command);
  }
  if (fence !== null) throw new Error("Unclosed Markdown fence");
  return commands;
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

function stripShellComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && !singleQuoted) {
      escaped = true;
      continue;
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      continue;
    }
    if (character === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    const previous = index === 0 ? "" : line[index - 1];
    if (character === "#"
      && !singleQuoted
      && !doubleQuoted
      && (index === 0 || /[\s;&|()]/u.test(previous))) {
      return line.slice(0, index);
    }
  }
  return line;
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
