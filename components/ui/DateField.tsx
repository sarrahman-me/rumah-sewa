// DateField input primitive; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

export interface DateFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  ({ className, type = 'date', ...props }, ref) => (
    <input ref={ref} type={type} className={cx('input focus-ring', className)} {...props} />
  )
);

DateField.displayName = 'DateField';
