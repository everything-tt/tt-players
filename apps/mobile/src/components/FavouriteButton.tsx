import { AppButton, cx } from '../ui/appkit';

export interface FavouriteButtonProps {
  saved: boolean;
  onToggle: () => void;
  /** Full pill (label "Save"/"Saved") or bare icon. */
  size?: 'sm' | 'icon';
  tone?: 'primary' | 'outline' | 'ghost';
  className?: string;
}

/**
 * Single favourite/save control for list rows, event cards, and hero actions.
 */
export function FavouriteButton({ saved, onToggle, size = 'sm', tone, className }: FavouriteButtonProps) {
  const effectiveTone = tone ?? (size === 'icon' ? (saved ? 'ghost' : 'outline') : (saved ? 'primary' : 'outline'));

  return (
    <AppButton
      tone={effectiveTone}
      size="sm"
      iconOnly={size === 'icon'}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
      className={cx('tt-favourite-button', `tt-favourite-button--${size}`, saved && 'tt-favourite-button--saved', className)}
    >
      <i className={saved ? 'fa fa-heart' : 'far fa-heart'} aria-hidden="true" />
      {size === 'sm' ? <span>{saved ? 'Saved' : 'Save'}</span> : null}
    </AppButton>
  );
}
