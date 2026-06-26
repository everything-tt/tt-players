import { useState, type FormEvent } from 'react';
import { API_BASE_URL } from '../player-shared';

export type FeedbackType = 'bug' | 'feature' | 'general' | 'data_accuracy';

export interface FeedbackPayload {
  name?: string | null;
  email?: string | null;
  message_type: FeedbackType;
  message: string;
  page_path?: string | null;
  page_title?: string | null;
  attachments?: File[];
}

export interface UseSubmitFeedbackResult {
  isSubmitting: boolean;
  submitError: string | null;
  submitSuccess: boolean;
  submit: (payload: FeedbackPayload) => Promise<boolean>;
  reset: () => void;
}

/**
 * Shared feedback submission. Replaces the duplicated fetch/try/catch/success
 * state in AboutTabContent and QuickFeedbackSheet.
 */
export function useSubmitFeedback(): UseSubmitFeedbackResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const submit = async (payload: FeedbackPayload): Promise<boolean> => {
    const message = payload.message.trim();
    if (message.length < 3) {
      setSubmitError('Please enter a message containing at least 3 characters.');
      return false;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const attachments = payload.attachments ?? [];
      const body = attachments.length > 0
        ? (() => {
            const data = new FormData();
            data.set('name', payload.name?.trim() || '');
            data.set('email', payload.email?.trim() || '');
            data.set('message_type', payload.message_type);
            data.set('message', message);
            data.set('page_path', payload.page_path?.trim() || '');
            data.set('page_title', payload.page_title?.trim() || '');
            for (const attachment of attachments) {
              data.append('attachments', attachment);
            }
            return data;
          })()
        : JSON.stringify({
          name: payload.name?.trim() || null,
          email: payload.email?.trim() || null,
          message_type: payload.message_type,
          message,
          page_path: payload.page_path?.trim() || null,
          page_title: payload.page_title?.trim() || null,
        });
      const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: attachments.length > 0 ? undefined : { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      setSubmitSuccess(true);
      return true;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send feedback.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  return { isSubmitting, submitError, submitSuccess, submit, reset };
}

/** Helper to consume a form event and pull out the typed payload. */
export function readFeedbackForm(event: FormEvent<HTMLFormElement>): FeedbackPayload {
  const form = event.currentTarget;
  const data = new FormData(form);
  return {
    name: (data.get('name') as string | null) ?? null,
    email: (data.get('email') as string | null) ?? null,
    message_type: ((data.get('message_type') as FeedbackType) || 'general'),
    message: (data.get('message') as string) || '',
    page_path: (data.get('page_path') as string | null) ?? null,
    page_title: (data.get('page_title') as string | null) ?? null,
    attachments: data.getAll('attachments').filter((item): item is File => item instanceof File && item.size > 0),
  };
}
