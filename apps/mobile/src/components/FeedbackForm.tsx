import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { AppButton, SegmentedToggle } from '../ui/appkit';
import { useSubmitFeedback, type FeedbackType } from '../hooks/useSubmitFeedback';
import { readFeedbackForm } from '../hooks/useSubmitFeedback';

export interface FeedbackFormProps {
  variant?: 'quick' | 'full';
  onSubmitted?: () => void;
  contextPath?: string;
}

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 1024 * 1024;

function getPageContext(contextPath?: string) {
  return {
    page_path: contextPath ?? (window.location.pathname + window.location.search + window.location.hash),
    page_title: document.title || null,
  };
}

/**
 * Single feedback form. Replaces the duplicated submit/success/error handling in
 * AboutTabContent (full) and QuickFeedbackSheet (quick).
 */
export function FeedbackForm({ variant = 'quick', onSubmitted, contextPath }: FeedbackFormProps) {
  const { isSubmitting, submitError, submitSuccess, submit, reset } = useSubmitFeedback();
  const [type, setType] = useState<FeedbackType>('general');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (attachments.length === 0) {
      setPreviewUrls([]);
      return;
    }
    const nextUrls = attachments.map((file) => URL.createObjectURL(file));
    setPreviewUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [attachments]);

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
          setAttachments([]);
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
    payload.attachments = attachments;
    Object.assign(payload, getPageContext(contextPath));
    await submit(payload);
  };

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setAttachmentError(null);
    if (files.length === 0) {
      return;
    }
    const nextFiles = [...attachments];
    for (const file of files) {
      if (nextFiles.length >= MAX_ATTACHMENTS) {
        setAttachmentError(`Add up to ${MAX_ATTACHMENTS} screenshots.`);
        break;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setAttachmentError('Choose PNG, JPEG, or WebP images.');
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError('Each image must be 1 MB or smaller.');
        continue;
      }
      nextFiles.push(file);
    }
    setAttachments(nextFiles);
    event.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setAttachmentError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pageContext = getPageContext(contextPath);

  return (
    <form className={`tt-feedback-form tt-feedback-form--${variant}`} onSubmit={handleSubmit}>
      <input type="hidden" name="page_path" value={pageContext.page_path} />
      <input type="hidden" name="page_title" value={pageContext.page_title ?? ''} />
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
            { value: 'data_accuracy', label: 'Data' },
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
          rows={variant === 'quick' ? 3 : 4}
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
          name="attachments"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleAttachment}
        />
        <label className="tt-feedback-attachment-button" htmlFor={`feedback-attachment-${variant}`}>
          <i className="fa fa-paperclip" aria-hidden="true" />
          <span>{attachments.length > 0 ? 'Add another screenshot' : 'Add screenshots'}</span>
          <small>Up to {MAX_ATTACHMENTS}, PNG/JPEG/WebP, 1 MB each</small>
        </label>
        {attachments.length > 0 ? (
          <div className="tt-feedback-attachment-list">
            {attachments.map((attachment, index) => (
              <div className="tt-feedback-attachment-preview" key={`${attachment.name}-${attachment.size}-${index}`}>
                <img src={previewUrls[index]} alt="" />
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
                </div>
                <button type="button" onClick={() => removeAttachment(index)} aria-label={`Remove ${attachment.name}`}>
                  <i className="fa fa-times" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
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
