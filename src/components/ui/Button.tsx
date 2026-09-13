import React from 'react';
import { BUTTON } from './controlStyles';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent';
  /**
   * 'md' is the standard action padding. 'none' adds no padding or text size,
   * for a button that sets its own in className.
   *
   * The base px-4 py-2 used to be present beside whatever padding a caller
   * passed, and which applied depended on the order Tailwind wrote its rules,
   * not on the order of the classes: a larger override (py-4) won and a smaller
   * one silently lost — InlineAddInput's px-3 py-1 never applied.
   */
  size?: 'md' | 'none';
  glow?: boolean;
}

const SIZE = { md: 'px-4 py-2', none: '' } as const;

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  glow = false,
  className = '',
  ...props
}) => (
  <button
    className={`${BUTTON[variant]} ${SIZE[size]} rounded font-medium disabled:pointer-events-none ${
      glow ? 'shadow-glow-cyan' : ''
    } ${className}`}
    {...props}
  >
    {children}
  </button>
);
