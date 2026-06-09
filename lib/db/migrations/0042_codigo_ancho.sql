-- Ensanchar ecf_documents.codigo de varchar(20) a varchar(40) para soportar el
-- nuevo código global-único: {TIPO}-{AÑO}-{EMP}{USR}-{RND5}-{SEC} (~25 chars).
ALTER TABLE ecf_documents ALTER COLUMN codigo TYPE varchar(40);
