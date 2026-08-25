const MAX_KEYWORDS = 8;
const MAX_QUESTION_HINTS = 4;
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "that", "this", "的", "了", "和", "是", "在", "与", "及"]);

export interface ChunkMetadata {
  keywords: string[];
  questionHints: string[];
}

export function buildChunkMetadata(headingPath: readonly string[], body: string): ChunkMetadata {
  const words = `${headingPath.join(" ")} ${body}`
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? [];
  const keywords: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word) || keywords.includes(word)) continue;
    keywords.push(word);
    if (keywords.length >= MAX_KEYWORDS) break;
  }
  const questionHints = keywords.slice(0, MAX_QUESTION_HINTS).flatMap((keyword) => [
    `What is ${keyword}?`,
  ]).slice(0, MAX_QUESTION_HINTS);
  return { keywords, questionHints };
}

export function metadataSearchText(metadata: ChunkMetadata): string {
  return [
    ...metadata.keywords.map((keyword) => `keyword:${keyword}`),
    ...metadata.questionHints.map((question) => `question:${question}`),
  ].join(" ");
}
