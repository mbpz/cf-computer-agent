/** Observe the raw operation, before a caller maps or compensates its failure.
 * Factories preserve native receivers/overloads and fence late I/O. No binding
 * proxy and no business-operation wrapper: domain rejections stay separate.
 */
export interface StorageObserver {
  run<T>(factory: () => Promise<T>): Promise<T>;
  markUncertain(reason: 'STORAGE_RESULT_UNCERTAIN'): void;
}

export function observeStorage<T>(observer: StorageObserver | undefined, factory: () => Promise<T>): Promise<T> {
  return observer ? observer.run(factory) : factory();
}
