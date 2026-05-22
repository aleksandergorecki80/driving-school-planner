# DrivePlan — MVP ideas

### Główny problem

Koordynacja lekcji jazdy między biurem a instruktorami odbywa się przez telefon i SMS,
co prowadzi do konfliktów terminów, nieporozumień i marnowania czasu obu stron.

### Najmniejszy zestaw funkcjonalności

- Biuro widzi kalendarze wszystkich instruktorów (widok tygodniowy) z globalnym filtrem po kategorii uprawnień (B, C, D, T, B+E, C+E...) → filtr zawęża listę instruktorów do tych z uprawnieniami dla wybranej kategorii
- Biuro tworzy lekcję / jazdę w kalendarzu isntruktora wypełnia formularz: termin + kursant (wybór z listy LUB wpisanie ręczne dla "jazdy dodatkowej") → tworzy lekcję / jazdę ze statusem `pending`
- Instruktor widzi lekcję w kalendarzu → klika Zatwierdź / Odrzuć → status się zmienia
- Jedno konto biura z logowaniem (Supabase Auth)
- Synchronizacja w czasie rzeczywistym (Supabase Realtime)

### Co NIE wchodzi w zakres MVP

- Dostępność instruktora zaznaczana samodzielnie przez instruktora w jego prywatnym kalendarzu (po utworzeniu profili); biuro może również dodać dostępność instruktora ręcznie
- Prawdziwe konta instruktorów (widok instruktora przez URL z `?instructorId=`)
- Profile kursantow
- Kursy jako wydarzenia od - do z mozliwoscią dodawania kursantow (jeden kursant moze uczestniczyc w kilku kursach)
- Pełna lista kategorii kursów — nie jest jeszcze znana, kategorie są od siebie zależne (np. C wymaga B); w kolejnej iteracji: możliwość tworzenia bazy kursów i dodawania do nich uczestników
- Walidacja zależności między kategoriami (kolejna iteracja)
- Sugestia terminu przez AI (kolejna iteracja) — możliwa gdy dostępność kursanta (uzupełniana przez biuro w profilu kursanta) oraz dostępność instruktora są znane; AI dopasowuje wspólny wolny termin
- Aplikacja mobilna (na początek tylko web, RWD dla instruktora)
- Powiadomienia email lub SMS
- Zarządzanie kursantami jako osobny moduł CRUD
- Płatności i faktury

### Kryteria sukcesu

- Biuro może zaproponować lekcję w mniej niż 60 sekund
- Po wyborze kategorii widoczni są tylko instruktorzy z odpowiednimi uprawnieniami
- Status lekcji aktualizuje się w czasie rzeczywistym bez odświeżania strony
