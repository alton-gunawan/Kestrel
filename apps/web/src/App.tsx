/**
 * MeetingOps web app shell: Astryx AppShell + SideNav + routes.
 * React Router 8 (library mode via BrowserRouter in main.tsx).
 */
import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router';
import {
  AppShell,
  SideNav,
  SideNavItem,
  Badge,
  Text,
  Spinner,
  Theme,
  useToast,
} from '@astryxdesign/core';
import {
  CalendarCheck,
  CircleNotch,
  CheckSquare,
  FolderOpen,
  Gavel,
  ListChecks,
  Robot,
  ShieldCheck,
  Sparkle,
} from '@phosphor-icons/react';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { WebmcpStatusProvider, useWebmcpStatus } from './webmcp/status';
import { OverviewPage } from './pages/OverviewPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';
import { ProposalsPage } from './pages/ProposalsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ActionsPage } from './pages/ActionsPage';
import { AgentActivityPage } from './pages/AgentActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import { sx } from './ui/sx';
import * as styles from './styles/app.styles';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: <Sparkle /> },
  { to: '/meetings', label: 'Meetings', icon: <CalendarCheck /> },
  { to: '/proposals', label: 'Proposals', icon: <ShieldCheck /> },
  { to: '/actions', label: 'Actions', icon: <CheckSquare /> },
  { to: '/projects', label: 'Projects', icon: <FolderOpen /> },
  { to: '/activity', label: 'Agent activity', icon: <Robot /> },
  { to: '/settings', label: 'Settings', icon: <ListChecks /> },
];

function WebmcpBadge(): React.ReactNode {
  const status = useWebmcpStatus();
  if (!status.ready) {
    return (
      <span className={sx(styles.badgePending)}>
        <CircleNotch className={sx(styles.spin)} /> WebMCP…
      </span>
    );
  }
  if (status.mode === 'native') {
    return (
      <span className={sx(styles.badgeNative)} title={`Native document.modelContext — ${status.registeredTools.length} tools registered`}>
        <Robot /> WebMCP native · {status.registeredTools.length} tools
      </span>
    );
  }
  if (status.mode === 'polyfill') {
    return (
      <span className={sx(styles.badgePolyfill)} title="Dev polyfill (D-013) — native WebMCP interoperability not verified in this browser">
        <Robot /> WebMCP polyfill · {status.registeredTools.length} tools
      </span>
    );
  }
  return (
    <span className={sx(styles.badgeUnavailable)} title={status.errors.join('; ') || 'document.modelContext unavailable'}>
      <Robot /> WebMCP unavailable
    </span>
  );
}

export default function App(): React.ReactNode {
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data: { user: { displayName: string } | null }) => {
        if (cancelled) return;
        if (!data.user) {
          // Demo mode (D-010): sign in as the demo user automatically.
          fetch('/api/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ userId: 'usr_alex' }),
          })
            .then((r) => r.json())
            .then((created: { user?: { displayName: string } }) => {
              if (!cancelled) {
                setUser(created.user ? { displayName: created.user.displayName } : null);
                setSessionReady(true);
              }
            })
            .catch(() => {
              if (!cancelled) setSessionReady(true);
            });
          return;
        }
        setUser({ displayName: data.user.displayName });
        setSessionReady(true);
      })
      .catch(() => {
        if (!cancelled) setSessionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sessionReady) {
    return (
      <div className={sx(styles.bootScreen)}>
        <Spinner size="lg" label="Starting MeetingOps" />
      </div>
    );
  }

  return (
    <WebmcpStatusProvider>
    <Theme theme={neutralTheme} mode="system">
      <AppShell variant="section" contentPadding={0}>
        <div>
          <div className={sx(styles.topBar)}>
            <Text size="lg" weight="semibold">
              MeetingOps
            </Text>
            <Text size="sm" color="secondary">
              meetings → execution · agent-proposed, human-approved
            </Text>
            <div className={sx(styles.topBarEnd)}>
              <WebmcpBadge />
              {user !== null && <Badge label={user.displayName} />}
            </div>
          </div>
        </div>
        <div className={sx(styles.shellBody)}>
          <SideNav aria-label="MeetingOps navigation">
            {NAV_ITEMS.map((item) => (
              <SideNavItem
                key={item.to}
                label={item.label}
                icon={item.icon}
                href={item.to}
                isSelected={
                  item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
                }
                onClick={(e) => {
                  e.preventDefault();
                  window.history.pushState({}, '', item.to);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
              />
            ))}
            <SideNavItem label="Decisions" icon={<Gavel />} href="/decisions" isSelected={location.pathname.startsWith('/decisions')} onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/decisions'); window.dispatchEvent(new PopStateEvent('popstate')); }} />
          </SideNav>
          <main className={sx(styles.mainArea)} id="main">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/proposals" element={<ProposalsPage />} />
              <Route path="/actions" element={<ActionsPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectsPage />} />
              <Route path="/decisions" element={<AgentActivityPage tab="decisions" />} />
              <Route path="/activity" element={<AgentActivityPage tab="activity" />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AppShell>
    </Theme>
    </WebmcpStatusProvider>
  );
}

export { useToast, NavLink };
