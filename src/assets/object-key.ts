const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export function originalObjectKey(sourceVersionId: string): string {
  if (!SAFE_ID.test(sourceVersionId)) throw new TypeError("Original object key identity is invalid");
  return `originals/${sourceVersionId}`;
}

export function parsedObjectKey(assetId: string): string {
  if (!SAFE_ID.test(assetId)) throw new TypeError("Parsed object key identity is invalid");
  return `parsed/${assetId}.md`;
}

export function validateOriginalObjectKey(objectKey: string, sourceVersionId: string): boolean {
  return SAFE_ID.test(sourceVersionId) && objectKey === originalObjectKey(sourceVersionId);
}
