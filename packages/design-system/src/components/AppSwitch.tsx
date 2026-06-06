import type { InputHTMLAttributes } from 'react';
import { cx } from '../utils/cx';

export interface AppSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string;
  containerClassName?: string;
}

export function AppSwitch({
  id,
  containerClassName,
  className,
  checked,
  onChange,
  ...props
}: AppSwitchProps) {
  return (
    <div className={cx('custom-control small-switch ios-switch', containerClassName)}>
      <input
        type="checkbox"
        className={cx('ios-input', className)}
        id={id}
        checked={checked}
        onChange={onChange}
        {...props}
      />
      <label className="custom-control-label" htmlFor={id} />
    </div>
  );
}
