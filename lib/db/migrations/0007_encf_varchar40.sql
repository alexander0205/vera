-- Amplía el campo encf de varchar(13) a varchar(40)
-- Los e-NCF reales son siempre 13 chars (E310000000001),
-- pero los borradores usan un placeholder más largo (BOR-XXXXXXXX).

ALTER TABLE ecf_documents
  ALTER COLUMN encf TYPE varchar(40);
