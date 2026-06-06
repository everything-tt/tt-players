import type { InputHTMLAttributes } from 'react';
import { cx } from '../utils/cx';

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
    <label className={cx('tt-players-search-input', containerClassName)}>
      <i className={iconClassName} aria-hidden="true" />
      <input type="text" className={className} {...props} />
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
    <div className={cx('search-box search-dark rounded-pill border-0 bg-theme mb-3', containerClassName)}>
      <i className={iconClassName} />
      <input type="text" className={cx('border-0', className)} {...props} />
    </div>
  );
}
