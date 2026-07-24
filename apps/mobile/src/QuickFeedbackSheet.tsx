import { BottomSheet } from './ui/appkit';
import { FeedbackForm } from './components/FeedbackForm';

interface QuickFeedbackSheetProps {
  onClose: () => void;
}

/**
 * Quick feedback bottom sheet built on the shared modal and form primitives.
 */
export function QuickFeedbackSheet({ onClose }: QuickFeedbackSheetProps) {
  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Send a quick note"
      eyebrow="Feedback"
      height="min(680px, 92dvh)"
      className="tt-feedback-quick-sheet"
      autoFocus
    >
      <FeedbackForm variant="quick" onSubmitted={onClose} />
    </BottomSheet>
  );
}
