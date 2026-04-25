import React from 'react';
import { cn } from '../../utils/cn';

const Card = React.forwardRef(({
  className,
  variant = 'default',
  padding = 'md',
  hover = false,
  interactive = false,
  children,
  ...props
}, ref) => {
  const baseClasses = 'card';
  
  const variants = {
    default: '',
    elevated: 'shadow-medium',
    outlined: 'border-2 border-gray-200 shadow-none',
    glass: 'glass-card',
  };
  
  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  };
  
  const hoverEffects = {
    lift: 'card-hover',
    interactive: 'card-interactive',
  };
  
  return (
    <div
      ref={ref}
      className={cn(
        baseClasses,
        variants[variant],
        paddings[padding],
        hover && hoverEffects.lift,
        interactive && hoverEffects.interactive,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

// Card sub-components
const CardHeader = React.forwardRef(({
  className,
  children,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn('mb-4 pb-4 border-b border-gray-100', className)}
    {...props}
  >
    {children}
  </div>
));

CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({
  className,
  children,
  ...props
}, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold text-gray-900', className)}
    {...props}
  >
    {children}
  </h3>
));

CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({
  className,
  children,
  ...props
}, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-gray-600 mt-1', className)}
    {...props}
  >
    {children}
  </p>
));

CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({
  className,
  children,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn('', className)}
    {...props}
  >
    {children}
  </div>
));

CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({
  className,
  children,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn('mt-6 pt-4 border-t border-gray-100 flex items-center justify-between', className)}
    {...props}
  >
    {children}
  </div>
));

CardFooter.displayName = 'CardFooter';

// Export all components
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter }; 