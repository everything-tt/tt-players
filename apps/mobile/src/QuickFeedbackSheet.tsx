import { BottomSheet } from './ui/appkit';
import { FeedbackForm } from './components/FeedbackForm';

interface QuickFeedbackSheetProps {
  onClose: () => void;
}

/**
 * Quick feedback bottom sheet. Now built on the shared BottomSheet + FeedbackForm
 * primitives, replacing the hand-rolled tt-feedback-shell + duplicated submit logic.
 */
export function QuickFeedbackSheet({ onClose }: QuickFeedbackSheetProps) {
  return (
    <BottomSheet isOpen onClose={onClose} title="Send a quick note" eyebrow="Feedback" height="min(680px, 92vh)" className="tt-feedback-quick-sheet">
      <FeedbackForm variant="quick" onSubmitted={onClose} />
    </BottomSheet>
  );
}
