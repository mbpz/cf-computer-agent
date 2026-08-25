export type AssetQueueStatus = "queued" | "processing" | "succeeded" | "failed";

export interface AssetQueueItem<T> {
  id: string;
  value: T;
  status: AssetQueueStatus;
  error?: string;
}

export interface AssetUploadQueue<T> {
  items: AssetQueueItem<T>[];
  run(): Promise<AssetQueueItem<T>[]>;
}

/** Runs independent uploads with a small bounded worker pool. One failure never aborts siblings. */
export function createAssetUploadQueue<T>(
  values: readonly T[],
  upload: (value: T) => Promise<void>,
  options: { concurrency?: number; id?: (value: T, index: number) => string } = {},
): AssetUploadQueue<T> {
  const concurrency = Number.isSafeInteger(options.concurrency) && (options.concurrency ?? 0) > 0
    ? Math.min(options.concurrency!, 3) : 2;
  const items = values.map((value, index) => ({
    id: options.id?.(value, index) ?? `asset-${index + 1}`,
    value,
    status: "queued" as const,
  }));
  return {
    items,
    async run() {
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          const index = next++;
          const item = items[index]!;
          item.status = "processing";
          try {
            await upload(item.value);
            item.status = "succeeded";
          } catch (error) {
            item.status = "failed";
            item.error = error instanceof Error && error.message ? error.message : "UPLOAD_FAILED";
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
      return items;
    },
  };
}
