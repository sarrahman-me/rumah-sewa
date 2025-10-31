import * as React from "react";
import { cx } from "./utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cx("input focus-ring", className)}
      {...props}
    />
  ),
);

Input.displayName = "Input";
