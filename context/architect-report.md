---
title: "Raport architektoniczny — Moduł 4 (10xArchitect)"
created: 2026-08-02
type: architecture-report
sources:
  - repo: tldraw
    path: context/map/repo-map.md
  - repo: tldraw
    path: context/changes/shape-persist-flow/research.md
  - repo: tldraw
    path: context/changes/refactor-opportunities/research.md
  - repo: tldraw
    path: context/changes/refactor-opportunities/plan.md
  - repo: driving-school-planner
    path: context/domain/01-domain-distillation.md
  - repo: driving-school-planner
    path: context/domain/02-invariant-aggregate-refactor.md
  - repo: driving-school-planner
    path: context/domain/03-anti-corruption-layer.md
---

# Raport architektoniczny — Moduł 4

Synteza pięciu artefaktów z **dwóch niepowiązanych repozytoriów**. Nic poniżej nie wykracza poza
to, co te artefakty stwierdzają; gdzie artefakt czegoś nie mówi, napisane jest to wprost.

## 1. Opisane projekty

| Repo | Projekt | Stack | Skala (wg artefaktów) | Pojawia się w |
|---|---|---|---|---|
| **tldraw** | SDK do canvas/whiteboard + produkt dotcom | Yarn monorepo, TypeScript. `packages/editor` (rdzeń), `packages/tldraw` (domyślny SDK), `apps/dotcom` (produkt, głównie `tla`), `apps/examples`/`apps/docs` | Duże, dojrzałe monorepo: `Editor.ts` = 11 799 linii / 335 metod; 15 pakietów objętych bramką CI `check-circular-deps`; 60 plików importuje `Editor` bezpośrednio, ~100 przez barrel pakietu | L2 (`repo-map.md`), L3 (`shape-persist-flow/research.md`), L4 (`refactor-opportunities/{research,plan}.md`) |
| **driving-school-planner** | DrivePlan — planer lekcji jazdy | Next.js 16 App Router + Supabase (Postgres + Auth) + Tailwind v4, Vercel | Mały MVP: jedna szkoła, biuro 1–3 osoby, sekundarnie instruktorzy; ACL-owy przeciek dotyczy ≥16 plików w całym repo | L5 (`context/domain/01–03`) |

---

## 2. Mapa projektu — tldraw (L2, `repo-map.md`)

- **Lokalne centra (hoty):** `packages/editor/src/lib/editor/Editor.ts` — #1 plik wg częstości zmian, węzeł 88 cykli (94% cykli swojego obszaru wg `dependency-cruiser`); para `packages/tldraw/src/lib/ui/context/{actions,components}.tsx` — hub 68 cykli, najsilniej sprzężony z `tla` (37/35 co-commitów, ~16–20%).
- **Strefa najszerszego promienia:** `apps/dotcom/client/src/tla` — nie definiuje prymitywów, ale jest dziś najaktywniejszym istniejącym obszarem repo, sprzężonym z UI, edytorem, e2e i stronami naraz.
- **Katalog kłamie:** `packages/create-tldraw` wygląda jak część SDK, a to zvendorowane CLI, na tyle nietypowe, że **crashuje** ekstraktor `dependency-cruiser` — zero danych strukturalnych. Odwrotnie: `fairy`/`packages/fairy-shared` mają najwyższą surową liczbę zmian folderowych (1354) w całym repo, ale kod **już nie istnieje** (usunięty jednym commitem, 2026-02-05, -55 235 linii).
- **Entry pointy ("Pierwszy dzień"):** `packages/editor/src/index.ts` → `Editor.ts` → `packages/tldraw/src/index.ts` → `actions.tsx`/`components.tsx` → `apps/dotcom/.../TldrawApp.ts` → `TlaEditor.tsx` → (dla multiplayer) `TLFileDurableObject.ts` — z zastrzeżeniem, że stary `TLDrawDurableObject.ts` z tej samej listy TOP 10 też już nie istnieje (rozbity 2026-04-23).
- **Najważniejsze unknowns:** brak formalnej analizy granic publicznego API/entry pointów; brak metryk Ca/Ce/instability (status "hubu" liczony po cyklach i częstości zmian, nie formalną metryką); warstwa ops/infra (TOML/YAML/workery) niewidzialna dla grafu importów — wiedza o niej pochodzi wyłącznie z historii gita.

---

## 3. Analiza ficzera — tldraw (L3, `shape-persist-flow/research.md`)

**Wybrany przepływ i dlaczego:** przepływ zapisu/mutacji kształtu (`tool → Editor.createShape/updateShape → store → tlschema`) — wybrany wprost dlatego, że przechodzi przez obszary już oflagowane jako strefy ryzyka w L2 (edytor, store, tlschema, hub `tldraw/lib/ui`).

**Feature overview:** jeden, spójny pipeline bez rozgałęzień per-typ-kształtu na poziomie store/schema: `StateNode` (narzędzie) → `Editor.createShape/updateShape` → hooki `onBeforeCreate`/`onBeforeUpdate` shape-utila → `Editor.run()`/`HistoryManager.batch()` → `@tldraw/state transact()` → `Store.atomic()` → `Store.put()` (walidacja przez `schema.validateRecord`, potem `AtomMap.set`) → `flushChanges()` → albo bezpośredni zapis DOM (`useQuickReactor`, ścieżka pozycjonowania), albo pełny re-render Reacta → i z powrotem przez generyczny mechanizm side-effects Store'a (bindingi dla strzałek, `onChildrenChange` re-wchodzące w `updateShapes`). Migracje **nie** uruchamiają się przy zwykłym zapisie tej samej wersji — tylko na granicy import/persystencja, potwierdzone ast-grepem na **6 realnych call site'ów** repo-wide.

**Technical debt (2–3 ryzyka):**
1. **Zero plików testowych walidatorów props kształtu** w `packages/tlschema/src/shapes/` — **potwierdzone ast-grepem** (`describe($$$)` → 0 dopasowań w tym katalogu) i ripgrepem; jedyny dowód runtime, że nieprawidłowe props rzucają, to luźne, niesamoizolowane `.toThrow()` w testach komend.
2. `packages/tlschema/src/migrations.test.ts` — 2 797 linii, 104 bloki `describe`, **de facto pojedynczy punkt koordynacji konfliktów mergowania** across 12 typów kształtów, które wywołują `createShapePropsMigrationSequence` (ast-grep: dokładnie 12 z 13 realnych plików kształtów; `TLArrowShape` to świadomy wyjątek).
3. Nadpisania `ShapeUtil.onBeforeUpdate` dla realnych kształtów (4: Bookmark/Text/Note/Geo, potwierdzone ripgrepem) nie mają **żadnego** dopasowującego pliku testowego pod `packages/tldraw/src/test/`.

(Warto odnotować proces weryfikacji: wcześniejszy szkic tego samego raportu błędnie twierdził, że awaria migracji "nigdy nie jest testowana" — po ast-grep/ripgrep okazało się, że jest testowana end-to-end na poziomie `sync-core`; raport sam to koryguje.)

---

## 4. Plan refaktoryzacji — tldraw (L4, `refactor-opportunities/plan.md`, ranking z sąsiedniego `research.md`)

**Kontekst rankingu:** `research.md` w tym samym folderze rankuje trzy kandydatów. #1 (ten plan) — split `migrations.test.ts`. #2 — wydzielenie metod SVG/eksportu `Editor.ts` do `ExportManager`, ze świadomym doprecyzowaniem: "94% cykli" `Editor.ts` z L2 okazało się w dużej mierze **artefaktem narzędzia** (`tsPreCompilationDeps: true` liczy importy `import type` jako cykle; realna, zacommitowana bramka CI raportuje **zero** cykli). C3 (rytuał rejestracji schematu kształtu) **odrzucony** jako refaktor strukturalny — deliberate, udokumentowany, ograniczony publicznym API; wartościowym następnym krokiem tam jest test, nie refaktor.

**Co refaktoryzowane i docelowy kształt:** jeden plik `migrations.test.ts` (2 797 linii / 104 bloki, tylko 53 z nich to realnie treść per-kształt) → 12 plików `packages/tlschema/src/shapes/<Shape>.migrations.test.ts` (mirror istniejącej konwencji `shapes/*.ts`) + 1 `cross-shape-migrations.test.ts` (8 bloków wielokształtowych/root-shape) + nowy statyczny `migrations-coverage.test.ts` (zastępuje kruchy, oparty na spy-ach check kompletności, który nie przetrwałby splitu) + `migrations.test.ts` zostaje z 46 blokami nie-kształtowymi.

**Czego świadomie NIE robimy:** refaktor #2 (`ExportManager`) — niezależny, inny pakiet, odłożony; nie ruszamy `.dependency-cruiser.cjs`/metryki cykli; nie dzielimy pozostałych 46 bloków nie-kształtowych; nie dodajemy testów walidatorów props (osobny follow-up); **zero zmian w logice `up`/`down` migracji** — to czysta reorganizacja plików testowych.

**Fazy (jedna linijka + weryfikacja):**
1. Nowy statyczny check pokrycia migracji, dowiedziony na obecnym, niepodzielonym pliku → `yarn test run migrations-coverage.test.ts` + pełny pakiet + typecheck; ręcznie: sztucznie zepsuć jedną migrację i potwierdzić, że check ją łapie po nazwie.
2. Właściwy split treści kształtów na 12+1 plików, usunięcie starego checku spy-based → pełny `yarn test run`, `grep` potwierdzający usunięcie starego bloku, parytet liczby testów, typecheck; ręcznie: spot-check 2–3 nowych plików.
3. Konsolidacja odkrytej po drodze duplikacji store-level (4 zdublowane migracje + 1 przeniesiona + 2 rozbite mieszane bloki) → `store-migrations.test.ts` ma 5 bloków, `grep` zero referencji `storeVersions.` w starym pliku, pełny pakiet; ręcznie: diff scenariuszy między starymi kopiami.
4. Aktualizacja `README.md` konwencji autorskiej migracji → `grep` potwierdzający nową treść; ręczne czytanie.

---

## 5. Domena wg DDD — driving-school-planner (L5, `context/domain/01–03`)

**Ubiquitous language (3–5 pojęć, z `01-domain-distillation.md`):** *Lesson* (instruktor+student+kategoria+termin+status); *Licence category* — asymetria celowa: instruktor ma **tablicę** kategorii, student **dokładnie jedną**; *One-time lesson token* — token per-lekcja, jednorazowy, zastąpił w v2 stary permanentny token per-instruktor; *Rejection reason* — wymagany w v1, opcjonalny w v2; *Instructor email / send-override email* — pole istnieje w schemacie, ale edycja przez biuro (FR-013 z `prd-v2.md`) nigdy nie została zbudowana.

**Najważniejsze rozjazdy model-vs-kod:** (1) koherencja kategorii studenta — PRD v1 wprost: "all three must align for a lesson to exist" — **nigdy nie zaimplementowana server-side**, kod nawet nie pobiera kolumny `students.category`; (2) `prd-v2.md` FR-013 opisuje edytowalny e-mail instruktora — kod świadomie odjechał od tego (rework 2026-07-11, nigdy nie zapisywany), a dokument **nie został zaktualizowany**; (3) powód odrzucenia jest poprawnie zapisywany w bazie, ale **nigdy niewyświetlany biuru** mimo że `prd-v2.md` opisuje to jako działające — udokumentowany "known gap".

**Niezmiennik #1 i agregat (z `02-invariant-aggregate-refactor.md`):** wybrany niezmiennik — koherencja kategorii **studenta** z kategorią lekcji — jednocześnie tak samo rdzeniowy jak analogiczna reguła dla instruktora (to samo zdanie PRD) i jedyny na liście 7 niezmienników z **zerowym** egzekwowaniem na jakimkolwiek poziomie. Projekt: agregat `Lesson` z fabryką `Lesson.propose()` jako jedynym miejscem konstrukcji (precondition na obie połowy reguły kategorii), repozytorium wołające jedną atomową funkcję RPC `book_lesson` (wzorowaną na istniejącym `respond_to_lesson`), oraz dwa constrainty `EXCLUDE USING gist` w Postgresie naprawiające przy okazji double-booking instruktora (dziś częściowy) i studenta (dziś zerowy).

**ACL (z `03-anti-corruption-layer.md`):** przecieka **Supabase SDK** (`@supabase/supabase-js` + `@supabase/ssr`) wraz z surowym kształtem PostgREST/RPC — przez **≥16 plików**: 7 importujących SDK/wrapper bezpośrednio poza `src/lib/supabase/` (w tym dwie strony UI Server Component odpytujące bazę wprost), 9 plików UI znających surowy kształt joina (`LessonRow`/`StudentRow`/nietypowany wiersz RPC), plus 5 miejsc niezależnie rekonstruujących konfigurację klienta. Kontrast: `resend` i `ai`/`@ai-sdk/openai` mają jawną deklarację wymienialności w `prd-v2.md:115` i są już odizolowane w jednym pliku każdy — Supabase takiej deklaracji nie ma, a przecieka najgłębiej. Projekt ACL: wąskie porty (`LessonRepository` itd.) + typy domenowe (`Lesson`, `StudentSummary`) jako jedyny kształt widoczny dla UI, adapter `SupabaseLessonRepository` (z `import 'server-only'`) jako jedyne miejsce znające Supabase.

---

## 6. Decyzje, które należą do mnie

AI (agent) dostarczył: inwentarze i klasyfikacje (mapa ryzyka, lista niezmienników, lista przecieków), zweryfikowane fakty strukturalne (ast-grep/ripgrep zamiast domysłu), ranking opcji wraz z uzasadnieniem, oraz konkretne szkice projektowe (agregat, porty, fazy). To, co **nie** zostało rozstrzygnięte przez AI, a wprost odłożone do decyzji człowieka: tldraw'owy `research.md` jawnie kończy się listą *Open questions* "deferred to planning" (np. czy pokrycie migracji na poziomie `sync-core` wystarcza, czy dociągać jeszcze `packages/store`), a `plan.md` ma wbudowaną w każdą fazę pauzę — "pause here for manual confirmation from the human" — czyli proces sam zakłada punkt kontrolny, nie autonomiczne wdrożenie. Podobnie w driving-school-planner: to ja decyduję, czy priorytet #1 (koherencja kategorii studenta) rzeczywiście przebija w kolejce prac widoczność powodu odrzucenia (biznesowo równie dotkliwy, choć mniej "core" wg klasyfikacji), czy `EXCLUDE USING gist` kontra trigger to właściwy wybór dla mojego zespołu, i w jakim tempie zamykać permisywną politykę RLS bez ryzyka zablokowania biura w trakcie wdrożenia. AI zrobiło robotę odkrywczą i diagnostyczną rzetelnie i z cytatami — ale wybór, co i kiedy faktycznie wdrożyć, zostaje po mojej stronie.
