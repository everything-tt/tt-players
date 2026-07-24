import { BottomSheet } from '../ui/appkit';

interface ShareLinks {
  facebook: string;
  twitter: string;
  linkedin: string;
  whatsapp: string;
  mail: string;
}

interface ShareSheetProps {
  isOpen: boolean;
  links: ShareLinks;
  onClose: () => void;
}

const SHARE_OPTIONS = [
  { key: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f' },
  { key: 'twitter', label: 'Twitter', icon: 'fab fa-twitter' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'fab fa-linkedin-in' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp' },
  { key: 'mail', label: 'Email', icon: 'fa fa-envelope' },
] as const;

export function ShareSheet({ isOpen, links, onClose }: ShareSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Share TT Players" height="auto" className="tt-share-sheet">
      <nav className="tt-share-sheet__list" aria-label="Share options">
        {SHARE_OPTIONS.map((option) => {
          const href = links[option.key];
          const isMail = option.key === 'mail';
          return (
            <a
              key={option.key}
              className="tt-share-sheet__row"
              href={href}
              target={isMail ? undefined : '_blank'}
              rel={isMail ? undefined : 'noopener noreferrer'}
              onClick={onClose}
            >
              <i className={option.icon} aria-hidden="true" />
              <span>{option.label}</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </a>
          );
        })}
      </nav>
    </BottomSheet>
  );
}
