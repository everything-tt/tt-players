import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { useMatchJournal, type JournalOutcome } from './hooks/useMatchJournal';
import { usePlayerExtendedStatsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppPageContent,
  EmptyState,
  IconCircle,
  List,
  ListItem,
  SectionHeader,
  SegmentedToggle,
} from './ui/appkit';

const OUTCOME_OPTIONS: Array<{ value: JournalOutcome; label: string }> = [
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
  { value: 'practice', label: 'Practice' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function outcomeLabel(outcome: JournalOutcome): string {
  if (outcome === 'win') return 'Win';
  if (outcome === 'loss') return 'Loss';
  return 'Practice';
}

export function MatchJournalPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const { entries, add, remove } = useMatchJournal(playerId);
  const [matchDate, setMatchDate] = useState(today());
  const [opponent, setOpponent] = useState('');
  const [outcome, setOutcome] = useState<JournalOutcome>('win');
  const [workedWell, setWorkedWell] = useState('');
  const [mainIssue, setMainIssue] = useState('');
  const [nextGoal, setNextGoal] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const playerName = statsQuery.data?.player_name ?? 'Player';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add({
      matchDate,
      opponent: opponent.trim(),
      outcome,
      workedWell: workedWell.trim(),
      mainIssue: mainIssue.trim(),
      nextGoal: nextGoal.trim(),
    });
    setOpponent('');
    setWorkedWell('');
    setMainIssue('');
    setNextGoal('');
    setSavedMessage('Review saved privately on this device.');
  };

  return (
    <TabShellPage>
      <DetailHeader
        title={statsQuery.data ? `${playerName} Journal` : 'Match Journal'}
        backFallback={playerId ? `player/${playerId}` : ''}
      />

      <AppPageContent>
        <section className="tt-player-section">
          <SectionHeader title="Private Match Journal" note="Stored on this device" />
          <List divider="hairline">
            <ListItem
              leading={<IconCircle iconClassName="fa fa-lock" tone="accent" />}
              title="Your notes stay private"
              subtitle="Journal entries are stored in this browser and are not published on player profiles."
              hideChevron
            />
          </List>
        </section>

        <section className="tt-player-section" aria-labelledby="tt-journal-new-entry-title">
          <SectionHeader title="New Review" note={playerName} />
          <form className="tt-feedback-form tt-feedback-form--full" onSubmit={handleSubmit}>
            <div className="tt-feedback-field">
              <label htmlFor="tt-journal-date">Match or session date</label>
              <input
                id="tt-journal-date"
                type="date"
                value={matchDate}
                onChange={(event) => setMatchDate(event.target.value)}
                required
              />
            </div>

            <div className="tt-feedback-field">
              <label htmlFor="tt-journal-opponent">Opponent or session (optional)</label>
              <input
                id="tt-journal-opponent"
                type="text"
                value={opponent}
                onChange={(event) => setOpponent(event.target.value)}
                placeholder="Opponent name or training session"
              />
            </div>

            <div className="tt-feedback-field">
              <label>Outcome</label>
              <SegmentedToggle
                ariaLabel="Choose match or practice outcome"
                value={outcome}
                onChange={setOutcome}
                options={OUTCOME_OPTIONS}
                full
              />
            </div>

            <div className="tt-feedback-field tt-feedback-field--message">
              <label htmlFor="tt-journal-worked">What worked well?</label>
              <textarea
                id="tt-journal-worked"
                value={workedWell}
                onChange={(event) => setWorkedWell(event.target.value)}
                rows={3}
                placeholder="For example: short serve created weak returns"
                required
              />
            </div>

            <div className="tt-feedback-field tt-feedback-field--message">
              <label htmlFor="tt-journal-issue">What was the main issue?</label>
              <textarea
                id="tt-journal-issue"
                value={mainIssue}
                onChange={(event) => setMainIssue(event.target.value)}
                rows={3}
                placeholder="For example: became passive after taking the lead"
                required
              />
            </div>

            <div className="tt-feedback-field tt-feedback-field--message">
              <label htmlFor="tt-journal-goal">One goal for the next session</label>
              <textarea
                id="tt-journal-goal"
                value={nextGoal}
                onChange={(event) => setNextGoal(event.target.value)}
                rows={2}
                placeholder="Keep it specific and achievable"
                required
              />
            </div>

            {savedMessage ? <p className="tt-section-meta" role="status">{savedMessage}</p> : null}

            <div className="tt-feedback-actions">
              <AppButton type="submit" full tone="primary">
                Save Review
              </AppButton>
            </div>
          </form>
        </section>

        <section aria-labelledby="tt-journal-history-title">
          <SectionHeader title="Review History" note={`${entries.length} saved`} />
          {entries.length === 0 ? (
            <div className="tt-player-section">
              <EmptyState
                iconClassName="fa fa-book-open"
                title="No reviews yet"
                message="Add a short review after a match or training session. Your next-session goals will build into a useful improvement record."
              />
            </div>
          ) : (
            entries.map((entry) => (
              <section className="tt-player-section" key={entry.id}>
                <SectionHeader
                  title={entry.opponent ? `vs ${entry.opponent}` : 'Training session'}
                  note={`${displayDate(entry.matchDate)} · ${outcomeLabel(entry.outcome)}`}
                />
                <List divider="hairline">
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-check" tone="success" />}
                    title="What worked"
                    subtitle={entry.workedWell}
                    hideChevron
                  />
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-exclamation" tone="danger" />}
                    title="Main issue"
                    subtitle={entry.mainIssue}
                    hideChevron
                  />
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-bullseye" tone="accent" />}
                    title="Next goal"
                    subtitle={entry.nextGoal}
                    hideChevron
                  />
                </List>
                <div className="tt-feedback-actions mt-3">
                  <AppButton
                    type="button"
                    full
                    tone="outline"
                    onClick={() => remove(entry.id)}
                  >
                    Delete Review
                  </AppButton>
                </div>
              </section>
            ))
          )}
        </section>
      </AppPageContent>
    </TabShellPage>
  );
}
