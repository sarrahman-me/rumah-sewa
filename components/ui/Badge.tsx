// Badge primitive component; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

type BadgeVariant = 'neutral' | 'success' | 'danger' | 'warning' | 'warningSoft';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClassMap: Record<BadgeVariant, string> = {
  neutral: '',
  success: 'badge-success',
  danger: 'badge-danger',
  warning: 'badge-warning',
  warningSoft: 'badge-warning-soft',
};

export function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cx('badge', variantClassMap[variant], className)} {...props} />;
}
