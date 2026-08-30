// @vitest-environment node
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DataPagination, type DataPaginationProps } from "../../frontend/components/data-pagination";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, type PaginationLabels, visiblePageTokens } from "../../frontend/components/ui/pagination";
import { Select } from "../../frontend/components/ui/select";
import { createLocaleRuntime, frontendPaginationLabels } from "../../frontend/lib/i18n";

const englishLocale = createLocaleRuntime({ navigatorLanguage: "en" });
const chineseLocale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });

type DataPaginationInput = Omit<DataPaginationProps, "locale" | "labels">;
type LocalizedPaginationInput = Omit<React.ComponentProps<typeof Pagination>, "labels"> & { labels?: PaginationLabels };

function localizedDataPaginationProps(props: DataPaginationInput, locale = englishLocale): DataPaginationProps {
  return { ...props, locale };
}

function localizedPaginationProps(props: LocalizedPaginationInput): React.ComponentProps<typeof Pagination> {
  const { labels = frontendPaginationLabels(englishLocale), ...rest } = props;
  return {
    ...rest,
    labels,
  };
}

describe("frontend pagination", () => {
  it("builds bounded full-numbered tokens with ellipses", () => {
    expect(visiblePageTokens(1, 0)).toEqual([]);
    expect(visiblePageTokens(1, 3)).toEqual([1, 2, 3]);
    expect(visiblePageTokens(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
  });

  it("keeps the compatible Pagination export semantic and untruncated", () => {
    const html = renderToStaticMarkup(<Pagination {...localizedPaginationProps({ currentPage: 51, pageCount: 1000, labels: { navigationLabel: "Pagination navigation", previousLabel: "上一页", nextLabel: "下一页", pageLabel: (page: number) => `第 ${page} 页` } })} />);
    expect(html).toContain('aria-label="Pagination navigation"');
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
      <DataPagination {...localizedDataPaginationProps({ page: 6, pageSize: 20, total: 238, totalPages: 12, onPageChange, onPageSizeChange: vi.fn() })} />,
    );
    expect(html).toContain(">238<");
    expect(html).toContain("101–120");
    expect(html).toMatch(/<button(?=[^>]*aria-label="Page 6")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html).toContain("…");

    const pagination = Pagination(localizedPaginationProps({ currentPage: 6, pageCount: 12, onPageChange }));
    const pageList = React.Children.toArray(pagination?.props.children)[1] as React.ReactElement<{ children: React.ReactNode }>;
    const pageSeven = React.Children.toArray(pageList.props.children).find((child) => React.isValidElement<{ children: React.ReactElement<{ children: React.ReactNode }> }>(child) && child.props.children.props.children === 7) as React.ReactElement<{ children: React.ReactElement<{ onClick: () => void }> }>;
    pageSeven.props.children.props.onClick();
    expect(onPageChange).toHaveBeenCalledWith(7);
  });

  it("offers exact page sizes and delegates atomic reset ownership to the route", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const html = renderToStaticMarkup(<DataPagination {...localizedDataPaginationProps({ page: 4, pageSize: 20, total: 238, totalPages: 12, onPageChange, onPageSizeChange })} />);
    expect(html).toContain('<option value="20" selected="">20</option>');
    expect(html).toContain('<option value="50">50</option>');
    expect(html).toContain('<option value="100">100</option>');
    const tree = DataPagination(localizedDataPaginationProps({ page: 4, pageSize: 20, total: 238, totalPages: 12, onPageChange, onPageSizeChange }));
    const select = findElementByType(tree, Select)!;
    select.props.onChange({ currentTarget: { value: "50" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("disables every control while pending and exposes responsive mobile controls", () => {
    const html = renderToStaticMarkup(
      <DataPagination {...localizedDataPaginationProps({ page: 2, pageSize: 20, total: 60, totalPages: 3, pending: true, onPageChange: vi.fn(), onPageSizeChange: vi.fn() })} />,
    );
    expect(html.match(/disabled=""/gu)?.length).toBe(8);
    expect(html).toContain('data-pagination-mobile="true" class="flex items-center gap-2 sm:hidden"');
    expect(html).toContain('data-pagination-desktop="true" class="hidden sm:flex"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("2 / 3");
  });

  it("renders zero totals without invalid ranges", () => {
    const html = renderToStaticMarkup(
      <DataPagination {...localizedDataPaginationProps({ page: 1, pageSize: 20, total: 0, totalPages: 0, onPageChange: vi.fn(), onPageSizeChange: vi.fn() })} />,
    );
    expect(html).toContain("0–0");
    expect(html).not.toContain("1–0");
  });

  it("normalizes missing legacy metadata to a valid empty first page", () => {
    const html = renderToStaticMarkup(
      <DataPagination {...localizedDataPaginationProps({ onPageChange: vi.fn(), onPageSizeChange: vi.fn() })} />,
    );
    expect(html).toContain(">0<");
    expect(html).toContain("0–0");
    expect(html).toContain("0 / 0");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("renders a legal beyond-last page without inventing a current desktop page", () => {
    const onPageChange = vi.fn();
    const html = renderToStaticMarkup(<DataPagination {...localizedDataPaginationProps({ page: 4, pageSize: 20, total: 21, totalPages: 2, onPageChange, onPageSizeChange: vi.fn() })} />);
    expect(html).toContain("0–0");
    expect(html).toContain("4 / 2");
    expect(html).not.toContain('aria-current="page"');

    const desktop = Pagination(localizedPaginationProps({ currentPage: 4, pageCount: 2, onPageChange }));
    const desktopPrevious = React.Children.toArray(desktop?.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
    desktopPrevious.props.onClick();
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    const tree = DataPagination(localizedDataPaginationProps({ page: 4, pageSize: 20, total: 21, totalPages: 2, onPageChange, onPageSizeChange: vi.fn() }));
    const mobilePrevious = findElementsByType(tree, "button").find((element) => element.props["aria-label"] === "Previous page")!;
    mobilePrevious.props.onClick();
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("provides a native accessible shadcn-style Select primitive", () => {
    const html = renderToStaticMarkup(<Select aria-label="Size" defaultValue="20"><option value="20">20</option></Select>);
    expect(html).toContain('aria-label="Size"');
    expect(html).toContain("focus-visible:ring-2");
  });

  it("renders the complete English pagination catalog through the shared surface", () => {
    const html = renderToStaticMarkup(<DataPagination {...localizedDataPaginationProps({ page: 6, pageSize: 20, total: 238, totalPages: 12, onPageChange: vi.fn(), onPageSizeChange: vi.fn() })} />);
    expect(html).toContain("Total <span class=\"font-medium text-foreground\">238</span>");
    expect(html).toContain("Visible <span class=\"font-medium text-foreground\">101–120</span>");
    expect(html).toContain('aria-label="Rows per page"');
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('aria-label="Pagination navigation"');
    expect(html).toContain('aria-label="Page 6"');
    expect(html).toContain("6 / 12");
  });

  it("renders the complete Chinese pagination catalog without English leakage", () => {
    const html = renderToStaticMarkup(<DataPagination {...localizedDataPaginationProps({ page: 1, pageSize: 20, total: 20, totalPages: 1, onPageChange: vi.fn(), onPageSizeChange: vi.fn() }, chineseLocale)} />);
    const emptyHtml = renderToStaticMarkup(<DataPagination {...localizedDataPaginationProps({ page: 1, pageSize: 20, total: 0, totalPages: 0, onPageChange: vi.fn(), onPageSizeChange: vi.fn() }, chineseLocale)} />);
    expect(html).toContain('aria-label="每页行数"');
    expect(html).toContain('aria-label="上一页"');
    expect(html).toContain('aria-label="下一页"');
    expect(html).toContain('aria-label="分页导航"');
    expect(html).toContain('aria-label="第 1 页"');
    expect(html).toContain("1 / 1");
    expect(html).not.toContain("Total");
    expect(html).not.toContain("Visible");
    expect(html).not.toContain("Rows per page");
    expect(emptyHtml).toContain("总计 <span class=\"font-medium text-foreground\">0</span><span aria-hidden=\"true\"> · </span>当前显示 <span class=\"font-medium text-foreground\">0–0</span>");
    expect(emptyHtml).toContain("0 / 0");
    expect(emptyHtml).not.toContain("Total");
    expect(emptyHtml).not.toContain("Visible");
    expect(emptyHtml).not.toContain("Rows per page");
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
