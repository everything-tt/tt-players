import { useState } from 'react';
import { AppButton } from './AppButton';
import { BottomSheet } from './BottomSheet';
import { DesignList } from './DesignList';
import { IconCircle, ListItem } from './List';

export type ActionMenuTone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

export interface ActionMenuItem {
  id: string;
  label: string;
  iconClassName: string;
  tone?: ActionMenuTone;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ActionMenuProps {
  label: string;
  title: string;
  items: ActionMenuItem[];
  triggerClassName?: string;
}

export function ActionMenu({
  label,
  title,
  items,
  triggerClassName,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AppButton
        tone="ghost"
        size="s"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i className="fa fa-ellipsis-v" aria-hidden="true" />
      </AppButton>

      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        height="auto"
      >
        <DesignList density="compact" divider="hairline" paginate={false}>
          {items.map((item) => (
            <ListItem
              key={item.id}
              leading={(
                <IconCircle
                  iconClassName={item.iconClassName}
                  tone={item.tone ?? 'neutral'}
                />
              )}
              title={item.label}
              disabled={item.disabled}
              hideChevron
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            />
          ))}
        </DesignList>
      </BottomSheet>
    </>
  );
}
