import { AppError } from "../http";

const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });

export function decodeSourceBytes(bytes: ArrayBuffer): string {
  try {
    return UTF8_FATAL.decode(bytes);
  } catch {
    throw new AppError("SOURCE_ENCODING_INVALID", "Source encoding is invalid", 400);
  }
}
