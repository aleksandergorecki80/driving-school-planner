---
title: "DrivePlan — Invariant & Aggregate Refactor Plan: Category Coherence"
created: 2026-08-02
type: refactor-plan
invariant: category-coherence-student-instructor
sources: [prd.md, prd-v2.md, context/domain/01-domain-distillation.md]
---

# DrivePlan — plan refaktoru: strażnik niezmiennika koherencji kategorii

To jest **plan**, nie implementacja. Żaden plik produkcyjny nie został zmieniony. Fragmenty kodu
poniżej to szkice projektowe (sygnatury, pseudokod SQL/TS) ilustrujące docelowy kształt, nie kod do
wklejenia.

`context/domain/01-domain-distillation.md` (dalej: "distillation") był użyty jako punkt startowy,
ale każde jego twierdzenie odnoszące się do tego zadania zostało zweryfikowane od nowa przeciwko
aktualnemu kodowi (patrz KROK 0–1) — nie zostało przepisane na wiarę.

---

## KROK 0 — Kontekst (zweryfikowany)

**Warstwy logiki biznesowej:**
- Server actions: `src/app/actions/lessons/{createLesson,cancelLesson,respondToLesson,regenerateLessonToken}.ts`
- API routes: `src/app/api/` zawiera wyłącznie `sentry-example-api/route.ts` — brak logiki domenowej w API routes; cała logika żyje w server actions + RPC.
- UI: `src/app/office/components/lesson-panel/NewLessonForm.tsx`, `src/app/office/components/sidebar/InstructorSidebar.tsx`
- Persystencja: `supabase/migrations/*.sql` (13 plików) — RLS policies, `lesson_status` enum, `respond_to_lesson`/`get_lesson_by_token` RPC, jeden częściowy unikalny indeks.
- Testy: `vitest` (`src/**/*.test.ts`, konfiguracja `vitest.config.ts:1-18`) + `playwright` (`e2e/*.spec.ts`, `playwright.config.ts:1-11`). Istnieje `src/lib/supabase/test-client.ts:31-84` z gotowymi helperami `seedInstructor`/`seedStudent`/`seedLesson`/`cleanupRows` — wzorzec do naśladowania w nowych testach.

**Weryfikacja priora (distillation):** twierdzenie distillation, że "category-student coherence"
nie jest egzekwowane server-side, zostało **potwierdzone** ponownym grep-em i odczytem
`createLesson.ts` w tej sesji — patrz KROK 3. Twierdzenie o częściowym indeksie unikalnym
(`lessons_instructor_slot_unique`) łapiącym tylko dokładny duplikat też potwierdzone. Nowe w tej
analizie (distillation tego nie zauważył): student **w ogóle nie ma pobieranej kolumny
`category`** w zapytaniu `createLesson.ts:41-45` (`.select('id')`) — czyli check nie mógłby
zostać dodany bez też rozszerzenia selecta. To mocniejszy dowód luki niż samo "brak porównania".

---

## KROK 1 — Lista niezmienników (z cytatami)

| # | Niezmiennik | Źródło (dokument) | Źródło (kod) |
|---|---|---|---|
| I1 | Instruktor musi posiadać kategorię lekcji | `prd.md:98-100` | `src/app/actions/lessons/createLesson.ts:37-39` |
| I2 | Student musi posiadać kategorię lekcji ("all three must align") | `prd.md:102` | **brak** — `createLesson.ts:41-45` nawet nie pobiera `students.category` |
| I3 | Jeden instruktor = jedna aktywna lekcja na nachodzący ±1h slot | implicit + `prd-v2.md:51` | app: `createLesson.ts:19-23,48-63`; DB (częściowo): `supabase/migrations/20260628000002_add_unique_lesson_slot_index.sql:4-5` |
| I4 | Jeden student = jedna aktywna lekcja na nachodzący ±1h slot | implicit + `prd-v2.md:51` | app: `createLesson.ts:65-80`; DB: brak |
| I5 | Token lekcji autoryzuje dokładnie jedną decyzję, ginie natychmiast po użyciu | `prd-v2.md:133-135` | DB: `supabase/migrations/20260704213336_lesson_token_functions.sql:31-41` (atomowe `SELECT...FOR UPDATE` + `UPDATE`) |
| I6 | `rejection_reason` ustawiane wyłącznie przy `status='rejected'` | implicit z `prd-v2.md:68` | DB: `supabase/migrations/20260705155520_scope_rejection_reason_to_rejected_decision.sql:27-28` |
| I7 | Anulowanie unieważnia token lekcji | `prd-v2.md:97-98` | app: `src/app/actions/lessons/cancelLesson.ts:12` |

---

## KROK 2 — Klasyfikacja i wybór #1

| # | (a) Rdzeniowość | (b) Rozsmarowanie po warstwach | (c) Poziom egzekwowania |
|---|---|---|---|
| I1 | Core — wprost nazwane w PRD Business Logic | 1 miejsce app (`createLesson.ts:37-39`) + pośrednio UI (`NewLessonForm.tsx` filtruje instruktorów per select kategorii instruktora) | **App only** — brak DB constraintu wiążącego `lessons.category` z `instructors.categories` |
| **I2** | **Core — ta sama zdanie PRD co I1, jawnie nazwane jako rozszerzenie tej samej reguły** | **0 miejsc egzekwujących** — jedyny ślad to filtr UX w `NewLessonForm.tsx:51`, który nie jest strażnikiem (klient może wysłać dowolny `studentId`/`category` przez wywołanie akcji bezpośrednio) | **Brak — zero.** Nawet dane wejściowe do checku (`students.category`) nie są pobierane server-side |
| I3 | Core — to dosłownie problem nazwany w Vision (`prd.md:20-22`, konflikty terminarza) | 2 miejsca app + 1 DB (indeks) | Częściowe DB (tylko identyczny `scheduled_at`) + app (okno ±1h, nieatomowe) |
| I4 | Core — jak I3 | 1 miejsce app | **App only, zero DB** |
| I5 | Core (to sedno `prd-v2.md`) | 1 RPC, dobrze scentralizowane | **Pełne DB, atomowe** — wzorcowy przykład w tym repo |
| I6 | Supporting (integralność danych pola pomocniczego) | 1 RPC | Pełne DB |
| I7 | Core-adjacent | 1 akcja | App (pojedynczy atomowy UPDATE, wystarczające) |

**Wybór: I2 — koherencja kategorii studenta.**

Uzasadnienie: I2 dzieli dokładnie to samo zdanie PRD co I1 ("all three must align for a lesson to
exist", `prd.md:102`) — jest więc **tak samo rdzeniowe** jak reguła instruktor-kategoria, którą
nikt by nie zakwestionował jako core. Jednocześnie jest to **jedyny niezmiennik na liście z zerowym
egzekwowaniem na jakimkolwiek poziomie** — I1, I3, I4 mają przynajmniej częściową ochronę
aplikacyjną, I5/I6 mają pełną ochronę bazodanową. I2 nie ma nic — nie tylko brakuje mu DB
constraintu, brakuje mu nawet odczytu danych potrzebnych do sprawdzenia. To czyni go jednocześnie
**najbardziej rdzeniowym i najsłabiej egzekwowanym** kandydatem, zgodnie z kryterium KROK 2.

(I4 był bliskim kandydatem — też core, też zero DB — ale ma przynajmniej ślad w aplikacji
[`createLesson.ts:65-80`]; I2 nie ma nawet tego, więc wygrywa jako ostrzejszy przypadek tej samej
kategorii problemu.)

---

## KROK 3 — Diagnoza niezmiennika I2

### Gdzie reguła żyje dziś (wszystkie warstwy)

| Warstwa | Plik:linia | Co robi |
|---|---|---|
| Dokument | `prd.md:102` | Deklaruje regułę wprost, ale to jedyne miejsce jej istnienia jako *zapisanej* reguły |
| Server action | `createLesson.ts:41-45` | Pobiera studenta z bazy — **ale tylko `.select('id')`**, kolumna `category` nie jest nawet w zapytaniu |
| Server action | `createLesson.ts:46` | `if (!student) return { error: 'Student not found' }` — jedyny check dot. studenta: czy istnieje, nie czy pasuje kategorią |
| UI | `NewLessonForm.tsx:51` | `const filteredStudents = students.filter((s) => s.category === selectedCategory)` — filtruje listę **wyświetlaną w `<select>`**, nic więcej |
| UI | `NewLessonForm.tsx:142-157` | Renderuje tylko przefiltrowanych studentów jako `<option>` — ale `<select name="studentId">` w DOM nie ma żadnego ograniczenia po stronie przeglądarki, które zapobiegałoby wysłaniu innego `studentId` (np. przez zmodyfikowane żądanie `fetch` do server action, DevTools, czy przyszły inny klient tej samej akcji) |
| Baza | — | **BRAK** — żaden constraint, trigger, RLS policy w 13 plikach migracji nie odnosi się do `students.category` w kontekście `lessons` |

### Ocena wg pytań diagnostycznych

- **Które warstwy jej nie egzekwują?** Wszystkie poza UI. Baza: brak. Server action: brak (mimo
  że to właśnie tu żyje analogiczny check dla instruktora, linie 37-39 tego samego pliku).
- **Gdzie egzekwowana niespójnie?** Nie jest to nawet "niespójność" w sensie różnych wyników w
  różnych miejscach — to strukturalna asymetria: I1 (instruktor) ma dokładnie ten sam kształt
  reguły i jest sprawdzany w server action; I2 (student), część tego samego zdania PRD, nie jest
  sprawdzany wcale. To najbardziej czytelny w tym repo przykład "połowicznie wdrożonej reguły".
- **Gdzie klient/UI jest jedynym strażnikiem?** Dokładnie tu. `NewLessonForm.tsx:51` to jedyna
  linia kodu, która kiedykolwiek "wie" o tej regule — i jest to filtr wyświetlania, nie walidacja.
  Każde wywołanie `createLesson()` z pominięciem tego formularza (inny komponent, ręczne
  wywołanie akcji, przyszłe API) całkowicie omija regułę.
- **Gdzie błąd jest "połykany" zamiast zatrzymywać operację?** To niuans: w tym repo istnieją
  świadome, udokumentowane przypadki połykania błędu (np. `suggestRejectionReasons.ts:28-34` —
  zamierzone graceful degradation dla FR-012; `createLesson.ts` zwraca `warning` zamiast `error`
  przy niepowodzeniu wysyłki maila). To **nie jest ten przypadek** — tu nie ma nawet checku,
  którego błąd mógłby zostać połknięty. Efekt jest gorszy niż połknięty błąd: **operacja INSERT
  przechodzi bezwarunkowo**, bo warunek nigdy nie został napisany, nie dlatego że został
  napisany i celowo zignorowany.
- **Ochrona aplikacyjna vs bazodanowa:** Aplikacyjna — brak. Bazodanowa — brak. Jest tylko ochrona
  kosmetyczna w warstwie prezentacji.

### Czynnik pogłębiający: RLS jest permisywne

`supabase/migrations/20260628000001_add_cancelled_lesson_status.sql:9-10`:
```sql
CREATE POLICY "office_insert_lessons"
  ON lessons FOR INSERT TO authenticated WITH CHECK (true);
```
`WITH CHECK (true)` oznacza, że **każdy** klient z aktywną sesją office (współdzielone konto) może
wstawić dowolny wiersz `lessons` bezpośrednio przez PostgREST, całkowicie z pominięciem
`createLesson.ts`. To nie jest samo w sobie niezmiennikiem biznesowym, ale jest przyczyną,
dla której "napraw w server action" nie wystarczy jako pełne rozwiązanie — dopóki RLS pozostaje
permisywne, server action jest tylko jedną z kilku możliwych dróg zapisu, nie jedyną. Stąd projekt
w KROK 4 celowo przenosi ostateczne egzekwowanie do bazy (RPC + constraint), nie tylko do TS.

---

## KROK 4 — Projekt agregatu-strażnika

### Agregat: `Lesson`

Root agregatu = `Lesson`. Jego **jedyny** legalny sposób powstania to fabryka `propose()`,
wymuszająca obie połowy reguły koherencji kategorii (I1 i I2 razem — to jedna reguł PRD, więc
jeden strażnik ma sens jako właściciel obu połówek, nie tylko brakującej).

```ts
// src/domain/lesson/Lesson.ts — SZKIC PROJEKTOWY, nie kod produkcyjny

type LicenceCategory = string // branded w realnej implementacji

interface InstructorProfile { id: string; categories: LicenceCategory[] }
interface StudentProfile    { id: string; category: LicenceCategory }

class InstructorCategoryMismatchError extends Error {
  constructor(readonly instructorId: string, readonly category: LicenceCategory) {
    super(`Instructor ${instructorId} does not hold category ${category}`)
  }
}
class StudentCategoryMismatchError extends Error {
  constructor(readonly studentId: string, readonly category: LicenceCategory) {
    super(`Student ${studentId} is not enrolled in category ${category}`)
  }
}

class Lesson {
  private constructor(
    readonly instructorId: string,
    readonly studentId: string,
    readonly category: LicenceCategory,
    readonly scheduledAt: Date,
  ) {}

  static propose(input: {
    instructor: InstructorProfile
    student: StudentProfile
    category: LicenceCategory
    scheduledAt: Date
  }): Lesson {
    if (!input.instructor.categories.includes(input.category)) {
      throw new InstructorCategoryMismatchError(input.instructor.id, input.category)
    }
    if (input.student.category !== input.category) {
      throw new StudentCategoryMismatchError(input.student.id, input.category)
    }
    return new Lesson(input.instructor.id, input.student.id, input.category, input.scheduledAt)
  }
}
```

Precondition I1 i I2 żyją teraz w **jednym** miejscu, symetrycznie — dokładnie tak, jak sugeruje
jedno zdanie PRD, które je opisuje.

### Niezmienniki I3/I4 (double-booking) — dlaczego nie mieszczą się w samej fabryce

Koherencja kategorii (I1/I2) jest sprawdzalna wyłącznie na podstawie danych przekazanych do
`propose()` — to prawdziwy niezmiennik pojedynczej instancji agregatu. Double-booking (I3/I4)
wymaga **porównania z innymi wierszami w bazie** (zbiór, nie pojedyncza instancja) — DDD-owo to
"set-based invariant", którego żadna czysta fabryka in-memory nie może zagwarantować pod
współbieżnością; wymaga backstopu bazodanowego. Ponieważ ten refaktor i tak przenosi cały zapis do
jednej transakcji RPC (patrz niżej), naturalnie staje się też właściwym miejscem na naprawienie
I3/I4 — opisane jako "przy okazji" w Before/After (KROK 5), nie jako osobny, dodatkowy zakres.

### Repozytorium

```ts
// src/domain/lesson/LessonRepository.ts — SZKIC

class SlotUnavailableError extends Error {
  constructor(readonly side: 'instructor' | 'student') { super(`Slot unavailable for ${side}`) }
}

interface SavedLesson { id: string; token: string }

class LessonRepository {
  constructor(private db: SupabaseClient) {}

  async save(lesson: Lesson): Promise<SavedLesson> {
    const { data, error } = await this.db.rpc('book_lesson', {
      p_instructor_id: lesson.instructorId,
      p_student_id: lesson.studentId,
      p_category: lesson.category,
      p_scheduled_at: lesson.scheduledAt.toISOString(),
    })
    if (error) throw error // błąd transportu/RPC — nie domenowy, propaguje się jako 500

    const row = data?.[0]
    if (!row?.ok) {
      switch (row?.error_code) {
        case 'INSTRUCTOR_CATEGORY_MISMATCH':
          throw new InstructorCategoryMismatchError(lesson.instructorId, lesson.category)
        case 'STUDENT_CATEGORY_MISMATCH':
          throw new StudentCategoryMismatchError(lesson.studentId, lesson.category)
        case 'SLOT_UNAVAILABLE_INSTRUCTOR':
          throw new SlotUnavailableError('instructor')
        case 'SLOT_UNAVAILABLE_STUDENT':
          throw new SlotUnavailableError('student')
      }
    }
    return { id: row.lesson_id, token: row.token }
  }
}
```

Repozytorium woła **jedną** RPC zamiast dzisiejszych czterech rozsianych zapytań
(`createLesson.ts:31-35`, `41-45`, `48-55`, `65-72`, `84-93` — pięć osobnych round-tripów do
bazy). RPC jest jedną funkcją PL/pgSQL, więc jej ciało wykonuje się w **jednej transakcji** —
sprawdzenie i wstawienie są atomowe względem siebie i względem innych równoległych wywołań.

### Co ląduje jako constraint w Supabase (nie w domenie)

1. **`book_lesson(p_instructor_id, p_student_id, p_category, p_scheduled_at)`** — nowa funkcja
   `SECURITY DEFINER`, wzorowana na istniejącym `respond_to_lesson`
   (`supabase/migrations/20260704213336_lesson_token_functions.sql:16-45`) — ten sam idiom:
   zwraca `TABLE(ok boolean, error_code text, lesson_id uuid, token uuid)` zamiast rzucać
   wyjątek, żeby wywołujący (repozytorium) dostawał strukturalny wynik, nie musiał parsować
   komunikatu Postgresa. Ciało: pobiera `instructors.categories`/`students.category`, sprawdza
   obie połowy I1/I2, robi `INSERT`, łapie `exclusion_violation` z constraintów niżej i mapuje na
   `SLOT_UNAVAILABLE_*` (rozróżnienie instruktor/student przez `GET STACKED DIAGNOSTICS` nazwy
   naruszonego constraintu).
2. **Dwa `EXCLUDE USING gist`** (wymaga `CREATE EXTENSION IF NOT EXISTS btree_gist`) —
   zastępują dzisiejszy `lessons_instructor_slot_unique`
   (`supabase/migrations/20260628000002_add_unique_lesson_slot_index.sql:4-5`), który łapie
   tylko identyczny `scheduled_at`:
   ```sql
   ALTER TABLE lessons ADD CONSTRAINT lessons_instructor_no_overlap
     EXCLUDE USING gist (instructor_id WITH =,
       tsrange(scheduled_at, scheduled_at + interval '1 hour') WITH &&)
     WHERE (status IN ('pending', 'confirmed'));

   ALTER TABLE lessons ADD CONSTRAINT lessons_student_no_overlap
     EXCLUDE USING gist (student_id WITH =,
       tsrange(scheduled_at, scheduled_at + interval '1 hour') WITH &&)
     WHERE (status IN ('pending', 'confirmed'));
   ```
   Semantyka `[scheduled_at, scheduled_at + 1h)` z operatorem `&&` daje **dokładnie** tę samą
   granicę co dzisiejszy app-owy check (`createLesson.ts:19-23`: okno ±1h, wyłącznie otwarte na
   obu końcach) — zweryfikowane na testowym przypadku brzegowym "dokładnie 1h później" z
   `lessons.test.ts:221-253`, który musi dalej przechodzić.
3. **Tightening RLS**: usunięcie/zawężenie `office_insert_lessons` (dziś `WITH CHECK (true)`,
   `20260628000001…sql:9-10`), tak by jedyną drogą tworzenia lekcji był `book_lesson` (SECURITY
   DEFINER omija RLS wewnętrznie — dokładnie ten sam wzorzec, którym `respond_to_lesson` już
   dziś obsługuje zapis anonimowy). Zamyka lukę permisywnego RLS opisaną w KROK 3.

Co **zostaje w domenie (TS), nie w bazie**: sama fabryka `Lesson.propose()` — daje szybki,
typowany błąd bez round-tripu do serwera, przydatny np. do walidacji formularza zanim
`createLesson()` w ogóle zawoła sieć. To świadome zdublowanie tej samej reguły w dwóch warstwach
("drzwi" i "sejf") — inne niż dzisiejsze zdublowanie, bo dziś reguła jest w jednym miejscu
niepełna (instruktor) i w drugim nieobecna (student); po refaktorze jest w obu miejscach **taka
sama i kompletna**.

### Cienka server action

```ts
// src/app/actions/lessons/createLesson.ts — SZKIC po refaktorze
export async function createLesson(data: CreateLessonInput) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const [instructor, student] = await Promise.all([
    fetchInstructor(db, data.instructorId),   // { id, categories, email }
    fetchStudent(db, data.studentId),         // { id, category } — TERAZ pobiera category
  ])
  if (!instructor) return { error: 'Instructor not found' }
  if (!student) return { error: 'Student not found' }

  try {
    const lesson = Lesson.propose({ instructor, student, category: data.category, scheduledAt: new Date(data.scheduledAt) })
    const saved = await new LessonRepository(db).save(lesson)
    // ... e-mail side-effect bez zmian, jak dziś (createLesson.ts:98-114)
    return {}
  } catch (err) {
    return { error: mapDomainErrorToMessage(err) } // 1:1 mapowanie błąd domenowy → string dla UI
  }
}
```

Parsowanie wejścia → `Lesson.propose()` → `repository.save()` → mapowanie błędu. Cała logika
przeniosła się z rozsianych `if`-ów do agregatu i RPC; server action nie zawiera już żadnego
zapytania sprawdzającego regułę biznesową samodzielnie.

---

## KROK 5 — Before/After, plan faz, testy

### Before/After

| Dzisiejsze miejsce | Dziś | Po refaktorze |
|---|---|---|
| `createLesson.ts:37-39` (I1) | `if (!instructor.categories.includes(category))` w akcji | Sprawdzane w `Lesson.propose()` **i** w `book_lesson` RPC (defense-in-depth) |
| `createLesson.ts:41-45` (I2) | `.select('id')` — kategoria studenta nawet nie pobierana | `.select('id, category')`; sprawdzane w `Lesson.propose()` **i** w RPC |
| `NewLessonForm.tsx:51` | Jedyny strażnik I2 (filtr UX) | Zostaje jako UX (szybki feedback w dropdownie), ale przestaje być jedynym strażnikiem — server odrzuci niepasującego studenta niezależnie od UI |
| `createLesson.ts:48-63` (I3) | App-owy check okna ±1h, nieatomowy względem współbieżnych żądań | `EXCLUDE USING gist` na `(instructor_id, tsrange)` — atomowe, wewnątrz `book_lesson` |
| `createLesson.ts:65-80` (I4) | App-owy check, zero DB | `EXCLUDE USING gist` na `(student_id, tsrange)` — nowy constraint, dziś nieistniejący |
| `20260628000002_add_unique_lesson_slot_index.sql` | Unikalny indeks łapiący tylko dokładny duplikat `scheduled_at` | Zastąpiony przez `lessons_instructor_no_overlap` (pełny zakres ±1h) |
| `office_insert_lessons` RLS (`WITH CHECK (true)`) | Dowolny authenticated insert omija wszystkie reguły | Zawężone/usunięte; `book_lesson` (SECURITY DEFINER) jedyną drogą zapisu |
| Komunikat błędu | `'Instructor does not hold this category'` (string, ad-hoc) | Nazwany błąd domenowy `InstructorCategoryMismatchError` / `StudentCategoryMismatchError`, mapowany na komunikat w jednym miejscu (`mapDomainErrorToMessage`) |

### Plan faz

Konwencja projektu: TDD tam, gdzie sensowne (widoczne w istniejących testach RPC —
`src/lib/supabase/lesson-token.test.ts` pisany przeciwko już istniejącej funkcji, ale
`lessons.test.ts` zawiera adnotacje "RED-state test" sugerujące test-first jako normę repo).

1. **Faza 1 — RPC `book_lesson` + constrainty (test-first, vitest).**
   Pisz test przeciwko RPC, zanim powstanie migracja (czerwony), potem migracja (zielony) —
   analogicznie do wzorca w `lesson-token.test.ts`. Nowy plik np.
   `src/lib/supabase/book-lesson.test.ts`, helpery z `test-client.ts` (`seedInstructor`,
   `seedStudent`, `cleanupRows`).
2. **Faza 2 — `Lesson.propose()` (test-first, vitest, czyste unit testy bez DB).**
   Najszybsza pętla feedbacku — brak I/O.
3. **Faza 3 — `LessonRepository` + rozszerzenie `lessons.test.ts` (test-first, vitest).**
   Rozszerzyć istniejący describe-block `createLesson — category-coherence`
   (`src/app/actions/lessons.test.ts:361-435`) o nowy przypadek studenta — dziś ten opisany blok
   **nie zawiera** ani jednego testu dla I2, co samo w sobie jest dowodem luki.
4. **Faza 4 — implementacja migracji** (RPC, `EXCLUDE`, zawężenie RLS) — zielone testy z Fazy 1.
5. **Faza 5 — implementacja domeny + przepisanie `createLesson.ts`** — zielone testy Fazy 2–3;
   **wszystkie istniejące testy w `lessons.test.ts` (linie 125–560) muszą przejść bez zmian** —
   to regresyjna siatka bezpieczeństwa potwierdzająca, że publiczny kontrakt akcji się nie zmienił.
6. **Faza 6 — weryfikacja E2E + porządki.** Uruchomić `e2e/office-books-lesson.spec.ts` (golden
   path przez prawdziwą przeglądarkę). Dodatkowego przypadku Playwright dla I2 **nie** dodawać —
   złamanie tego niezmiennika nie jest ryzykiem widocznym w DOM (UI i tak filtruje dropdown), więc
   zgodnie z zasadą projektu "DOM (snapshot) jest domyślny; E2E dla ryzyk wymagających
   przeglądarki" (`CLAUDE.md`), właściwym miejscem testu jest vitest na poziomie server
   action/RPC (Fazy 1 i 3), nie Playwright. Usunąć zastąpiony `lessons_instructor_slot_unique`.

### Przypadki testowe niezmiennika I2 (legalne i nielegalne)

| # | Operacja | Oczekiwany wynik |
|---|---|---|
| L1 | Kategoria lekcji = kategoria instruktora = kategoria studenta | Sukces, status `pending`, token wygenerowany |
| N1 | Kategoria lekcji ∉ `instructor.categories`, kategoria studenta pasuje | Błąd `InstructorCategoryMismatchError`, zero wierszy wstawionych |
| N2 | Kategoria lekcji pasuje instruktorowi, ale `student.category ≠ category` | Błąd `StudentCategoryMismatchError`, zero wierszy wstawionych — **dziś zielony test na to nie istnieje** |
| N3 | Zarówno instruktor, jak i student nie pasują kategorią | Błąd (który z dwóch? — RPC sprawdza instruktora pierwszy, więc `InstructorCategoryMismatchError` — do ustalenia i udokumentowania jako kolejność sprawdzeń) |
| L2 (regresja) | Dokładny duplikat slotu instruktora | Błąd `SlotUnavailableError('instructor')` (dziś: `'This slot is already booked'`) |
| L3 (regresja) | 30 min odstępu od istniejącej lekcji instruktora | Błąd `SlotUnavailableError('instructor')` |
| L4 (regresja, granica) | Dokładnie 1h odstępu od istniejącej lekcji instruktora | Sukces (granica wyłączona, zgodnie z `lessons.test.ts:221-253`) |
| N4 (nowy — dziś nieprotegowany) | Student ma nachodzącą lekcję z **innym** instruktorem | Błąd `SlotUnavailableError('student')` |
| C1 (współbieżność, nowy) | Dwa równoległe wywołania `book_lesson` dla tego samego instruktora i nachodzącego slotu | Dokładnie jedno kończy się sukcesem, drugie `SlotUnavailableError` — test dowodzący, że `EXCLUDE` faktycznie chroni przed race condition, czego dzisiejszy app-owy check-then-insert nie gwarantuje |
| L5 | Poprzednia lekcja studenta/instruktora ma status `cancelled`/`rejected` | Nowa lekcja na tym samym/nachodzącym slocie — sukces (constraint filtrowany `WHERE status IN ('pending','confirmed')`) |

---

## Podsumowanie

Zweryfikowałem od nowa priora z `01-domain-distillation.md` i potwierdziłem: reguła koherencji
kategorii studenta (`prd.md:102`, "all three must align") jest jedynym niezmiennikiem w tym
kodzie, który jest jednocześnie tak samo rdzeniowy jak analogiczna reguła instruktora, a przy tym
kompletnie niechroniony — `createLesson.ts` nawet nie pobiera kolumny `students.category`, więc
strażnikiem jest wyłącznie filtr dropdowna w `NewLessonForm.tsx:51`. Plan projektuje agregat
`Lesson` z fabryką `propose()` jako jedynym miejscem konstrukcji, repozytorium wołające jedną nową
funkcję RPC `book_lesson` (wzorowaną na istniejącym `respond_to_lesson`) jako jedyną atomową
ścieżkę zapisu, oraz dwa constrainty `EXCLUDE USING gist`, które przy okazji naprawiają też dwa
sąsiednie niezmienniki double-bookingu (I3 częściowo, I4 całkowicie nieprotegowany dziś). Kluczowa
decyzja architektoniczna: koherencja kategorii to niezmiennik pojedynczej instancji (żyje w
fabryce), a double-booking to niezmiennik zbioru (musi żyć w bazie) — rozróżnienie to determinuje
podział między domeną TS a constraintami Supabase. Plan faz jest test-first tam, gdzie to możliwe,
z jawnym wskazaniem, że test na złamanie I2 należy do vitest, nie do Playwright, zgodnie z
konwencją DOM-najpierw tego projektu.
