---
title: "DrivePlan — Anti-Corruption Layer Refactor Plan: Supabase Wire Shapes"
created: 2026-08-02
type: refactor-plan
sources: [prd-v2.md, tech-stack.md, README.md]
---

# DrivePlan — plan refaktoru: warstwa antykorupcyjna dla Supabase

To jest **plan**, nie implementacja. Żaden plik produkcyjny nie został zmieniony. Fragmenty kodu
poniżej to szkice projektowe (sygnatury, pseudokod), nie kod do wklejenia.

---

## KROK 0 — Kontekst

**Stack i zależności zewnętrzne** (`package.json:14-31`): `@supabase/ssr` (0.12), `@supabase/supabase-js`
(2.108), `@ai-sdk/openai` + `ai` (AI SDK), `resend` (email), `zod`, `next`/`react`.

**Warstwy kodu:**
- Server actions: `src/app/actions/{auth.ts, lessons/*.ts}`
- API routes: `src/app/api/sentry-example-api/route.ts` (Sentry, nieistotne domenowo),
  `src/app/auth/signout/route.ts` (jedyna produkcyjna route handler dotykająca Supabase)
- Middleware: `src/proxy.ts`
- UI (Server Components + client components): `src/app/office/**`, `src/app/lesson/[token]/**`
- Warstwa persystencji-w-aplikacji: `src/lib/supabase/{server,anon,service,client,test-client}.ts`
- `src/lib/ai/suggestRejectionReasons.ts`, `src/lib/email/sendLessonLink.ts`

**Deklaracje o wymienialności** (szukane w `context/foundation/*.md`):
- `prd-v2.md:115`: "an email-sending capability and an AI-backed reason-suggestion capability —
  the specific services are a downstream stack decision, **not part of this document**"
- `shape-notes.md:139`: "Sending email requires a new third-party service/credential — which
  service is a downstream stack decision, not a PRD concern."
- **Brak analogicznej deklaracji dla Supabase.** `tech-stack.md:29` mówi odwrotnie: "Supabase is
  **the intended** data and auth layer" — sformułowanie commitmentu, nie opcjonalności. Żaden
  dokument w `context/foundation/` nie sugeruje, że Supabase miałby być wymienialny.

Ta asymetria jest sama w sobie sygnałem wykorzystanym w KROK 2/3: dwie zależności z **jawną**
deklaracją wymienialności (email, AI) są dziś najlepiej odizolowane w kodzie; zależność bez
żadnej takiej deklaracji (Supabase) jest tą, która przecieka najgłębiej.

---

## KROK 1 — Identyfikacja przeciekających zależności

### Kandydat A: `resend` (e-mail)

| Plik:linia | Co robi |
|---|---|
| `src/lib/email/sendLessonLink.ts:1,15-21` | Jedyne miejsce importu `Resend` i wywołania `resend.emails.send()` |
| `src/app/actions/lessons/createLesson.ts:3,109` | Importuje **funkcję wrapper** `sendLessonLink`, nie `Resend` |
| `src/app/actions/lessons/regenerateLessonToken.ts:3,48` | To samo |

**Ocena:** 1 plik zna bibliotekę bezpośrednio. Już dziś dobrze odizolowana.

### Kandydat B: `ai` / `@ai-sdk/openai` (sugestie AI)

| Plik:linia | Co robi |
|---|---|
| `src/lib/ai/suggestRejectionReasons.ts:1-2,17-19` | Jedyne miejsce importu `generateText`/`Output`/`openai` |
| `src/app/actions/lessons/suggestRejectionReasonsAction.ts:2,17` | Importuje wrapper `suggestRejectionReasons`, nie SDK |

**Ocena:** 1 plik zna bibliotekę bezpośrednio. Już dziś dobrze odizolowana.

### Kandydat C: `@supabase/supabase-js` + `@supabase/ssr` + kształt wire (PostgREST row/RPC response)

**Bezpośrednie importy pakietu** (pełny grep `from '@supabase'`):

| Plik:linia | Pakiet | Kontekst |
|---|---|---|
| `src/lib/supabase/server.ts:1` | `@supabase/ssr` | wrapper `createClient()` (server, cookie-based) |
| `src/lib/supabase/client.ts:3` | `@supabase/ssr` | wrapper `createClient()` (browser) — **nieużywany nigdzie** (zero importów w `src/`) |
| `src/lib/supabase/anon.ts:1` | `@supabase/supabase-js` | wrapper `createAnonClient()` |
| `src/lib/supabase/service.ts:1` | `@supabase/supabase-js` | wrapper `createServiceClient()` — **nieużywany nigdzie** (zero importów w `src/`) |
| `src/lib/supabase/test-client.ts:2` | `@supabase/supabase-js` | testowe klienty |
| `src/proxy.ts:1` | `@supabase/ssr` | **rekonstruuje `createServerClient` samodzielnie**, nie woła `lib/supabase/server.ts` |
| `src/app/auth/signout/route.ts:1` | `@supabase/ssr` | **rekonstruuje `createServerClient` samodzielnie** — produkcyjny route handler, nie test |
| `src/middleware.test.ts:2` | `@supabase/ssr` | test — osobna rekonstrukcja logowania |
| `src/app/office/page.test.ts:2` | `@supabase/ssr` | test — osobna rekonstrukcja logowania |
| `src/app/actions/lessons.test.ts:2` | `@supabase/ssr` | test — osobna rekonstrukcja logowania |

**Import "opakowanych" klientów przez warstwy aplikacji** (wrapper centralizuje tylko URL/klucz,
nie kształt zapytań ani typ zwracany — zwraca surowy `SupabaseClient`):

| Plik:linia | Wrapper |
|---|---|
| `src/app/office/page.tsx:2` | `createClient` z `lib/supabase/server` — **UI Server Component** |
| `src/app/actions/auth.ts:3` | `createClient` |
| `src/app/actions/lessons/createLesson.ts:2` | `createClient` |
| `src/app/actions/lessons/cancelLesson.ts:2` | `createClient` |
| `src/app/actions/lessons/regenerateLessonToken.ts:2` | `createClient` |
| `src/app/actions/lessons/respondToLesson.ts:2` | `createAnonClient` |
| `src/app/lesson/[token]/page.tsx:2` | `createAnonClient` — **UI Server Component** |

**Zduplikowana rekonstrukcja tego samego typu/kształtu biblioteki** (ten sam PostgREST-owy
"many-to-one embeds as object, not array" problem, rozwiązywany trzy razy niezależnie):

| Plik:linia | Cytat |
|---|---|
| `src/app/office/components/types.ts:2-8` | `// lessons.student_id → students.id is many-to-one; PostgREST embeds as an object, not an array.` + ręcznie zdefiniowany typ `LessonRow` |
| `src/app/actions/lessons/regenerateLessonToken.ts:5-7` | `// lessons.instructor_id → instructors.id is many-to-one; PostgREST embeds as an object, not an array (...)` + osobny, lokalny typ `LessonWithInstructorEmail` |
| `src/app/office/page.tsx:55-57` | `// Supabase infers students join as array, but PostgREST returns an object for many-to-one FK (...). Cast to the correct shape.` + `(data as LessonRow[] | null)` |

Trzy pliki, trzy niezależne komentarze, trzy osobne typy (`LessonRow`, `StudentRow`,
`LessonWithInstructorEmail`) opisujące ten sam problem biblioteki — żadnego wspólnego miejsca.

**Kształt wire (surowy PostgREST/RPC row) używany bezpośrednio w UI, bez mapowania domenowego:**

| Plik:linia | Co się dzieje |
|---|---|
| `src/app/office/page.tsx:36-37,48-49,62-63` | Trzy surowe zapytania `.from('instructors')/.from('lessons')/.from('students')` bezpośrednio w komponencie strony |
| `src/app/office/components/types.ts:3-9,11-15` | `LessonRow`/`StudentRow` — typy 1:1 z kształtem PostgREST, eksportowane jako "wspólny typ UI" |
| `src/app/office/components/lesson-panel/LessonPanel.tsx:3,10,25,33` | Przyjmuje/przekazuje `LessonRow`/`StudentRow` |
| `src/app/office/components/calendar/WeeklyCalendar.tsx:3,9,12` | To samo |
| `src/app/office/components/calendar/CalendarGrid.tsx:2,18` | To samo |
| `src/app/office/components/calendar/LessonBlock.tsx:2,7,13,20` | `lesson.students?.name` czytane bezpośrednio w komponencie liścia |
| `src/app/office/components/lesson-panel/LessonPopover.tsx:5,11,52` | `lesson.students?.name`, `lesson.category`, `lesson.scheduled_at`, `lesson.status` czytane bezpośrednio |
| `src/app/office/components/lesson-panel/NewLessonForm.tsx:5,9,51` | `StudentRow` czytane bezpośrednio |
| `src/app/lesson/[token]/page.tsx:36-37,53,58,64,70-71` | `anon.rpc('get_lesson_by_token', ...)` wywoływane wprost w Server Component; wynik **nawet nietypowany** (`data?.[0]`, brak generyka na `.rpc()`) — pola `lesson.student_name`, `lesson.category`, `lesson.scheduled_at` czytane jako `any` i przekazywane dalej jako propsy do `LessonResponseForm` |

**Ocena:** 7 plików produkcyjnych importuje SDK lub jego wrapper bezpośrednio poza
`src/lib/supabase/`, kolejnych 9 plików UI zna surowy kształt PostgREST (`LessonRow`/`StudentRow`/
nietypowany RPC row), plus 5 plików łącznie (3 testy + `proxy.ts` + `signout/route.ts`)
rekonstruuje konfigurację klienta niezależnie od istniejących wrapperów. To zdecydowanie
najszerzej rozsmarowana zależność w projekcie.

---

## KROK 2 — Klasyfikacja i wybór

| Zależność | (a) Liczba dotkniętych plików/warstw | (b) Koszt/ryzyko wymiany dziś | (c) Deklarowana wymienialność w dokumentach |
|---|---|---|---|
| `resend` | 1 plik (`sendLessonLink.ts`) | Niski — jeden plik do przepisania | **Tak** (`prd-v2.md:115`), i kod to honoruje |
| `ai` / `@ai-sdk/openai` | 1 plik (`suggestRejectionReasons.ts`) | Niski | **Tak** (`prd-v2.md:115`), i kod to honoruje |
| **`@supabase/*` + kształt wire** | **≥16 plików** (7 importujących SDK/wrapper bezpośrednio poza `lib/supabase/`, 9 UI-owych znających surowy kształt PostgREST, nakładająco 5 rekonstruujących klienta) | **Bardzo wysoki** — dotyka middleware (`proxy.ts`), model bezpieczeństwa oparty o RLS, wszystkie 5 server actions, 2 strony UI i całe drzewo komponentów kalendarza | **Brak** — `tech-stack.md:29` traktuje Supabase jako trwały wybór, nigdy jako wymienialny |

**Wybór: Supabase SDK + jego surowy kształt wire (PostgREST rows / RPC responses).**

Uzasadnienie: to jedyny kandydat spełniający wszystkie sygnały z KROK 1 naraz — ten sam pakiet w
API+UI+serwisie, zduplikowana rekonstrukcja tego samego typu bibliotecznego (trzykrotnie, w trzech
plikach), typy wire (`LessonRow`/`StudentRow`/nietypowany RPC row) używane wprost jako "typ
domenowy UI". Rozjazd intencja-vs-kod działa tu odwrotnie niż podpowiada intuicja: zależności z
jawną deklaracją wymienialności (email, AI) są już dobrze izolowane — dokument o nich pamiętał, więc
ktoś zadbał o granicę. Supabase nie ma żadnej takiej deklaracji — nikt nie zaplanował dla niego
granicy — i to właśnie ono przecieka przez każdą warstwę aplikacji. Brak deklaracji okazuje się
silniejszym sygnałem ryzyka niż jej obecność.

---

## KROK 3 — Diagnoza

### Duplikacja rekonstrukcji klienta (zamiast reużycia `lib/supabase/server.ts`)

`src/lib/supabase/server.ts:4-27` definiuje `createClient()` — pełny, poprawny wrapper z
obsługą cookies dla Next.js Server Components/Actions. Mimo to:

- `src/proxy.ts:19-32` **kopiuje** niemal identyczną konfigurację `createServerClient` (URL, anon
  key, `cookies.getAll/setAll`) zamiast importować `lib/supabase/server.ts` — uzasadnione po
  części (middleware ma inny cykl życia żądania/odpowiedzi niż RSC), ale oznacza, że zmiana
  sposobu konstrukcji klienta (np. dodanie nagłówka, zmiana pakietu) musi być wykonana w dwóch
  miejscach.
- `src/app/auth/signout/route.ts:1,22-33` **też kopiuje** tę samą konfigurację — to jest
  produkcyjny route handler (nie middleware, nie test), więc to jest **czysta duplikacja bez
  uzasadnienia cyklem życia** — mógłby, ale nie musi, różnić się od `lib/supabase/server.ts` tylko
  tym, że buduje response wcześniej (komentarz `route.ts:17-19` tłumaczy dlaczego), ale sama
  konstrukcja klienta powinna dawać się reużyć.
- Trzy pliki testowe (`middleware.test.ts:2`, `office/page.test.ts:2`, `lessons.test.ts:2`)
  niezależnie odtwarzają wzorzec logowania przez `createServerClient` z ręcznym cookie store —
  legitymne dla testów integracyjnych, ale to nadal ta sama konfiguracja przepisana 3 razy zamiast
  jednego współdzielonego test helpera (`test-client.ts` ma to dla ról anon/service, nie ma dla
  "zalogowany jako office").

### Sprawdzony, ale NIEobecny sygnał "niebezpiecznego" przecieku

Zweryfikowano dokładnie scenariusz z instrukcji zadania: "biblioteka serwerowa / klucz serwisowy
Supabase wciągane do bundla klienta". **Nie występuje.** `src/lib/supabase/client.ts:1,5-10`
(jedyny plik z `'use client'` i `@supabase/ssr`) używa wyłącznie `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (publiczne z założenia) i **nie jest nigdzie importowany**
(potwierdzone grep-em `lib/supabase/client` w całym `src/` — zero wyników). `service.ts`
(`SUPABASE_SERVICE_ROLE_KEY`) też nigdzie nie jest importowany. Oba pliki to dziś martwy kod, nie
aktywny przeciek do klienta. To jednak **utajone ryzyko**: nic dziś nie broni, żeby ktoś w
przyszłości zaimportował `service.ts` z komponentu klienckiego — brak katalogowej/lintowej granicy
egzekwującej "ten kod jest tylko server-side" (projekt nie ma zależności `server-only`,
sprawdzone w `package.json:14-31`). KROK 4 zamyka tę lukę explicite.

### Kształt wire jako "typ domenowy" UI

`src/app/office/page.tsx:48-49` zapytanie `.select('id, scheduled_at, status, category,
students(name))` zwraca kształt PostgREST, który `page.tsx:55-57` ręcznie rzutuje na `LessonRow`
(`src/app/office/components/types.ts:3-9`) — i **ten sam typ**, bez żadnej pośredniej warstwy
mapującej, jest konsumowany 5 warstw w głąb drzewa komponentów: `page.tsx` → `LessonPanel.tsx:10`
→ `WeeklyCalendar.tsx:9` → `CalendarGrid.tsx:18` → `LessonBlock.tsx:7,20` oraz równolegle →
`LessonPopover.tsx:11,52`. Żaden z tych pięciu komponentów nie zna "domeny lekcji" — zna
`lessons.student_id → students.id many-to-one` PostgREST embedding, bo to jest jego typ danych.
Analogicznie `src/app/lesson/[token]/page.tsx:36-37` przekazuje surowe, nietypowane pola RPC
(`lesson.category`, `lesson.scheduled_at`) wprost jako propsy `scheduledAt`/`category` do
`LessonResponseForm.tsx:9-11` (`src/app/lesson/[token]/components/LessonResponseForm.tsx:7-11`) —
mapowanie snake_case → camelCase dzieje się inline w JSX (`page.tsx:70`:
`scheduledAt={lesson.scheduled_at}`), nienazwane, niepowtarzalne, bez typu pośredniego.

### Rozjazd intencja-vs-kod

`tech-stack.md:29`: "Supabase is **the intended** data and auth layer... **URL token access for
instructors handled at the application layer**" — dokument zakłada, że logika dostępu żyje w
warstwie aplikacji, oddzielonej od bazy. W praktyce `src/app/lesson/[token]/page.tsx:33-37` **jest**
tą warstwą aplikacji i woła RPC bezpośrednio z komponentu strony — nie ma żadnej pośredniej
warstwy między "Supabase" a "UI", więc zdanie z dokumentu jest formalnie prawdziwe (jakiś kod
aplikacji rzeczywiście to robi), ale nie w sensie architektonicznej separacji, jaką by sugerowało.

---

## KROK 4 — Projekt ACL

### Domenowe typy (value objects) — jedyny kształt, jaki widzi domena/UI

```ts
// src/domain/lesson/types.ts — SZKIC PROJEKTOWY

type LessonStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled'

interface Lesson {
  readonly id: string
  readonly instructorId: string
  readonly studentId: string
  readonly studentName: string
  readonly category: string
  readonly scheduledAt: Date          // nie string — Date, skonwertowany raz, w adapterze
  readonly status: LessonStatus
  readonly rejectionReason: string | null
}

interface LessonForInstructorView {   // to, co dziś zwraca get_lesson_by_token, ale NAZWANE
  readonly category: string
  readonly scheduledAt: Date
  readonly studentName: string
}

interface InstructorSummary { readonly id: string; readonly name: string; readonly categories: string[]; readonly email: string | null }
interface StudentSummary    { readonly id: string; readonly name: string; readonly category: string }
```

Żadne z tych pól nie jest `snake_case`, żadne nie jest zagnieżdżonym obiektem joina PostgREST —
konwersja `students(name) → studentName`, `scheduled_at → scheduledAt: Date` dzieje się **raz**, w
adapterze (niżej), nie inline w JSX czy w trzech niezależnych komentarzach jak dziś.

### Wąski port (interfejs domenowy)

```ts
// src/domain/lesson/LessonRepository.ts — SZKIC, tylko interfejs, zero importu Supabase

interface LessonRepository {
  findWeekForInstructor(instructorId: string, weekStart: Date, weekEnd: Date): Promise<Lesson[]>
  findByToken(token: string): Promise<LessonForInstructorView | null>
  // book/cancel/respond/regenerateToken — patrz też `02-invariant-aggregate-refactor.md`,
  // ten sam port jest naturalnym miejscem na `book()` z tamtego planu.
}

interface InstructorRepository {
  list(): Promise<InstructorSummary[]>
  findById(id: string): Promise<InstructorSummary | null>
}

interface StudentRepository {
  list(): Promise<StudentSummary[]>
}
```

Port nie zna `@supabase/supabase-js`, nie zna nazw tabel, nie zna PostgREST embedding — to jest
kontrakt, który UI i server actions widzą i na którym mogą pisać testy z podwójnym (fake)
repozytorium bez uruchamiania bazy.

### Adapter — jedyne miejsce znające Supabase

```ts
// src/lib/supabase/SupabaseLessonRepository.ts — SZKIC

import 'server-only' // twardy build-time guard: import z komponentu klienckiego = błąd kompilacji

class SupabaseLessonRepository implements LessonRepository {
  constructor(private db: SupabaseClient) {}

  async findWeekForInstructor(instructorId: string, weekStart: Date, weekEnd: Date): Promise<Lesson[]> {
    const { data } = await this.db
      .from('lessons')
      .select('id, instructor_id, student_id, scheduled_at, status, category, rejection_reason, students(name)')
      .eq('instructor_id', instructorId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString())

    return (data ?? []).map(toLesson) // jedyne miejsce mapowania row → Lesson
  }

  async findByToken(token: string): Promise<LessonForInstructorView | null> {
    const { data } = await this.db.rpc('get_lesson_by_token', { p_token: token })
    const row = data?.[0]
    return row ? { category: row.category, scheduledAt: new Date(row.scheduled_at), studentName: row.student_name } : null
  }
}

// Jedyne miejsce, gdzie żyje wiedza "PostgREST zwraca embed jako obiekt, nie tablicę" —
// zastępuje trzy niezależne komentarze z KROK 3.
function toLesson(row: RawLessonRow): Lesson {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    studentId: row.student_id,
    studentName: row.students?.name ?? 'Unknown',
    category: row.category,
    scheduledAt: new Date(row.scheduled_at),
    status: row.status,
    rejectionReason: row.rejection_reason,
  }
}
```

`import 'server-only'` w adapterze zamienia dzisiejsze "utajone ryzyko" (KROK 3) w twardy błąd
kompilacji, gdyby ktoś kiedyś zaimportował ten plik z komponentu klienckiego — zamyka lukę wokół
`service.ts`/`client.ts` na stałe, nie tylko przez konwencję.

### Cienkie strony/akcje

`office/page.tsx` i `lesson/[token]/page.tsx` przestają importować `@/lib/supabase/*`
bezpośrednio — zamiast tego wołają `lessonRepository.findWeekForInstructor(...)` /
`lessonRepository.findByToken(token)` i renderują `Lesson`/`LessonForInstructorView`, nigdy
surowy PostgREST row.

---

## KROK 5 — Dowód izolacji + before/after

### Dowód: wymiana Supabase dotyka wyłącznie adaptera

Gdyby jutro trzeba było zamienić Supabase na inną bazę (Postgres+Prisma, PlanetScale, cokolwiek):

1. `LessonRepository`/`InstructorRepository`/`StudentRepository` (porty) — **bez zmian**, to
   czyste interfejsy TypeScript, zero importu biblioteki.
2. `Lesson`/`LessonForInstructorView`/`InstructorSummary`/`StudentSummary` (typy domenowe) —
   **bez zmian**.
3. `office/page.tsx`, `lesson/[token]/page.tsx`, `LessonPanel.tsx`, `WeeklyCalendar.tsx`,
   `CalendarGrid.tsx`, `LessonBlock.tsx`, `LessonPopover.tsx`, `NewLessonForm.tsx` — **bez zmian**,
   widzą tylko `Lesson`/`StudentSummary`, nie wiedzą, skąd te dane pochodzą.
4. Wszystkie server actions (`createLesson.ts`, `cancelLesson.ts`, `respondToLesson.ts`,
   `regenerateLessonToken.ts`) — **bez zmian** w logice, tylko wstrzyknięte repozytorium (jedna
   linia importu).
5. **Zmienia się wyłącznie:** `src/lib/supabase/SupabaseLessonRepository.ts` (i analogiczne
   `SupabaseInstructorRepository.ts`, `SupabaseStudentRepository.ts`) — nowa implementacja portu
   dla nowego backendu. Migracje SQL (`supabase/migrations/`) i tak wymagałyby przepisania przy
   zmianie bazy niezależnie od tego refaktoru — to nie jest nowy koszt, tylko koszt, który już
   istniał, teraz jasno odizolowany.

### Before/After

| Miejsce | Dziś | Po refaktorze |
|---|---|---|
| `office/page.tsx:2,36-37,48-49,62-63` | Bezpośredni import `createClient`, trzy surowe zapytania `.from(...)` w komponencie strony | `lessonRepository.findWeekForInstructor(...)`, `instructorRepository.list()`, `studentRepository.list()` — brak wzmianki o Supabase |
| `office/page.tsx:55-57` | Ręczny rzutowania `(data as LessonRow[])` z komentarzem o PostgREST embed | Brak — mapowanie żyje raz w `toLesson()` w adapterze |
| `lesson/[token]/page.tsx:33-37` | `createAnonClient()` + `anon.rpc(...)` bezpośrednio w Server Component, wynik nietypowany | `lessonRepository.findByToken(token)` zwraca typowany `LessonForInstructorView` |
| `types.ts:2-9`, `regenerateLessonToken.ts:5-7` | Dwa niezależne, ręcznie zdefiniowane typy (`LessonRow`, `LessonWithInstructorEmail`) opisujące ten sam PostgREST embed | Jeden typ domenowy `Lesson`, jedno mapowanie, jeden komentarz o embed-quirku — w adapterze |
| `proxy.ts:19-32`, `auth/signout/route.ts:22-33` | Dwie niezależne rekonstrukcje `createServerClient` | `proxy.ts` zostaje odrębny (inny cykl życia, uzasadnione), ale `signout/route.ts` reużywa `lib/supabase/server.ts:4-27` zamiast kopiować konfigurację |
| UI komponenty (`LessonBlock.tsx:20`, `LessonPopover.tsx:52`) | Czytają `lesson.students?.name` (kształt joina) | Czytają `lesson.studentName` (pole domenowe) |
| `service.ts`/`client.ts` | Martwy kod, bez ochrony przed przypadkowym importem do klienta | `import 'server-only'` w adapterze — twardy błąd kompilacji przy próbie importu z `'use client'` |

UI po refaktorze **nigdy** nie widzi surowego obiektu biblioteki — dostaje gotowe `Lesson[]`
przez port, dokładnie tak jak wymaga KROK 5.

---

## KROK 6 — Weryfikacja i plan faz

### Kryterium sukcesu (grep)

Po refaktorze:
```
grep -rn "@supabase/supabase-js\|@supabase/ssr" src --include="*.ts" --include="*.tsx"
```
powinien zwracać wyłącznie pliki w `src/lib/supabase/` (adapter/ACL) — plus `src/proxy.ts`
(świadomy, udokumentowany wyjątek: middleware ma inny cykl życia żądania niż RSC/Server Actions,
nie da się go poprowadzić przez repozytorium bez utraty dostępu do `NextRequest`/`NextResponse`) —
oraz pliki testowe integracyjne (`*.test.ts`), które celowo testują prawdziwą bazę.

**Pliki, które DZIŚ znają zależność, a PO refaktorze przestają:**
- `src/app/office/page.tsx`
- `src/app/lesson/[token]/page.tsx`
- `src/app/actions/lessons/createLesson.ts`
- `src/app/actions/lessons/cancelLesson.ts`
- `src/app/actions/lessons/respondToLesson.ts`
- `src/app/actions/lessons/regenerateLessonToken.ts`
- `src/app/actions/auth.ts`
- `src/app/auth/signout/route.ts` (przestaje rekonstruować klienta, zaczyna reużywać wrapper)
- `src/app/office/components/types.ts` (typy `LessonRow`/`StudentRow` znikają, zastąpione importem `Lesson`/`StudentSummary` z `src/domain/lesson/types.ts`)
- `src/app/office/components/{lesson-panel,calendar}/*.tsx` (importują typy domenowe zamiast `LessonRow`/`StudentRow`)

**Pliki, które zostają jedynym miejscem znajomości zależności:**
- `src/lib/supabase/server.ts`, `anon.ts`, `service.ts`, `client.ts` (konstrukcja klienta)
- Nowe: `src/lib/supabase/SupabaseLessonRepository.ts`, `SupabaseInstructorRepository.ts`,
  `SupabaseStudentRepository.ts` (implementacje portów — jedyne miejsce z `.from()`/`.rpc()`/mapowaniem)
- `src/proxy.ts` (wyjątek udokumentowany wyżej)
- Pliki `*.test.ts` (seedowanie danych testowych to osobny problem niż architektura aplikacji)

Jeśli po fazie 5 grep zwróci jakikolwiek inny plik — refaktor nie jest kompletny.

### Plan faz (konwencja projektu: test-first tam, gdzie sensowne, patrz `02-invariant-aggregate-refactor.md`)

1. **Faza 1 — typy domenowe + porty (bez testów, czyste interfejsy TS).** `src/domain/lesson/types.ts`,
   `LessonRepository.ts`, `InstructorRepository.ts`, `StudentRepository.ts`.
2. **Faza 2 — adaptery Supabase (test-first, vitest).** Testy przeciwko realnej bazie (wzorem
   `src/lib/supabase/lesson-token.test.ts`) weryfikujące, że `SupabaseLessonRepository.findByToken`
   zwraca `Lesson`/`LessonForInstructorView` o poprawnym kształcie (camelCase, `Date`, brak
   zagnieżdżonego joina) — pisane PRZED implementacją mapowania.
3. **Faza 3 — przepięcie server actions.** Wstrzyknięcie repozytoriów zamiast bezpośrednich
   zapytań; istniejące testy w `lessons.test.ts` (linie 125–560) muszą przejść bez zmian kontraktu
   publicznego (regresja).
4. **Faza 4 — przepięcie UI (`office/page.tsx`, `lesson/[token]/page.tsx` i całe drzewo
   komponentów).** Usunięcie `LessonRow`/`StudentRow`/`LessonWithInstructorEmail`, podmiana na
   typy z `src/domain/lesson/types.ts`.
5. **Faza 5 — `import 'server-only'` w adapterach + weryfikacja grep-em** opisanym wyżej;
   uruchomienie pełnego `vitest` + `e2e/office-books-lesson.spec.ts` (Playwright) jako regresji
   golden-path.

---

## Podsumowanie

Zidentyfikowałem trzy zależności zewnętrzne o granicach warstwowych do sprawdzenia (`resend`,
`ai`/`@ai-sdk/openai`, `@supabase/*`) i stwierdziłem, że pierwsze dwie są już dobrze izolowane —
każda w jednym pliku, każda z jawną deklaracją wymienialności w `prd-v2.md:115`. Supabase jest
przeciwieństwem: żaden dokument nie deklaruje go jako wymienialnego, a mimo to (albo właśnie
dlatego) jego SDK i surowy kształt PostgREST/RPC przeciekają przez co najmniej 16 plików — dwie
strony UI odpytujące bazę bezpośrednio, całe drzewo komponentów kalendarza czytające pola joina
(`lesson.students?.name`), i trzy niezależnie napisane komentarze/typy rozwiązujące dokładnie ten
sam problem biblioteki ("PostgREST embeds as object, not array"). Sprawdziłem też explicite
najgroźniejszy możliwy wariant tego przecieku — klucz service-role w bundlu klienckim — i go nie
znalazłem (kod martwy, ale nieużywany); to utajone ryzyko, które projekt ACL zamyka na stałe przez
`import 'server-only'`. Plan wprowadza wąskie porty repozytoriów i typy domenowe (`Lesson`,
`StudentSummary`) jako jedyny kształt danych widoczny dla UI i server actions, z adapterem
`SupabaseLessonRepository` jako jedynym miejscem znającym `@supabase/*` — kryterium sukcesu to
grep po nazwie pakietu zwracający wyłącznie pliki w `src/lib/supabase/` plus udokumentowany
wyjątek `proxy.ts`.
