export const TEXT_LIMIT: number;
export const UPLOAD_LIMIT: number;
export const FILE_ERRORS: Set<string>;
export type FileRequest =
  | { op: 'list'; path: string; page?: number; pageSize?: 20 | 50 | 100 }
  | { op: 'readText' | 'download' | 'mkdir' | 'remove'; path: string }
  | { op: 'rename'; path: string; destination: string }
  | { op: 'saveText'; path: string; version: string; text: string }
  | { op: 'upload'; path: string; bytes: Uint8Array };
export type FileResult =
  | { path: string; page: number; pageSize: 20 | 50 | 100; total: number; pages: number;
      entries: { name: string; type: 'file' | 'directory' | 'symlink' | 'unsupported'; bytes: number }[] }
  | { text: string; version: string } | { bytes: Uint8Array } | { ok: true };
export function copyFileRequest(value: unknown): FileRequest;
export function validFileResult(input: FileRequest, value: unknown): value is FileResult;
