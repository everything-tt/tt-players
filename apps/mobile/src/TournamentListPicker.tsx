import {
  AppButton,
  BottomSheet,
  DesignList,
  IconCircle,
  ListItem,
} from './ui/appkit';

type TournamentListScope = 'all' | 'saved' | 'submitted';

interface TournamentListPickerProps {
  isOpen: boolean;
  value: TournamentListScope;
  showSubmissions: boolean;
  onClose: () => void;
  onChange: (scope: TournamentListScope) => void;
  onPost?: () => void;
}

const OPTIONS: Array<{
  value: TournamentListScope;
  iconClassName: string;
  title: string;
  subtitle: string;
}> = [
  {
    value: 'all',
    iconClassName: 'fa fa-list-ul',
    title: 'All tournaments',
    subtitle: 'Browse every published tournament',
  },
  {
    value: 'saved',
    iconClassName: 'fa fa-heart',
    title: 'Saved',
    subtitle: 'Tournaments you’ve saved',
  },
  {
    value: 'submitted',
    iconClassName: 'fa fa-upload',
    title: 'My submissions',
    subtitle: 'Track tournaments you’ve posted',
  },
];

export function TournamentListPicker({
  isOpen,
  value,
  showSubmissions,
  onClose,
  onChange,
  onPost,
}: TournamentListPickerProps) {
  const options = showSubmissions
    ? OPTIONS
    : OPTIONS.filter((option) => option.value !== 'submitted');

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Tournament list"
      description="Choose which tournaments you want to see."
      height="min(72dvh, 560px)"
    >
      {onPost ? (
        <div className="tt-tournament-list-picker__post">
          <AppButton
            tone="outline"
            size="sm"
            full
            onClick={onPost}
          >
            <i className="fa fa-plus" aria-hidden="true" />
            Post a tournament
          </AppButton>
        </div>
      ) : null}

      <DesignList
        density="comfortable"
        surface="flat"
        textWrap="multiline"
        divider="hairline"
        paginate={false}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <ListItem
              key={option.value}
              leading={(
                <IconCircle
                  iconClassName={option.iconClassName}
                  tone={selected ? 'accent' : 'neutral'}
                />
              )}
              title={option.title}
              subtitle={option.subtitle}
              active={selected}
              trailing={selected ? <i className="fa fa-check" aria-hidden="true" /> : null}
              onClick={() => onChange(option.value)}
            />
          );
        })}
      </DesignList>
    </BottomSheet>
  );
}
