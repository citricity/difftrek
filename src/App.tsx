/**
 * Diff Trek.
 *
 * The composition root: it wires loading, navigation and the row model
 * together and hands them to the toolbar and the document. All the interesting
 * logic lives in `lib/` and `hooks/`; this file should stay boring.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StartupError } from './components/StartupError.tsx';
import { ChangeBar } from './features/diff/ChangeBar.tsx';
import { DiffDocument } from './features/diff/DiffDocument.tsx';
import { NoteDialogs } from './features/diff/NoteDialogs.tsx';
import { NoteStatus } from './features/diff/NoteStatus.tsx';
import type { NoteDialog } from './features/diff/NoteDialogs.tsx';
import { NavigationControls } from './features/navigation/NavigationControls.tsx';
import { ViewModeToggle } from './features/navigation/ViewModeToggle.tsx';
import { RepositoryHeader } from './features/repository/RepositoryHeader.tsx';
import { GitAliasDialog } from './features/gitAlias/GitAliasDialog.tsx';
import { NotARepository } from './features/gitAlias/NotARepository.tsx';
import { SettingsDialog } from './features/settings/SettingsDialog.tsx';
import { useDiffNavigation } from './hooks/useDiffNavigation.ts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.ts';
import { useAiChangelog } from './hooks/useAiChangelog.ts';
import { useRepositoryDiff } from './hooks/useRepositoryDiff.ts';
import { useRowMetrics } from './hooks/useRowMetrics.ts';
import { useSettings } from './hooks/useSettings.ts';
import { useZoom } from './hooks/useZoom.ts';
import { autoWrapColumn, buildRowModel } from './lib/rows.ts';
import {
  changeOfHunk,
  changesInOrder,
  documentOrder,
  fileOfHunk,
  focusFilter,
  hunksOfChange,
  labelChanges,
  stepChange,
  stepWithinChange,
} from './lib/noteMarkers.ts';
import { followNote } from './lib/openNote.ts';
import type { NoteCursor } from './lib/openNote.ts';
import { throttle } from './lib/throttle.ts';
import type { Direction } from './lib/navigation.ts';
import type { ResolvedHunk, ViewMode } from './types/index.ts';
import styles from './App.module.css';

/**
 * How often a changing viewport width may rebuild the row model, in ms.
 *
 * A resize drag reports a width every frame, and in auto-wrap mode each new
 * column re-lays out every wrapped line in the document. Ten rebuilds a second
 * still tracks the drag closely, and the throttle's trailing call makes sure
 * the width the drag ends on is always the one laid out.
 */
const RESIZE_THROTTLE_MS = 100;

/** One empty object, so a diff with no changelog does not churn the memos. */
const NO_HUNKS: Readonly<Record<string, ResolvedHunk>> = {};

export function App() {
  const {
    state,
    summary,
    ensureLoaded,
    prefetchAround,
    loadFully,
    toggleCollapse,
    revealContext,
  } = useRepositoryDiff();

  /**
   * The AI changelog for what is on screen, if an agent wrote one.
   *
   * Loaded once the file list is in, because a changelog describes a diff and
   * there is nothing to describe before that — and not at all when startup
   * failed, where asking would only add a second error to the first.
   */
  const changelog = useAiChangelog(state.phase === 'ready');
  const hasNotes = changelog.changelog !== null;

  /**
   * The markers need room in the gutter, and auto wrapping reads the gutter's
   * width from the document root — so the flag lives there rather than on a
   * container, and the metrics are re-measured when it changes.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (hasNotes) root.dataset.aiChangelog = 'true';
    else delete root.dataset.aiChangelog;

    return () => {
      delete root.dataset.aiChangelog;
    };
  }, [hasNotes]);

  const metrics = useRowMetrics(hasNotes);
  const settingsState = useSettings();
  const { wrap, wrapLength } = settingsState.settings;

  /**
   * ⌘+ / ⌘− / ⌘0, and the View menu items alongside them. The webview's page
   * zoom does the scaling, so nothing below has to know the interface is any
   * particular size.
   */
  const zoom = useZoom(settingsState);

  /**
   * The layout this window is in, as against the one it opens with.
   *
   * Seeded from the preference when it arrives, but only until the reader
   * touches the toolbar — after that the window is theirs, and a preference
   * landing late must not snatch it back.
   */
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const chosen = useRef(false);

  useEffect(() => {
    if (!chosen.current) setViewMode(settingsState.settings.defaultViewMode);
  }, [settingsState.settings.defaultViewMode]);

  const chooseViewMode = useCallback((mode: ViewMode) => {
    chosen.current = true;
    setViewMode(mode);
  }, []);

  /**
   * The viewport width auto wrapping fits lines to, throttled.
   *
   * `DiffDocument` measures the viewport and reports every change; only this
   * copy is rate-limited, because the document's own virtualiser and pinned
   * bars need the live width to stay correct mid-drag, and they are cheap.
   */
  const [wrapWidth, setWrapWidth] = useState(0);
  const reportViewportWidth = useMemo(
    () => throttle((width: number) => setWrapWidth(width), RESIZE_THROTTLE_MS),
    [],
  );
  useEffect(() => () => reportViewportWidth.cancel(), [reportViewportWidth]);

  /**
   * The column lines wrap at, or null when they do not.
   *
   * In auto mode it is derived from the width, and only a change of whole
   * column reaches the model — most pixels of a drag change nothing and the
   * memo below keeps the model it has. Until the viewport is first measured
   * the stored column stands in, so the first layout is a plausible one.
   */
  const wrapColumn =
    wrap === 'off'
      ? null
      : wrap === 'column'
        ? wrapLength
        : (autoWrapColumn(wrapWidth, metrics, viewMode) ?? wrapLength);

  // Rebuilt whenever a diff arrives, a file is collapsed, or the wrap column
  // changes — which, in auto mode, includes the window being resized.
  // Everything the virtualiser and the scroll model need is derived from here.
  const model = useMemo(
    () => buildRowModel(state.files, metrics, wrapColumn, viewMode),
    [state.files, metrics, wrapColumn, viewMode],
  );

  /**
   * The logical change the reader has narrowed to, if any.
   *
   * Focus changes the sequence, not the document: every hunk stays on screen,
   * and only Previous/Next, the readout and following the scroll are narrowed.
   */
  const [requestedFocus, setFocused] = useState<string | null>(null);

  /**
   * Derived rather than stored, so a changelog that no longer mentions the
   * focused change lets the focus lapse by itself — correcting it in an effect
   * would mean a render with the reader stepping through an empty sequence.
   */
  const focused =
    requestedFocus !== null && changelog.logicalChange(requestedFocus) !== null
      ? requestedFocus
      : null;

  const navigationFilter = useMemo(() => {
    const hunks = changelog.changelog?.hunks;
    if (focused === null || hunks === undefined) return undefined;
    return focusFilter(hunks, focused);
  }, [focused, changelog]);

  const navigation = useDiffNavigation(state.files, ensureLoaded, navigationFilter);

  // Taken out of the object, which `useDiffNavigation` rebuilds every render:
  // a callback keyed on the whole of it is a new callback every render, and
  // `documentNotes` below — which reaches every rendered row — is built from
  // one of those.
  const { goToHunk } = navigation;

  /** Which note dialog is open, if any. */
  const [noteDialog, setNoteDialog] = useState<NoteDialog>(null);

  /**
   * Whether notes open docked — in a sidebar beside the diff or a bar above
   * it — rather than over it.
   *
   * Docked notes are not modal, so the diff can still be read and stepped
   * while one is open — which changes what a few actions should do: going
   * somewhere from the contents list no longer has a reason to close it.
   */
  const notePlacement = settingsState.settings.notePlacement;
  const notesDocked = notePlacement !== 'overlay';

  /**
   * The sidebar's width while its edge is being dragged, and null otherwise.
   *
   * Held here for the length of the drag and saved once when it ends, so the
   * settings file is written for the width the reader settled on rather than
   * for every frame on the way to it.
   */
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null);
  // Dropped as soon as the panel closes: a drag the panel does not outlive —
  // Escape, a reloaded changelog, a change of placement — never reaches its own
  // release, and the width it was passing through would otherwise shadow the
  // stored one for the rest of the session.
  if (noteDialog === null && draggedWidth !== null) setDraggedWidth(null);

  const sidebarWidth = draggedWidth ?? settingsState.settings.noteSidebarWidth;
  const { update: updateSettings } = settingsState;

  /**
   * A drag the panel does not outlive — Escape, a reloaded changelog, a change
   * of placement — never reaches its own release, so the width it was passing
   * through would otherwise shadow the stored one for the rest of the session.
   */
  const resizeSidebar = useCallback(
    (width: number, done: boolean) => {
      if (!done) {
        setDraggedWidth(width);
        return;
      }

      setDraggedWidth(null);
      updateSettings({ noteSidebarWidth: width });
    },
    [updateSettings],
  );

  /**
   * Reveals a hunk that may be in a file nobody has opened yet — the file
   * lands at once and the hunk follows when its diff arrives.
   */
  const revealHunk = useCallback(
    (hunkId: string) => {
      goToHunk(fileOfHunk(hunkId), hunkId);
    },
    [goToHunk],
  );


  /**
   * The logical changes with a hunk on screen, and where the reader sits among
   * them.
   *
   * The current change follows the hunk cursor rather than being stored, so
   * stepping hunks and stepping changes can never disagree about where the
   * reader is. While focused it is the focused change: a hunk serving two
   * intents would otherwise rename the bar out from under the narrowing.
   */
  const notedHunks = changelog.changelog?.hunks ?? NO_HUNKS;

  /**
   * Every hunk the changelog knows, in document order — including those in
   * files whose diffs have not been read yet, so the counter does not climb
   * as the reader scrolls.
   */
  const fileOrder = useMemo(
    () => state.files.map((file) => file.meta.id),
    [state.files],
  );

  const notedOrder = useMemo(
    () => documentOrder(fileOrder, notedHunks),
    [fileOrder, notedHunks],
  );

  const changes = useMemo(
    () => changesInOrder(notedOrder, notedHunks),
    [notedOrder, notedHunks],
  );

  /**
   * A, B, C… in the order the changes first appear on screen.
   *
   * Assigned here rather than in the hook, because a label is a position in
   * the document: taking them from the changelog's table instead would open a
   * diff whose first marker is B.
   */
  const labels = useMemo(
    () =>
      labelChanges(
        changes,
        changelog.changelog?.logicalChanges.map((change) => change.id) ?? [],
      ),
    [changes, changelog],
  );

  const labelOf = useCallback(
    (id: string) => labels.get(id) ?? '?',
    [labels],
  );

  /** The changelog as everything below reads it, labels included. */
  const notes = useMemo(
    () => ({ ...changelog, labelOf }),
    [changelog, labelOf],
  );

  /**
   * The change the reader stepped to, which only the reader can say.
   *
   * A hunk may serve two intents, and the hunk cannot name which of them is
   * being read — so stepping onto a shared hunk would otherwise be read back as
   * the first of its changes, and the second would be unreachable. Kept only
   * while it still covers the hunk in view: scroll away and the bar goes back
   * to naming what is under the cursor.
   */
  const [requestedChange, setRequestedChange] = useState<string | null>(null);

  /**
   * Picking a logical change's letter in the gutter.
   *
   * The cursor moves to the hunk the letter was drawn on, and that change
   * becomes the bar's current one — so a hunk serving two intents shows the
   * one picked rather than the first. Selecting a change and being left
   * standing somewhere else was the confusing half of this (Guy); jumping to
   * the change's first hunk instead would be the other, since it can be in
   * another file, away from the marker just clicked.
   */
  const openChangeFromGutter = useCallback(
    (changeId: string, hunkId?: string) => {
      if (hunkId !== undefined) revealHunk(hunkId);

      setRequestedChange(changeId);
      setNoteDialog({ kind: 'change', changeId });
    },
    [revealHunk],
  );

  const documentNotes = useMemo(() => {
    if (changelog.changelog === null) return null;

    return {
      hunks: changelog.changelog.hunks,
      state: changelog.state,
      labelOf,
      describe: changelog.describe,
      // The cursor goes to the hunk whose icon was clicked, as it does for a
      // change's letter. Without that, Next/Previous — and the note that
      // follows them — carry on from wherever the cursor was left, a hunk
      // behind the one being read (Guy).
      onOpenHunk: (hunkId: string) => {
        revealHunk(hunkId);
        setNoteDialog({ kind: 'hunk', hunkId });
      },
      onOpenChange: openChangeFromGutter,
    };
  }, [changelog, labelOf, openChangeFromGutter, revealHunk]);

  const currentHunk = navigation.current?.hunkId ?? null;

  const hunkChanges =
    currentHunk === null ? undefined : notedHunks[currentHunk]?.logicalChangeIds;
  // Also kept while a step is still landing: a hunk in a file not read yet puts
  // the cursor on that file's header until the diff arrives, and the header
  // covers no change — so without this the bar would go blank mid-step.
  const landing = currentHunk === null && navigation.navigating;
  const stepped =
    requestedChange !== null &&
    (landing || (hunkChanges?.includes(requestedChange) ?? false))
      ? requestedChange
      : null;

  const currentChange =
    focused ?? stepped ?? changeOfHunk(notedHunks, currentHunk);

  /**
   * A docked note follows the reader: step or scroll onto another hunk and a
   * hunk note shows that hunk; move into another change and a change note
   * shows that change.
   *
   * Adjusted during render against the cursor it last saw, rather than in an
   * effect, so the note never paints a frame about the hunk just left. Only
   * when docked — the overlay is modal, and the cursor cannot move under it.
   */
  const [lastCursor, setLastCursor] = useState<NoteCursor>({
    hunkId: currentHunk,
    changeId: currentChange,
  });
  if (lastCursor.hunkId !== currentHunk || lastCursor.changeId !== currentChange) {
    const nextCursor = { hunkId: currentHunk, changeId: currentChange };
    setLastCursor(nextCursor);
    if (notesDocked) {
      setNoteDialog((note) => followNote(note, lastCursor, nextCursor));
    }
  }

  /**
   * The hunks of the change in view, and which of them the reader is on: what
   * the bar's right-hand arrows walk. They stop at either end of the change —
   * moving on to the next change is what the arrows beside the badge are for.
   */
  const changeHunks = useMemo(
    () =>
      currentChange === null
        ? []
        : hunksOfChange(notedOrder, notedHunks, currentChange),
    [currentChange, notedOrder, notedHunks],
  );

  const changeHunk = currentHunk === null ? -1 : changeHunks.indexOf(currentHunk);

  // Nothing to step from while a step is still landing: the cursor is on a
  // file header until the diff arrives, and Next would read that as being off
  // the change and start it again from the top.
  const nextInChange = landing
    ? null
    : stepWithinChange(changeHunks, currentHunk, 'next');
  const previousInChange = landing
    ? null
    : stepWithinChange(changeHunks, currentHunk, 'previous');

  const stepHunkInChange = useCallback(
    (target: string | null) => {
      if (currentChange === null || target === null) return;

      revealHunk(target);
      setRequestedChange(currentChange);
    },
    [currentChange, revealHunk],
  );

  const nextHunkInChange = useCallback(
    () => stepHunkInChange(nextInChange),
    [nextInChange, stepHunkInChange],
  );
  const previousHunkInChange = useCallback(
    () => stepHunkInChange(previousInChange),
    [previousInChange, stepHunkInChange],
  );

  const changePosition = changes.findIndex((entry) => entry.id === currentChange);

  const nextChange = stepChange(
    changes,
    notedOrder,
    fileOrder,
    navigation.current,
    currentChange,
    'next',
  );
  const previousChange = stepChange(
    changes,
    notedOrder,
    fileOrder,
    navigation.current,
    currentChange,
    'previous',
  );


  /**
   * Stepping while focused moves the focus with it, so the arrows read as
   * "the next intent, on its own" rather than silently stepping out of the
   * narrowing the reader asked for.
   */
  const goToChange = useCallback(
    (direction: Direction) => {
      const target = direction === 'next' ? nextChange : previousChange;
      if (target === null) return;

      revealHunk(target.hunkId);
      setRequestedChange(target.id);
      if (focused !== null) setFocused(target.id);
    },
    [focused, nextChange, previousChange, revealHunk],
  );

  const goToNextChange = useCallback(() => goToChange('next'), [goToChange]);
  const goToPreviousChange = useCallback(
    () => goToChange('previous'),
    [goToChange],
  );

  const closeDockedNote = useCallback(() => setNoteDialog(null), []);
  const clearFocus = useCallback(() => setFocused(null), []);
  const escape =
    notesDocked && noteDialog !== null
      ? closeDockedNote
      : focused === null
        ? undefined
        : clearFocus;

  useKeyboardShortcuts({
    onNext: navigation.goNext,
    onPrevious: navigation.goPrevious,
    onNextChange: changes.length === 0 ? undefined : goToNextChange,
    onPreviousChange: changes.length === 0 ? undefined : goToPreviousChange,
    onNextHunkInChange: currentChange === null ? undefined : nextHunkInChange,
    onPreviousHunkInChange: currentChange === null ? undefined : previousHunkInChange,
    // A docked note goes first: it is the nearer thing to escape from, and a
    // second press then clears the focus. A modal dialog handles its own
    // Escape, which the hook already leaves alone.
    onEscape: escape,
    onZoomIn: zoom.zoomIn,
    onZoomOut: zoom.zoomOut,
    onZoomReset: zoom.resetZoom,
  });

  const handleLoadFully = useCallback(
    (fileId: string) => {
      void loadFully(fileId);
    },
    [loadFully],
  );

  /**
   * The notes, wherever Settings puts them: a dialog over the diff, a sidebar
   * beside it (both mounted inside the document's row), or a bar above it
   * (mounted before that row, under the change bar).
   */
  const noteView = changelog.changelog !== null && (
    <NoteDialogs
      open={noteDialog}
      notes={notes}
      order={notedOrder}
      onClose={() => setNoteDialog(null)}
      onOpenChange={(changeId: string, hunkId?: string) => {
        // Asked from a hunk the reader is already on, the answer is the
        // change itself, read in place. Yanking them to the change's first
        // hunk would throw away the one piece of context they had.
        if (hunkId !== undefined) {
          setRequestedChange(changeId);
          setNoteDialog({ kind: 'change', changeId });
          return;
        }

        // Asked from the contents list, where no hunk is in play: the
        // change's first hunk is the only sensible place to land.
        const entry = changes.find((candidate) => candidate.id === changeId);
        if (entry !== undefined) {
          revealHunk(entry.hunkId);
          setRequestedChange(changeId);
        }
        // Beside the diff the list stays open, to be used again: the whole
        // point of docking it is that the code it jumps to is visible.
        if (!notesDocked) setNoteDialog(null);
      }}
      focused={focused}
      currentChange={currentChange}
      onFocus={(changeId) => {
        setFocused(changeId);
        if (!notesDocked) setNoteDialog(null);
      }}
      placement={notePlacement}
      currentHunk={currentHunk}
      onGoToHunk={(hunkId) => {
        revealHunk(hunkId);
        // The note stays on the change: walking its hunks is what the list is
        // for, and `followNote` moves a change note only when the change
        // itself changes.
        setRequestedChange(currentChange);
      }}
      sidebarWidth={sidebarWidth}
      onSidebarResize={resizeSidebar}
    />
  );

  if (state.phase === 'failed' && state.error !== null) {
    return (
      <div className={styles.app}>
        {state.error.kind === 'notARepository' ? (
          // Opening Diff Trek from Applications, outside any repository, lands
          // here — which is exactly when installing git dt is wanted. The
          // screen offers it, and carries the dialog itself.
          <NotARepository />
        ) : (
          <>
            <StartupError error={state.error} />
            <GitAliasDialog />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.toolbar}>
        <RepositoryHeader repository={state.repository} summary={summary} />
        <NavigationControls navigation={navigation} />
        {changelog.changelog !== null && (
          <NoteStatus summary={changelog.changelog.summary} />
        )}
        <ViewModeToggle value={viewMode} onChange={chooseViewMode} />
        <SettingsDialog state={settingsState} />
        <GitAliasDialog />
      </header>

      {changes.length > 0 && (
        <ChangeBar
          label={currentChange === null ? null : labelOf(currentChange)}
          description={
            currentChange === null ? null : changelog.describe(currentChange)
          }
          position={changePosition === -1 ? null : changePosition + 1}
          total={changes.length}
          onHunk={currentHunk !== null}
          focused={focused !== null}
          canGoNext={nextChange !== null}
          canGoPrevious={previousChange !== null}
          hunkPosition={changeHunk === -1 ? null : changeHunk + 1}
          hunkTotal={changeHunks.length}
          canGoNextHunk={nextInChange !== null}
          canGoPreviousHunk={previousInChange !== null}
          onOpenContents={() => setNoteDialog({ kind: 'contents' })}
          onOpenChange={() => {
            if (currentChange !== null) {
              setNoteDialog({ kind: 'change', changeId: currentChange });
            }
          }}
          onNext={goToNextChange}
          onPrevious={goToPreviousChange}
          onNextHunk={nextHunkInChange}
          onPreviousHunk={previousHunkInChange}
          onToggleFocus={() =>
            setFocused(focused === null ? currentChange : null)
          }
        />
      )}

      {notePlacement === 'topbar' && noteView}

      <div className={styles.main}>
        <DiffDocument
          files={state.files}
          model={model}
          metrics={metrics}
          loading={state.phase === 'starting'}
          comparison={
            state.repository === null
              ? undefined
              : (state.repository.comparison?.label ?? null)
          }
          current={navigation.current}
          revealRequest={navigation.revealRequest}
          onSelect={navigation.goTo}
          onScrollToChange={navigation.goTo}
          onSelectFile={navigation.goToFile}
          onVisibleFileChange={prefetchAround}
          onToggleCollapse={toggleCollapse}
          onLoadFully={handleLoadFully}
          onExpandContext={revealContext}
          wrapColumn={wrapColumn}
          viewMode={viewMode}
          onViewportWidthChange={reportViewportWidth}
          notes={documentNotes}
          navigationFilter={navigationFilter}
        />

        {notePlacement !== 'topbar' && noteView}
      </div>
    </div>
  );
}
