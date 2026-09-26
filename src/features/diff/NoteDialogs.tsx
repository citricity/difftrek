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

import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerDownRight, Crosshair, X } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { AiChangelogView } from '../../hooks/useAiChangelog.ts';
import {
  DEFAULT_SETTINGS,
  MAX_NOTE_SIDEBAR_WIDTH,
  MIN_NOTE_SIDEBAR_WIDTH,
} from '../../types/index.ts';
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

import type { NoteDialog } from '../../lib/openNote.ts';

// Defined beside `followNote`, which is what decides how it changes; exported
// from here too because this is where everything else reaches for it.
export type { NoteDialog };

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
  /** The sidebar's width in CSS pixels. Unused in the overlay. */
  sidebarWidth?: number;
  /**
   * Called as the sidebar's edge is dragged, with `done` false while the drag
   * is under way and true once — on release, a key press or a reset — for the
   * width to keep. Saving on every frame of a drag would write the settings
   * file sixty times a second.
   */
  onSidebarResize?: (width: number, done: boolean) => void;
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
  sidebarWidth = DEFAULT_SETTINGS.noteSidebarWidth,
  onSidebarResize,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  /**
   * What had focus when the note opened.
   *
   * `showModal` restores focus to it for the overlay; docked, nothing does,
   * and closing the panel from its own button would otherwise drop focus on
   * the body and restart tabbing at the top of the app.
   */
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open !== null && !wasOpen.current) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    wasOpen.current = open !== null;
  }, [open]);

  const closeDocked = useCallback(() => {
    const back = opener.current;
    onClose();
    // Gone if the row it was drawn on has been virtualised away since.
    if (back !== null && back.isConnected) back.focus();
  }, [onClose]);

  const close = placement === 'overlay' ? onClose : closeDocked;

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
          // Keyed so a note that follows the cursor starts afresh on each hunk:
          // the accordion's open state and the scroll position belong to the
          // hunk they were set on.
          key={open.hunkId}
          hunkId={open.hunkId}
          notes={notes}
          onClose={close}
          onOpenChange={onOpenChange}
        />
      )}

      {open?.kind === 'contents' && (
        <ContentsDialog
          notes={notes}
          order={order}
          current={currentChange}
          focused={focused}
          onClose={close}
          onGoTo={(changeId) => {
            onOpenChange(changeId);
          }}
          onFocus={onFocus}
        />
      )}

      {open?.kind === 'change' && (
        <ChangeDialog
          key={open.changeId}
          changeId={open.changeId}
          notes={notes}
          onClose={close}
        />
      )}
    </>
  );

  // Docked either way, absent rather than empty when nothing is open, so the
  // diff gets its whole width or height back.
  if (placement !== 'overlay' && open === null) return null;

  if (placement === 'topbar') {
    // Across the top, under the change bar. A fixed share of the window, and
    // the body scrolls within it — a long description must not push the diff
    // off the screen. Not resizable: the split view it exists for is short of
    // width, not of height.
    return (
      <aside className={styles.topbar} aria-labelledby={TITLE_ID}>
        {content}
      </aside>
    );
  }

  if (placement === 'sidebar') {
    return (
      <aside
        className={styles.sidebar}
        aria-labelledby={TITLE_ID}
        style={{ '--note-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        {onSidebarResize !== undefined && (
          <SidebarEdge width={sidebarWidth} onResize={onSidebarResize} />
        )}
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

/** How far one arrow key press moves the sidebar's edge, in CSS pixels. */
const KEYBOARD_STEP = 16;

/**
 * The sidebar's left edge, dragged to resize it.
 *
 * A separator in ARIA terms, so it is focusable and the arrow keys move it,
 * and a double click puts it back to the default. The width is clamped to
 * half the space the sidebar shares with the diff as well as to the stored
 * range: CSS caps it there anyway, and a stored width wider than what is
 * drawn would leave a dead zone at the start of the next drag.
 */
function SidebarEdge({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number, done: boolean) => void;
}) {
  const drag = useRef<{
    x: number;
    width: number;
    last: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** The width the arrow keys have moved to but not yet saved. */
  const keyed = useRef<number | null>(null);

  const clamp = (element: HTMLElement, wanted: number) => {
    // Zero where nothing has been laid out (jsdom), which must not read as
    // "no room at all".
    const shared = element.closest('aside')?.parentElement?.clientWidth || Infinity;
    const upper = Math.min(MAX_NOTE_SIDEBAR_WIDTH, Math.floor(shared / 2));
    // In a window with less than twice the minimum to give, the half-width cap
    // is the tighter of the two and wins: a floor above the space available
    // would report a width nothing is ever drawn at.
    const lower = Math.min(MIN_NOTE_SIDEBAR_WIDTH, upper);
    return Math.round(Math.max(lower, Math.min(upper, wanted)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // No text selection sweeping across the diff while the edge moves.
    event.preventDefault();
    // jsdom has no pointer capture, and a browser refuses it for a pointer
    // that is no longer down. Neither is a reason to lose the drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer events still arrive; only capture outside the element is
      // lost.
    }

    // Measured rather than taken from `width`, so a drag starts from what is
    // on screen even where the window has capped it.
    const drawn =
      event.currentTarget.closest('aside')?.getBoundingClientRect().width ?? width;
    drag.current = { x: event.clientX, width: drawn, last: drawn, moved: false };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null) return;

    // The edge is on the sidebar's left, so moving left makes it wider.
    const next = clamp(event.currentTarget, start.width + start.x - event.clientX);
    if (next === start.last) return;

    start.last = next;
    start.moved = true;
    onResize(next, false);
  };

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null) return;

    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // A click that moved nothing saves nothing. The drag starts from the width
    // as drawn, which the window may have capped below the stored one, so
    // committing it here would quietly shrink a width the reader never touched.
    if (start.moved) onResize(start.last, true);
  };

  /**
   * Arrow keys move the edge like a drag: every press is shown, and the width
   * is saved when the key comes back up. A held-down arrow repeats about
   * thirty times a second, and each of those saves would be a write to the
   * settings file.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowLeft'
        ? KEYBOARD_STEP
        : event.key === 'ArrowRight'
          ? -KEYBOARD_STEP
          : 0;
    if (step === 0) return;

    event.preventDefault();
    keyed.current = clamp(event.currentTarget, width + step);
    onResize(keyed.current, false);
  };

  const onKeyUp = () => {
    if (keyed.current === null) return;

    const settled = keyed.current;
    keyed.current = null;
    onResize(settled, true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the notes sidebar"
      aria-valuemin={MIN_NOTE_SIDEBAR_WIDTH}
      aria-valuemax={MAX_NOTE_SIDEBAR_WIDTH}
      aria-valuenow={width}
      title="Drag to resize · double-click to reset"
      tabIndex={0}
      className={`${styles.edge} ${dragging ? styles.edgeDragging : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      // The panel can close under a drag — Escape, a reloaded changelog — and
      // the release then never arrives at the element that started it.
      onLostPointerCapture={finish}
      onDoubleClick={() => onResize(DEFAULT_SETTINGS.noteSidebarWidth, true)}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onKeyUp}
    />
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
