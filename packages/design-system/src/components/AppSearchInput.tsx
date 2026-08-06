import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

export interface AppSearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  iconClassName?: string;
  containerClassName?: string;
}

export function AppSearchInput({
  iconClassName = 'fa fa-search',
  containerClassName,
  className,
  ...props
}: AppSearchInputProps) {
  return (
    <label className={cn('tt-app-search-input', containerClassName)} data-slot="search-field">
      <i className={iconClassName} aria-hidden="true" />
      <Input type="text" unstyled className={className} {...props} />
    </label>
  );
}

export function AppSearchBox({
  iconClassName = 'fa fa-search ms-1',
  containerClassName,
  className,
  ...props
}: AppSearchInputProps) {
  return (
    <div className={cn('search-box search-dark rounded-pill border-0 bg-theme mb-3', containerClassName)} data-slot="search-field">
      <i className={iconClassName} aria-hidden="true" />
      <Input type="text" unstyled className={cn('border-0', className)} {...props} />
    </div>
  );
}
