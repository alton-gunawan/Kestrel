**Kestrel**

**Perubahan Arah Produk & Arsitektur**

*Web App First, WebMCP Alternative, Integration Abstraction*

Dokumen perubahan ini menetapkan baseline baru untuk menyelaraskan PRD,
UX/UI, domain/API, WebMCP, integrations, testing, golden demo, dan
roadmap implementasi Kestrel. Dokumen sumber asli tidak diubah
melalui dokumen ini; file ini adalah versi perubahan yang menjadi acuan
revisi berikutnya.

**KEPUTUSAN INTI**

Kestrel adalah user-facing web application terlebih dahulu. Web App
adalah tempat utama user melakukan pekerjaan operasional dan CRUD.
WebMCP adalah alternative interface yang memungkinkan external agent
mengoperasikan capability yang sama. Integrations adalah product
capability untuk menghubungkan Kestrel ke provider eksternal melalui
abstraction layer yang konsisten.

# 1. Ringkasan Arah Baru

Arah baru tidak mengubah thesis produk Kestrel. Produk tetap
bertujuan mengubah meeting menjadi execution melalui rangkaian context →
agenda → meeting → decisions → action items → follow-up. Perubahan
utamanya adalah penegasan bahwa pengalaman produk utama berada di web
app, sedangkan WebMCP dan integrations memperluas cara capability
tersebut digunakan.

| **Area**                    | **Baseline baru**                  | **Implikasi**                                                               |
|-----------------------------|------------------------------------|-----------------------------------------------------------------------------|
| Primary product experience  | Web App / UI user-facing           | Seluruh workflow inti harus dapat diselesaikan tanpa WebMCP.                |
| Alternative agent interface | Native WebMCP                      | External agent dapat menemukan dan mengoperasikan capability yang sama.     |
| Business logic              | Shared application/domain services | UI dan WebMCP tidak boleh memiliki aturan bisnis berbeda.                   |
| Integration model           | Provider abstraction               | Provider eksternal dapat diganti/ditambah tanpa mengubah domain model inti. |
| Approval                    | Human-controlled                   | Consequential mutation tetap membutuhkan approval manusia.                  |
| Meeting intelligence        | Third-party provider               | Kestrel tidak membangun transcription engine sendiri untuk sementara.    |

# 2. Prinsip Produk

- User dapat menjalankan Kestrel secara penuh dari web app tanpa
  memahami WebMCP.

- CRUD dan operational workflows adalah fondasi produk; WebMCP bukan
  alasan untuk mengurangi kelengkapan UI.

- WebMCP adalah alternative interaction path menuju capability yang
  sama, bukan business system kedua.

- Integrations bukan halaman setting teknis. Integrations adalah area
  user-facing untuk menghubungkan provider dan menentukan bagaimana
  data/kapabilitas eksternal digunakan.

- Proposal tetap terpisah dari committed state. Mutation yang berdampak
  nyata membutuhkan human approval.

- Data dari transcript, notes, imported records, external APIs, dan
  project systems diperlakukan sebagai untrusted data, bukan instruksi.

- Server/domain boundary tetap menjadi sumber kebenaran untuk
  authorization, validation, concurrency, idempotency, audit, dan
  persisted state.

# 3. Posisi Web App vs WebMCP

## 3.1 Web App — Primary Interface

UI harus terasa seperti aplikasi Meeting Operations yang lengkap dan
profesional. User tidak perlu mengetahui bahwa di belakang layar ada
WebMCP.

| **Area UI**  | **Tanggung jawab utama**                                                                              |
|--------------|-------------------------------------------------------------------------------------------------------|
| Overview     | Attention management: next meeting, prep-needed, overdue actions, pending decisions, recent activity. |
| Meetings     | List, filter, create, edit, schedule, participants, detail, agenda, outcomes, follow-up.              |
| Projects     | Project context, linked meetings, decisions, actions, and relevant context.                           |
| Actions      | Create, edit, assign, due date, status, owner, linked meeting/project.                                |
| Decisions    | Record, review, link to meeting/project, status/context.                                              |
| Follow-up    | Track outstanding actions, continuity, suggested follow-up, next meeting context.                     |
| Integrations | Connect/manage providers and view provider status, scopes, sync state, and ingestion activity.        |
| Settings     | User/workspace preferences and operational configuration.                                             |

## 3.2 WebMCP — Alternative Interface

External agent boleh menjalankan discovery, context gathering, planning,
proposal, dan approved execution melalui WebMCP. Namun tool tersebut
selalu berakhir pada shared application/domain services yang sama dengan
UI.

Contoh: user dapat membuat meeting langsung melalui form. Sebagai
alternatif, user dapat meminta external agent menyiapkan meeting
berdasarkan project context dan availability. Keduanya menghasilkan
proposal dan committed state yang tunduk pada aturan bisnis yang sama.

# 4. Arsitektur Target

Boundary yang diinginkan adalah satu business system dengan dua
interface utama dan satu integration layer.

Web App UI → Authenticated API → Application Services → Domain Services
→ Repository → Drizzle → PostgreSQL

WebMCP browser adapter → Authenticated API → Application Services →
Domain Services → Repository → Drizzle → PostgreSQL

External Integrations → Integration Adapter/Provider → Ingestion/Sync
Services → Application/Domain Services → Persistence

Integration provider tidak boleh menulis langsung ke database dan tidak
boleh melewati domain invariants. Integration hanya menyediakan context,
events, media/transcript, atau external execution capability.

# 5. Integration Abstraction — Baseline Arsitektur

Semua integrasi eksternal harus diorganisasikan berdasarkan capability
provider, bukan berdasarkan implementasi vendor. Ini membuat domain
Kestrel tetap stabil walaupun provider berubah.

| **Abstraction**             | **Contoh provider**                | **Capability yang diberikan**                                                                   |
|-----------------------------|------------------------------------|-------------------------------------------------------------------------------------------------|
| CalendarProvider            | Google Calendar, Microsoft Outlook | Read calendar, availability/free-busy, create/update event bila integration mode mengizinkan.   |
| MeetingIntelligenceProvider | Fathom, Fireflies.ai, tl;dv        | Transcript, summary, action items, meeting metadata, webhook/event delivery.                    |
| CommunicationProvider       | Slack, Email                       | Notification, follow-up reminder, delivery of approved updates/messages.                        |
| ProjectProvider             | Linear, GitHub                     | Project/issue/PR context, links, optional synchronization of approved action items.             |
| MeetingPlatformProvider     | Zoom, Google Meet                  | Meeting link, meeting lifecycle metadata, provider-side meeting details.                        |
| AutomationProvider          | Zapier atau automation layer lain  | Long-tail integrations dan event-driven workflows tanpa membuat native connector satu per satu. |

Aturan utama: domain model Kestrel tidak mengenal “Fathom Action
Item” atau “Linear Action Item” sebagai entity inti. Provider-specific
objects dipetakan menjadi canonical Kestrel concepts seperti
MeetingContext, TranscriptInput, Decision, ActionItem, FollowUp, atau
ExternalReference.

## 5.1 Kontrak Capability yang Disarankan

| **Interface konseptual**    | **Contoh method**                                                                 | **Catatan**                                                                  |
|-----------------------------|-----------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| CalendarProvider            | getCalendarContext(), findAvailability(), createEvent(), updateEvent()            | Method yang menulis ke external calendar harus eksplisit dan approval-aware. |
| MeetingIntelligenceProvider | getMeeting(), getTranscript(), getSummary(), getActionItems(), subscribeWebhook() | Raw outputs masuk sebagai untrusted inputs sebelum dianalisis.               |
| CommunicationProvider       | sendNotification(), sendFollowUp()                                                | Pengiriman eksternal adalah consequential action; sebaiknya approval-aware.  |
| ProjectProvider             | getProjectContext(), getIssues(), createLinkedIssue()                             | Read first; writes only from approved Kestrel actions.                    |
| MeetingPlatformProvider     | createMeeting(), getMeeting(), getJoinLink()                                      | Optional untuk MVP; tidak boleh menjadi prerequisite golden path.            |
| AutomationProvider          | emitEvent(), registerRecipe()                                                     | Future/optional layer untuk long-tail automation.                            |

# 6. Prioritas Integrations untuk MVP

Untuk hackathon, jangan implement semua provider. Implement satu
provider yang membuktikan lifecycle, tetapi desain abstraction dari awal
agar provider kedua dapat masuk tanpa mengubah domain model.

| **Prioritas** | **Integration**         | **Peran dalam Kestrel**                          | **Keputusan**                                                                          |
|---------------|-------------------------|-----------------------------------------------------|----------------------------------------------------------------------------------------|
| P0            | Google Calendar         | Scheduling, availability, calendar context          | Direkomendasikan sebagai calendar integration utama jika external calendar dibutuhkan. |
| P0            | Fathom                  | Transcript, summary, action items                   | Pilihan pertama untuk Meeting Intelligence integration.                                |
| P1            | Slack                   | Notifications dan follow-up delivery                | Menutup loop setelah meeting.                                                          |
| P1            | Linear                  | Project/issue context dan approved action execution | Sangat cocok untuk persona engineering/product.                                        |
| P1/P2         | Microsoft Outlook       | Alternative calendar provider                       | Masuk melalui CalendarProvider abstraction.                                            |
| P1/P2         | Fireflies.ai / tl;dv    | Alternative MeetingIntelligenceProvider             | Ditambahkan setelah provider pertama stabil.                                           |
| P2            | GitHub                  | Issue/PR/repository context                         | Dapat menjadi ProjectProvider kedua untuk engineering.                                 |
| P2            | Zoom / Google Meet      | Meeting platform capability                         | Optional; tidak diperlukan untuk golden path utama.                                    |
| P2+           | Notion / Email / Zapier | Knowledge, communication, automation                | Long-tail expansion setelah core workflow stabil.                                      |

# 7. Integrations sebagai Fitur User-Facing

Menu Integrations harus tampil sebagai bagian normal dari web app, bukan
dashboard developer. Fokus UI adalah: provider apa yang terhubung,
capability apa yang aktif, data apa yang boleh dipakai, status koneksi,
dan bagaimana disconnect/reconnect dilakukan.

| **Screen/element** | **Perilaku user-facing**                                                                     |
|--------------------|----------------------------------------------------------------------------------------------|
| Provider cards     | Menampilkan provider, capability, status connected/disconnected, dan CTA yang jelas.         |
| Connect flow       | Menjelaskan tujuan koneksi dan scope data sebelum authorization.                             |
| Configuration      | Memilih workspace/calendar/channel/project scope yang relevan bila provider mendukung.       |
| Sync status        | Last successful sync, last event received, warnings, retry/reconnect affordance.             |
| Activity           | Menampilkan integration events yang benar-benar terjadi, tanpa membuat klaim sukses palsu.   |
| Disconnect         | Revokes/disables provider access dan mempertahankan local canonical state sesuai policy.     |
| Error states       | Authentication expired, webhook unavailable, rate limit, invalid mapping, permission denied. |

# 8. Meeting Intelligence / Transcription

Kestrel tidak membangun transcription engine sendiri untuk sementara.
Gunakan MeetingIntelligenceProvider abstraction sehingga provider dapat
diganti tanpa menyentuh domain model inti.

| **Provider** | **Posisi**      | **Alasan**                                                                                                                    |
|--------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------|
| Fathom       | Pilihan pertama | Sesuai dengan kebutuhan ingestion transcript/summary/action items dan cocok untuk membuktikan lifecycle meeting-to-execution. |
| Fireflies.ai | Pilihan kedua   | Memiliki API/webhook meeting intelligence yang kuat sebagai alternatif provider.                                              |
| tl;dv        | Pilihan ketiga  | Menyediakan transcript/notes dan webhook; cocok sebagai provider lanjutan setelah abstraction terbukti.                       |

Flow yang dipertahankan: Meeting platform/provider → webhook/API →
Kestrel ingestion → untrusted transcript/notes → analysis/proposal →
human review/approval → committed Decision/ActionItem/FollowUp.

Raw transcript tidak langsung membuat Decision atau ActionItem. Sistem
harus memisahkan input mentah, hasil analisis/proposal, dan committed
business state.

# 9. Pola Integrasi Lain

## 9.1 Calendar

CalendarProvider menyediakan konteks jadwal dan availability. Pada tahap
MVP, golden demo tetap dapat berjalan dengan seeded/demo calendar
context agar tidak bergantung pada third-party calendar untuk setiap
judge path. External calendar write harus diperlakukan sebagai
consequential mutation dan mengikuti approval/concurrency/idempotency
policy.

## 9.2 Slack / Communication

CommunicationProvider digunakan untuk mengirim reminder, follow-up, atau
notification setelah user menyetujui perubahan yang akan keluar dari
Kestrel. Pengiriman harus memiliki audit trail dan hasil delivery
yang nyata.

## 9.3 Linear / Project systems

ProjectProvider menyediakan project/issue context untuk meeting
preparation dan dapat menjadi target execution untuk approved action
items. Canonical ActionItem tetap berada di Kestrel; external
issue/PR hanya menjadi linked reference atau synchronized
representation.

## 9.4 Automation

AutomationProvider adalah lapisan ekspansi, bukan core dependency.
Fungsinya menjangkau aplikasi di luar connector native Kestrel
setelah core workflows matang.

# 10. CRUD dan User Operations

| **Priority** | **Capability**           | **Acceptance focus**                                           |
|--------------|--------------------------|----------------------------------------------------------------|
| P0           | Meetings CRUD            | Create, view, edit, participants, schedule, status, detail.    |
| P0           | Agenda CRUD              | Create, edit, reorder, status, source.                         |
| P0           | Projects & context       | Create/edit/view project context and linked meeting data.      |
| P0           | Actions CRUD             | Create, assign, due date, status, owner, linkage.              |
| P0           | Decisions CRUD           | Record, edit/review where allowed, link to context.            |
| P0           | Follow-up                | Outstanding actions, continuity, suggested follow-up.          |
| P1           | Integrations             | Connect/manage providers via user-facing UI.                   |
| P1           | Proposal/review/approval | Before/after, rationale, warnings, explicit approval.          |
| P1           | WebMCP coverage          | Expose meaningful capability already implemented in UI/domain. |

# 11. User Flow yang Menjadi Canonical

1. Discover — user masuk ke Overview/Meetings dan melihat pekerjaan yang perlu perhatian.
2. Operate — user mengerjakan CRUD langsung di web app.
3. Prepare — sistem menggabungkan project context, calendar context, dan optional meeting intelligence.
4. Propose — perubahan kompleks dibuat sebagai proposal, bukan langsung committed.
5. Review — user melihat before/after, rationale, warnings, dan unresolved items.
6. Approve / Reject / Edit — human approval menjadi batas eksplisit untuk consequential mutations.
7. Execute — shared application/domain service menjalankan mutation tervalidasi.
8. Verify — persisted state aktual dibaca kembali dan ditampilkan.
9. Close the loop — decisions, action items, follow-up, notification, dan external project sync diteruskan melalui provider abstraction sesuai kebutuhan.
10. Alternative agent path — external agent dapat menjalankan discovery/planning/execution melalui WebMCP pada capability yang sama.

# 12. Perubahan yang Perlu Diterapkan ke Dokumen Sumber

| **Dokumen**                     | **Perubahan**                                                                                                                                                                                            |
|---------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| PRD v2                          | Tegaskan Web App sebagai primary product experience. Tambahkan Integrations sebagai product capability. Tambahkan integration abstraction dan third-party meeting intelligence path.                     |
| UX/UI Specification             | Integrations menjadi menu user-facing. CRUD/lifecycle menjadi fokus utama. Agent Activity tetap secondary observability. Hindari UI yang mengharuskan user memahami WebMCP.                              |
| WebMCP Technical Specification  | Framing diubah menjadi alternative interface over shared application services. Tool coverage mengikuti canonical UI/domain capability.                                                                   |
| Domain/Data/API Contract        | Tambahkan integration contracts, provider adapters, external references, ingestion records, dan provider status tanpa menjadikan provider object sebagai core domain entity.                             |
| Agent Interaction Specification | Agent tetap reasoning layer eksternal dan optional. Agent tidak boleh menjadi satu-satunya cara untuk menjalankan workflow.                                                                              |
| Build Instructions              | Urutan: UI shell + CRUD → domain/API → approval/audit → integrations abstraction → provider pertama → WebMCP exposure → verification.                                                                    |
| Golden Demo                     | Web App harus tetap terlihat mandiri. WebMCP menunjukkan alternative control path. Integration dapat dibuktikan melalui seeded/mock-safe boundary bila third-party connectivity bukan bagian judge path. |
| Test & Verification Plan        | Tambahkan tests untuk provider abstraction, webhook ingestion, mapping canonical entities, provider failure, reconnect/disconnect, dan golden workflow tanpa WebMCP.                                     |
| Production Release Checklist    | Tambahkan integration health, secure credential handling, webhook verification, idempotent ingestion, provider-specific failure states, dan user-facing disconnect flows.                                |
| Devpost Submission Pack         | Narasi utama: Kestrel adalah meeting operations web app. WebMCP dan integrations menjadi differentiators yang memperluas cara sistem digunakan, bukan menggantikan aplikasi.                          |

# 13. Batasan yang Tidak Berubah

- Native WebMCP tetap menggunakan
  document.modelContext.registerTool(...).

- Tidak ada embedded LLM, Vercel AI SDK, LangChain, atau LangGraph
  sebagai reasoning layer internal.

- Approval tetap human-only untuk consequential mutations.

- Agent tidak dapat memalsukan approval, approval token, atau
  authorization state.

- Server menjadi sumber kebenaran untuk validation, authorization,
  concurrency, idempotency, audit, dan persisted state.

- verify_meeting_state harus memeriksa state nyata yang tersimpan; tidak
  boleh mengklaim external event yang tidak benar-benar dibuat.

- Imported/external data termasuk transcript, notes, project systems,
  calendar content, dan webhook payload adalah untrusted data.

- Third-party integrations tidak boleh melewati domain invariants atau
  menulis langsung ke database.

# 14. Acceptance Criteria Perubahan

- User baru dapat menyelesaikan golden workflow sepenuhnya dari web app
  tanpa mengetahui WebMCP.

- CRUD inti tersedia dan terasa sebagai primary operational experience.

- WebMCP dapat menemukan dan menjalankan capability yang sama tanpa
  duplikasi business logic.

- Provider eksternal diakses melalui abstraction interface dan adapter,
  bukan tersebar di domain logic.

- Fathom dapat menjadi initial MeetingIntelligenceProvider tanpa
  mengubah canonical Meeting/Decision/ActionItem/FollowUp model.

- CalendarProvider, CommunicationProvider, ProjectProvider, dan
  MeetingIntelligenceProvider memiliki boundary yang jelas.

- Integration failures menghasilkan error yang eksplisit dan tidak
  pernah dilaporkan sebagai success palsu.

- Webhook/event ingestion idempotent dan dapat diaudit.

- User dapat connect, inspect status, reconnect, dan disconnect
  integration dari UI.

- Golden demo tetap deterministik dan tidak bergantung pada third-party
  integration untuk jalur inti kecuali memang sengaja didemonstrasikan.

- Native WebMCP discovery/execution diverifikasi secara terpisah dari
  correctness web app.

# 15. Urutan Implementasi yang Disarankan

1. Stabilkan shell, navigation, routing, design system, seeded data, auth boundary, dan responsive layout.
2. Selesaikan Meetings, Projects, Agenda, Actions, Decisions, Follow-up CRUD dan lifecycle.
3. Bangun application/domain services, validation, authorization, audit, optimistic concurrency, dan idempotency.
4. Bangun proposal/review/approval UX sebagai common human-control layer.
5. Bangun Integrations UI dan provider abstraction contracts.
6. Implementasikan satu provider pertama: Google Calendar untuk calendar capability dan/atau Fathom untuk meeting intelligence sesuai batas waktu demo.
7. Implementasikan ingestion/mapping provider → canonical Kestrel concepts, termasuk idempotency dan audit.
8. Tambahkan Slack dan Linear hanya setelah core lifecycle stabil, menggunakan CommunicationProvider dan ProjectProvider.
9. Expose capability yang sudah stabil melalui native WebMCP.
10. Lakukan E2E, accessibility, security, native WebMCP verification, provider failure tests, dan golden demo rehearsal.

# 16. Mental Model Final

Kestrel bukan “aplikasi WebMCP”. Kestrel adalah web application
untuk meeting operations yang dapat dioperasikan manusia secara langsung
dan dapat pula dikendalikan oleh external agent melalui WebMCP. Di
dalamnya, integrations menyediakan konteks dan koneksi ke sistem
eksternal melalui provider abstractions yang stabil.

Model ringkas:

User → Web App → Shared Application/Domain Services

External Agent → WebMCP → Shared Application/Domain Services

External Systems → Integration Providers/Adapters → Shared
Application/Domain Services

Semua jalur bertemu pada business rules, authorization, approval
boundary, audit, concurrency, idempotency, dan verification yang sama.

# 17. Basis Dokumen

Dokumen ini diturunkan dari PRD v2, WebMCP Technical Specification,
Domain/Data Model and API Contract, Agent Interaction Specification,
UX/UI Specification, Build Instructions for Claude Code, Golden Demo,
Test & Verification Plan, Devpost Submission Pack, dan Production
Release Checklist Kestrel yang telah diberikan sebelumnya, ditambah
keputusan arah integrasi yang telah disepakati dalam percakapan ini.
