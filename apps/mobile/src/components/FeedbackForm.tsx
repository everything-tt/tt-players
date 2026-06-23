import { type FormEvent, useState } from 'react';
import { AppButton, SegmentedToggle } from '../ui/appkit';
import { useSubmitFeedback, type FeedbackType } from '../hooks/useSubmitFeedback';
import { readFeedbackForm } from '../hooks/useSubmitFeedback';

export interface FeedbackFormProps {
  variant?: 'quick' | 'full';
  onSubmitted?: () => void;
}

/**
 * Single feedback form. Replaces the duplicated submit/success/error handling in
 * AboutTabContent (full) and QuickFeedbackSheet (quick).
 */
export function FeedbackForm({ variant = 'quick', onSubmitted }: FeedbackFormProps) {
  const { isSubmitting, submitError, submitSuccess, submit, reset } = useSubmitFeedback();
  const [type, setType] = useState<FeedbackType>('general');

  if (submitSuccess) {
    return (
      <div className="tt-feedback-success" role="status" aria-live="polite">
        <i className="far fa-check-circle" />
        <h5>Feedback sent</h5>
        <p>Thanks — your note has been saved and will help improve TT Players.</p>
        <AppButton onClick={() => { reset(); setType('general'); }} tone="primary">
          {variant === 'full' ? 'Send another message' : 'Done'}
        </AppButton>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = readFeedbackForm(event);
    payload.message_type = type;
    const ok = await submit(payload);
    if (ok) onSubmitted?.();
  };

  return (
    <form className="tt-feedback-form" onSubmit={handleSubmit}>
      <div className="tt-feedback-field">
        <label htmlFor={`feedback-type-${variant}`}>Type</label>
        <SegmentedToggle
          ariaLabel="Choose feedback type"
          value={type}
          onChange={setType}
          options={[
            { value: 'general', label: 'General' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
          ]}
          full
        />
        <input type="hidden" name="message_type" value={type} />
      </div>

      {variant === 'full' ? (
        <div className="tt-feedback-field">
          <label htmlFor={`feedback-name-${variant}`}>Name (optional)</label>
          <input id={`feedback-name-${variant}`} type="text" name="name" placeholder="Enter your name" />
        </div>
      ) : null}

      <div className="tt-feedback-field tt-feedback-field--message">
        <label htmlFor={`feedback-message-${variant}`}>Message</label>
        <textarea
          id={`feedback-message-${variant}`}
          name="message"
          placeholder={variant === 'quick' ? 'What should we fix or improve?' : 'Type your message here...'}
          rows={4}
          required
        />
      </div>

      <div className="tt-feedback-field">
        <label htmlFor={`feedback-email-${variant}`}>Email (optional)</label>
        <input id={`feedback-email-${variant}`} type="email" name="email" placeholder="For follow-up if needed" />
      </div>

      {submitError ? <p className="tt-feedback-error" role="alert">{submitError}</p> : null}

      <div className="tt-feedback-actions">
        <AppButton type="submit" full loading={isSubmitting} tone="primary">
        {isSubmitting ? 'Sending…' : 'Send feedback'}
        </AppButton>
      </div>
    </form>
  );
}
