# Inicio del proyecto: Modulo Colegios

## 1. Objetivo

Crear un modulo formal llamado **Colegios** dentro de Vera para administrar estudiantes, padres/tutores, cursos, materias, periodos escolares, matriculas, cargos, pagos y deudas.

El objetivo principal es que cada pago quede claramente relacionado con:

- estudiante
- padre/tutor responsable
- matricula
- periodo escolar
- curso o grado
- concepto de pago
- mes correspondiente, si aplica
- factura o registro de pago
- deuda o balance pendiente

## 2. Problema que resuelve

Actualmente, cuando se paga una factura no queda claro si ese pago corresponde a inscripcion, mensualidad, que mes, que periodo escolar o que estudiante.

El modulo debe permitir responder rapidamente:

- En que curso esta este estudiante?
- Quien es el padre/tutor responsable?
- Que matricula tiene este ano escolar?
- Que debe?
- Que mensualidades pago?
- Que factura corresponde a septiembre, octubre, inscripcion, etc.?

## 3. Ubicacion en la aplicacion

El modulo debe aparecer como un modulo propio en el sidebar.

Ruta base propuesta:

```txt
/dashboard/colegios
```

Subrutas iniciales:

```txt
/dashboard/colegios
/dashboard/colegios/estudiantes
/dashboard/colegios/estudiantes/[id]
/dashboard/colegios/matriculas
/dashboard/colegios/cargos
/dashboard/colegios/pagos
/dashboard/colegios/configuracion
```

Sidebar sugerido:

```txt
Inicio
Contactos
Colegios
  - Estudiantes
  - Matriculas
  - Cargos y deudas
  - Pagos escolares
  - Configuracion
Reportes
```

## 4. Permisos sugeridos

Agregar permisos nuevos al sistema de roles:

```txt
colegios:ver
colegios:gestionar
colegios:configurar
colegios:pagos
```

Uso sugerido:

| Permiso | Uso |
|---|---|
| `colegios:ver` | Ver estudiantes, matriculas, cargos y pagos. |
| `colegios:gestionar` | Crear y editar estudiantes, tutores, cursos, materias y matriculas. |
| `colegios:configurar` | Acceder a configuracion escolar: periodos, cursos, materias, conceptos. |
| `colegios:pagos` | Registrar pagos escolares y aplicar pagos a cargos. |

## 5. Alcance MVP

Primera version funcional recomendada:

1. Agregar modulo Colegios al sidebar.
2. Crear permisos y proteccion de rutas.
3. Crear tablas base del modulo.
4. Crear listado de estudiantes.
5. Crear ficha lateral del estudiante seleccionado.
6. Crear perfil completo del estudiante.
7. Crear periodos escolares.
8. Crear cursos/grados.
9. Crear tutores y relacionarlos con estudiantes.
10. Crear matriculas por estudiante, periodo y curso.
11. Crear cargos escolares.
12. Registrar pagos contra cargos.
13. Mostrar deuda total y pagos recientes por estudiante.

## 6. Fases de implementacion

### Fase 1: Modulo, rutas y permisos

Tareas:

- Agregar `Colegios` al sidebar en `app/(dashboard)/dashboard/layout.tsx`.
- Crear rutas base bajo `app/(dashboard)/dashboard/colegios`.
- Crear permisos en el catalogo de roles.
- Proteger las rutas con los permisos correspondientes.
- Agregar estado vacio inicial para cada pantalla.

Resultado esperado:

- El modulo aparece en el sidebar.
- Los usuarios con permiso pueden entrar.
- Los usuarios sin permiso no ven el modulo o son bloqueados por URL directa.

### Fase 2: Modelo de datos base

Crear las entidades principales del modulo escolar.

Tablas propuestas:

```txt
colegio_periodos
colegio_cursos
colegio_materias
colegio_estudiantes
colegio_tutores
colegio_estudiante_tutores
```

Resultado esperado:

- Se pueden registrar estudiantes.
- Se pueden registrar tutores.
- Se pueden crear periodos escolares.
- Se pueden crear cursos y materias.
- Se puede asociar un estudiante a uno o varios tutores.

### Fase 3: Matriculas

Crear matriculas por estudiante y periodo escolar.

Tabla propuesta:

```txt
colegio_matriculas
```

Reglas:

- Un estudiante puede tener varias matriculas historicas.
- Solo debe tener una matricula activa por periodo escolar.
- El curso pertenece a la matricula, no directamente al estudiante.
- La matricula conserva el historial del estudiante por ano escolar.

Ejemplo:

```txt
Ana Maria Perez
2025-2026 -> Segundo A
2026-2027 -> Tercero A
2027-2028 -> Cuarto B
```

### Fase 4: Cargos y deudas

Crear cargos escolares por estudiante, matricula, periodo, concepto y mes.

Tablas propuestas:

```txt
colegio_conceptos_pago
colegio_cargos
```

Conceptos iniciales:

- Inscripcion
- Mensualidad
- Uniforme
- Actividad
- Otro

Reglas:

- Un cargo debe estar asociado a estudiante, matricula y periodo.
- Si es mensualidad, debe tener mes y ano.
- No se deben duplicar cargos para el mismo estudiante, concepto, mes y periodo.
- El estado del cargo puede ser `pendiente`, `parcial`, `pagado` o `vencido`.

### Fase 5: Pagos escolares

Registrar pagos aplicados a cargos escolares.

Tabla propuesta:

```txt
colegio_pagos
```

El pago debe poder relacionarse opcionalmente con:

- factura existente
- registro en `pagos_recibidos`
- metodo de pago
- tutor/padre responsable
- cargo escolar

Resultado esperado:

- Al registrar un pago, el balance del estudiante se actualiza.
- Se puede saber si el pago fue de inscripcion, mensualidad u otro concepto.
- Se puede saber a que mes y periodo corresponde.

### Fase 6: Ficha del estudiante

Crear una tarjeta lateral que aparezca al seleccionar un estudiante desde el listado.

La ficha debe mostrar:

- nombre del estudiante
- codigo
- estado
- matricula activa
- periodo escolar
- curso actual
- tutor responsable
- telefono/email del tutor
- deuda total
- mensualidades pendientes
- ultimo pago
- acciones rapidas

Acciones:

- Abrir perfil completo
- Registrar pago
- Editar estudiante

### Fase 7: Perfil completo del estudiante

Ruta:

```txt
/dashboard/colegios/estudiantes/[id]
```

Tabs sugeridos:

```txt
Resumen
Matricula
Deudas
Pagos
Tutores
Historial
```

Debe mostrar:

- informacion personal
- matricula activa
- historial de matriculas
- tutor responsable
- otros tutores
- cargos pendientes
- pagos recientes
- balance total

### Fase 8: Integracion con Contactos, dependientes y beneficiarios

Esta integracion puede hacerse despues del MVP.

Hay dos opciones:

#### Opcion A: Estudiantes propios con enlaces futuros

Crear estudiantes y tutores como entidades propias del modulo Colegios, con campos opcionales:

```txt
colegio_estudiantes.dependiente_id
colegio_tutores.client_id
```

Ventajas:

- Mayor control funcional.
- Permite avanzar sin bloquearse por Contactos.
- Mantiene historial escolar limpio.
- La integracion futura sigue siendo posible.

Riesgos:

- Habra que sincronizar o enlazar con Contactos mas adelante.

#### Opcion B: Usar dependientes/contactos como base desde el inicio

Modelar estudiantes como dependientes y tutores como contactos/clientes desde el primer dia.

Ventajas:

- Menos duplicacion de entidades.
- Integracion rapida con Contactos.

Riesgos:

- Puede forzar reglas escolares dentro de un modelo pensado para clientes/facturacion.
- Menos flexibilidad para matriculas e historial escolar.

#### Recomendacion

Usar **Opcion A** para la primera version.

Motivo:

El modulo escolar necesita reglas propias: matriculas por periodo, historial academico, cargos por mes, conceptos escolares y tutores responsables. Es mejor crear una estructura escolar limpia y dejar campos de enlace para unirla con Contactos despues.

## 7. Modelo de datos propuesto

### `colegio_periodos`

```txt
id
team_id
nombre
fecha_inicio
fecha_fin
activo
created_at
updated_at
```

Ejemplo:

```txt
2025-2026
2026-2027
2027-2028
```

### `colegio_cursos`

```txt
id
team_id
nombre
nivel
orden
activo
created_at
updated_at
```

Ejemplo:

```txt
Primero A
Primero B
Segundo A
Segundo B
```

### `colegio_materias`

```txt
id
team_id
nombre
activo
created_at
updated_at
```

### `colegio_estudiantes`

```txt
id
team_id
codigo
nombres
apellidos
fecha_nacimiento
estado
dependiente_id nullable
created_at
updated_at
```

Estados sugeridos:

```txt
activo
inactivo
retirado
graduado
```

### `colegio_tutores`

```txt
id
team_id
client_id nullable
nombre
documento
telefono
email
direccion
created_at
updated_at
```

### `colegio_estudiante_tutores`

```txt
id
team_id
estudiante_id
tutor_id
relacion
responsable_pago
created_at
updated_at
```

Relaciones sugeridas:

```txt
padre
madre
tutor
cuidador
otro
```

### `colegio_matriculas`

```txt
id
team_id
estudiante_id
periodo_id
curso_id
codigo_matricula
fecha_inscripcion
estado
notas
created_at
updated_at
```

Estados sugeridos:

```txt
activa
finalizada
retirada
anulada
```

### `colegio_conceptos_pago`

```txt
id
team_id
nombre
tipo
recurrente
activo
created_at
updated_at
```

Tipos sugeridos:

```txt
inscripcion
mensualidad
uniforme
actividad
otro
```

### `colegio_cargos`

```txt
id
team_id
estudiante_id
matricula_id
periodo_id
concepto_id
mes nullable
anio
monto_centavos
saldo_centavos
fecha_vencimiento
estado
created_at
updated_at
```

Estados sugeridos:

```txt
pendiente
parcial
pagado
vencido
anulado
```

### `colegio_pagos`

```txt
id
team_id
estudiante_id
matricula_id
cargo_id nullable
ecf_document_id nullable
pago_recibido_id nullable
monto_centavos
fecha_pago
metodo
referencia
notas
created_by
created_at
```

## 8. APIs sugeridas

### Estudiantes

```txt
GET    /api/colegios/estudiantes
POST   /api/colegios/estudiantes
GET    /api/colegios/estudiantes/[id]
PATCH  /api/colegios/estudiantes/[id]
DELETE /api/colegios/estudiantes/[id]
```

### Tutores

```txt
GET    /api/colegios/tutores
POST   /api/colegios/tutores
PATCH  /api/colegios/tutores/[id]
DELETE /api/colegios/tutores/[id]
```

### Periodos

```txt
GET    /api/colegios/periodos
POST   /api/colegios/periodos
PATCH  /api/colegios/periodos/[id]
```

### Cursos

```txt
GET    /api/colegios/cursos
POST   /api/colegios/cursos
PATCH  /api/colegios/cursos/[id]
```

### Matriculas

```txt
GET    /api/colegios/matriculas
POST   /api/colegios/matriculas
GET    /api/colegios/estudiantes/[id]/matriculas
```

### Cargos

```txt
GET    /api/colegios/cargos
POST   /api/colegios/cargos
POST   /api/colegios/cargos/generar
GET    /api/colegios/estudiantes/[id]/cargos
```

### Pagos

```txt
GET    /api/colegios/pagos
POST   /api/colegios/pagos
GET    /api/colegios/estudiantes/[id]/pagos
```

## 9. Componentes UI sugeridos

```txt
app/(dashboard)/dashboard/colegios/page.tsx
app/(dashboard)/dashboard/colegios/estudiantes/page.tsx
app/(dashboard)/dashboard/colegios/estudiantes/_page-client.tsx
app/(dashboard)/dashboard/colegios/estudiantes/[id]/page.tsx
app/(dashboard)/dashboard/colegios/configuracion/page.tsx
app/(dashboard)/dashboard/colegios/cargos/page.tsx
```

Componentes:

```txt
components/colegios/EstudiantesTable.tsx
components/colegios/EstudianteFicha.tsx
components/colegios/EstudiantePerfil.tsx
components/colegios/TutoresPanel.tsx
components/colegios/MatriculaCard.tsx
components/colegios/CargosTable.tsx
components/colegios/PagosTable.tsx
components/colegios/GenerarCargosDialog.tsx
components/colegios/ConfiguracionEscolar.tsx
```

## 10. Mockups de referencia

Los mockups ya creados representan estas pantallas:

### Mockup 1: Listado de estudiantes con ficha lateral

Archivo:

```txt
docs/colegios-mockup-1-estudiantes.png
```

Referencia:

- listado de estudiantes
- indicadores generales
- seleccion de estudiante
- ficha lateral con deuda, tutor, matricula y pagos

### Mockup 2: Perfil completo del estudiante

Archivo:

```txt
docs/colegios-mockup-2-perfil-estudiante.png
```

Referencia:

- perfil detallado del estudiante
- tutor responsable
- deudas
- pagos
- matriculas
- historial

### Mockup 3: Generacion de cargos

Archivo:

```txt
docs/colegios-mockup-3-cargos.png
```

Referencia:

- generacion masiva de mensualidades
- cargos por periodo, curso, concepto y mes
- validacion para evitar duplicados

### Mockup 4: Configuracion escolar

Archivo:

```txt
docs/colegios-mockup-4-configuracion.png
```

Referencia:

- periodos escolares
- cursos
- materias
- conceptos de pago
- acceso administrativo

## 11. Reglas de negocio iniciales

- El modulo debe estar separado de Contactos al inicio, pero preparado para integrarse luego.
- Un estudiante puede tener varios tutores.
- Solo un tutor debe marcarse como responsable de pago principal.
- Un estudiante puede tener varias matriculas historicas.
- Solo una matricula puede estar activa por estudiante y periodo.
- Un cargo debe pertenecer a estudiante, matricula y periodo.
- Una mensualidad debe indicar mes y ano.
- Un pago debe poder aplicarse a un cargo especifico.
- Un cargo parcialmente pagado debe conservar saldo.
- Un cargo pagado debe quedar en estado `pagado`.
- Un cargo vencido debe poder filtrarse como deuda.
- La configuracion escolar debe ser solo para administradores.

## 12. Criterios de aceptacion MVP

### Sidebar

- El usuario con permiso ve `Colegios` en el sidebar.
- El usuario sin permiso no ve el modulo.
- Si entra por URL directa sin permiso, se bloquea.

### Estudiantes

- Se puede crear estudiante.
- Se puede editar estudiante.
- Se puede listar estudiantes.
- Se puede buscar por nombre, codigo o tutor.
- Al seleccionar un estudiante, aparece la ficha lateral.

### Tutores

- Se puede crear tutor.
- Se puede asociar tutor a estudiante.
- Se puede marcar responsable de pago.
- La ficha del estudiante muestra el tutor responsable.

### Matriculas

- Se puede crear periodo escolar.
- Se puede crear curso.
- Se puede matricular estudiante en periodo y curso.
- No se puede duplicar matricula activa para el mismo periodo.

### Cargos y deudas

- Se puede crear cargo manual.
- Se puede generar cargo masivo.
- No se duplican cargos por estudiante, concepto, mes y periodo.
- La deuda total del estudiante se calcula correctamente.

### Pagos

- Se puede registrar pago contra cargo.
- El saldo del cargo se actualiza.
- El historial de pagos aparece en el perfil del estudiante.
- El pago muestra concepto, periodo y mes cuando aplique.

## 13. Orden recomendado para empezar

1. Crear migracion de tablas.
2. Agregar permisos al catalogo de roles.
3. Agregar `Colegios` al sidebar.
4. Crear rutas vacias del modulo.
5. Crear API de periodos, cursos, estudiantes y tutores.
6. Crear pantalla de estudiantes con datos reales.
7. Crear ficha lateral del estudiante.
8. Crear matriculas.
9. Crear cargos.
10. Crear pagos.
11. Crear perfil completo.
12. Agregar reportes basicos.

## 14. Archivos probables a tocar

Sidebar:

```txt
app/(dashboard)/dashboard/layout.tsx
```

Roles/permisos:

```txt
lib/config/roles.ts
lib/auth/permissions.ts
lib/auth/page-guard.ts
```

Base de datos:

```txt
lib/db/schema.ts
lib/db/migrations/00XX_colegios.sql
lib/db/queries.ts
```

Rutas:

```txt
app/(dashboard)/dashboard/colegios/**
app/api/colegios/**
```

Componentes:

```txt
components/colegios/**
```

## 15. Notas tecnicas

- Usar `team_id` en todas las tablas para mantener aislamiento multiempresa.
- Usar indices por `team_id`, `estudiante_id`, `periodo_id` y `matricula_id`.
- Guardar montos en centavos, siguiendo el patron existente de pagos.
- No depender de facturas para representar deuda escolar; la deuda escolar debe vivir en `colegio_cargos`.
- Los pagos escolares pueden enlazarse a facturas o `pagos_recibidos`, pero no deben depender de ellos para existir.
- Preparar campos `client_id` y `dependiente_id` para integracion futura con Contactos.

## 16. Resultado esperado de la primera version

Al completar el MVP, el colegio debe poder:

- crear estudiantes
- asociarlos a tutores
- asignar curso y periodo mediante matricula
- generar cargos por inscripcion y mensualidad
- registrar pagos contra esos cargos
- ver deuda total por estudiante
- ver pagos realizados por estudiante
- identificar claramente a que mes, concepto y periodo corresponde cada pago

