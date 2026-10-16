import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppliedFilters } from "../../frontend/components/ui/applied-filters";
import { FilterSelect } from "../../frontend/components/ui/filter-select";

describe("shared list filters", () => {
  it("renders the filter as a labelled beUI select with its historical accessible name", () => {
    const html = renderToStaticMarkup(
      <FilterSelect label="Status" ariaLabel="Asset status" value="queued" options={[{ value: "", label: "All" }, { value: "queued", label: "queued" }]} onChange={() => {}} />,
    );
    expect(html).toContain("Status");
    expect(html).toContain("Asset status");
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain("<select");
  });

  it("renders nothing without applied conditions and removable chips with a clear-all otherwise", () => {
    expect(renderToStaticMarkup(<AppliedFilters filters={[]} onClear={() => {}} clearLabel="Clear" ariaLabel="Applied filters" />)).toBe("");
    const html = renderToStaticMarkup(
      <AppliedFilters filters={[{ id: "status", label: "Status: queued", onRemove: () => {} }]} onClear={() => {}} clearLabel="Clear" ariaLabel="Applied filters" />,
    );
    expect(html).toContain("Status: queued");
    expect(html).toContain('aria-label="Clear: Status: queued"');
    expect(html).toContain("data-filters-clear");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Applied filters"');
  });
});
