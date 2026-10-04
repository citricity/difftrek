/**
 * Messages with markup inside them.
 *
 * A sentence such as "Run {command} in a repository" has to be translated
 * whole — word order differs between languages, so it cannot be glued
 * together from fragments — yet `{command}` is a `<code>` element, not text.
 * `t` leaves placeholders it was given no argument for exactly as they are,
 * so the translated string still carries `{command}`, and this puts the
 * element there.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';

export function rich(
  text: string,
  parts: Readonly<Record<string, ReactNode>>,
): ReactNode {
  const pieces = text.split(/(\{[^{}]*\})/g);

  return pieces.map((piece, index) => {
    const name = /^\{([^{}]*)\}$/.exec(piece)?.[1];
    if (name !== undefined && Object.prototype.hasOwnProperty.call(parts, name)) {
      return <Fragment key={index}>{parts[name]}</Fragment>;
    }
    return piece === '' ? null : <Fragment key={index}>{piece}</Fragment>;
  });
}
