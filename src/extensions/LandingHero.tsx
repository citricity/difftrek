import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './LandingHero.module.css';

/** Whether the window is out of sight, when nothing should be moving. */
function useHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return hidden;
}

interface Props {
  title: ReactNode;
  intro?: ReactNode;
}

/**
 * The band across the top of a landing screen, holding the screen's title.
 *
 * A landing screen is the first thing someone sees when they open Diff Trek
 * from Applications, so it gets one bold, coloured element — and only one:
 * everything below sits on the plain background, where the controls need to
 * be read. The band runs from A's blue to B's orange, and two sets of rings,
 * one from each side, cross in the middle: two things compared, without a
 * word.
 *
 * Drawn with gradients and transforms only, so nothing is fetched and it
 * costs next to nothing. The rings drift slowly, and stop for anyone who has
 * asked for reduced motion and whenever the window is hidden.
 */
export function LandingHero({ title, intro }: Props) {
  const hidden = useHidden();

  return (
    <header className={styles.band} data-paused={hidden || undefined}>
      <div className={`${styles.rings} ${styles.a}`} aria-hidden="true" />
      <div className={`${styles.rings} ${styles.b}`} aria-hidden="true" />
      <h1 className={styles.title}>{title}</h1>
      {intro !== undefined && <p className={styles.intro}>{intro}</p>}
    </header>
  );
}
