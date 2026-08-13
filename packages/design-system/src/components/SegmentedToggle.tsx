import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/utils';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Visual style: pill (default), tab (underline), chip (square). */
  variant?: 'pill' | 'tab' | 'chip';
  /** Control density. Compact is intended for mixed-control toolbars. */
  density?: 'default' | 'compact';
  /** Stretch to fill the container width (buttons flex:1). */
  full?: boolean;
  className?: string;
}

/** Radix roving-focus toggle group presented with radio semantics. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'pill',
  density = 'default',
  full = false,
  className,
}: SegmentedToggleProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null);

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
    const nextOption = options[nextIndex];
    if (!nextOption) return;
    onChange(nextOption.value);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <ToggleGroup
      ref={groupRef}
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onChange(nextValue as T);
      }}
      variant="unstyled"
      size="unstyled"
      className={cn(
        'tt-segmented',
        `tt-segmented--${variant}`,
        density === 'compact' && 'tt-segmented--compact',
        full && 'tt-segmented--full',
        className,
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={moveSelection}
      loop
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            variant="unstyled"
            size="unstyled"
            role="radio"
            aria-checked={selected}
            className={cn('tt-segmented__btn', selected && 'tt-segmented__btn--active')}
          >
            {option.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
