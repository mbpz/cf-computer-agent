// Compatibility surface for the unrewired Worker entry point; Task 6 removes this shim.
export { safeId, searchNotes } from "./knowledge/search";
export type { NoteRecord, SearchDocument, SearchHit } from "./knowledge/types";
