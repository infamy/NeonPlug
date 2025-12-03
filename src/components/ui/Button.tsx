import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  glow = false,
  className = '',
  ...props
}) => {
  const baseClasses = 'px-4 py-2 rounded font-medium transition-all duration-200';
  
  const variantClasses = {
    primary: 'bg-neon-cyan text-dark-charcoal hover:bg-opacity-90',
    secondary: 'bg-electric-purple text-white hover:bg-opacity-90',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  
  const glowClasses = glow ? 'shadow-glow-cyan' : '';
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${glowClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

