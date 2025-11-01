// Button primitive component; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline' | 'primaryOutline';
type ButtonSize = 'default' | 'sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  outline: 'btn-outline',
  primaryOutline: 'btn-primary-outline',
};

const sizeClassMap: Record<ButtonSize, string> = {
  default: '',
  sm: 'btn-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'default', className, type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cx('btn focus-ring', variantClassMap[variant], sizeClassMap[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
