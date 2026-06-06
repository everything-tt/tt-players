import { cx } from '../utils/cx';

export interface AppBackdropProps {
  isActive: boolean;
  onClick: () => void;
  zIndex?: number;
  className?: string;
}

export function AppBackdrop({ isActive, onClick, zIndex, className }: AppBackdropProps) {
  return (
    <div
      className={cx('menu-hider', isActive && 'menu-active', className)}
      onClick={onClick}
      style={zIndex !== undefined ? { zIndex } : undefined}
      aria-hidden={isActive ? undefined : true}
    />
  );
}
