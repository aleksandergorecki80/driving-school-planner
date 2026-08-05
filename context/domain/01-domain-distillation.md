---
title: "DrivePlan — Domain Distillation"
created: 2026-08-02
type: domain-distillation
sources: [prd.md, prd-v2.md]
---

# DrivePlan — destylacja domeny

Metoda: czytanie źródeł, nie zgadywanie. Każde pojęcie ma cytat (plik:linia) i status w kodzie
(plik:linia lub "BRAK w kodzie"). `prd.md` = v1 (greenfield, 2026-05-21). `prd-v2.md` = v2
(brownfield, 2026-07-04, aktualne źródło prawdy). Kod zbadany na commit `2b2db5e` (main).

## KROK 0 — Kontekst projektu

- **Stack:** Next.js 16 App Router, Supabase (Postgres + Auth), Tailwind v4, Vercel
  (`context/foundation/tech-stack.md:1-29`).
- **Warstwy logiki biznesowej:**
  - Server actions: `src/app/actions/lessons/*.ts` (createLesson, cancelLesson, respondToLesson,
    regenerateLessonToken, suggestRejectionReasonsAction) — główne miejsce reguł domenowych po
    stronie aplikacji.
  - Baza (Postgres RPC + constrainty): `supabase/migrations/*.sql` — część reguł żyje TYLKO tu
    (np. `respond_to_lesson`), inne wcale (patrz KROK 5).
  - UI: `src/app/office/**`, `src/app/lesson/[token]/**` — częściowo dubluje walidację
    (np. filtr kategorii w `NewLessonForm.tsx`) bez gwarancji server-side.
- **Dwa PRD:** `prd.md` (v1, greenfield, MVP-owy kształt) i `prd-v2.md` (v2, brownfield,
  redefiniuje dostęp instruktora). Roadmapa (`context/foundation/roadmap.md`) i folder zmiany
  `context/changes/instructor-responds/` dokumentują, że **kod odjechał także od v2** w jednym
  miejscu (FR-013, patrz KROK 2/5) — to trzecia warstwa prawdy, nowsza niż sam `prd-v2.md`.

---

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja | Cytat źródłowy | W kodzie |
|---|---|---|---|
| **Lesson (lekcja)** | Jednostka rezerwacji: instruktor + student + kategoria + termin + status. | `prd.md:72` "Lesson is created with status pending" | `supabase/migrations/20260614143835_initial_schema.sql:23-32` (tabela `lessons`); `createLesson.ts:82-92` |
| **Office / biuro** | Jedno wspólne konto (email+hasło), pełny dostęp do kalendarzy i tworzenia lekcji. | `prd.md:26-27`, `prd.md:106` | Supabase Auth session; `src/proxy.ts:40-44` (gate `/office`); `src/app/actions/auth.ts` |
| **Instructor (instruktor)** | Osoba prowadząca lekcje, ma zestaw kategorii uprawnień. | `prd.md:31-33` | `instructors` table (`id, name, categories[], email`) |
| **Student** | Osoba ucząca się, przypisana do jednej kategorii. | `prd.md:89` "Student profiles: name + phone number" | `students` table (`id, name, phone, category`) |
| **Licence category (kategoria)** | Uprawnienie (B, C, D, T, B+E, C+E…) — instruktor ma tablicę kategorii, student dokładnie jedną. | `prd.md:66` "filter the instructor list by licence category" | `instructors.categories text[]` vs `students.category text` — **asymetria celowa, nigdzie niewyjaśniona wprost w PRD** |
| **Lesson status** | `pending → confirmed / rejected`, plus `cancelled` (dodane później). | `prd.md:76` (3 statusy) | `lesson_status` enum; `cancelled` dodany w `20260628000001_add_cancelled_lesson_status.sql:4` — **status spoza v1 PRD, uzasadniony dopiero przez FR-009 w v2** (`prd-v2.md:97`) |
| **Rejection reason** | Powód odrzucenia lekcji przez instruktora. | v1: wymagany, `prd.md:84`; v2: opcjonalny, `prd-v2.md:95` | `lessons.rejection_reason text`; scope'owany do `rejected` w `20260705155520_scope_rejection_reason_to_rejected_decision.sql` |
| **Permanent instructor token** (RETIRED) | Jeden stały token URL per instruktor, lista wszystkich lekcji. | `prd.md:80-81` (FR-006) | Był: `instructors.token uuid` (initial_schema) + `get_instructor_lessons()`. **Usunięty**: `20260705102934_drop_instructor_token.sql` |
| **One-time lesson token** | Token per-lekcja, jednorazowy, unieważniany przy decyzji/anulowaniu/regeneracji. | `prd-v2.md:45,75` (FR-001) | `lessons.token uuid` (`20260704213335…sql`), `respond_to_lesson()` RPC (`20260704213336…sql:16-45`) |
| **AI-suggested rejection reasons** | Do 5 kontekstowych propozycji powodu odrzucenia (data/godzina/kategoria, bez danych studenta). | `prd-v2.md:87` (FR-012) | `src/lib/ai/suggestRejectionReasons.ts:6-35` (AI SDK, `gpt-5.4-nano`) |
| **Instructor email** | Adres, na który wysyłany jest link do lekcji. | `prd-v2.md:89` (FR-013, jako pole **edytowalne przez biuro**) | `instructors.email text` (kolumna istnieje) — **UI edycji NIE istnieje**, patrz KROK 2/5 |
| **Send-override email (one-shot)** | Alternatywny adres na *ten jeden* mail, nigdy nie zapisywany. | BRAK w żadnym PRD — powstał dopiero mid-implementation | `createLesson.ts:98` `overrideEmail`, `regenerateLessonToken.ts:37` |
| **Category-instructor coherence** | Lekcja może istnieć tylko gdy instruktor ma daną kategorię. | `prd.md:98-100` | `createLesson.ts:37-39` (`instructor.categories.includes(category)`) |
| **Category-student coherence** | (Twierdzenie PRD) student musi też mieć tę kategorię. | `prd.md:102` "all three must align for a lesson to exist" | **BRAK w kodzie server-side** — tylko filtr UI w `NewLessonForm.tsx:51` |
| **Double-booking (instructor)** | Instruktor nie może mieć dwóch aktywnych lekcji w nachodzących oknach. | implicit, `prd-v2.md:51` "double-booking guards" | App: `createLesson.ts:48-63` (okno ±1h); DB: `lessons_instructor_slot_unique` (`20260628000002…sql`) — **DB łapie tylko identyczny `scheduled_at`, nie cały overlap** |
| **Double-booking (student)** | Student nie może mieć dwóch aktywnych lekcji w nachodzących oknach. | implicit, `prd-v2.md:51` | App: `createLesson.ts:65-80` — **BRAK jakiegokolwiek DB constraintu** |
| **Approve (confirm)** | Instruktor akceptuje lekcję, z krokiem potwierdzenia "Are you sure?". | v1: bez potwierdzenia (`prd.md:82`); v2 modified: z potwierdzeniem (`prd-v2.md:93`) | `LessonResponseForm.tsx:86-108` (client-side state machine); `respond_to_lesson` RPC nie zna pojęcia "confirmation step" — to czysto UI |
| **Reject** | Instruktor odrzuca lekcję, opcjonalny powód. | `prd-v2.md:95` (FR-005 modified) | `LessonResponseForm.tsx:110-150`, `respond_to_lesson()` |
| **Cancellation** | Biuro anuluje lekcję; unieważnia też token. | `prd-v2.md:97` (FR-009 modified) | `cancelLesson.ts:10-16` (`status='cancelled', token=null`) |
| **Manual token regeneration** | Biuro może wygenerować nowy token, unieważniając poprzedni. | `prd-v2.md:83` (FR-007) | `regenerateLessonToken.ts` |
| **Polling refresh** | Biuro widzi zmiany statusu bez ręcznego odświeżania, co ~30s. | v1: `prd.md:76-77` (FR-005); v2 preserved: `prd-v2.md:106` (FR-011) | `AutoRefresh.tsx:5,11-14` (`setInterval` + `router.refresh()`) |
| **Weekly calendar (per-instructor)** | Widok tygodniowy jednego instruktora. | `prd.md:63-64` (FR-001) | `WeeklyCalendar.tsx`, `CalendarGrid.tsx` |
| **Combined all-instructors calendar** | Widok wszystkich instruktorów naraz. | `prd.md:65` (FR-001b, nice-to-have) | **BRAK w kodzie** — `office/page.tsx` wymaga wybranego `instructorId` |

---

## KROK 2 — Ewolucja domeny (v1 → v2 → kod)

| Pojęcie/reguła | v1 mówi | v2 mówi | Kod | Komentarz |
|---|---|---|---|---|
| **Dostęp instruktora** | Stały token per instruktor, lista lekcji, brak wygaśnięcia — ryzyko zaakceptowane (`prd.md:80-81`) | Token per-lekcja, jednorazowy, tylko ta jedna lekcja (`prd-v2.md:40,63,75-81`) | `lessons.token` + `get_lesson_by_token`/`respond_to_lesson`; stary mechanizm **usunięty** (`20260705102934…sql`) | Kod **nadąża za v2** w pełni — to modelowy przykład dobrze wykonanej migracji modelu. |
| **Powód odrzucenia** | Wymagany, wolny tekst lub lista opcji (`prd.md:84`) | Opcjonalny (`prd-v2.md:95-96`) | `respond_to_lesson(p_reason DEFAULT NULL)` — nie wymusza | Kod = v2. |
| **Krok potwierdzenia approve** | Brak (`prd.md:82`) | "Are you sure?" przed zatwierdzeniem (`prd-v2.md:93-94`) | `LessonResponseForm.tsx` step-state | Kod = v2, ale **tylko UI** — brak twardej bramki po stronie serwera/DB. |
| **AI-podpowiedzi powodu** | Nie istniało; v1 non-goal dot. AI dotyczył scheduling, nie reasons (`prd.md:120`) | Nowe: do 5 propozycji, bez danych studenta, degraduje się łagodnie (`prd-v2.md:87-88`) | `suggestRejectionReasons.ts` + `suggestRejectionReasonsAction.ts` (walidacja długości `category`, timeout 10s, fallback `[]`) | Kod = v2. |
| **Powiadomienia e-mail** | Non-goal: "No email or SMS notifications" (`prd.md:119`) | Rdzeń mechanizmu: FR-002, e-mail z linkiem (`prd-v2.md:77`) | `sendLessonLink.ts` (Resend) | Kod = v2. |
| **Email instruktora** | Nie istnieje jako pole (pre-seeded: tylko name+categories, `prd.md:88`) | FR-013: pole **edytowalne przez biuro** w UI (`prd-v2.md:89,141`) | `instructors.email` istnieje, ale **brak akcji edycji**; zamiast tego one-shot `overrideEmail` nigdy nie zapisywany | **Kod ≠ ani v1, ani litera v2.** Rework z 2026-07-11 udokumentowany w `roadmap.md:109,140` i `context/changes/instructor-responds/change.md:14-17`, ale `prd-v2.md` **nie został zaktualizowany** — dokument nadal opisuje starą (odrzuconą) wersję FR-013. |
| **Status "cancelled"** | Nie istnieje (3 statusy: pending/confirmed/rejected, `prd.md:76`) | Domyślnie zakłada możliwość anulowania (FR-009, `prd-v2.md:97-98`) — ale enum nie jest wprost wymieniony | `20260628000001_add_cancelled_lesson_status.sql` — dodany **przed** napisaniem `prd-v2.md` (28 czerwca vs 4 lipca), więc technicznie należy do S-01/booking-integrity, nie do S-02 | Kod wyprzedził dokumentację — status faktycznie wspiera FR-009 zanim FR-009 został spisany. |
| **Polling biura** | Downgrade z realtime na polling (`prd.md:77`) | Zachowane jako "preserved" (`prd-v2.md:106,120`), a Success Criteria (`prd-v2.md:45,61`) opisuje je jako już działające | `AutoRefresh.tsx` — **nie istniało** aż do Phase 8 (2026-07-11), mimo że `prd-v2.md` (2026-07-04) i `roadmap.md` opisywały je jako częściowo gotowe/preserved | Potwierdzony w `roadmap.md:115` "confirmed gap... never actually implemented until 2026-07-11". Dziś kod = v2 (naprawione). |
| **Rejection reason widoczny dla biura** | — (nie dotyczy, powód nie istniał w v1 jako pole biura) | Success Criteria: "office sees it alongside the status change" (`prd-v2.md:48,68`) | `office/page.tsx` SELECT pomija `rejection_reason`; `LessonRow` (`types.ts:3-9`) i `LessonPopover.tsx` też | **Kod nie nadąża za v2** — udokumentowany "known gap" w `roadmap.md:115` i `change.md:19-23`. |
| **Category-student coherence** | Explicit: "all three must align" (`prd.md:102`) | Nie powtórzone wprost, ale "Existing rule (unchanged by this change)" (`prd-v2.md:131`) sugeruje kontynuację | `createLesson.ts` sprawdza tylko instructor↔category | **Kod nigdy nie nadążył za v1** — luka istnieje od S-01, nie jest efektem v1→v2, ale jest udokumentowana explicite tylko w v1. |

**Wniosek:** tam, gdzie v2 świadomie przeprojektował mechanizm dostępu instruktora (token), kod
jest wzorowo zsynchronizowany. Tam, gdzie v2 dodał *nowy* wymóg widoczności danych dla biura
(rejection reason) albo gdzie FR został **przeprojektowany bez aktualizacji dokumentu** (FR-013),
kod i PRD rozjeżdżają się — a w jednym przypadku (student-category coherence) to **v1**, nie v2,
ma wymóg, którego kod nigdy nie zaimplementował.

---

## KROK 3 — Subdomeny: Core / Supporting / Generic

| Obszar | Klasyfikacja | Uzasadnienie |
|---|---|---|
| **Pending → confirmed/rejected/cancelled workflow + category coherence + double-booking guards** | **Core** | To jest dosłownie teza produktu z Vision (`prd.md:22`): "generic calendar tools... have no concept of category-filtered instructor views... no lesson approval workflow". Usunięcie tego = usunięcie produktu. |
| **One-time lesson token (dostęp instruktora)** | **Core** | Cały `prd-v2.md` istnieje wyłącznie po to, by przeprojektować tę regułę (`prd-v2.md:32-34`) — to centralny niezmiennik bezpieczeństwa domeny, nie szczegół techniczny. |
| **Instructor / Student jako encje (kategorie, dane kontaktowe)** | **Core (dane) / Supporting (zarządzanie)** | Same dane (kategorie, przypisania) są rdzeniem reguł koherencji; ale *zarządzanie* nimi (CRUD) jest explicite non-goal (`prd.md:117`) — pre-seeded, brak UI. Encja jest core, jej administracja jest supporting/nie-istnieje. |
| **Office authentication (Supabase Auth email+hasło)** | **Supporting** | Niezbędne dla dostępu, ale to gotowy mechanizm platformy (Supabase Auth) — nie jest unikalną wiedzą domenową szkoły jazdy. |
| **Weekly calendar UI (rendering siatki godzin)** | **Supporting** | Prezentuje dane core, ale sama siatka 30-minutowych slotów to generyczny wzorzec kalendarza, świadomie zbudowany na Tailwind zamiast biblioteki (`roadmap.md:93`) z powodów kosztowych, nie domenowych. |
| **Polling / auto-refresh (`AutoRefresh.tsx`)** | **Generic** | Standardowy `setInterval` + `router.refresh()` — brak logiki domenowej; mogłoby być SSE, WebSocket czy Realtime bez zmiany reguł biznesowych. |
| **Email delivery (Resend)** | **Generic** | Wymienialny dostawca transakcyjnego e-maila; `prd-v2.md:115` sam to nazywa "specific services are a downstream stack decision". |
| **AI-suggested rejection reasons** | **Supporting** | Domenowo trafne (kontekst: data/kategoria), ale to opcjonalne UX-wsparcie wokół core-workflow, jawnie projektowane tak, by core mógł działać bez niego (graceful degradation, `prd-v2.md:88`). Nie jest tym, co sprzedaje produkt. |
| **Rejection reason (samo pole, niezależnie od AI)** | **Core** | To dokładnie mechanizm redukujący telefon zwrotny biura (`prd.md:85`) — czyli redukujący koszt koordynacji, czyli sedno Vision. |

---

## KROK 4 — Kandydaci na agregaty i ich niezmienniki

### 1. `Lesson` (agregat główny)

| Niezmiennik | Cytat | Status w kodzie | Status w bazie |
|---|---|---|---|
| Instruktor musi posiadać kategorię lekcji | `prd.md:98-100` | **Egzekwowany** — `createLesson.ts:37-39` | **Nie** — brak CHECK/FK między `lessons.category` a `instructors.categories` |
| Student musi posiadać kategorię lekcji | `prd.md:102` | **Nie egzekwowany** — brak jakiegokolwiek serwerowego sprawdzenia | **Nie** |
| Instruktor nie może mieć dwóch nachodzących aktywnych lekcji (±1h) | implicit, `prd-v2.md:51` | **Częściowo** — app sprawdza okno, ale check-then-insert nie jest atomowy | **Częściowo** — unikalny indeks łapie tylko identyczny `scheduled_at`, nie cały overlap |
| Student nie może mieć dwóch nachodzących aktywnych lekcji (±1h) | implicit, `prd-v2.md:51` | **Częściowo** — jak wyżej, tylko app | **Nie** — zero constraintu |
| Token autoryzuje dokładnie jedną decyzję na jednej lekcji, unieważnia się natychmiast po zmianie statusu | `prd-v2.md:133-135` | **Egzekwowany** | **Tak** — `respond_to_lesson` robi `SELECT...FOR UPDATE` + `UPDATE` atomowo w jednej funkcji (`20260704213336…sql:31-41`) |
| `rejection_reason` ustawiane wyłącznie przy decyzji `rejected` | implicit z `prd-v2.md:68` | **Egzekwowany** | **Tak** — `CASE WHEN` w `20260705155520…sql:27-28` |
| Raz podjęta decyzja (confirmed/rejected) jest ostateczna — token ginie i nie da się "cofnąć" statusu przez tę samą ścieżkę | implikowane przez cały model tokena, nigdzie wprost nie nazwane jako "immutable decision" | **Nie egzekwowany** poza ścieżką tokenu | **Nie** — `office_update_lessons ... USING (true)` pozwala authenticated dowolnie nadpisać `status` bez maszyny stanów |
| Anulowanie unieważnia token | `prd-v2.md:97-98` | **Egzekwowany** — `cancelLesson.ts:12` | Pośrednio (kolumna nullable, brak triggera — polega na aplikacji) |

### 2. `Instructor`

| Niezmiennik | Cytat | Kod | Baza |
|---|---|---|---|
| `categories` jest jedynym źródłem prawdy o tym, jakie lekcje instruktor może prowadzić | `prd.md:88,98-100` | Czytane w `createLesson.ts:31-39` | Brak walidacji formatu/wartości w `categories text[]` (dowolny tekst) |
| Email jest miejscem dostarczenia linku | `prd-v2.md:89` | `createLesson.ts:98`, `regenerateLessonToken.ts:37` | Kolumna nullable — brak `NOT NULL`, co jest zgodne z realnym stanem (instruktor może nie mieć maila) |

### 3. `Token` (właściwość `Lesson`, nie osobny agregat)

Niezmienniki opisane wyżej przy `Lesson`. Token nie ma sensu bytu niezależnego od lekcji — 1:0..1.

### 4. `Student`

| Niezmiennik | Cytat | Kod | Baza |
|---|---|---|---|
| Ma dokładnie jedną kategorię (nie tablicę) | wynika z `students.category text` vs `prd.md:89` | Filtr UI w `NewLessonForm.tsx:51` | `category text NOT NULL` — jedna wartość, zgodnie ze schematem |

---

## KROK 5 — Rozjazdy MODEL vs KOD

| # | Dokument mówi (który PRD) | Kod robi | Dowód | Kierunek rozjazdu |
|---|---|---|---|---|
| 1 | v1: "all three must align for a lesson to exist" — kategoria lekcji musi zgadzać się z kategorią **studenta**, nie tylko instruktora (`prd.md:102`) | `createLesson.ts` sprawdza wyłącznie `instructor.categories.includes(category)` (linie 37-39); nie ma żadnego porównania `student.category === category` | `src/app/actions/lessons/createLesson.ts:31-46`; test-suite `lessons.test.ts:361-435` testuje tylko koherencję instruktora, zero testu koherencji studenta | **Kod utknął przy niepełnej implementacji v1** — nie jest to efekt przejścia v1→v2, luka istniała od S-01 i v2 ją milcząco "dziedziczy" bez ponownego przywołania. |
| 2 | v2 FR-013: "Office can view and **update** an instructor's email address" (`prd-v2.md:89`) | Brak jakiejkolwiek akcji/UI do edycji `instructors.email`. Jedyny mechanizm to `overrideEmail` — jednorazowy, nigdy niezapisywany do bazy | Grep całego `src/` za `updateInstructor`/edycją email: brak wyników; `createLesson.ts:98`, `regenerateLessonToken.ts:37,41` (`overrideEmail?.trim() \|\| instructor.email`, nigdy `.update({email: ...})`) | **Kod świadomie odjechał od litery v2** — udokumentowane w `roadmap.md:109,140` i `context/changes/instructor-responds/change.md:14-17` jako "reworked mid-implementation (2026-07-11)". `prd-v2.md` samo w sobie **nie zostało poprawione** — to PRD jest przestarzałe względem świadomej decyzji projektowej, nie na odwrót. |
| 3 | v2 Success Criteria/US-01: office widzi `rejection_reason` "alongside the status change" (`prd-v2.md:48,68`) | `office/page.tsx:49` SELECT nie zawiera `rejection_reason`; `LessonRow` (`types.ts:3-9`) nie ma tego pola; `LessonPopover.tsx` nigdy go nie renderuje | `src/app/office/page.tsx:49`, `src/app/office/components/types.ts:3-9`, `src/app/office/components/lesson-panel/LessonPopover.tsx` (brak wzmianki o `rejection_reason` w całym pliku) | **Kod nie nadążył za v2** — jawnie przyznane jako "known gap" w `roadmap.md:115` i `change.md:19-23`, mimo że dane są poprawnie zapisywane w bazie od Phase 3. |
| 4 | Business Logic (implicit, `prd-v2.md:51`, "double-booking guards... regardless of what UI submits") sugeruje twardą gwarancję na poziomie serwera | Gwarancja **instruktora** jest tylko częściowa: DB `UNIQUE INDEX` łapie wyłącznie identyczny `scheduled_at` (`20260628000002…sql:4-5`), a prawdziwa reguła "±1h overlap" żyje wyłącznie w `createLesson.ts` jako nieatomowy check-then-insert | `supabase/migrations/20260628000002_add_unique_lesson_slot_index.sql`; `createLesson.ts:19-23,48-63` (komentarz przyznaje: "Two 1-hour lessons overlap iff...") | Kod deklaruje regułę silniej niż faktycznie gwarantuje — race condition możliwy przy równoległych żądaniach w oknie ±1h (poza dokładnym duplikatem). |
| 5 | To samo (`prd-v2.md:51`) dla studenta | **Zero** ochrony na poziomie bazy — żaden unikalny indeks na `(student_id, scheduled_at)` | Brak w `supabase/migrations/*.sql` (sprawdzone we wszystkich 13 plikach) | Silniejszy rozjazd niż #4 — student nie ma nawet częściowego backstopu. |
| 6 | Cały model tokenu (`prd-v2.md:133-135`) sugeruje, że decyzja instruktora jest **ostateczna** (token ginie na zawsze po decyzji) | RLS `office_update_lessons ... USING (true)` (`20260628000001…sql:12-13`) pozwala authenticated userowi (biuru) zaktualizować `status` dowolnej lekcji w dowolny sposób, bez maszyny stanów w bazie | `supabase/migrations/20260628000001_add_cancelled_lesson_status.sql:12-13` | Niezamierzona luka: nic nie broni np. ręcznego "cofnięcia" `rejected → confirmed` przez klienta z sesją biura (poza UI, które tego nie oferuje). |
| 7 | v2 Success Criteria opisuje polling biura jako działający w momencie powstania dokumentu (2026-07-04, `prd-v2.md:45,61`) | Polling **nie istniał** aż do 2026-07-11 (Phase 8) | `roadmap.md:115` "confirmed gap... never actually implemented until 2026-07-11" | Rozjazd **historyczny, już zamknięty** — dziś kod = v2 (`AutoRefresh.tsx`). Wymieniony dla kompletności ewolucji, nie jako aktywny problem. |

---

## KROK 6 — Ranking refaktoru

Kryteria: **wartość** = jak bardzo niezmiennik jest core-domain (im bliżej sedna produktu, tym
wyżej) × **ryzyko** = jak słabo jest dziś egzekwowany (brak DB-backstopu > częściowy > pełny).

| Ranking | Kandydat | Wartość | Ryzyko | Uzasadnienie |
|---|---|---|---|---|
| **#1** | **Category-student coherence** (rozjazd #1) | Core — to jedna z trzech zdań reguły biznesowej explicite nazwanej w PRD v1 | Wysokie — zero egzekwowania poza dropdown-em UI, który każdy bezpośredni wywołanie server action omija | **Refaktor #1.** To jedyny przypadek, gdzie sam dokument (nie tylko domyślna oczekiwana spójność) wprost twierdzi "all three must align", a kod tego nigdy nie zaimplementował. Naprawa jest tania (jedno dodatkowe zapytanie + porównanie w `createLesson.ts`, analogiczne do istniejącego sprawdzenia instruktora) i usuwa realną możliwość zarezerwowania studentowi lekcji w kategorii, której nie ma. |
| #2 | **Student double-booking bez DB-backstopu** (rozjazd #5) | Core — double-booking to jeden z dwóch pierwotnych problemów, które PRD wymienia w Vision ("scheduling conflicts") | Wysokie — całkowity brak ochrony w bazie, tylko nieatomowy check w aplikacji | Race condition przy równoległych żądaniach naruszy dokładnie tę regułę, którą produkt obiecuje rozwiązywać. Naprawa: częściowy unikalny indeks analogiczny do `lessons_instructor_slot_unique`, ale na `student_id` (uwaga: nie rozwiąże pełnego ±1h overlap, tylko dokładny duplikat — jak dziś dla instruktora — ale to i tak realna poprawa nad zerem). |
| #3 | **Instructor double-booking: częściowy overlap bez atomowości** (rozjazd #4) | Core — jak wyżej | Średnie — istnieje częściowy DB-backstop (dokładny duplikat), luka dotyczy tylko przesuniętych o np. 30 min żądań w wyścigu | Mniej pilne niż #2, bo przynajmniej najgrubszy przypadek (identyczny slot) jest chroniony atomowo przez bazę. |
| #4 | **Brak maszyny stanów dla `lessons.status` w DB** (rozjazd #6) | Core — ostateczność decyzji instruktora jest sednem modelu tokenu z `prd-v2.md` | Średnie — wymaga świadomego, nietrywialnego działania (bezpośredni update z sesją biura), nie dzieje się przez normalny UI | Wart naprawy (CHECK constraint lub trigger pilnujący dozwolonych przejść), ale mniej pilny niż luki w double-bookingu, bo dzisiejsze UI i tak nie oferuje ścieżki do jego naruszenia. |
| #5 | **Rejection reason niewidoczny dla biura** (rozjazd #3) | Supporting-ish/Core-adjacent — redukuje telefon zwrotny, ale to defekt UI/query, nie defekt reguły biznesowej (dane są poprawnie zapisane) | Niskie — nic się nie psuje domenowo, tylko informacja nie dociera do UI | Już świadomie śledzony jako known gap w roadmapie; niska trudność naprawy (dodać kolumnę do SELECT + do typu + do komponentu), niski priorytet refaktoru domenowego (to raczej bug UI niż luka w agregacie). |
| #6 | **FR-013 (dokument nieaktualny względem świadomej decyzji kodu)** | Niska wartość domenowa — to rozjazd dokumentacyjny, nie w logice | Niskie — kod jest spójny i celowy, tylko `prd-v2.md` nie został zaktualizowany | Nie wymaga refaktoru kodu — wymaga aktualizacji `prd-v2.md`, żeby przestał kłamać o kształcie FR-013. **→ Śledzone jako `DOC-01` (`sync-prd-fr013`) w `context/foundation/roadmap.md` Backlog Handoff (2026-08-02).** |

---

## Podsumowanie

Artefakt rekonstruuje Ubiquitous Language DrivePlan z dwóch PRD i kodu, śledzi ewolucję domeny
między greenfield (v1) a brownfield (v2), klasyfikuje obszary na Core/Supporting/Generic,
identyfikuje cztery kandydatów na agregaty (`Lesson`, `Instructor`, `Token` jako właściwość
`Lesson`, `Student`) wraz z ich niezmiennikami i stopniem egzekwowania w aplikacji vs bazie, oraz
zestawia siedem konkretnych rozjazdów model-vs-kod. Najważniejszy wniosek: tam, gdzie v2 świadomie
przeprojektował mechanizm dostępu instruktora (permanent token → one-time per-lesson token), kod
jest wzorowo zsynchronizowany z dokumentem — ale reguła koherencji student-kategoria-instruktor,
jawnie nazwana już w v1, nigdy nie została w pełni zaimplementowana po stronie serwera, co czyni ją
priorytetem #1 do refaktoru. Ogólnie: kod nadąża za `prd-v2.md` bardzo dobrze w obszarze, który był
głównym powodem napisania v2 (dostęp instruktora), słabiej w obszarach pobocznych wobec tego
przeprojektowania (widoczność powodu odrzucenia, edycja e-maila instruktora) i ma jedną
odziedziczoną po v1 lukę, której v2 nie dotknął w ogóle.
