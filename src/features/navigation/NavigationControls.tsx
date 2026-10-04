import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DiffNavigation } from '../../hooks/useDiffNavigation.ts';
import { useT } from '../../i18n/index.ts';
import styles from './NavigationControls.module.css';

interface Props {
  navigation: DiffNavigation;
}

/**
 * Previous/Next Change.
 *
 * These step through every change in the repository, not just the file in
 * view. The position readout makes that scope visible: "12 / 87" counts hunks
 * across the whole diff.
 */
export function NavigationControls({ navigation }: Props) {
  const { position, total, canGoNext, canGoPrevious, navigating } = navigation;
  const t = useT();

  return (
    <div className={styles.controls}>
      <span
        className={`${styles.position} ${navigating ? styles.busy : ''}`}
        aria-live="polite"
      >
        {total === 0 ? '' : `${position ?? '–'} / ${total}`}
      </span>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.button}
          onClick={navigation.goPrevious}
          disabled={!canGoPrevious}
          title={t('navigation.previous.title', { key: 'p' })}
          aria-label={t('navigation.previous')}
        >
          <ChevronUp size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={navigation.goNext}
          disabled={!canGoNext}
          title={t('navigation.next.title', { key: 'n' })}
          aria-label={t('navigation.next')}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
