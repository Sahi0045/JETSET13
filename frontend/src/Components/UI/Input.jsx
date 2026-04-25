import React from 'react';
import { cn } from '../../utils/cn';

const Input = React.forwardRef(({
  className,
  type = 'text',
  size = 'md',
  variant = 'default',
  error = false,
  errorMessage,
  label,
  placeholder,
  leftIcon,
  rightIcon,
  disabled = false,
  required = false,
  ...props
}, ref) => {
  const baseClasses = 'form-input';
  
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3',
    lg: 'px-5 py-4 text-lg',
  };
  
  const variants = {
    default: 'border-gray-300 focus:border-primary-500 focus:ring-primary-500',
    filled: 'bg-gray-50 border-gray-200 focus:bg-white focus:border-primary-500 focus:ring-primary-500',
    outlined: 'border-2 border-gray-300 focus:border-primary-500 focus:ring-primary-500',
  };
  
  const errorClasses = error 
    ? 'border-error-500 focus:border-error-500 focus:ring-error-500' 
    : '';
  
  const disabledClasses = disabled 
    ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
    : '';
  
  const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{leftIcon}</span>
          </div>
        )}
        
        <input
          ref={ref}
          id={inputId}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            baseClasses,
            sizes[size],
            variants[variant],
            errorClasses,
            disabledClasses,
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            className
          )}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{rightIcon}</span>
          </div>
        )}
      </div>
      
      {error && errorMessage && (
        <p className="form-error">{errorMessage}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input; 