INSERT INTO instructors (name, categories) VALUES
  ('Jan Kowalski',      ARRAY['B']),
  ('Anna Nowak',        ARRAY['B', 'C']),
  ('Piotr Wiśniewski',  ARRAY['C', 'D', 'C+E']),
  ('Maria Dąbrowska',   ARRAY['B', 'T']),
  ('Tomasz Zając',      ARRAY['B+E', 'C+E']);

INSERT INTO students (name, phone, category) VALUES
  ('Adam Wójcik',          '+48 111 222 333', 'B'),
  ('Karolina Lewandowska', '+48 222 333 444', 'B'),
  ('Michał Kowalczyk',     '+48 333 444 555', 'B'),
  ('Agnieszka Kamińska',   '+48 444 555 666', 'C'),
  ('Rafał Zieliński',      '+48 555 666 777', 'C'),
  ('Justyna Woźniak',      '+48 666 777 888', 'D'),
  ('Łukasz Szymański',     '+48 777 888 999', 'B+E'),
  ('Natalia Piotrowska',   '+48 888 999 000', 'T');
