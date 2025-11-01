// Table primitive set for structured data display; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

export interface TableContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TableContainer = React.forwardRef<HTMLDivElement, TableContainerProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cx('table-wrap', className)} {...props} />
  )
);
TableContainer.displayName = 'TableContainer';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cx('table', className)} {...props} />
  )
);
Table.displayName = 'Table';

export interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableHead = React.forwardRef<HTMLTableSectionElement, TableHeadProps>(
  ({ className, ...props }, ref) => <thead ref={ref} className={className} {...props} />
);
TableHead.displayName = 'TableHead';

export interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />
);
TableBody.displayName = 'TableBody';

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, ...props }, ref) => <tr ref={ref} className={className} {...props} />
);
TableRow.displayName = 'TableRow';

export interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export const TableHeaderCell = React.forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  ({ className, scope = 'col', ...props }, ref) => (
    <th ref={ref} scope={scope} className={className} {...props} />
  )
);
TableHeaderCell.displayName = 'TableHeaderCell';

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => <td ref={ref} className={className} {...props} />
);
TableCell.displayName = 'TableCell';

export interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableFooter = React.forwardRef<HTMLTableSectionElement, TableFooterProps>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={className} {...props} />
);
TableFooter.displayName = 'TableFooter';
