// @vitest-environment node
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DataPagination } from "../../frontend/components/data-pagination";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, visiblePageTokens } from "../../frontend/components/ui/pagination";
import { Select } from "../../frontend/components/ui/select";

describe("frontend pagination", () => {
  it("builds bounded full-numbered tokens with ellipses", () => {
    expect(visiblePageTokens(1, 0)).toEqual([]);
    expect(visiblePageTokens(1, 3)).toEqual([1, 2, 3]);
    expect(visiblePageTokens(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
  });

  it("keeps the compatible Pagination export semantic and untruncated", () => {
    const html = renderToStaticMarkup(<Pagination currentPage={51} pageCount={1000} previousLabel="上一页" nextLabel="下一页" />);
    expect(html).toContain('aria-label="Pagination"');
    expect(html).toContain('aria-label="上一页"');
    expect(html).toContain('aria-label="下一页"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">51<");
    expect(html).toContain(">1000<");
    expect(html).toContain("…");
  });

  it("exports composable shadcn-style pagination primitives", () => {
    const html = renderToStaticMarkup(<nav aria-label="Pages"><PaginationContent><PaginationItem><PaginationPrevious aria-label="Back" /></PaginationItem><PaginationItem><PaginationLink isActive>2</PaginationLink></PaginationItem><PaginationItem><PaginationEllipsis /></PaginationItem><PaginationItem><PaginationNext aria-label="Forward" /></PaginationItem></PaginationContent></nav>);
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("More pages");
    expect(html).toContain('aria-label="Forward"');
  });

  it("keeps controlled active state authoritative over aria-current props", () => {
    const active = renderToStaticMarkup(<PaginationLink isActive aria-current={undefined}>2</PaginationLink>);
    const inactive = renderToStaticMarkup(<PaginationLink isActive={false} aria-current="page">2</PaginationLink>);
    expect(active).toContain('aria-current="page"');
    expect(inactive).not.toContain("aria-current");
  });

  it("renders totals, range, desktop tokens, and invokes page changes", () => {
    const onPageChange = vi.fn();
    const html = renderToStaticMarkup(
      <DataPagination page={6} pageSize={20} total={238} totalPages={12} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />,
    );
    expect(html).toContain(">238<");
    expect(html).toContain("101–120");
    expect(html).toMatch(/<button(?=[^>]*aria-label="Page 6")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html).toContain("…");

    const pagination = Pagination({ currentPage: 6, pageCount: 12, onPageChange });
    const pageList = React.Children.toArray(pagination?.props.children)[1] as React.ReactElement<{ children: React.ReactNode }>;
    const pageSeven = React.Children.toArray(pageList.props.children).find((child) => React.isValidElement<{ children: React.ReactElement<{ children: React.ReactNode }> }>(child) && child.props.children.props.children === 7) as React.ReactElement<{ children: React.ReactElement<{ onClick: () => void }> }>;
    pageSeven.props.children.props.onClick();
    expect(onPageChange).toHaveBeenCalledWith(7);
  });

  it("offers exact page sizes and delegates atomic reset ownership to the route", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const html = renderToStaticMarkup(<DataPagination page={4} pageSize={20} total={238} totalPages={12} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />);
    expect(html).toContain('<option value="20" selected="">20</option>');
    expect(html).toContain('<option value="50">50</option>');
    expect(html).toContain('<option value="100">100</option>');
    const tree = DataPagination({ page: 4, pageSize: 20, total: 238, totalPages: 12, onPageChange, onPageSizeChange });
    const select = findElementByType(tree, Select)!;
    select.props.onChange({ currentTarget: { value: "50" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("disables every control while pending and exposes responsive mobile controls", () => {
    const html = renderToStaticMarkup(
      <DataPagination page={2} pageSize={20} total={60} totalPages={3} pending onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(html.match(/disabled=""/gu)?.length).toBe(8);
    expect(html).toContain('data-pagination-mobile="true" class="flex items-center gap-2 sm:hidden"');
    expect(html).toContain('data-pagination-desktop="true" class="hidden sm:flex"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("2 / 3");
  });

  it("renders zero totals without invalid ranges", () => {
    const html = renderToStaticMarkup(
      <DataPagination page={1} pageSize={20} total={0} totalPages={0} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(html).toContain("0–0");
    expect(html).not.toContain("1–0");
  });

  it("renders a legal beyond-last page without inventing a current desktop page", () => {
    const onPageChange = vi.fn();
    const html = renderToStaticMarkup(<DataPagination page={4} pageSize={20} total={21} totalPages={2} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />);
    expect(html).toContain("0–0");
    expect(html).toContain("4 / 2");
    expect(html).not.toContain('aria-current="page"');

    const desktop = Pagination({ currentPage: 4, pageCount: 2, onPageChange });
    const desktopPrevious = React.Children.toArray(desktop?.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
    desktopPrevious.props.onClick();
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    const tree = DataPagination({ page: 4, pageSize: 20, total: 21, totalPages: 2, onPageChange, onPageSizeChange: vi.fn() });
    const mobilePrevious = findElementsByType(tree, "button").find((element) => element.props["aria-label"] === "Previous page")!;
    mobilePrevious.props.onClick();
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("provides a native accessible shadcn-style Select primitive", () => {
    const html = renderToStaticMarkup(<Select aria-label="Size" defaultValue="20"><option value="20">20</option></Select>);
    expect(html).toContain('aria-label="Size"');
    expect(html).toContain("focus-visible:ring-2");
  });
});

function findElementByType(node: React.ReactNode, type: React.ElementType): React.ReactElement<Record<string, any>> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node as React.ReactElement<Record<string, any>>;
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const found = findElementByType(child, type);
    if (found) return found;
  }
  return null;
}

function findElementsByType(node: React.ReactNode, type: React.ElementType): React.ReactElement<Record<string, any>>[] {
  if (!React.isValidElement(node)) return [];
  const matches = node.type === type ? [node as React.ReactElement<Record<string, any>>] : [];
  return matches.concat(React.Children.toArray((node.props as { children?: React.ReactNode }).children).flatMap((child) => findElementsByType(child, type)));
}
