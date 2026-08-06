import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';
import { Switch } from './ui/switch';

export interface AppSwitchProps extends Omit<ComponentPropsWithoutRef<typeof Switch>, 'onCheckedChange'> {
  id: string;
  containerClassName?: string;
  onCheckedChange?: (checked: boolean) => void;
}

/** Radix-backed shadcn switch with the stable TT visual contract. */
export function AppSwitch({
  id,
  containerClassName,
  className,
  checked,
  onCheckedChange,
  ...props
}: AppSwitchProps) {
  return (
    <Switch
      id={id}
      className={cn('tt-switch', containerClassName, className)}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...props}
    />
  );
}
