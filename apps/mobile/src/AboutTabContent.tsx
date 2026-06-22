import { useState, type FormEvent } from 'react';
import { SegmentedToggle } from './components/SegmentedToggle';
import { API_BASE_URL } from './player-shared';

type FeedbackType = 'bug' | 'feature' | 'general';

export function AboutTabContent() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleResetData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete all saved favorites, selected leagues, and settings? This cannot be undone.'
    );
    if (confirmed) {
      localStorage.clear();
      sessionStorage.clear();

      if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
      }

      window.location.replace('/#/tabs/home');
      window.location.reload();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 3) {
      setSubmitError('Please enter a message containing at least 3 characters.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim() || null,
          message_type: feedbackType,
          message: message.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      setSubmitSuccess(true);
      setName('');
      setEmail('');
      setFeedbackType('general');
      setMessage('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      {/* ── About Section ── */}
      <div className="card card-style" style={{ padding: '20px', margin: '0 0 20px 0', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>About TT Players</h2>
        <p style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '16px', opacity: 0.85 }}>
          TT Players is a companion app for UK table tennis players. It gathers match results and player statistics from different league websites (including TT Leagues and Table Tennis 365) so you can easily search for players, check league tables, analyze head-to-head records, and follow tournament results in one clean, simple app.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', fontWeight: '500' }}>
            TT Leagues
          </span>
          <span style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', fontWeight: '500' }}>
            Table Tennis 365
          </span>
          <span style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px', fontWeight: '500' }}>
            Sport80 Grand Prix
          </span>
        </div>
      </div>



      {/* ── Feedback Form Section ── */}
      <div className="card card-style" style={{ padding: '20px', margin: '0 0 20px 0', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>Send Feedback</h3>
        <p style={{ fontSize: '12px', opacity: 0.6, marginBottom: '16px' }}>
          Have a feature request, found a bug, or just want to say hi? Send us a message below.
        </p>

        {submitSuccess ? (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ fontSize: '40px', color: '#4caf50', marginBottom: '12px' }}>
              <i className="far fa-check-circle" />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Feedback Submitted!</h4>
            <p style={{ fontSize: '13px', opacity: 0.8, marginBottom: '16px' }}>
              Thank you for your response. Your feedback has been saved and will help improve TT Players.
            </p>
            <button
              type="button"
              className="btn btn-s btn-full rounded-s bg-highlight text-uppercase font-900"
              style={{ padding: '8px 16px', fontSize: '11px', display: 'inline-block', width: 'auto' }}
              onClick={() => setSubmitSuccess(false)}
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {submitError && (
              <div style={{ padding: '12px', background: 'rgba(244, 67, 54, 0.15)', borderLeft: '3px solid #f44336', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', color: '#f44336' }}>
                {submitError}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' }}>
                Message Type
              </label>
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

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="feedback-name" style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' }}>
                Name (Optional)
              </label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'inherit',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="feedback-email" style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' }}>
                Email (Optional)
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'inherit',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="feedback-message" style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' }}>
                Message
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                required
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'inherit',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-m btn-full rounded-s bg-highlight text-uppercase font-900 shadow-s w-100"
              style={{
                border: 'none',
                padding: '10px',
                fontSize: '12px',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Sending...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>

      {/* ── Saved Data Reset Section ── */}
      <div className="card card-style" style={{ padding: '20px', margin: '0 0 20px 0', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>Saved Data</h3>
        <p style={{ fontSize: '13px', lineHeight: '1.5', marginBottom: '16px', opacity: 0.85 }}>
          Your favorites, selected leagues, and active settings are stored locally on this device.
        </p>
        <button
          type="button"
          onClick={handleResetData}
          className="btn btn-m btn-full rounded-s text-uppercase font-900 shadow-s w-100"
          style={{
            background: '#dc3545',
            border: 'none',
            color: '#fff',
            padding: '10px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Clear Saved Data
        </button>
      </div>
    </div>
  );
}
