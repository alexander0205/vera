# QA Checklist EmiteDO — Cobertura Completa UI

**Cuenta test**: `ferrerasalexander@gmail.com` / `Admin1822` (owner team YISRAEL TECHNOLOGY SRL)
**URL local**: http://localhost:3000
**Ambiente DGII**: CerteCF

Reglas:
- Cada caso usa la **UI real** (clicks, forms), no `fetch()` directo
- Capturar screenshot al final de cada caso
- Persistir resultado en `qa/qa-results.json` después de CADA caso (no batch)
- Status: `pass` | `fail` | `blocked` | `partial`
- En `notes` describir hallazgo

---

## 1. Login / Auth (8 casos)

| ID | Descripción | Esperado |
|---|---|---|
| AUTH-01 | Login con credenciales correctas | redirect /dashboard |
| AUTH-02 | Login password incorrecto | error "Invalid email or password" |
| AUTH-03 | Login email inexistente | error mismo (no leak info) |
| AUTH-04 | Logout via menú perfil | redirect /sign-in, sesión limpia |
| AUTH-05 | Acceso /dashboard sin sesión | redirect /sign-in |
| AUTH-06 | Forgot password — enviar email | form acepta, muestra confirmación |
| AUTH-07 | Sign-up nuevo usuario (test inbox) | crea cuenta, login automático |
| AUTH-08 | Cambiar empresa activa (team switcher) | dashboard refleja nuevo team |

## 2. Cliente CRUD (12 casos)

| ID | Descripción | Esperado |
|---|---|---|
| CLI-01 | Crear cliente con RNC (búsqueda padrón DGII) | autocompleta razón social |
| CLI-02 | Crear cliente sin RNC (consumidor final) | guarda OK |
| CLI-03 | Crear cliente con email + teléfono formato auto | tel `(XXX) XXX-XXXX` aplicado |
| CLI-04 | Crear cliente sin nombre | error required |
| CLI-05 | Editar cliente existente | persiste cambios |
| CLI-06 | Editar tel raw → format aplicado en hidratación | muestra `(XXX) XXX-XXXX` |
| CLI-07 | Eliminar cliente | confirm modal + delete |
| CLI-08 | Buscar cliente por nombre | filtra tabla |
| CLI-09 | Buscar cliente por RNC | filtra |
| CLI-10 | Buscar cliente por email | filtra |
| CLI-11 | Cliente con caracteres especiales en nombre | guarda OK |
| CLI-12 | RNC duplicado en team — debería avisar o permitir? | documentar comportamiento |

## 3. Producto CRUD (12 casos)

| ID | Descripción | Esperado |
|---|---|---|
| PROD-01 | Crear servicio con ITBIS 18% | guarda OK |
| PROD-02 | Crear bien con ITBIS 16% | guarda OK |
| PROD-03 | Crear servicio Exento (label "Exento (fuera de ITBIS)") | label correcto fix #6 |
| PROD-04 | Tab "Combo" disabled — click no hace nada | bloqueado |
| PROD-05 | Crear sin nombre | error required |
| PROD-06 | Crear con precio negativo | error |
| PROD-07 | Crear con referencia | guarda OK |
| PROD-08 | Editar producto | persiste |
| PROD-09 | Eliminar producto | confirm + delete |
| PROD-10 | Buscar producto por nombre | filtra |
| PROD-11 | Filtrar por tipo bien/servicio | filtra |
| PROD-12 | Mostrar formulario avanzado (toggle) | expande campos |

## 4. Factura Emitir (25 casos)

| ID | Descripción | Esperado |
|---|---|---|
| EMIT-01 | Tipo 31 Crédito Fiscal Contado | emite, NCF asignado |
| EMIT-02 | Tipo 31 Crédito 30 días | vencimiento +30d |
| EMIT-03 | Tipo 32 Consumo <250k | emite |
| EMIT-04 | Tipo 32 Consumo ≥250k | requiere datos comprador OBLIGATORIO |
| EMIT-05 | Tipo 33 Nota Débito (con NCF ref) | emite |
| EMIT-06 | Tipo 34 Nota Crédito (con NCF ref + codigoModificacion) | emite |
| EMIT-07 | Tipo 41 Compras | emite |
| EMIT-08 | Tipo 43 Gastos Menores | emite |
| EMIT-09 | Tipo 44 Régimen Especial | emite |
| EMIT-10 | Tipo 45 Gubernamental | emite |
| EMIT-11 | Tipo 46 Exportaciones | emite |
| EMIT-12 | Tipo 47 Pagos Exterior | emite (sin RNC, con comprador extranjero) |
| EMIT-13 | Sin items | bloquea "Agregar item" |
| EMIT-14 | Item sin nombre | bloquea o validation msg |
| EMIT-15 | Sin cliente seleccionado (tipo 31 requiere RNC) | bloquea |
| EMIT-16 | RNC comprador formato inválido | validación |
| EMIT-17 | Calcular ITBIS 18% automático | total = subtotal × 1.18 |
| EMIT-18 | Descuento por línea | reduce subtotal |
| EMIT-19 | Agregar retención | descuenta del total |
| EMIT-20 | Cambiar tipo después de llenar → reinicia cliente | confirma reset |
| EMIT-21 | Vista previa antes de emitir | abre PDF preview |
| EMIT-22 | Guardar como borrador | estado BORRADOR |
| EMIT-23 | Guardar e imprimir (split button) | descarga PDF + emite |
| EMIT-24 | Guardar y enviar correo | emite + envía email |
| EMIT-25 | Guardar y crear nueva | emite + reset form |

## 5. Factura Listado (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| LIST-01 | Paginación 50/página | botones prev/next |
| LIST-02 | Buscar por NCF | filtra |
| LIST-03 | Buscar por cliente | filtra |
| LIST-04 | Filtro estado ACEPTADO | filtra |
| LIST-05 | Filtro fechas desde/hasta | filtra |
| LIST-06 | Sort por columna (click header) | reordena |
| LIST-07 | Bulk select + anular múltiples | confirma + anula todas |
| LIST-08 | Export CSV | descarga archivo |
| LIST-09 | Click row → navega a detalle | abre /facturas/[id] |
| LIST-10 | Histórica NO aparece en listado (fix Fase 1.1) | excluida |

## 6. Factura Detalle (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| DET-01 | Abrir factura ACEPTADA | bottom bar Volver/Ver PDF/Acciones |
| DET-02 | Abrir factura BORRADOR | bottom bar Cancelar/Ver PDF/Continuar edición |
| DET-03 | Click "Ver PDF" → abre PDF en nueva pestaña | abre |
| DET-04 | Click "Imprimir" en dropdown Acciones | abre PDF |
| DET-05 | Click "Enviar por correo" | abre modal email |
| DET-06 | Enviar email con dirección válida | toast "enviado" |
| DET-07 | Botón "Consultar DGII" | actualiza estado |
| DET-08 | Botón "Anular" | confirm + estado ANULADO |
| DET-09 | Estado EN_PROCESO → ver Track ID | mostrar UUID |
| DET-10 | Estado RECHAZADO → ver mensajes DGII | panel mensajes |

## 7. NC + Anular (27 casos) — los 20 originales + extras

| ID | Descripción | Esperado |
|---|---|---|
| NCA-01 | Anular factura BORRADOR | ANULADO o eliminar |
| NCA-02 | Anular factura ACEPTADA sin pagos | ANULADO |
| NCA-03 | Anular factura ACEPTADA con pagos registrados | bloquear o revertir pagos |
| NCA-04 | Anular distingue BORRADOR (delete) vs ACEPTADO (NC formal) | UX diferente |
| NCA-05 | tipoAnulacion 01-10 selectable en modal | UI con dropdown |
| NCA-06 | tipoAnulacion enviado persiste en DB | no quede default 04 |
| NCA-07 | NC tipo 34 codigoModificacion=01 (anulación) | factura ref → ANULADO_POR_NC |
| NCA-08 | NC parcial codigoModificacion=03 (devolución) | saldo AR descuenta |
| NCA-09 | NC descuento codigoModificacion=04 | saldo AR descuenta |
| NCA-10 | NC corrección codigoModificacion=02 | saldo NO cambia |
| NCA-11 | Múltiples NCs misma factura | suma descuentos |
| NCA-12 | NC sobre factura BORRADOR | bloquear UI |
| NCA-13 | NC sobre factura RECHAZADO | bloquear UI |
| NCA-14 | NC sobre factura ANULADO | bloquear UI |
| NCA-15 | NC sobre cuenta HISTORICA | bloquear UI |
| NCA-16 | NC monto > factura original | bloquear validación |
| NCA-17 | NC sin ncfModificado | UI no permite emitir tipo 34 sin ref |
| NCA-18 | Anular factura con NC asociada | bloquear |
| NCA-19 | Anular NC tipo 34 | restaura saldo factura referenciada |
| NCA-20 | Detalle factura muestra panel "NCs asociadas" | listar NCs + montos |
| NCA-21 | AR muestra saldo neto post-NCs | total - pagos - NCs |
| NCA-22 | Filtro listado "Con NCs asociadas" | filtra |
| NCA-23 | NC sobre nota débito (33) | ¿permitido? documentar |
| NCA-24 | NC sobre NC (cadena) | bloquear o documentar |
| NCA-25 | Bulk anular múltiples | UI permite |
| NCA-26 | NC fecha mes diferente al de factura | afecta libro correctamente |
| NCA-27 | Anular factura tipo 47 (pago exterior) | comportamiento correcto |

## 8. Cuentas por Cobrar (15 casos)

| ID | Descripción | Esperado |
|---|---|---|
| AR-01 | Listado muestra solo facturas crédito con saldo > 0 | filtra |
| AR-02 | Stat cards: Pendiente / Vencido / Activas / Vencidas | totales correctos |
| AR-03 | Filtro "Vencidas" | solo vencidas |
| AR-04 | Filtro "Todas" | todas activas |
| AR-05 | Registrar pago total | saldo 0, badge "Pagada" |
| AR-06 | Registrar pago parcial | saldo reducido |
| AR-07 | Múltiples pagos misma factura | suma correcta |
| AR-08 | Pago con método transferencia + referencia | persistido |
| AR-09 | Pago monto > saldo | bloquea validación |
| AR-10 | Pago fecha futura | ¿permitido? documentar |
| AR-11 | Cuenta histórica: agregar | aparece con badge "histórica" |
| AR-12 | Cuenta histórica: con monto ya pagado inicial | crea pago inicial automático |
| AR-13 | Eliminar pago registrado | restaura saldo |
| AR-14 | Días vencida calculado correcto (no off-by-1) | match con listado facturas |
| AR-15 | Dashboard alerta vencidas (banner amber) | muestra si count>0 |

## 9. Recurrente (15 casos)

| ID | Descripción | Esperado |
|---|---|---|
| REC-01 | Crear plan mensual contado | guarda |
| REC-02 | Crear plan mensual crédito 5 días | guarda con diasParaPago |
| REC-03 | Crear plan semanal | OK |
| REC-04 | Crear plan quincenal | OK |
| REC-05 | Crear plan trimestral | OK |
| REC-06 | Crear plan anual | OK |
| REC-07 | Día de cobro 1-31 | OK |
| REC-08 | Día de cobro 31 en feb (¿skip o último día?) | documentar |
| REC-09 | Editar plan existente | persiste |
| REC-10 | Pausar plan | estado pausada |
| REC-11 | Reactivar plan pausado | estado activa |
| REC-12 | Eliminar plan | confirm + delete |
| REC-13 | Sin cliente | bloquea |
| REC-14 | Sin items | bloquea |
| REC-15 | Próxima emisión = fechaInicio si futuro (fix #4) | display correcto |

## 10. Reportes DGII (12 casos)

| ID | Descripción | Esperado |
|---|---|---|
| REP-01 | Ventas generales — stats cards (brutas - NC + ITBIS = después) | suma cuadra |
| REP-02 | Ventas generales — exportar CSV | descarga |
| REP-03 | Ventas generales — filtro fechas | filtra |
| REP-04 | Ventas generales — gráfico diario/mensual toggle | switch |
| REP-05 | 606 Compras — descargar TXT | archivo .txt formato DGII |
| REP-06 | 607 Ventas — descargar TXT con facturas + NCs | formato correcto |
| REP-07 | 608 Anulados — descargar TXT con tipoAnulacion | incluye 01-10 |
| REP-08 | 609 Exterior — descargar TXT | OK |
| REP-09 | Declaración en cero (sin docs) | genera archivo válido |
| REP-10 | Cambiar mes/año del periodo | reflejado |
| REP-11 | Listado documentos del periodo | tabla |
| REP-12 | Estado "Cobrada" vs "En proceso" badges | correctos |

## 11. Configuración (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| CFG-01 | Cargar datos empresa actuales | populated |
| CFG-02 | Editar razón social | persiste |
| CFG-03 | Editar nombre comercial | persiste |
| CFG-04 | Editar RNC (validación 9 o 11 dígitos) | valida |
| CFG-05 | Cambiar provincia → reset municipio | dependencia |
| CFG-06 | Cambiar municipio | persiste |
| CFG-07 | Editar teléfono formato auto | (XXX) XXX-XXXX (fix #7) |
| CFG-08 | Subir logo (file upload) | preview + persiste |
| CFG-09 | Cambiar color primario | refleja en UI |
| CFG-10 | Cambiar ambiente DGII (TesteCF/CerteCF/Producción) | persiste, próximas emisiones usan nuevo |

## 12. Secuencias NCF (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| SEQ-01 | Listado todas las secuencias 31-47 | muestra rangos |
| SEQ-02 | Crear nuevo rango | guarda |
| SEQ-03 | Editar siguiente número | validar > actual |
| SEQ-04 | Editar siguiente menor a actual | bloquea |
| SEQ-05 | Cambiar fecha vencimiento | persiste |
| SEQ-06 | Marcar preferida | uncheck otras |
| SEQ-07 | Activar/desactivar numeración automática | toggle |
| SEQ-08 | Semáforo: disponibles>50 verde, <50 amber, 0 rojo | colores |
| SEQ-09 | Rango vencido (fecha < hoy) | badge "Vencida" |
| SEQ-10 | NCF preview siguiente emisión | match con calc |

## 13. Certificado P12 (6 casos)

| ID | Descripción | Esperado |
|---|---|---|
| CERT-01 | Ver certificado activo (titular, vencimiento, días restantes) | muestra |
| CERT-02 | Subir P12 + password correcto | guarda, valida DGII |
| CERT-03 | Subir P12 + password incorrecto | error claro |
| CERT-04 | Subir P12 expirado | error claro |
| CERT-05 | Subir P12 con RNC distinto al team | error |
| CERT-06 | Revocar certificado activo | confirm + revocado |

## 14. Equipo / Invitations (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| EQ-01 | Listar miembros activos | tabla |
| EQ-02 | Invitar nuevo miembro (email) | crea invitación |
| EQ-03 | Invitación con role contador | persiste rol |
| EQ-04 | Invitar email ya miembro | bloquea |
| EQ-05 | Listar invitaciones pendientes | tabla |
| EQ-06 | Reenviar invitación | toast OK |
| EQ-07 | Cancelar invitación pendiente | delete |
| EQ-08 | Aceptar invitación (link email) | join team |
| EQ-09 | Remover miembro | confirm + delete |
| EQ-10 | Cambiar rol miembro | persiste |

## 15. Permisos por Rol (12 casos)

| ID | Descripción | Esperado |
|---|---|---|
| PERM-01 | Owner ve todos los sidebar items | full |
| PERM-02 | Admin role ve igual que owner excepto suscripción | filtrado |
| PERM-03 | Contador ve facturas + reportes, no equipo/config | filtrado |
| PERM-04 | Vendedor ve facturas (crear/ver), no reportes | filtrado |
| PERM-05 | Member básico: sin permisos administrativos | sidebar reducido |
| PERM-06 | Contador intenta crear factura — bloquea | UI o API gate |
| PERM-07 | Vendedor intenta ver reportes — redirect /dashboard | gate |
| PERM-08 | Platform admin (yisraeltech) accede a /admin | full panel |
| PERM-09 | Platform admin accede a team sin membership (fix #1) | sin "Sin permiso" |
| PERM-10 | Cambiar rol miembro → sidebar refresca | refresca |
| PERM-11 | API cuentas-por-cobrar respeta rol | 403 si sin facturas:ver |
| PERM-12 | API registrar pago respeta rol | 403 si sin facturas:crear |

## 16. Webhooks (5 casos)

| ID | Descripción | Esperado |
|---|---|---|
| WH-01 | Crear webhook URL | guarda |
| WH-02 | Test delivery (botón "probar") | envía POST a URL |
| WH-03 | Listar webhooks | tabla |
| WH-04 | Editar webhook | persiste |
| WH-05 | Eliminar webhook | delete |

## 17. API Keys (5 casos)

| ID | Descripción | Esperado |
|---|---|---|
| APIK-01 | Generar API key | muestra una vez |
| APIK-02 | Listar keys (sin valor, solo metadatos) | tabla |
| APIK-03 | Revocar key | inactiva |
| APIK-04 | Key revocada → API responde 401 | testeable |
| APIK-05 | Scope/permisos por key | configurable |

## 18. Sistema / Edge cases (12 casos)

| ID | Descripción | Esperado |
|---|---|---|
| SYS-01 | Cambiar empresa activa (team switcher) | dashboard refleja |
| SYS-02 | Sesión expirada → redirect login | OK |
| SYS-03 | Mobile responsive 375px | layout funcional |
| SYS-04 | Tablet 768px | layout funcional |
| SYS-05 | Desktop 1440px | sidebar visible |
| SYS-06 | 2FA setup wizard | QR + verificar |
| SYS-07 | Reset password flow completo | email + nueva pass |
| SYS-08 | Onboarding primera vez (cuenta nueva) | wizard |
| SYS-09 | Network error simulado | toast error claro |
| SYS-10 | Concurrencia 2 users mismo team (race condition) | no genera NCF duplicado |
| SYS-11 | Búsqueda global (Cmd+K) | abre, busca facturas/clientes |
| SYS-12 | Tema visual consistente | colores teal, font Inter |

## 19. Notas Crédito / Cotizaciones (10 casos)

| ID | Descripción | Esperado |
|---|---|---|
| NC-01 | Listar notas crédito | tabla |
| NC-02 | Crear nota crédito desde lista | wizard |
| NC-03 | Cotizaciones — listar | tabla vacía o con datos |
| NC-04 | Cotizaciones — crear | form |
| NC-05 | Cotizaciones — convertir a factura | flow |
| NC-06 | Cotizaciones — enviar por email | modal |
| NC-07 | Cotizaciones — estado (borrador/enviada/aprobada/rechazada) | badges |
| NC-08 | Cotizaciones — vencimiento configurable | persiste |
| NC-09 | Cotizaciones — agregar productos | line items |
| NC-10 | Cotizaciones — exportar PDF | descarga |

---

## Total: 196 casos en 19 categorías

**Persistencia**: `qa/qa-results.json` — array de objetos `{id, status, notes, screenshot, timestamp}`
