-- Link products → categorias (la tabla ya existía huérfana, sin FK desde products).
-- Nullable: producto sin categoría sigue siendo válido.
ALTER TABLE products ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id);
