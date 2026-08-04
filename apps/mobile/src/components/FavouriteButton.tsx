import { AppButton, cx } from '../ui/appkit';

export interface FavouriteButtonProps {
  saved: boolean;
  onToggle: () => void;
  /** Full pill (label "Save"/"Saved") or bare icon. */
  size?: 'sm' | 'icon';
  className?: string;
}

/**
 * Single favourite/save control for list rows, event cards, and hero actions.
 */
export function FavouriteButton({ saved, onToggle, size = 'sm', className }: FavouriteButtonProps) {
  return (
    <AppButton
      tone={saved ? 'primary' : 'outline'}
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
