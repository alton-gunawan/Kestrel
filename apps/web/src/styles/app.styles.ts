/**
 * Shared product styles (StyleX). Product layer sits above Astryx base layer.
 */
import * as stylex from '@stylexjs/stylex';

export const bootScreen = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
});

export const topBar = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    width: '100%',
  },
});

export const topBarEnd = stylex.create({
  root: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
});

export const shellBody = stylex.create({
  root: {
    display: 'flex',
    minHeight: 0,
    flex: 1,
    width: '100%',
  },
});

export const mainArea = stylex.create({
  root: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    padding: '20px 24px 48px',
  },
});

export const spin = stylex.create({
  root: {
    animation: 'kestrel-spin 1s linear infinite',
    display: 'inline-block',
  },
});

export const badgeNative = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#0a6b3d',
    background: '#e3f6ec',
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
});

export const badgePolyfill = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#8a5a00',
    background: '#fdf1d7',
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
});

export const badgeUnavailable = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#8a1f2b',
    background: '#fbe4e7',
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
});

export const badgePending = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#5a6472',
    background: '#eef1f5',
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
});

/* Page primitives */
export const page = stylex.create({
  root: { maxWidth: 980 },
});

export const pageHeader = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
});

export const sectionGap = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
});

export const cardRow = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    border: '1px solid #e2e6ec',
    borderRadius: 10,
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
});

export const cardRowMain = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
});

export const metaRow = stylex.create({
  root: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
});

export const statGrid = stylex.create({
  root: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
});

export const statCard = stylex.create({
  root: {
    border: '1px solid #e2e6ec',
    borderRadius: 12,
    padding: '14px 16px',
    background: '#fff',
  },
});

export const statValue = stylex.create({
  root: { fontSize: 28, fontWeight: 700, lineHeight: 1.15 },
});

export const statLabel = stylex.create({
  root: { fontSize: 13, color: '#5a6472' },
});

export const statusChip = (status: string): string => {
  void status;
  return '';
};

export const toolbar = stylex.create({
  root: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
});

export const diffBox = stylex.create({
  root: {
    background: '#f6f8fa',
    border: '1px solid #e2e6ec',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12.5,
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
  },
});

export const verifyList = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' },
});

export const verifyPass = stylex.create({ root: { color: '#0a6b3d', fontWeight: 600 } });
export const verifyFail = stylex.create({ root: { color: '#b3261e', fontWeight: 600 } });

export const twoColumn = stylex.create({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
    gap: 20,
    alignItems: 'start',
  },
});

export const tabBar = stylex.create({
  root: { display: 'flex', gap: 4, borderBottom: '1px solid #e2e6ec', marginBottom: 16 },
});

export const tab = stylex.create({
  root: {
    padding: '8px 14px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: '#5a6472',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  selected: {
    color: '#1a1d23',
    fontWeight: 600,
    borderBottomColor: '#1a5cff',
  },
});

export const detailGrid = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: 8 },
});

export const muted = stylex.create({
  root: { color: '#5a6472' },
});
