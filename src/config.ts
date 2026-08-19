const MAX_NOTE_BYTES = 128 * 1024;
const MAX_JSON_ESCAPE_BYTES_PER_INPUT_BYTE = 6;
const MAX_NOTE_JSON_METADATA_BYTES = 16 * 1024;
const MAX_NOTE_ID_BYTES = 192;
const MAX_NOTE_TITLE_BYTES = 480;
const MAX_NOTE_TAG_BYTES = 1024;
const MAX_NOTE_TAGS = 20;
const CANONICAL_ORIGIN = "https://memory.crgmhrc.asia";

export const APP_CONFIG = {
  canonicalOrigin: CANONICAL_ORIGIN,
  githubOAuthCallbackUrl: `${CANONICAL_ORIGIN}/auth/github/callback`,
  githubApiVersion: "2022-11-28",
  githubOAuthUserAgent: "memory-garden-agent",
  githubOAuthTimeoutMs: 5_000,
  githubOAuthTokenResponseMaxBytes: 8 * 1024,
  githubOAuthUserResponseMaxBytes: 32 * 1024,
  githubOAuthEmailsResponseMaxBytes: 64 * 1024,
  oauthTemporaryCookieMaxAgeSeconds: 10 * 60,
  sessionCookieMaxAgeSeconds: 7 * 24 * 60 * 60,
  accessJwtAssertionHeader: "cf-access-jwt-assertion",
  workspaceName: "personal",
  indexPath: "/workspace/.memory/index.json",
  notesRoot: "/workspace/notes",
  maxNoteBytes: MAX_NOTE_BYTES,
  maxNoteMetadataBytes: MAX_NOTE_JSON_METADATA_BYTES,
  maxNoteIdBytes: MAX_NOTE_ID_BYTES,
  maxNoteTitleBytes: MAX_NOTE_TITLE_BYTES,
  maxNoteTagBytes: MAX_NOTE_TAG_BYTES,
  maxNoteTags: MAX_NOTE_TAGS,
  // JSON may encode a one-byte control character as a six-byte `\\u00XX` escape.
  maxJsonRequestBytes: MAX_NOTE_BYTES * MAX_JSON_ESCAPE_BYTES_PER_INPUT_BYTE + MAX_NOTE_JSON_METADATA_BYTES,
  maxQuestionChars: 4_000,
  maxSourceExcerptChars: 1_200,
  maxContextChars: 8_000,
  maxAnswerTokens: 700,
  model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
} as const;
