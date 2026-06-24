import type { FormResult } from './types';
import { OutcomeBadge } from '../ui/appkit';

interface FormResultPillsProps {
  results: FormResult[];
  label?: string;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
}

export function FormResultPills({
  results,
  label = 'Recent',
  loading = false,
  loadingText = 'Loading...',
  emptyText = '-',
}: FormResultPillsProps) {
  return (
    <div className="tt-form-recent mt-1">
      <span className="tt-form-recent-label">{label}</span>
      {loading ? (
        <span className="tt-form-recent-empty">{loadingText}</span>
      ) : results.length === 0 ? (
        <span className="tt-form-recent-empty">{emptyText}</span>
      ) : (
        <div className="tt-form-recent-list">
          {results.map((result, index) => (
            <OutcomeBadge
              key={`${result}-${index}`}
              result={result}
              variant="pill"
            />
          ))}
        </div>
      )}
    </div>
  );
}
