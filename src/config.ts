export const APP_CONFIG = {
  workspaceName: "personal",
  indexPath: "/workspace/.memory/index.json",
  notesRoot: "/workspace/notes",
  maxNoteBytes: 128 * 1024,
  model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
} as const;
