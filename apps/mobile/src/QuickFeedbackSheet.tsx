import { useState, type FormEvent } from 'react';
import { SegmentedToggle } from './components/SegmentedToggle';
import { API_BASE_URL } from './player-shared';

type FeedbackType = 'bug' | 'feature' | 'general';

interface QuickFeedbackSheetProps {
  onClose: () => void;
}

export function QuickFeedbackSheet({ onClose }: QuickFeedbackSheetProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();

    if (trimmedMessage.length < 3) {
      setSubmitError('Please enter at least 3 characters.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: null,
          email: email.trim() || null,
          message_type: feedbackType,
          message: trimmedMessage,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `HTTP ${response.status}`);
      }

      setSubmitSuccess(true);
      setFeedbackType('general');
      setMessage('');
      setEmail('');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="menu-hider menu-active" onClick={onClose} style={{ zIndex: 998 }} />
      <div className="menu menu-box-bottom rounded-m menu-active tt-feedback-sheet" style={{ zIndex: 999 }}>
        <div className="tt-feedback-shell">
          <div className="tt-feedback-header">
            <div>
              <p className="tt-picker-eyebrow">Feedback</p>
              <h4 className="tt-feedback-title">Send a quick note</h4>
            </div>
            <a href="#" onClick={(event) => { event.preventDefault(); onClose(); }} className="tt-picker-close" aria-label="Close feedback form">
              <i className="fa fa-times-circle font-20" />
            </a>
          </div>

          {submitSuccess ? (
            <div className="tt-feedback-success">
              <i className="far fa-check-circle" />
              <h5>Feedback sent</h5>
              <p>Thanks. Your note has been saved.</p>
              <button type="button" className="tt-feedback-primary" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <form className="tt-feedback-form" onSubmit={handleSubmit}>
              <div className="tt-feedback-field">
                <label>Type</label>
                <SegmentedToggle
                  ariaLabel="Choose feedback type"
                  value={feedbackType}
                  onChange={setFeedbackType}
                  options={[
                    { value: 'general', label: 'General' },
                    { value: 'bug', label: 'Bug' },
                    { value: 'feature', label: 'Feature' },
                  ]}
                  className="w-100"
                />
              </div>

              <div className="tt-feedback-field">
                <label htmlFor="quick-feedback-message">Message</label>
                <textarea
                  id="quick-feedback-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What should we fix or improve?"
                  rows={4}
                  required
                />
              </div>

              <div className="tt-feedback-field">
                <label htmlFor="quick-feedback-email">Email (optional)</label>
                <input
                  id="quick-feedback-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="For follow-up if needed"
                />
              </div>

              {submitError ? (
                <p className="tt-feedback-error">{submitError}</p>
              ) : null}

              <button type="submit" className="tt-feedback-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send feedback'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
