// Card primitive component set; formatting only, no behavior changes.
import * as React from 'react';
import { cx } from './utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className, ...props }: CardProps) {
  return <div className={cx('card', padded && 'card-pad', className)} {...props} />;
}

export interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardSection({ className, ...props }: CardSectionProps) {
  return <div className={cx('card-pad', className)} {...props} />;
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return <h2 className={cx('section-title', className)} {...props} />;
}
