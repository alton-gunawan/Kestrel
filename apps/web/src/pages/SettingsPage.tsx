import { useState } from 'react';
import { Link } from 'react-router';
import { Text, Button, useToast } from '@astryxdesign/core';
import { Robot, ShieldCheck, ArrowRight, ArrowsClockwise, Info } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useWebmcpStatus } from '../webmcp/status';
import { PageHeader, LoadingState, ErrorState } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

export function SettingsPage() {
  const status = useWebmcpStatus();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  async function resetDemo(): Promise<void> {
    setResetting(true);
    try {
      const result = await api.resetDemo();
      toast({ body: result.message, type: 'info' });
      setTimeout(() => window.location.assign('/'), 600);
    } catch {
      toast({ body: 'Reset failed — check the API is running.', type: 'error' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title="Settings & Integrasi"
        subtitle="Konfigurasi portal pengguna, integrasi WebMCP, dan kontrol demo"
      />

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Robot size={22} color="#1a5cff" />
          <Text size="lg" weight="semibold">
            Integrasi WebMCP (Agen AI Eksternal)
          </Text>
        </div>

        <div className={sx(styles.sectionGap)}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              border: '1px solid #e2e6ec',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Info size={18} style={{ marginTop: 2, flexShrink: 0, color: '#1a5cff' }} />
              <div>
                <Text size="sm" weight="semibold">
                  Bagaimana WebMCP Bekerja?
                </Text>
                <Text size="sm" color="secondary">
                  Aplikasi web ini adalah <strong>portal utama bagi pengguna manusia</strong> untuk
                  mengelola rapat. Protokol <code>document.modelContext</code> mengekspos alat-alat bantu
                  secara aman ke agen AI peramban (browser agent) Anda. Agen hanya dapat membaca konteks
                  dan mengajukan usulan (<em>proposals</em>). Keputusan akhir dan eksekusi tetap 100% di tangan Anda.
                </Text>
              </div>
            </div>
          </div>

          {!status.ready && <LoadingState label="Mendaftarkan WebMCP tools..." />}

          {status.ready && (
            <div className={sx(styles.sectionGap)}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: '1px solid #e2e6ec',
                  borderRadius: 10,
                  background: '#fff',
                }}
              >
                <div>
                  <Text size="sm" weight="semibold">
                    Status Protokol WebMCP
                  </Text>
                  <Text size="2xs" color="secondary">
                    Tersambung melalui <code>window.modelContext</code>
                  </Text>
                </div>
                <div>
                  <span
                    className={sx(
                      status.mode === 'native'
                        ? styles.badgeNative
                        : status.mode === 'polyfill'
                          ? styles.badgePolyfill
                          : styles.badgeUnavailable,
                    )}
                  >
                    {status.mode === 'native'
                      ? '● Native Browser'
                      : status.mode === 'polyfill'
                        ? '● Dev Polyfill'
                        : '● Tidak Tersedia'}
                  </span>
                </div>
              </div>

              <div>
                <Text size="sm" weight="semibold">
                  Tools yang Terdaftar ({status.registeredTools.length}):
                </Text>
                <div className={sx(styles.diffBox)} style={{ marginTop: 6 }}>
                  {status.registeredTools.length === 0 ? 'Tidak ada tools' : status.registeredTools.join('\n')}
                </div>
              </div>

              {status.errors.length > 0 && (
                <ErrorState message={status.errors.join('; ')} errorCode="WEBMCP" />
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  border: '1px solid #e2e6ec',
                  borderRadius: 10,
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ShieldCheck size={20} color="#0a6b3d" />
                  <div>
                    <Text size="sm" weight="semibold">
                      Audit Trail & Transparansi Agen
                    </Text>
                    <Text size="2xs" color="secondary">
                      Lihat riwayat pemanggilan tool yang dilakukan oleh agen AI secara rinci
                    </Text>
                  </div>
                </div>
                <Link to="/activity" style={{ textDecoration: 'none' }}>
                  <Button
                    label="Lihat Log Aktivitas"
                    variant="secondary"
                    size="sm"
                    icon={<ArrowRight />}
                  />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: '1px solid #e2e6ec', paddingTop: 24 }}>
        <Text size="lg" weight="semibold">
          Data Workspace & Golden Demo
        </Text>
        <div className={sx(styles.sectionGap)} style={{ marginTop: 8 }}>
          <Text size="sm" color="secondary">
            Reset akan mengembalikan data uji coba ke set awal (Project Launch, peserta Alex, Sarah,
            Daniel, blockers, serta keputusan rapat).
          </Text>
          <div>
            <Button
              label={resetting ? 'Mereset data...' : 'Reset Data Demo'}
              icon={<ArrowsClockwise />}
              variant="secondary"
              isDisabled={resetting}
              onClick={() => void resetDemo()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
