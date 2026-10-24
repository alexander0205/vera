-- 0207 · Tareas por revisar de cada alumno y su familia.
--
-- Cada vez que un caso no se podía resolver solo —un pago de más, una factura
-- que no cuadra con sus cargos, un mes que se cobró a medias— la decisión
-- quedaba en un chat o en la memoria de alguien, y el arreglo terminaba por SQL
-- de soporte. Esto le da un lugar en el sistema: una tarea con lo que hay que
-- decidir, a quién le toca (Dirección, Administración, Soporte IT de Zero o
-- una persona del colegio), de qué alumno o familia es, y su conversación
-- hasta que alguien la marca como completada.
--
-- Una tarea es de un alumno (`estudiante_id`) o de toda su familia
-- (`client_id`, el responsable de pago). Los mensajes son la conversación y
-- también la constancia: crear, reasignar, completar y reabrir dejan su línea.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS admin_escolar_tareas (
  id                    serial PRIMARY KEY,
  team_id               integer      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- De un alumno, o de su familia entera (entonces estudiante_id es NULL).
  estudiante_id         integer      REFERENCES admin_escolar_estudiantes(id) ON DELETE CASCADE,
  client_id             integer      REFERENCES clients(id) ON DELETE SET NULL,
  titulo                varchar(160) NOT NULL,
  descripcion           text,
  -- direccion | administracion | soporte | persona
  asignada_a            varchar(16)  NOT NULL CHECK (asignada_a IN ('direccion', 'administracion', 'soporte', 'persona')),
  asignada_user_id      integer      REFERENCES users(id) ON DELETE SET NULL,
  -- La factura o el cargo de los que trata, si los hay.
  ecf_document_id       integer      REFERENCES ecf_documents(id) ON DELETE SET NULL,
  cargo_id              integer      REFERENCES admin_escolar_cargos(id) ON DELETE SET NULL,
  vence_el              date,
  -- abierta | completada
  estado                varchar(12)  NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'completada')),
  -- Quién la abrió: una persona, o Zero AI (creada_por_ia) sin persona.
  creada_por_user_id    integer      REFERENCES users(id) ON DELETE SET NULL,
  creada_por_ia         boolean      NOT NULL DEFAULT false,
  completada_por_user_id integer     REFERENCES users(id) ON DELETE SET NULL,
  completada_en         timestamp,
  creado_en             timestamp    NOT NULL DEFAULT now(),
  actualizado_en        timestamp    NOT NULL DEFAULT now(),
  CONSTRAINT admin_escolar_tareas_de_alguien CHECK (estudiante_id IS NOT NULL OR client_id IS NOT NULL),
  CONSTRAINT admin_escolar_tareas_persona CHECK (asignada_a <> 'persona' OR asignada_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS admin_escolar_tareas_estudiante_idx ON admin_escolar_tareas (team_id, estudiante_id, estado);
CREATE INDEX IF NOT EXISTS admin_escolar_tareas_familia_idx    ON admin_escolar_tareas (team_id, client_id, estado);
CREATE INDEX IF NOT EXISTS admin_escolar_tareas_abiertas_idx   ON admin_escolar_tareas (team_id, estado, asignada_a);

CREATE TABLE IF NOT EXISTS admin_escolar_tarea_mensajes (
  id           serial PRIMARY KEY,
  team_id      integer     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tarea_id     integer     NOT NULL REFERENCES admin_escolar_tareas(id) ON DELETE CASCADE,
  -- mensaje: lo que alguien escribió · evento: creada, completada, reabierta…
  -- ia: lo que propuso Zero AI
  tipo         varchar(10) NOT NULL CHECK (tipo IN ('mensaje', 'evento', 'ia')),
  user_id      integer     REFERENCES users(id) ON DELETE SET NULL,
  -- Cómo se enseña quién lo dijo, guardado al escribirlo: «Soporte IT · Zero»,
  -- «Zero AI» o el nombre de la persona. Si la persona cambia de nombre, la
  -- conversación conserva el que tenía.
  autor        varchar(100) NOT NULL,
  texto        text        NOT NULL,
  creado_en    timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escolar_tarea_mensajes_tarea_idx ON admin_escolar_tarea_mensajes (tarea_id, creado_en);
