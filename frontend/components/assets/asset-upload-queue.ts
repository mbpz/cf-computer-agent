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
  options: { concurrency?: number; id?: (value: T, index: number) => string; onChange?: (items: AssetQueueItem<T>[]) => void } = {},
): AssetUploadQueue<T> {
  const concurrency = Number.isSafeInteger(options.concurrency) && (options.concurrency ?? 0) > 0
    ? Math.min(options.concurrency!, 3) : 2;
  const items: AssetQueueItem<T>[] = values.map((value, index) => ({
    id: options.id?.(value, index) ?? `asset-${index + 1}`,
    value,
    status: "queued" as const,
  }));
  const snapshot = () => items.map((item) => ({ ...item }));
  const notify = () => options.onChange?.(snapshot());
  let running: Promise<AssetQueueItem<T>[]> | undefined;
  return {
    get items() { return snapshot(); },
    run() {
      // A queue is one attempt, not an implicit retry. Concurrent callers share it.
      if (running) return running;
      running = Promise.resolve().then(async () => {
        let next = 0;
        const worker = async () => {
          while (next < items.length) {
            const index = next++;
            const item = items[index]!;
            item.status = "processing";
            notify();
            try {
              await upload(item.value);
              item.status = "succeeded";
            } catch (error) {
              item.status = "failed";
              item.error = error instanceof Error && error.message ? error.message : "UPLOAD_FAILED";
            }
            notify();
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
        return snapshot();
      });
      return running;
    },
  };
}
