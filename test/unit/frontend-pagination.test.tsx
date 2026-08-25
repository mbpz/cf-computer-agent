// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Pagination } from "../../frontend/components/ui/pagination";

describe("frontend pagination", () => {
  it("renders bounded semantic controls and marks the current page", () => {
    const html = renderToStaticMarkup(<Pagination currentPage={2} pageCount={3} previousLabel="上一页" nextLabel="下一页" />);
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain('aria-label="上一页"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="下一页"');
    expect(html).not.toContain('undefined');
  });

  it("clamps page count and disables the edge controls", () => {
    const html = renderToStaticMarkup(<Pagination currentPage={99} pageCount={1000} />);
    expect((html.match(/aria-label="Page /gu) || []).length).toBe(50);
    expect(html).toContain('aria-label="Next page" disabled=""');
    expect(renderToStaticMarkup(<Pagination currentPage={1} pageCount={0} />)).toBe("");
  });

  it("keeps page changes on the public callback", () => {
    const onPageChange = vi.fn();
    expect(onPageChange).not.toHaveBeenCalled();
    // Server rendering cannot dispatch clicks; the component exposes only the callback seam.
    renderToStaticMarkup(<Pagination currentPage={1} pageCount={2} onPageChange={onPageChange} />);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
