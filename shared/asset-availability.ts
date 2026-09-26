/** Configuration only: not a quota check or proof that the upload UI is connected. */
export type AssetAvailability = { maxBytes: number } & (
  | { storageEnabled: true; reason: null }
  | { storageEnabled: false; reason: "ASSET_STORAGE_NOT_CONFIGURED" }
);
