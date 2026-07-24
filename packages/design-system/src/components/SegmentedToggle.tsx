import { useRef, type KeyboardEvent } from 'react';

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
  /** Stretch to fill the container width (buttons flex:1). */
  full?: boolean;
  className?: string;
}

/**
 * Shared segmented control with radio semantics and arrow-key navigation.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'pill',
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
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % options.length;
    }
    const nextOption = options[nextIndex];
    if (!nextOption) return;
    onChange(nextOption.value);
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <div
      ref={groupRef}
      className={`tt-segmented tt-segmented--${variant}${full ? ' tt-segmented--full' : ''}${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={moveSelection}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`tt-segmented__btn${selected ? ' tt-segmented__btn--active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
