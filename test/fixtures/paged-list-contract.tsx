// Contract fixture: one list shape the checker accepts and one it must reject.
// PAGED_LIST_FIXTURE_SENTINEL

declare function DataTable(props: Record<string, unknown>): null;

const rows: string[] = [];
const page = { page: 1, pageSize: 20 as const, total: 1, totalPages: 1 };

export function PagedListFixture() {
  return <DataTable rows={rows} columns={[]} rowId={(row: string) => row} ariaLabel="Rows" emptyState="None" pagination={page} onPageChange={() => undefined} onPageSizeChange={() => undefined} hasMore onLoadMore={() => undefined} />;
}

export function FeedOnlyFixture() {
  return <DataTable rows={rows} columns={[]} rowId={(row: string) => row} ariaLabel="Rows" emptyState="None" hasMore onLoadMore={() => undefined} />;
}
