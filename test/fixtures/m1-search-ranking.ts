import type { SearchHighlightRange, SearchMatchedField } from "../../src/library/types";

export interface M1SearchRankingDocument {
  id: string;
  title: string;
  summary?: string;
  searchTags?: string;
  body: string;
  searchBody?: string;
  indexField?: "body" | "code";
  visibility?: "shared" | "admin_only";
  spaceId?: "default" | "space-two";
}

export interface M1SearchRankingCase {
  query: string;
  expectedTopFive: string[];
  expectedMatchedFields: SearchMatchedField[][];
  expectedHighlights: SearchHighlightRange[][];
}

export const M1_SEARCH_RANKING_DOCUMENTS: readonly M1SearchRankingDocument[] = Object.freeze([
  { id: "rank-en-title", title: "rankterm title", body: "English title-only evidence." },
  { id: "rank-en-tags", title: "English tags", searchTags: "rankterm", body: "English Tag-only evidence." },
  { id: "rank-en-summary", title: "English summary", summary: "rankterm summary", body: "English summary-only evidence." },
  { id: "rank-en-code", title: "English code", body: "😀 const rankterm = '<img onerror=alert(1)>';", searchBody: "const rankterm img onerror alert", indexField: "code" },
  { id: "rank-en-body", title: "English body", body: "body rankterm evidence" },

  { id: "rank-han-title", title: "权限治理 权限 限治 治理 标题", body: "中文标题字段证据。" },
  { id: "rank-han-tags", title: "中文标签", searchTags: "权限治理 权限 限治 治理", body: "中文标签字段证据。" },
  { id: "rank-han-summary", title: "中文摘要", summary: "权限治理 权限 限治 治理", body: "中文摘要字段证据。" },
  { id: "rank-han-code", title: "中文代码", body: "const policy = '权限治理';", searchBody: "权限治理 权限 限治 治理", indexField: "code" },
  { id: "rank-han-body", title: "中文正文", body: "权限治理需要双人复核。", searchBody: "权限治理 权限 限治 治理 双人复核" },

  { id: "rank-code-title", title: "getUserByID reference", body: "Identifier title-only evidence." },
  { id: "rank-code-tags", title: "Identifier tags", searchTags: "getuserbyid", body: "Identifier Tag-only evidence." },
  { id: "rank-code-summary", title: "Identifier summary", summary: "getUserByID", body: "Identifier summary-only evidence." },
  { id: "rank-code-code", title: "Identifier code", body: "const getUserByID = true;", searchBody: "const getuserbyid true", indexField: "code" },
  { id: "rank-code-body", title: "Identifier body", body: "Call getUserByID before caching.", searchBody: "call getuserbyid before caching" },

  { id: "corpus-mixed-fields", title: "Launch operations", summary: "Rollback summary", searchTags: "runbook", body: "Launch rollback body." },
  { id: "corpus-repeated-position", title: "Repeated positions", body: "repeat repeat repeat at stable positions" },
  { id: "corpus-admin-only", title: "Private compensation", body: "admin secret evidence", visibility: "admin_only" },
  { id: "corpus-disabled-space", title: "Disabled archive", body: "disabled resource evidence", spaceId: "space-two" },
  { id: "corpus-emoji-combining", title: "Unicode safety", body: "😀 cafe\u0301 normalization and <script>inert</script>" },
  { id: "corpus-title-only", title: "solotitle", body: "No matching body token." },
  { id: "corpus-tag-only", title: "Tag fixture", searchTags: "solotag", body: "No matching body token." },
  { id: "corpus-body-only", title: "Body fixture", body: "solobody is present here" },
  { id: "corpus-code-only", title: "Code fixture", body: "const SOLO_CODE = 1;", searchBody: "const solo code 1", indexField: "code" },
  { id: "corpus-unrelated-01", title: "Vacation policy", body: "Annual leave calendar." },
  { id: "corpus-unrelated-02", title: "Benefits directory", body: "Health plan contacts." },
  { id: "corpus-unrelated-03", title: "Office handbook", body: "Building access hours." },
  { id: "corpus-unrelated-04", title: "Expense guide", body: "Receipt submission rules." },
  { id: "corpus-unrelated-05", title: "Incident roles", body: "Commander and scribe duties." },
  { id: "corpus-unrelated-06", title: "Release calendar", body: "Quarterly freeze windows." },
]);

export const M1_SEARCH_RANKING_CASES: readonly M1SearchRankingCase[] = Object.freeze([
  {
    query: "rankterm",
    expectedTopFive: ["rank-en-title", "rank-en-tags", "rank-en-summary", "rank-en-code", "rank-en-body"],
    expectedMatchedFields: [["title"], ["tags"], ["summary"], ["code"], ["body"]],
    expectedHighlights: [[], [], [], [{ start: 8, end: 16 }], [{ start: 5, end: 13 }]],
  },
  {
    query: "权限治理",
    expectedTopFive: ["rank-han-title", "rank-han-tags", "rank-han-summary", "rank-han-code", "rank-han-body"],
    expectedMatchedFields: [["title"], ["tags"], ["summary"], ["code"], ["body"]],
    expectedHighlights: [[], [], [], [{ start: 16, end: 20 }], [{ start: 0, end: 4 }]],
  },
  {
    query: "getUserByID",
    expectedTopFive: ["rank-code-title", "rank-code-tags", "rank-code-summary", "rank-code-code", "rank-code-body"],
    expectedMatchedFields: [["title"], ["tags"], ["summary"], ["code"], ["body"]],
    expectedHighlights: [[], [], [], [{ start: 6, end: 17 }], [{ start: 5, end: 16 }]],
  },
]);
