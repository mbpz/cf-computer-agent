export const APP_CONFIG = {
  workspaceName: "personal",
  indexPath: "/workspace/.memory/index.json",
  notesRoot: "/workspace/notes",
  maxNoteBytes: 128 * 1024,
  maxJsonRequestBytes: 144 * 1024,
  maxQuestionChars: 4_000,
  maxSourceExcerptChars: 1_200,
  maxContextChars: 8_000,
  maxAnswerTokens: 700,
  model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
} as const;
