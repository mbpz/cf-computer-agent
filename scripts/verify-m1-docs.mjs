import { readFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const runbookPath = new URL("docs/operations/m1-release.md", repositoryRoot);
const checklistPath = new URL("docs/product/ai-knowledge-base-checklist.md", repositoryRoot);
const reportPath = new URL(".superpowers/sdd/2026-08-22-m1-gate-completion/task-9-report.md", repositoryRoot);
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
const htmlBlockTags = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption",
  "center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2",
  "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "iframe", "legend", "li",
  "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p",
  "param", "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead",
  "title", "tr", "track", "ul",
]);
const completeOpenTag = /^<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:[^ \t"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t]*\/?>[ \t]*$/u;
const completeClosingTag = /^<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$/u;

async function verifyRunbook(path) {
  const markdown = await readFile(path, "utf8");
  const fences = commonMarkFences(markdown);
  rejectRawHtmlBlocks(markdown, fences);
  const evidence = exactEvidenceBlocks(markdown, fences);
  if (evidence.length !== requiredEvidenceBlocks.length
    || evidence.some((block, index) => block.id !== requiredEvidenceBlocks[index][0]
      || block.command !== requiredEvidenceBlocks[index][1])) {
    throw new Error("M1 evidence blocks are missing, malformed, duplicated, or out of order");
  }

  for (const fence of fences.filter(({ language }) => language === "bash" || language === "zsh")) {
    const withoutCommentLines = fence.content
      .filter((line) => !/^\s*#/u.test(line))
      .join("\n");
    const normalized = withoutCommentLines.replace(/\\\r?\n/gu, "");
    if (forbiddenCommands.some((pattern) => pattern.test(normalized))) {
      throw new Error("Forbidden executable command found");
    }
  }
  console.log(`[pass] m1-runbook evidence_blocks=${evidence.length}`);
}

function exactEvidenceBlocks(markdown, fences) {
  const lines = markdown.split(/\r?\n/u);
  const fenceByStart = new Map(fences.map((fence) => [fence.start, fence]));
  const fencedLines = coveredFenceLines(fences);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (fencedLines.has(index)) continue;
    const marker = /^M1 evidence command: `([a-z0-9-]+)`$/u.exec(lines[index]);
    if (!marker) continue;
    const fence = fenceByStart.get(index + 1);
    if (!fence
      || (fence.rawInfo !== "bash" && fence.rawInfo !== "zsh")
      || fence.content.length !== 1) {
      throw new Error("M1 evidence block must be one top-level exact physical shell command line");
    }
    const [command] = fence.content;
    if (!command || /^\s*#/u.test(command)) {
      throw new Error("M1 evidence block command is missing");
    }
    blocks.push({ id: marker[1], command });
    index = fence.end;
  }
  return blocks;
}

function commonMarkFences(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const fences = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence === null) {
      const opening = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
      if (!opening || (opening[2][0] === "`" && opening[3].includes("`"))) continue;
      fence = {
        character: opening[2][0],
        length: opening[2].length,
        start: index,
        rawInfo: opening[3],
        language: infoLanguage(opening[3]),
        content: [],
      };
      continue;
    }
    const closing = /^( {0,3})(`{3,}|~{3,})[ \t]*$/u.exec(line);
    if (closing
      && closing[2][0] === fence.character
      && closing[2].length >= fence.length) {
      fences.push({ ...fence, end: index });
      fence = null;
      continue;
    }
    fence.content.push(line);
  }
  if (fence !== null) throw new Error("Unclosed Markdown fence");
  return fences;
}

function infoLanguage(rawInfo) {
  const [firstWord = ""] = rawInfo.trim().split(/[ \t]+/u);
  return firstWord.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function coveredFenceLines(fences) {
  return new Set(fences.flatMap((fence) => {
    const covered = [];
    for (let line = fence.start; line <= fence.end; line += 1) covered.push(line);
    return covered;
  }));
}

function rejectRawHtmlBlocks(markdown, fences) {
  const fencedLines = coveredFenceLines(fences);
  const lines = markdown.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!fencedLines.has(index) && isRawHtmlBlockStart(lines[index])) {
      throw new Error("Raw HTML blocks are forbidden in the M1 release runbook");
    }
  }
}

function isRawHtmlBlockStart(line) {
  const candidate = /^( {0,3})(\S.*)$/u.exec(line)?.[2];
  if (!candidate || candidate[0] !== "<") return false;
  if (/^<(?:script|pre|style|textarea)(?=[\t >]|$)/iu.test(candidate)) return true;
  if (candidate.startsWith("<!--")
    || candidate.startsWith("<?")
    || /^<![A-Za-z]/u.test(candidate)
    || candidate.startsWith("<![CDATA[")) return true;

  const blockTag = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\t />]|$)/u.exec(candidate)?.[1];
  if (blockTag && htmlBlockTags.has(blockTag.toLowerCase())) return true;
  return completeOpenTag.test(candidate) || completeClosingTag.test(candidate);
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
    || checked.length !== 75
    || unchecked.length !== 1
    || gates.length !== 1
    || gates[0][1] !== " ") {
    throw new Error("M1 checklist counts do not match the reviewed truth");
  }

  const summary = "Checklist totals: **76 P0/M1 atoms = 75 checked + 1 unchecked**. `GATE-M1` is one additional unchecked gate, so **2 items are unchecked including the gate**.";
  if (!reportText.includes(summary)
    || !reportText.includes("One current P0/M1 atom remains unchecked")) {
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
