/**
 * StyleX className helper: converts stylex.create() style objects into a
 * className string for plain DOM elements and Astryx className props.
 */
import * as stylex from '@stylexjs/stylex';

// stylex.create() returns opaque class-marked values; accept them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StylexStyle = Record<string, any>;
type StylexStyles = Record<string, StylexStyle>;

export function sx(
  ...styles: Array<StylexStyles | StylexStyle | false | null | undefined>
): string | undefined {
  const resolved = styles
    .filter((s): s is Exclude<typeof s, false | null | undefined> => s !== false && s !== null && s !== undefined)
    .map((s) => ('root' in s && typeof (s as StylexStyles).root === 'object' ? (s as StylexStyles).root : s));
  return stylex.props(...(resolved as never[])).className;
}
