import React from 'react';
import { cn } from '../../utils/cn';

const Button = React.forwardRef(({
  className,
  variant = 'primary',
  size = 'md',
  children,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  ...props
}, ref) => {
  const baseClasses = 'btn focus-ring';
  
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    ghost: 'btn-ghost',
    danger: 'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5',
    success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5',
  };
  
  const sizes = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };
  
  const LoadingSpinner = () => (
    <svg
      className="animate-spin -ml-1 mr-2 h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
  
  return (
    <button
      ref={ref}
      className={cn(
        baseClasses,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        disabled && 'opacity-50 cursor-not-allowed transform-none hover:transform-none',
        loading && 'cursor-wait',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoadingSpinner />}
      {leftIcon && !loading && <span className="mr-2">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="ml-2">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';

export default Button; 