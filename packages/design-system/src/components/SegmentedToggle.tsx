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
 * Single segmented control for the whole app. Replaces the local
 * apps/mobile SegmentedToggle plus the hand-rolled tt-players-search-scope-toggle
 * and tt-picker-tabs.
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
  return (
    <div
      className={`tt-segmented tt-segmented--${variant}${full ? ' tt-segmented--full' : ''}${className ? ' ' + className : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={`tt-segmented__btn${value === option.value ? ' tt-segmented__btn--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
