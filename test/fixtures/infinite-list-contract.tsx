// Contract fixture: one list shape the checker accepts and one it must reject.
// INFINITE_LIST_FIXTURE_SENTINEL
// Local stubs keep this fixture typecheckable after the real pager is deleted.

function DataTable(_props: Record<string, unknown>) {
  return null;
}

function DataPagination(_props: Record<string, unknown>) {
  return null;
}

const rows: string[] = [];

export function InfiniteListFixture() {
  return <DataTable rows={rows} columns={[]} rowId={(row: string) => row} ariaLabel="Rows" emptyState="None" onLoadMore={() => undefined} hasMore />;
}

export function NumberedListFixture() {
  return <DataPagination page={1} pageSize={20} total={1} totalPages={1} onPageChange={() => undefined} onPageSizeChange={() => undefined} locale={undefined} />;
}
