import { useState } from 'react';
import { Link } from 'react-router';
import {
  Text,
  Button,
  Dialog,
  DialogHeader,
  TextInput,
  TextArea,
  useToast,
} from '@astryxdesign/core';
import { Plus } from '@phosphor-icons/react';
import { api, ApiError } from '../api/client';
import type { MeetingDetail as MeetingDetailEntity } from '../api/client';
import { useAsync, formatDateTime } from '../ui/helpers';
import { PageHeader, LoadingState, ErrorState, EmptyStateInline, StatusChip } from '../ui/components';
import { sx } from '../ui/sx';
import * as styles from '../styles/app.styles';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'attention', label: 'Needs attention' },
];

export function MeetingsPage() {
  const toast = useToast();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startAt, setStartAt] = useState(() => {
    const nextDay = new Date(Date.now() + 86400000);
    nextDay.setMinutes(0, 0, 0);
    return nextDay.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [projectId, setProjectId] = useState('prj_launch');
  const [participants, setParticipants] = useState('usr_alex, usr_sarah');

  const state = useAsync<MeetingDetailEntity[]>(async () => {
    const result = await api.meetings({ filter: activeFilter });
    return result.meetings;
  }, [activeFilter]);

  async function handleCreateMeeting(): Promise<void> {
    if (!title.trim()) {
      toast({ body: 'Judul rapat wajib diisi', type: 'error' });
      return;
    }

    setCreating(true);
    try {
      const parsedParticipants = participants
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((id, index) => ({
          participantId: id,
          role: (index === 0 ? 'organizer' : 'required') as 'organizer' | 'required',
        }));

      if (parsedParticipants.length === 0) {
        parsedParticipants.push({ participantId: 'usr_alex', role: 'organizer' });
      }

      let parsedStart = startAt;
      try {
        parsedStart = new Date(startAt).toISOString();
      } catch {
        parsedStart = new Date().toISOString();
      }

      const res = await api.createMeeting({
        title: title.trim(),
        purpose: purpose.trim(),
        projectId: projectId.trim() || null,
        startAt: parsedStart,
        durationMinutes: parseInt(durationMinutes, 10) || 30,
        participants: parsedParticipants,
      });

      toast({ body: `Rapat "${res.meeting.title}" berhasil dijadwalkan!`, type: 'info' });
      setIsCreateOpen(false);
      setTitle('');
      setPurpose('');
      state.reload();
    } catch (err) {
      toast({
        body: err instanceof ApiError ? `${err.code}: ${err.message}` : 'Gagal membuat rapat',
        type: 'error',
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={sx(styles.page)}>
      <PageHeader
        title="Meetings"
        subtitle="Jadwal & Ruang Kerja Rapat Pengguna"
        actions={
          <Button
            label="New meeting"
            icon={<Plus />}
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
          />
        }
      />

      <div className={sx(styles.toolbar)}>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            label={f.label}
            variant={activeFilter === f.key ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveFilter(f.key)}
          />
        ))}
      </div>

      {state.loading && <LoadingState label="Loading meetings" />}
      {state.error !== null && (
        <ErrorState message={state.error} errorCode={state.errorCode} onRetry={state.reload} />
      )}
      {state.data !== null &&
        (state.data.length === 0 ? (
          <EmptyStateInline
            message={
              activeFilter === 'all'
                ? "Belum ada rapat. Klik 'New meeting' di kanan atas untuk membuat jadwal rapat baru."
                : `Tidak ada rapat untuk filter "${FILTERS.find((f) => f.key === activeFilter)?.label}".`
            }
          />
        ) : (
          <div className={sx(styles.sectionGap)}>
            {state.data
              .slice()
              .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
              .map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} style={{ textDecoration: 'none' }}>
                  <div className={sx(styles.cardRow)}>
                    <div className={sx(styles.cardRowMain)}>
                      <Text weight="semibold">{m.title}</Text>
                      <Text size="sm" color="secondary">
                        {formatDateTime(m.startAt)} · {m.durationMinutes} min ·{' '}
                        {m.participants.map((p) => p.participantId).join(', ')}
                        {m.projectId !== null ? ` · ${m.projectId}` : ''}
                      </Text>
                    </div>
                    <StatusChip status={m.status} />
                  </div>
                </Link>
              ))}
          </div>
        ))}

      <Dialog isOpen={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
        {isCreateOpen && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 380 }}>
            <DialogHeader title="Schedule a new meeting" />
            <Text size="sm" color="secondary">
              Buat rapat langsung ke sistem Kestrel Anda.
            </Text>

            <TextInput
              label="Meeting Title"
              placeholder="Contoh: Sprint Review & Retrospective"
              value={title}
              onChange={(val: string) => setTitle(val)}
              isRequired
            />

            <TextInput
              label="Waktu Mulai (YYYY-MM-DDTHH:mm)"
              placeholder="2026-09-03T10:00"
              value={startAt}
              onChange={(val: string) => setStartAt(val)}
              isRequired
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextInput
                label="Durasi (Menit)"
                value={durationMinutes}
                onChange={(val: string) => setDurationMinutes(val)}
              />
              <TextInput
                label="Project ID"
                placeholder="prj_launch"
                value={projectId}
                onChange={(val: string) => setProjectId(val)}
              />
            </div>

            <TextInput
              label="Peserta (ID pengguna dipisahkan koma)"
              placeholder="usr_alex, usr_sarah"
              value={participants}
              onChange={(val: string) => setParticipants(val)}
            />

            <TextArea
              label="Tujuan & Deskripsi Rapat"
              placeholder="Jelaskan tujuan dan poin pembahasan rapat ini..."
              value={purpose}
              onChange={(val: string) => setPurpose(val)}
              rows={3}
            />

            <div className={sx(styles.metaRow)} style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <Button label="Batal" variant="secondary" onClick={() => setIsCreateOpen(false)} />
              <Button
                label={creating ? 'Menyimpan...' : 'Jadwalkan Rapat'}
                variant="primary"
                isDisabled={creating || !title.trim()}
                onClick={() => void handleCreateMeeting()}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
