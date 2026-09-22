/**
 * The dialogs the gutter markers and the change bar open.
 *
 * Native `<dialog>`, as Settings and the file navigator are: `showModal` gives
 * the focus trap, the backdrop, the inert background and Escape for nothing,
 * and `CLAUDE.md` asks for native elements wherever they are practical.
 *
 * Or, when Settings says so, the same content in a sidebar beside the diff.
 * A note is about code, and a dialog in the middle of the window covers the
 * code it is about. The sidebar is deliberately not modal: the diff stays
 * scrollable and clickable, and clicking another marker swaps what it shows
 * rather than having to close it first. Escape is handled by the app's
 * shortcuts there, since there is no `<dialog>` to raise `close`.
 */

import { useEffect, useRef, useState } from 'react';
import { CornerDownRight, Crosshair, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { AiChangelogView } from '../../hooks/useAiChangelog.ts';
import type { NotePlacement } from '../../types/index.ts';
import { issueUrl } from '../../lib/issues.ts';
import {
  changesInOrder,
  fileOfHunk,
  hunksOfChange,
  laneColour,
  ungroupedHunks,
} from '../../lib/noteMarkers.ts';
import styles from './NoteDialogs.module.css';

/** What the reader has open, if anything. */
export type NoteDialog =
  | { kind: 'hunk'; hunkId: string }
  | { kind: 'change'; changeId: string }
  | { kind: 'contents' }
  | null;

interface Props {
  open: NoteDialog;
  notes: AiChangelogView;
  /** Every hunk in the document, in order — what the contents list counts. */
  order: readonly string[];
  onClose: () => void;
  onOpenChange: (changeId: string, hunkId?: string) => void;
  /** The change Previous/Next is currently narrowed to, if any. */
  focused?: string | null;
  onFocus?: (changeId: string) => void;
  /** The change the reader is in, marked in the contents list. */
  currentChange?: string | null;
  /** Over the diff as a modal dialog, or beside it in a sidebar. */
  placement?: NotePlacement;
}

export function NoteDialogs({
  open,
  notes,
  order,
  onClose,
  onOpenChange,
  focused = null,
  onFocus,
  currentChange = null,
  placement = 'overlay',
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Re-run on a change of placement as well: switching to the overlay while a
  // note is open mounts a fresh `<dialog>` that has not been shown yet.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    // jsdom has neither `showModal` nor `close`; the `open` attribute stands in
    // for them there, exactly as the file navigator and the alias dialog do.
    if (open !== null && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }

    if (open === null && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  }, [open, placement]);

  const content = (
    <>
      {open?.kind === 'hunk' && (
        <HunkDialog
          hunkId={open.hunkId}
          notes={notes}
          onClose={onClose}
          onOpenChange={onOpenChange}
        />
      )}

      {open?.kind === 'contents' && (
        <ContentsDialog
          notes={notes}
          order={order}
          current={currentChange}
          focused={focused}
          onClose={onClose}
          onGoTo={(changeId) => {
            onOpenChange(changeId);
          }}
          onFocus={onFocus}
        />
      )}

      {open?.kind === 'change' && (
        <ChangeDialog changeId={open.changeId} notes={notes} onClose={onClose} />
      )}
    </>
  );

  if (placement === 'sidebar') {
    // Absent rather than empty when nothing is open, so the diff gets the
    // whole width back.
    if (open === null) return null;

    return (
      <aside className={styles.sidebar} aria-labelledby={TITLE_ID}>
        {content}
      </aside>
    );
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      // Named by whichever header is rendered inside it. Without this the
      // dialog announces itself as nothing at all.
      aria-labelledby={TITLE_ID}
      onClose={onClose}
    >
      {content}
    </dialog>
  );
}

/** One dialog is open at a time, so one id is enough to name it. */
const TITLE_ID = 'note-dialog-title';

function Header({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return (
    <header className={styles.header}>
      <h2 id={TITLE_ID} className={styles.title}>
        {title}
      </h2>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Close"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </header>
  );
}

/**
 * Why one hunk exists.
 *
 * The logical changes it belongs to come first, as an accordion — a reader
 * scanning several hunks wants the intent, and the same intent repeats across
 * hunks, so it collapses to one line. The hunk's own reason is below it.
 */
function HunkDialog({
  hunkId,
  notes,
  onClose,
  onOpenChange,
}: {
  hunkId: string;
  notes: AiChangelogView;
  onClose: () => void;
  onOpenChange: (changeId: string, hunkId?: string) => void;
}) {
  const hunk = notes.hunk(hunkId);
  const changes = hunk?.logicalChangeIds ?? [];

  return (
    <>
      <Header title={fileOfHunk(hunkId)} onClose={onClose} />

      <div className={styles.body}>
        {changes.length > 0 && (
          <section className={styles.changes}>
            {changes.map((id) => (
              <ChangeAccordion
                key={id}
                changeId={id}
                hunkId={hunkId}
                notes={notes}
                // One change on its own has nothing to choose between, so it
                // opens; several stay closed until the reader picks.
                initiallyOpen={changes.length === 1}
                onOpenChange={onOpenChange}
              />
            ))}
          </section>
        )}

        <section className={styles.reason}>
          {hunk === null || hunk.reasons.length === 0 ? (
            <p className={styles.muted}>
              No reason was recorded for this hunk. It may be a change nobody
              meant to make.
            </p>
          ) : (
            <>
              {hunk.partial && (
                <p className={styles.warning}>
                  <span aria-hidden="true">!</span> This hunk has changed around
                  the note since it was written. What follows is about the lines
                  it was written for; the rest of the hunk is unaccounted for.
                </p>
              )}

              {hunk.ambiguous && (
                <p className={styles.warning}>
                  <span aria-hidden="true">!</span> Identical hunks were given
                  different reasons, so both are shown.
                </p>
              )}

              {hunk.reasons.map((reason) => (
                <p key={reason} className={styles.text}>
                  {reason}
                </p>
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Every logical change in the diff, in the order they appear.
 *
 * Stepping is how a reader walks a diff; this is how they see its shape before
 * they start — "this branch is five intents" is a sentence the arrows alone can
 * never say, because you only learn the shape by walking all of it.
 */
function ContentsDialog({
  notes,
  order,
  current,
  focused,
  onClose,
  onGoTo,
  onFocus,
}: {
  notes: AiChangelogView;
  order: readonly string[];
  current: string | null;
  focused: string | null;
  onClose: () => void;
  onGoTo: (changeId: string) => void;
  onFocus?: (changeId: string) => void;
}) {
  const hunks = notes.changelog?.hunks ?? {};
  const changes = changesInOrder(order, hunks);
  const ungrouped = ungroupedHunks(order, hunks);

  return (
    <>
      <Header title="Logical changes" onClose={onClose} />

      <div className={styles.body}>
        <ol className={styles.contents}>
          {changes.map(({ id }) => {
            const label = notes.labelOf(id);
            const covered = hunksOfChange(order, hunks, id).length;

            return (
              <li key={id} className={styles.entry}>
                <button
                  type="button"
                  className={styles.entryButton}
                  aria-current={id === current ? 'true' : undefined}
                  onClick={() => onGoTo(id)}
                >
                  <span
                    className={styles.entryLabel}
                    style={{ '--note-lane': laneColour(label) } as CSSProperties}
                  >
                    {label}
                  </span>
                  <span className={styles.entryText}>
                    {notes.describe(id)}
                    <span className={styles.entryMeta}>
                      {covered} hunk{covered === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>

                {onFocus !== undefined && (
                  <button
                    type="button"
                    className={`${styles.entryFocus} ${
                      id === focused ? styles.entryFocusOn : ''
                    }`}
                    aria-pressed={id === focused}
                    title="Step through this change only"
                    aria-label={`Focus logical change ${label}`}
                    onClick={() => onFocus(id)}
                  >
                    <Crosshair size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {ungrouped > 0 && (
          <p className={styles.muted}>
            {ungrouped} hunk{ungrouped === 1 ? '' : 's'} belong
            {ungrouped === 1 ? 's' : ''} to no logical change. The arrows step
            past {ungrouped === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>
    </>
  );
}

/** One logical change, collapsed to a line until the reader wants it. */
function ChangeAccordion({
  changeId,
  notes,
  initiallyOpen,
  hunkId,
  onOpenChange,
}: {
  changeId: string;
  hunkId: string;
  notes: AiChangelogView;
  initiallyOpen: boolean;
  onOpenChange: (changeId: string, hunkId?: string) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const change = notes.logicalChange(changeId);
  const description = change?.description ?? 'Logical change';

  return (
    <div className={styles.accordion}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span
          className={styles.label}
          style={
            { '--note-lane': laneColour(notes.labelOf(changeId)) } as CSSProperties
          }
        >
          {notes.labelOf(changeId)}
        </span>
        <span className={open ? styles.fullLine : styles.oneLine}>
          {description}
        </span>
      </button>

      {open && (
        <div className={styles.accordionBody}>
          <button
            type="button"
            className={styles.jump}
            onClick={() => onOpenChange(changeId, hunkId)}
          >
            <CornerDownRight size={13} aria-hidden="true" />
            Open this change
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One logical change, in full: its description and the issues it answers.
 *
 * Nothing else. Walking the change — its hunks, one after another — is done
 * from the change bar, where the code stays in view; a dialog over the diff is
 * the wrong place for anything the reader does while looking at the code. What
 * a dialog is for is the description, which the bar can only cut short.
 */
function ChangeDialog({
  changeId,
  notes,
  onClose,
}: {
  changeId: string;
  notes: AiChangelogView;
  onClose: () => void;
}) {
  const change = notes.logicalChange(changeId);
  const tracker = notes.changelog?.issueTracker ?? null;
  // Defaulted rather than indexed directly: a backend that omits an empty list
  // would otherwise take the whole window down on a click.
  const issues = change?.associatedIssues ?? [];

  return (
    <>
      <Header
        title={
          // The letter first and in the change's own colour, as the gutter and
          // the contents list both draw it — the title names the mark the
          // reader clicked rather than describing it.
          <span className={styles.changeTitle}>
            <span
              className={styles.titleLabel}
              style={
                { '--note-lane': laneColour(notes.labelOf(changeId)) } as CSSProperties
              }
            >
              {notes.labelOf(changeId)}
            </span>
            Logical change
          </span>
        }
        onClose={onClose}
      />

      <div className={styles.body}>
        <p className={styles.text}>
          {change?.description ?? 'This change is not in the changelog’s table.'}
        </p>

        {issues.length > 0 && (
          <p className={styles.issues}>
            {issues.map((issue) => {
              const href = issueUrl(tracker, issue);

              return href === null ? (
                <span key={issue} className={styles.issue}>
                  #{issue}
                </span>
              ) : (
                <a
                  key={issue}
                  className={styles.issue}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  #{issue}
                </a>
              );
            })}
          </p>
        )}
      </div>
    </>
  );
}
