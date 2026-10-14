import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { RequestSort, SortDirection } from "../../types";
import { requestTableHeadClass } from "../../lib/uiClasses";

type CellProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  "data-sort"?: RequestSort;
};

// Only plain rendered text becomes a tooltip; icons and component internals are ignored.
function cellText(value: ReactNode): string {
  return Children.toArray(value)
    .map((child): string => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      if (isValidElement<CellProps>(child) && typeof child.type === "string")
        return cellText(child.props.children);
      return "";
    })
    .join(" ")
    .trim();
}

export function RequestRecordHead({
  children,
  sort,
  direction,
}: {
  children: ReactNode;
  sort: RequestSort;
  direction: SortDirection;
}) {
  return (
    <thead className="contents">
      <tr className={requestTableHeadClass}>
        {Children.map(children, (child) => {
          if (!isValidElement<CellProps>(child)) return null;
          const sortKey = child.props["data-sort"];
          const active = sortKey === sort;
          const Icon = active
            ? direction === "asc"
              ? ArrowUp
              : ArrowDown
            : ChevronsUpDown;
          return (
            <th
              scope="col"
              className={
                child.type === "span" ? child.props.className : undefined
              }
              aria-sort={
                sortKey
                  ? active
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                  : undefined
              }
            >
              {child.type === "button"
                ? cloneElement(child, {
                    className:
                      "flex min-h-10 w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent px-1 font-inherit text-inherit hover:bg-linehaul-teal-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-soc5-lime-deep",
                    title: `${cellText(child.props.children)}: ${active ? (direction === "asc" ? "ascending" : "descending") : "unsorted"}. Sort ${active && direction === "asc" ? "descending" : "ascending"}`,
                    children: (
                      <>
                        {child.props.children}
                        <Icon size={13} aria-hidden="true" />
                      </>
                    ),
                  })
                : child.props.children}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function RequestRecordRow({
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...props}>
      {Children.map(children, (child) => {
        if (!isValidElement<CellProps>(child)) return null;
        return child.type === "span" ? (
          <td
            {...child.props}
            title={
              child.props.title ?? (cellText(child.props.children) || undefined)
            }
          >
            {cellText(child.props.children) ? (
              <span className="min-w-0 truncate">{child.props.children}</span>
            ) : (
              child.props.children
            )}
          </td>
        ) : (
          <td>{child}</td>
        );
      })}
    </tr>
  );
}

export function RequestDetailRow({
  children,
  columns,
  id,
}: {
  children: ReactNode;
  columns: number;
  id?: string;
}) {
  return (
    <tr id={id} className="col-span-full grid min-w-0 grid-cols-subgrid">
      <td colSpan={columns} className="col-span-full min-w-0 p-0">
        {children}
      </td>
    </tr>
  );
}
