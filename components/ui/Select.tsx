// Select primitive component; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cx('select focus-ring', className)} {...props} />
  )
);

Select.displayName = 'Select';
