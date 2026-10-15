# Asistente de Zero — plan de mejoras

Estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho. Cada tarea cierra con
pruebas (unitarias o fila en `tests/unit/asistente-evaluacion.test.ts`) y commit.

## Hecho
- [x] Asistente solo lectura (IA + contestador local), guía de 138 pantallas
- [x] Búsqueda por la API de la app, enlaces verificados por turno
- [x] Políticas en código (prompt, secretos, otra empresa, evasión, asesoría…)
- [x] Confirmación propuesta→confirmar (infraestructura, sin acciones registradas)
- [x] PDF de respuestas legible (columnas proporcionales, horizontal si hace falta)
- [x] Valoración 👍/👎 por respuesta (migración 0194)
- [x] Set de evaluación (41 preguntas conocidas)

## Fase 1 — base de calidad y seguridad
- [x] 1.1 Detección de abuso/volumen (ráfagas, vaciado de listados) + acción de auditoría
- [x] 1.2 Atajos de preguntas frecuentes al abrir el chat (sin IA)
- [x] 1.3 Más intenciones locales a partir de preguntas que caen a la IA
- [x] 1.4 Casos de inyección con datos reales en el set de evaluación
- [x] 1.5 Hueco de guía: «impuestos / ITBIS» sin entrada fuera de POS (mapa)

## Fase 2 — diferenciadores de demo
- [x] 2.1 Contexto de pantalla (el asistente sabe en qué página/registro estás)
- [x] 2.2 Gráficos simples en el chat (barras/línea de ventas por mes)
- [x] 2.3 👎 con motivo → cola de casos para el set de evaluación
- [x] 2.4 Resumen del día (por cobrar vencidas, borradores, turnos abiertos)

## Fase 3 — control y alcance
- [ ] 3.1 Bitácora visible para el dueño (quién preguntó qué y cuándo)
- [x] 3.2 Alcance por rol (por permisos y módulos; protegido con pruebas)
- [~] 3.3 Reportes por correo — retirado por ahora (decisión del negocio); queda en el historial de git (5964fb61)

## Fase 4 — canales y acciones
- [~] 4.1 ~~Acciones reales con confirmación~~ — descartada: el asistente se queda de solo lectura (decisión del negocio). La infraestructura propuesta→confirmar queda sin acciones registradas.
- [~] 4.2 WhatsApp — solo diseño: docs/asistente-whatsapp-diseno.md (falta credenciales y número verificado)
- [~] 4.3 Voz — retirada por ahora (decisión del negocio); el código se quitó, queda en el historial de git

## Antes de producción
- [ ] Aplicar migraciones 0193 y 0194 en producción
- [ ] Configurar gateway/clave y modelo vigente; `ASISTENTE_IA_SIMULADA` apagada
- [ ] Revisar pasos del mapa con uso real
- [ ] Validar retención (180 días) con legal

## Fase 5 — ideas aprobadas (funcionalidad, diseño, calidad)
Orden de trabajo; cada una con pruebas y commit.

### Funcionalidad
- [x] 5.1 Explicar el rechazo / estado ante la DGII de la factura en pantalla
- [x] 5.2 Contexto de pantalla: cliente (detalle, deuda, facturas)
- [x] 5.3 Contexto de pantalla: cotización, producto, estudiante
- [x] 5.4 Seguimiento natural («¿y de ese cliente?», «¿y los de septiembre?»)
- [x] 5.5 Comparativos (este mes vs el mes pasado, vs el año pasado)
- [x] 5.6 Alertas al abrir el panel (rechazadas, secuencia por agotarse, certificado por vencer)
- [x] 5.7 Resumen semanal en el chat
- [x] 5.8 Ayuda guiada para tareas largas
- [x] 5.9 Atajos que aprenden de lo que más pregunta cada dueño

### Diseño
- [x] 5.10 Sugerencias después de cada respuesta (chips)
- [x] 5.11 Tarjetas para una factura / un cliente
- [x] 5.12 Gráficos de línea y de torta
- [x] 5.13 Cifras clicables
- [x] 5.14 Respuesta que se va mostrando (streaming)
- [x] 5.15 Historial de conversaciones
- [x] 5.16 Modo ancho del panel
- [ ] 5.17 Estados vacíos y de error cuidados

### Calidad
- [ ] 5.18 Tablero interno de calidad (👎, caídas a la IA, % sin IA)
- [ ] 5.19 Evaluación contra el modelo real (script nocturno)
