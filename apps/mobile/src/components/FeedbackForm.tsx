import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(attachment);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [attachment]);

  if (submitSuccess) {
    return (
      <div className="tt-feedback-success" role="status" aria-live="polite">
        <i className="far fa-check-circle" />
        <h5>Feedback sent</h5>
        <p>Thanks — your note has been saved and will help improve TT Players.</p>
        <AppButton onClick={() => {
          if (variant === 'quick' && onSubmitted) {
            onSubmitted();
            return;
          }
          reset();
          setType('general');
          setAttachment(null);
        }} tone="primary">
          {variant === 'full' ? 'Send another message' : 'Done'}
        </AppButton>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = readFeedbackForm(event);
    payload.message_type = type;
    payload.attachment = attachment;
    await submit(payload);
  };

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAttachmentError(null);
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setAttachment(null);
      setAttachmentError('Choose a PNG, JPEG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      setAttachment(null);
      setAttachmentError('Image must be 1 MB or smaller.');
      event.target.value = '';
      return;
    }
    setAttachment(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

      <div className="tt-feedback-attachment">
        <input
          ref={fileInputRef}
          id={`feedback-attachment-${variant}`}
          className="tt-feedback-file-input"
          type="file"
          name="attachment"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleAttachment}
        />
        {attachment && previewUrl ? (
          <div className="tt-feedback-attachment-preview">
            <img src={previewUrl} alt="" />
            <div>
              <strong>{attachment.name}</strong>
              <span>{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
            </div>
            <button type="button" onClick={removeAttachment} aria-label={`Remove ${attachment.name}`}>
              <i className="fa fa-times" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <label className="tt-feedback-attachment-button" htmlFor={`feedback-attachment-${variant}`}>
            <i className="fa fa-paperclip" aria-hidden="true" />
            <span>Add screenshot</span>
            <small>PNG, JPEG or WebP, up to 1 MB</small>
          </label>
        )}
      </div>

      {attachmentError ? <p className="tt-feedback-error" role="alert">{attachmentError}</p> : null}
      {submitError ? <p className="tt-feedback-error" role="alert">{submitError}</p> : null}

      <div className="tt-feedback-actions">
        <AppButton type="submit" full loading={isSubmitting} tone="primary">
        {isSubmitting ? 'Sending…' : 'Send feedback'}
        </AppButton>
      </div>
    </form>
  );
}
