import {
  pgTable,
  serial,
  bigserial,
  varchar,
  char,
  text,
  timestamp,
  integer,
  bigint,
  smallint,
  date,
  boolean,
  index,
  uniqueIndex,
  uuid,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Auth & Teams (base del starter — no modificar estructura) ────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  platformRole: varchar('platform_role', { length: 20 }).notNull().default('member'),
  // Email verification
  emailVerified: boolean('email_verified').notNull().default(false),
  // 2FA
  twoFactorSecret: text('two_factor_secret'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// teams = Tenant en EmiteDO (una empresa / RNC)
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Stripe
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),

  // ── EmiteDO — datos fiscales del negocio ──────────────────────────────────
  rnc: varchar('rnc', { length: 11 }),
  razonSocial: varchar('razon_social', { length: 255 }),
  nombreComercial: varchar('nombre_comercial', { length: 255 }),
  direccion: varchar('direccion', { length: 500 }),
  provincia: varchar('provincia', { length: 100 }),
  municipio: varchar('municipio', { length: 100 }),
  actividadEconomica: varchar('actividad_economica', { length: 20 }),
  // Representante legal — requerido para postulación DGII
  cedulaRepresentante: varchar('cedula_representante', { length: 11 }),
  nombreRepresentante: varchar('nombre_representante', { length: 255 }),
  correoRepresentante: varchar('correo_representante', { length: 255 }),

  // ── Certificado P12 — cifrado AES-256-GCM ────────────────────────────────
  // (reemplaza certP12 / certPassword — ver lib/crypto/cert.ts)
  certP12Ciphered:  text('cert_p12_ciphered'),
  certP12Iv:        text('cert_p12_iv'),
  certP12AuthTag:   text('cert_p12_auth_tag'),
  certPinCiphered:  text('cert_pin_ciphered'),
  certPinIv:        text('cert_pin_iv'),
  certPinAuthTag:   text('cert_pin_auth_tag'),
  // Metadatos públicos del certificado (sin cifrar — para mostrar en UI)
  certTitular:      text('cert_titular'),
  certSerial:       text('cert_serial'),
  certVencimiento:  timestamp('cert_vencimiento'),

  // ── DGII ─────────────────────────────────────────────────────────────────
  // Ambiente DGII vive en ecf-api (contrib.ambiente) — NO se duplica aquí.
  // Token de enrutamiento público — va en la URL que el cliente copia al portal DGII
  // Ej: api.emitedo.com/dgii/v1/{dgiiRoutingToken}/fe/recepcion/api/ecf
  // Generado una sola vez al crear el team, nunca cambia.
  dgiiRoutingToken: uuid('dgii_routing_token').defaultRandom().unique(),
  // Token DGII cifrado AES-256-GCM (JWT para llamar la API de DGII — distinto al anterior)
  dgiiTokenCiphered:  text('dgii_token_ciphered'),
  dgiiTokenIv:        text('dgii_token_iv'),
  dgiiTokenAuthTag:   text('dgii_token_auth_tag'),
  dgiiTokenExpiresAt: timestamp('dgii_token_expires_at'),

  // ── Habilitación DGII — JSON blob con estado del wizard ──────────────────
  // { fase, subPaso, pruebasEmitidas:{'31':4,...}, xmls:{postulacion:'...', declaracion:'...'}, ... }
  habilitacionState: text('habilitacion_state'),
  habilitacionCompletadoAt: timestamp('habilitacion_completado_at'),

  // ── Perfil visual (PDF, portal) ───────────────────────────────────────────
  logo: text('logo'),                          // base64 data URL
  firma: text('firma'),                        // base64 data URL
  telefono: varchar('telefono', { length: 30 }),
  sitioWeb: varchar('sitio_web', { length: 200 }),
  emailFacturacion: varchar('email_facturacion', { length: 255 }),
  colorPrimario: varchar('color_primario', { length: 7 }).default('#1e40af'),

  // ── ECF API — identificador del contribuyente en el proveedor NCF ─────────
  // Asignado al registrar la empresa en ecf-api. Null = aún no registrada.
  ecfCodigoPublico: varchar('ecf_codigo_publico', { length: 50 }),

  // ── Recargo por mora (cobranza) ───────────────────────────────────────────
  // Si está activo, el cron diario aplica un recargo automático como dato de
  // cobranza sobre las facturas vencidas. NO modifica el e-CF ya emitido ni
  // su XML fiscal — el recargo se registra en `recargos_mora` y se suma al
  // saldo mostrado en la vista de cuentas por cobrar (Opción A arquitectura).
  recargoMoraActivo:      boolean('recargo_mora_activo').notNull().default(false),
  recargoMoraPorcentaje:  integer('recargo_mora_porcentaje').notNull().default(200),  // basis points; 200 = 2.00%
  recargoMoraDiasGracia:  integer('recargo_mora_dias_gracia').notNull().default(5),

  // ── Módulo Cuadre de Caja ─────────────────────────────────────────────────
  // Toggle por empresa. Si está activo: aparece el grupo "Caja" en el sidebar,
  // el badge de estado en el header, y no se puede facturar sin turno abierto.
  cajaHabilitada:         boolean('caja_habilitada').notNull().default(false),
  // Duración máxima de un turno abierto, en horas. NULL = SIN LÍMITE: sin
  // contador, sin avisos, sin bloqueo. Default NULL a propósito — la función
  // nace apagada y se activa por empresa desde /admin/empresas/[id]. Un default
  // con número bloquearía a los cajeros con turnos largos el día del deploy.
  cajaLimiteHoras:        integer('caja_limite_horas'),
  // Minutos antes del límite en que aparece el contador y empiezan los avisos.
  // Antes de esa ventana no se muestra nada: un contador visible todo el día se
  // vuelve parte del decorado y nadie lo mira. Solo aplica si hay límite.
  cajaAvisoMinutos:       integer('caja_aviso_minutos').notNull().default(60),
  // Horas de tolerancia tras el límite. Pasadas, el cajero NO puede facturar ni
  // cobrar hasta cerrar caja. La gracia evita que el corte caiga a mitad de una
  // venta: al llegar, lleva horas de avisos. NULL/0 = nunca bloquea (solo avisa).
  cajaGraciaHoras:        integer('caja_gracia_horas'),

  // ── Módulo Punto de Venta (POS) ───────────────────────────────────────────
  // Toggle por empresa. Si está activo: aparece el POS full-screen y sus terminales.
  posHabilitado:          boolean('pos_habilitado').notNull().default(false),
  // Capa escolar (monedero del estudiante): exclusiva de colegios. Solo aplica con posHabilitado.
  posEscolarHabilitado:   boolean('pos_escolar_habilitado').notNull().default(false),

  // Plazo de pago por defecto para nuevas facturas. NULL = de contado; N = crédito a N días.
  plazoPagoDefaultDias:   integer('plazo_pago_default_dias'),

  // ── Métodos de pago que OBLIGAN emisión a la DGII ─────────────────────────
  // Array de valores de METODO_PAGO_VALUES (lib/pagos/metodos.ts). Si una
  // factura registra un pago con alguno de estos métodos, NO se puede guardar
  // como borrador: hay que emitirla a la DGII. Vacío = sin restricción.
  // Ej: ["tarjeta"] → toda venta con tarjeta va obligatoriamente a la DGII.
  metodosObligaDgii:      jsonb('metodos_obliga_dgii').notNull().default([]),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

// ── Roles por empresa (permisos editables) ──────────────────────────────────
// Cada team tiene sus propios roles: los 4 de sistema (owner/admin/user/lector)
// sembrados + los custom que cree. teamMembers.role guarda la `key`.
// Permisos efectivos se resuelven en lib/auth/permissions.ts (owner siempre full).
export const teamRoles = pgTable('team_roles', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  key: varchar('key', { length: 50 }).notNull(),
  label: varchar('label', { length: 60 }).notNull(),
  description: varchar('description', { length: 255 }),
  icon: varchar('icon', { length: 40 }),
  color: varchar('color', { length: 120 }),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  teamKeyUnique: uniqueIndex('team_roles_team_key_idx').on(t.teamId, t.key),
}));

export const teamRolePermissions = pgTable('team_role_permissions', {
  id: serial('id').primaryKey(),
  teamRoleId: integer('team_role_id')
    .notNull()
    .references(() => teamRoles.id, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 50 }).notNull(),
}, (t) => ({
  rolePermUnique: uniqueIndex('team_role_perm_idx').on(t.teamRoleId, t.permission),
}));

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  token: varchar('token', { length: 64 }).unique().notNull(),
});

// ─── EmiteDO — Clientes ───────────────────────────────────────────────────────

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  rnc: varchar('rnc', { length: 20 }),
  razonSocial: varchar('razon_social', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  telefono: varchar('telefono', { length: 20 }),
  direccion: varchar('direccion', { length: 500 }),
  descripcion: text('descripcion'),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Dependientes de Clientes ──────────────────────────────────────

export const dependientes = pgTable('dependientes', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  clientId: integer('client_id')
    .notNull()
    .references(() => clients.id),
  nombre: varchar('nombre', { length: 120 }).notNull(),
  apellido: varchar('apellido', { length: 120 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('dependientes_client_idx').on(t.clientId),
  // Búsqueda de clientes por beneficiario (EXISTS en GET /api/clientes?q=).
  index('dependientes_team_client_idx').on(t.teamId, t.clientId),
]);

// ─── POS — Monedero escolar del estudiante (Fase 2) ──────────────────────────
// Saldo prepago por estudiante (un dependiente). El acudiente recarga; el
// estudiante consume en el POS. Exclusivo de colegios (pos_escolar_habilitado).
export const monederoEstudiante = pgTable('monedero_estudiante', {
  id:                    serial('id').primaryKey(),
  teamId:                integer('team_id').notNull().references(() => teams.id),
  dependienteId:         integer('dependiente_id').notNull().references(() => dependientes.id),
  saldoCentavos:         integer('saldo_centavos').notNull().default(0),
  /** NULL = sin límite diario. */
  limiteDiarioCentavos:  integer('limite_diario_centavos'),
  activo:                boolean('activo').notNull().default(true),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
  updatedAt:             timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('monedero_dependiente_uniq').on(t.dependienteId),
  index('monedero_team_idx').on(t.teamId),
]);

export const monederoMovimientos = pgTable('monedero_movimientos', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  monederoId:       integer('monedero_id').notNull().references(() => monederoEstudiante.id),
  // RECARGA | CONSUMO | AJUSTE | REVERSA
  tipo:             varchar('tipo', { length: 20 }).notNull(),
  montoCentavos:    integer('monto_centavos').notNull(),
  esEntrada:        boolean('es_entrada').notNull(),
  saldoAntes:       integer('saldo_antes').notNull(),
  saldoDespues:     integer('saldo_despues').notNull(),
  referenciaEcfId:  integer('referencia_ecf_id').references(() => ecfDocuments.id),
  motivo:           text('motivo'),
  createdBy:        integer('created_by').references(() => users.id),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('monedero_mov_monedero_idx').on(t.monederoId),
  index('monedero_mov_team_fecha_idx').on(t.teamId, t.createdAt),
]);

export type MonederoEstudiante  = typeof monederoEstudiante.$inferSelect;
export type MonederoMovimiento  = typeof monederoMovimientos.$inferSelect;

// ─── EmiteDO — Productos y Servicios ─────────────────────────────────────────

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  descripcion: text('descripcion'),
  referencia: varchar('referencia', { length: 100 }),  // SKU / código interno
  codigoBarras: varchar('codigo_barras', { length: 64 }),  // EAN/UPC para lector POS
  precio: integer('precio').notNull().default(0),       // en centavos
  tasaItbis: varchar('tasa_itbis', { length: 6 }).notNull().default('0.18'), // '0.18'|'0.16'|'0'|'exento'
  tipo: varchar('tipo', { length: 10 }).notNull().default('servicio'),       // 'bien'|'servicio'
  activo: varchar('activo', { length: 5 }).notNull().default('true'),        // 'true'|'false'
  // ── Inventario ──────────────────────────────────────────────────────────────
  unidadMedida: varchar('unidad_medida', { length: 50 }).notNull().default('Unidad'),
  costo: integer('costo').notNull().default(0),                   // costo de compra en centavos
  stockActual: integer('stock_actual').notNull().default(0),      // unidades disponibles
  stockMinimo: integer('stock_minimo').notNull().default(0),      // umbral alerta bajo mínimo
  controlaInventario: boolean('controla_inventario').notNull().default(false),
  permiteVentaSinStock: boolean('permite_venta_sin_stock').notNull().default(true),
  // POS: si aparece en la grilla del punto de venta (excluye servicios/no vendibles en mostrador).
  visiblePos: boolean('visible_pos').notNull().default(true),
  // POS: favorito → se muestra primero en la grilla.
  posFavorito: boolean('pos_favorito').notNull().default(false),
  esMora: boolean('es_mora').notNull().default(false),                        // servicio de sistema: línea de las ND de mora (1 por team)
  categoriaId: integer('categoria_id').references(() => categorias.id),
  imagen: text('imagen'),  // data URL base64 (mismo patrón que teams.logo), tope ~800KB en el cliente
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Secuencias de e-NCF ───────────────────────────────────────────

export const sequences = pgTable(
  'sequences',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    tipoEcf: varchar('tipo_ecf', { length: 10 }).notNull(), // "31", "32", ..., "sin-ncf"
    nombre: varchar('nombre', { length: 200 }),
    secuenciaDesde: bigint('secuencia_desde', { mode: 'bigint' }).notNull().default(1n),
    secuenciaActual: bigint('secuencia_actual', { mode: 'bigint' }).notNull(),
    secuenciaHasta: bigint('secuencia_hasta', { mode: 'bigint' }).notNull(),
    fechaVencimiento: timestamp('fecha_vencimiento'), // nullable (sin-ncf y e32 no requieren)
    preferida: boolean('preferida').notNull().default(false),
    numeracionAutomatica: boolean('numeracion_automatica').notNull().default(true),
    prefijo: varchar('prefijo', { length: 20 }),
    pieDeFactura: text('pie_de_factura'),
    sucursal: varchar('sucursal', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('sequences_team_tipo_idx').on(table.teamId, table.tipoEcf), index('sequences_team_preferida_idx').on(table.teamId, table.preferida)]
);

// ─── EmiteDO — Documentos e-CF ───────────────────────────────────────────────

export const ecfDocuments = pgTable('ecf_documents', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  clientId: integer('client_id').references(() => clients.id),

  // Identificación
  encf: varchar('encf', { length: 40 }).notNull(),          // E310000000001 (real) o BOR-XXXXXXXX (borrador)
  tipoEcf: varchar('tipo_ecf', { length: 10 }).notNull(),   // "31", "32", ..., "sin-ncf"
  /** Código global-único e identificable: {TIPO}-{AÑO}-{EMP}{USR}-{RND5}-{SEC}. Generado al crear. */
  codigo: varchar('codigo', { length: 40 }),

  // Estado del ciclo de vida
  estado: varchar('estado', { length: 30 }).notNull().default('BORRADOR'),
  // BORRADOR | EN_PROCESO | ACEPTADO | ACEPTADO_CONDICIONAL | RECHAZADO | ANULADO

  /** Estado persistido de cobro. Se recalcula al emitir, pagar, anular. */
  estadoPago: varchar('estado_pago', { length: 20 }).notNull().default('PENDIENTE'),
  // PENDIENTE | PARCIAL | PAGADA | ANULADA | GRATUITA | USO

  // Respuesta DGII
  trackId: varchar('track_id', { length: 100 }),
  codigoSeguridad: varchar('codigo_seguridad', { length: 6 }),
  fechaFirma: varchar('fecha_firma', { length: 30 }), // dd-MM-yyyy HH:mm:ss (firmado por ecf-api)
  urlVerificacion: text('url_verificacion'), // URL completa DGII (devuelta por ecf-api, no reconstruir)
  mensajesDgii: text('mensajes_dgii'), // JSON string

  // XMLs (guardar texto; para producción usar R2/S3)
  xmlOriginal: text('xml_original'),
  xmlFirmado: text('xml_firmado'),
  xmlUrl: text('xml_url'),
  pdfUrl: text('pdf_url'),

  // Datos del comprador (desnormalizados para acceso rápido)
  rncComprador: varchar('rnc_comprador', { length: 20 }),
  razonSocialComprador: varchar('razon_social_comprador', { length: 255 }),
  emailComprador: varchar('email_comprador', { length: 255 }),

  // Montos en centavos (evitar floating point)
  montoTotal: integer('monto_total').notNull().default(0),
  totalItbis: integer('total_itbis').notNull().default(0),
  totalRetenciones: integer('total_retenciones').notNull().default(0),

  // Referencia para notas débito/crédito (tipos 33, 34)
  ncfModificado: varchar('ncf_modificado', { length: 13 }),

  // Referencia por id al documento padre (NC/ND). Más robusta que ncfModificado:
  // sobrevive a que el padre borrador (BOR-) sea promovido a e-CF real.
  // Self-reference sin .references() para evitar import circular (FK en migración 0043).
  origenDocumentoId: integer('origen_documento_id'),

  // Metadatos de modificación DGII (tipos 33/34): 1=Anula, 2=Corrige texto,
  // 3=Corrige monto, 4=Reemplazo contingencia, 5=Ref. factura consumo.
  codigoModificacion: integer('codigo_modificacion'),
  razonModificacion:  text('razon_modificacion'),

  // Saldo a favor del cliente generado por esta Nota de Crédito (tipo 34), capado
  // a lo PAGADO de la factura origen al momento de crearla.
  //   NULL     → NC del modelo viejo: reduce el saldo cobrable de su factura.
  //   NOT NULL → NC del modelo nuevo: NO toca la factura; genera crédito del
  //              cliente (saldo a favor) para pagar otras facturas.
  creditoGeneradoCents: integer('credito_generado_cents'),

  // Campos adicionales del formulario
  notas:               text('notas'),
  terminosCondiciones: text('terminos_condiciones'),
  pieFactura:          text('pie_factura'),
  retenciones:         text('retenciones'),   // JSON: [{id,nombre,porcentaje,tipo,monto}]
  comentario:          text('comentario'),

  // Pago recibido registrado al momento de emitir
  pagoRecibido: varchar('pago_recibido', { length: 5 }).default('false'),
  pagoMetodo:   varchar('pago_metodo',   { length: 30 }),
  pagoCuenta:   varchar('pago_cuenta',   { length: 100 }),
  pagoValorCts: integer('pago_valor_cts').default(0), // centavos
  pagoFecha:    varchar('pago_fecha',    { length: 10 }),

  // Campos DGII Norma 07-18
  // 607: tipo de ingreso (1=operaciones, 2=financiero, 3=extraordinario, 4=arrendamiento, 5=activo depreciable, 6=otros)
  tipoIngreso:   varchar('tipo_ingreso',   { length: 2 }).default('1'),
  // 608: tipo de anulación (01=deterioro preimpresa, 02=errores impresión, 03=impresión defectuosa,
  //   04=corrección info, 05=cambio productos, 06=devolución, 07=omisión, 08=errores secuencia, 09=cese, 10=pérdida)
  tipoAnulacion: varchar('tipo_anulacion', { length: 2 }).default('04'),

  // Datos para editar borradores (no van al XML, solo para restaurar el form)
  lineasJson:       text('lineas_json'),         // JSON con ItemLinea[] del form
  tipoPago:         integer('tipo_pago').default(1),  // 1=contado,2=crédito,3=gratuito,4=uso
  fechaLimitePago:  varchar('fecha_limite_pago', { length: 10 }), // YYYY-MM-DD

  // Dependiente del cliente seleccionado al emitir (metadato — no va al XML DGII)
  dependienteId:     integer('dependiente_id').references(() => dependientes.id),
  dependienteNombre: varchar('dependiente_nombre', { length: 255 }),

  // ID de la emisión en ecf-api (para consultar estado sin ir a DGII directo)
  ecfApiEmisionId: varchar('ecf_api_emision_id', { length: 50 }),

  // Origen: si este documento fue generado por una factura recurrente, apunta a ella.
  // Permite que AR muestre borradores de origen recurrente (crédito/tipoPago=2) aunque
  // todavía no estén emitidos a la DGII.
  origenRecurrenteId: integer('origen_recurrente_id').references(() => facturasRecurrentes.id),

  // Cuadre de caja: turno en el que se emitió/cobró este documento. Nullable
  // (legacy + empresas sin caja habilitada). Se estampa al emitir si el usuario
  // tiene un turno abierto. Permite la conciliación NCF↔efectivo del cierre.
  turnoCajaId: integer('turno_caja_id').references(() => cajaTurnos.id),

  // Si fue generado por una recurrente, la fecha de cobro (período) del schedule
  // a la que corresponde. Permite el timeline de períodos y detección de duplicados.
  periodoRecurrente: date('periodo_recurrente'),

  // Si este documento es una Nota de Débito por mora (tipo 33, BORRADOR interno,
  // no se envía a DGII), apunta al ecf_document padre que la originó. Self-reference
  // sin .references() para evitar import circular (FK declarada en la migración).
  moraOrigenId: integer('mora_origen_id'),

  // Override por factura del recargo por mora (crédito + recargo activo).
  // NULL = usar el default del team (recargoMoraPorcentaje / recargoMoraDiasGracia).
  moraPorcentaje: integer('mora_porcentaje'),  // basis points (200 = 2%)
  moraDiasGracia: integer('mora_dias_gracia'), // días de gracia

  // Metadatos de venta: almacén, vendedor y lista de precios usada al emitir
  almacenId:      integer('almacen_id').references(() => almacenes.id),
  vendedorId:     integer('vendedor_id').references(() => vendedores.id),
  listaPreciosId: integer('lista_precios_id').references(() => listasPrecios.id),

  // true = ya se descontó stock para este documento (al guardar borrador o al
  // emitir). Evita doble descuento al promover un borrador a e-CF, y le dice a
  // /anular si debe restaurar stock (reemplaza el chequeo viejo por `estado`,
  // que ya no sirve porque BORRADOR también puede tener stock descontado).
  stockDescontado: boolean('stock_descontado').notNull().default(false),

  // Usuario que creó el documento (nullable para registros legacy)
  createdBy: integer('created_by').references(() => users.id),
  // Último usuario que editó el documento (anular, editar borrador, emitir)
  updatedBy: integer('updated_by').references(() => users.id),

  fechaEmision: timestamp('fecha_emision').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — e-CFs RECIBIDOS de otros contribuyentes ──────────────────────
// Cuando otra empresa nos envía un e-CF (tipos 31, 33, 34, 44), se guarda aquí.
// El team identifica al receptor (nosotros). El emisor se guarda desnormalizado.

export const ecfDocumentsRecibidos = pgTable('ecf_documents_recibidos', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),

  // Identificación del e-CF recibido
  encf:       varchar('encf', { length: 40 }).notNull(),
  tipoEcf:    varchar('tipo_ecf', { length: 2 }).notNull(),

  // Emisor (quién nos envió)
  rncEmisor:         varchar('rnc_emisor', { length: 20 }).notNull(),
  razonSocialEmisor: varchar('razon_social_emisor', { length: 255 }),

  // Receptor (debe coincidir con teams.rnc)
  rncReceptor: varchar('rnc_receptor', { length: 20 }).notNull(),

  // Totales (centavos)
  montoTotal: integer('monto_total').notNull().default(0),
  totalItbis: integer('total_itbis').notNull().default(0),

  // XML recibido + ARECF que respondimos
  xmlRecibido:    text('xml_recibido').notNull(),
  arecfFirmado:   text('arecf_firmado'),

  // Estado del acuse: RECIBIDO | NO_RECIBIDO
  estadoAcuse:    varchar('estado_acuse', { length: 20 }).notNull().default('RECIBIDO'),
  // Código de rechazo (si estadoAcuse = NO_RECIBIDO):
  // 1=Error especificación, 2=Error firma digital, 3=Envío duplicado, 4=RNC no corresponde
  codigoRechazo:  varchar('codigo_rechazo', { length: 2 }),

  // Aprobación comercial (B2B): APROBADO | RECHAZADO | CONDICIONAL | PENDIENTE
  estadoComercial:     varchar('estado_comercial', { length: 20 }).notNull().default('PENDIENTE'),
  acecfRecibido:       text('acecf_recibido'),
  fechaEstadoComercial: timestamp('fecha_estado_comercial'),

  fechaRecepcion: timestamp('fecha_recepcion').notNull().defaultNow(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('ecf_recibidos_team_idx').on(t.teamId),
  index('ecf_recibidos_encf_idx').on(t.teamId, t.rncEmisor, t.encf),
]);

// ─── DGII — Catálogos de referencia (estáticos) ──────────────────────────────
// Espejo local de los catálogos públicos de ecf-api (/v1/catalogos/*).
// Tabla genérica con `metadata jsonb` para los campos extra que varían por
// catálogo (descripcion, tasa, sigla, simbolo, codigoIso2, formato, etc.).
// Sincronizada por /api/cron/dgii-catalogos-sync (semanal).

export const dgiiCatalogos = pgTable(
  'dgii_catalogos',
  {
    tipo:         varchar('tipo', { length: 40 }).notNull(),
    codigo:       varchar('codigo', { length: 20 }).notNull(),
    nombre:       varchar('nombre', { length: 255 }).notNull(),
    parentCodigo: varchar('parent_codigo', { length: 20 }),
    metadata:     jsonb('metadata').notNull().default({}),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tipo, t.codigo] }),
    index('dgii_catalogos_parent_idx').on(t.tipo, t.parentCodigo),
  ],
);

// Log de ejecuciones del cron de sincronización.
export const dgiiCatalogosSyncLog = pgTable('dgii_catalogos_sync_log', {
  id:           serial('id').primaryKey(),
  ejecutadoAt:  timestamp('ejecutado_at', { withTimezone: true }).notNull().defaultNow(),
  ok:           boolean('ok').notNull(),
  detalle:      jsonb('detalle').notNull().default({}),
  duracionMs:   integer('duracion_ms'),
});

// ─── DGII — Padrón de contribuyentes (RNC) ───────────────────────────────────
// Descargado del ZIP público de la DGII (~600K registros)
// Permite búsqueda de nombre por RNC y viceversa

export const rncPadron = pgTable('rnc_padron', {
  rnc:             varchar('rnc', { length: 20 }).primaryKey(),
  nombre:          varchar('nombre', { length: 255 }).notNull(),
  nombreComercial: varchar('nombre_comercial', { length: 255 }),
  categoria:       varchar('categoria', { length: 3 }),
  estado:          varchar('estado', { length: 2 }).default('2'), // 2=Activo, 3=Suspendido, 4=Baja
  actividad:       varchar('actividad', { length: 10 }),
  actualizadoAt:   timestamp('actualizado_at').notNull().defaultNow(),
});

// ─── EmiteDO — Categorías de Productos ──────────────────────────────────────
export const categorias = pgTable('categorias', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  descripcion: text('descripcion'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── EmiteDO — Maestros (listas custom de atributos) ─────────────────────────
// Un maestro es una lista (Marca, Color…) con valores manuales. Se engancha a
// productos/servicios como labels. aplicaA: 'bien'|'servicio'|'ambos'|'manual'.
// multiple: false = un valor por producto; true = varios.
export const maestros = pgTable('maestros', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  descripcion: text('descripcion'),
  aplicaA: varchar('aplica_a', { length: 10 }).notNull().default('manual'),
  multiple: boolean('multiple').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('maestros_team_idx').on(t.teamId)]);

export const maestroValores = pgTable('maestro_valores', {
  id: serial('id').primaryKey(),
  maestroId: integer('maestro_id').notNull().references(() => maestros.id, { onDelete: 'cascade' }),
  valor: varchar('valor', { length: 150 }).notNull(),
  orden: integer('orden').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('maestro_valores_maestro_idx').on(t.maestroId)]);

export const productoMaestroValores = pgTable('producto_maestro_valores', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  maestroId: integer('maestro_id').notNull().references(() => maestros.id, { onDelete: 'cascade' }),
  valorId: integer('valor_id').notNull().references(() => maestroValores.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('producto_maestro_valores_product_idx').on(t.productId),
  index('producto_maestro_valores_maestro_idx').on(t.maestroId),
  uniqueIndex('producto_maestro_valores_uniq').on(t.productId, t.valorId),
]);

// A qué entidades aplica un maestro: 'producto' | 'factura' (extensible).
export const maestroTargets = pgTable('maestro_targets', {
  id: serial('id').primaryKey(),
  maestroId: integer('maestro_id').notNull().references(() => maestros.id, { onDelete: 'cascade' }),
  entidad: varchar('entidad', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('maestro_targets_uniq').on(t.maestroId, t.entidad)]);

// Clasificación de la factura (cabecera) con valores de maestros target='factura'.
export const facturaMaestroValores = pgTable('factura_maestro_valores', {
  id: serial('id').primaryKey(),
  ecfDocumentId: integer('ecf_document_id').notNull().references(() => ecfDocuments.id, { onDelete: 'cascade' }),
  maestroId: integer('maestro_id').notNull().references(() => maestros.id, { onDelete: 'cascade' }),
  valorId: integer('valor_id').notNull().references(() => maestroValores.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('factura_maestro_valores_doc_idx').on(t.ecfDocumentId),
  index('factura_maestro_valores_maestro_idx').on(t.maestroId),
  index('factura_maestro_valores_valor_idx').on(t.valorId),
  uniqueIndex('factura_maestro_valores_uniq').on(t.ecfDocumentId, t.valorId),
]);

export const maestrosRelations = relations(maestros, ({ one, many }) => ({
  team: one(teams, { fields: [maestros.teamId], references: [teams.id] }),
  valores: many(maestroValores),
  targets: many(maestroTargets),
}));

export const maestroTargetsRelations = relations(maestroTargets, ({ one }) => ({
  maestro: one(maestros, { fields: [maestroTargets.maestroId], references: [maestros.id] }),
}));

export const facturaMaestroValoresRelations = relations(facturaMaestroValores, ({ one }) => ({
  ecfDocument: one(ecfDocuments, { fields: [facturaMaestroValores.ecfDocumentId], references: [ecfDocuments.id] }),
  maestro: one(maestros, { fields: [facturaMaestroValores.maestroId], references: [maestros.id] }),
  valor: one(maestroValores, { fields: [facturaMaestroValores.valorId], references: [maestroValores.id] }),
}));

export const maestroValoresRelations = relations(maestroValores, ({ one }) => ({
  maestro: one(maestros, { fields: [maestroValores.maestroId], references: [maestros.id] }),
}));

export const productoMaestroValoresRelations = relations(productoMaestroValores, ({ one }) => ({
  product: one(products, { fields: [productoMaestroValores.productId], references: [products.id] }),
  maestro: one(maestros, { fields: [productoMaestroValores.maestroId], references: [maestros.id] }),
  valor: one(maestroValores, { fields: [productoMaestroValores.valorId], references: [maestroValores.id] }),
}));

export type Maestro = typeof maestros.$inferSelect;
export type NewMaestro = typeof maestros.$inferInsert;
export type MaestroValor = typeof maestroValores.$inferSelect;
export type NewMaestroValor = typeof maestroValores.$inferInsert;
export type ProductoMaestroValor = typeof productoMaestroValores.$inferSelect;
export type NewProductoMaestroValor = typeof productoMaestroValores.$inferInsert;
export type MaestroTarget = typeof maestroTargets.$inferSelect;
export type NewMaestroTarget = typeof maestroTargets.$inferInsert;
export type FacturaMaestroValor = typeof facturaMaestroValores.$inferSelect;
export type NewFacturaMaestroValor = typeof facturaMaestroValores.$inferInsert;

// ─── EmiteDO — Cotizaciones ───────────────────────────────────────────────────
export const cotizaciones = pgTable('cotizaciones', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  clientId: integer('client_id').references(() => clients.id),
  numero: varchar('numero', { length: 20 }).notNull(),
  estado: varchar('estado', { length: 20 }).notNull().default('borrador'),
  razonSocialComprador: varchar('razon_social_comprador', { length: 255 }),
  rncComprador: varchar('rnc_comprador', { length: 20 }),
  emailComprador: varchar('email_comprador', { length: 255 }),
  fechaEmision: timestamp('fecha_emision').notNull().defaultNow(),
  fechaVencimiento: timestamp('fecha_vencimiento'),
  montoSubtotal: integer('monto_subtotal').notNull().default(0),
  montoDescuento: integer('monto_descuento').notNull().default(0),
  totalItbis: integer('total_itbis').notNull().default(0),
  montoTotal: integer('monto_total').notNull().default(0),
  items: text('items'),
  notas: text('notas'),
  terminosCondiciones: text('terminos_condiciones'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Facturas Recurrentes ──────────────────────────────────────────
export const facturasRecurrentes = pgTable('facturas_recurrentes', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  clientId:         integer('client_id').references(() => clients.id),
  nombre:           varchar('nombre', { length: 100 }).notNull(),
  /** Descripción corta opcional del plan (visible en UI/PDF). Distinto de notas. */
  descripcion:      varchar('descripcion', { length: 200 }),
  tipoEcf:          varchar('tipo_ecf', { length: 2 }).notNull().default('31'),
  tipoPago:         integer('tipo_pago').notNull().default(1),
  /** Días desde fechaEmision hasta fechaLimitePago cuando tipoPago=2 (crédito).
   *  null = inmediato. Caso colegio: 5 días → vence el día 5, AR detecta vencida día 6. */
  diasParaPago:     integer('dias_para_pago'),
  frecuencia:       varchar('frecuencia', { length: 20 }).notNull().default('mensual'),
  /** Día del mes (1-31) en que se cobra para frecuencias mensual/trimestral/anual.
   *  null para semanal/quincenal. Cron lo usa para evitar drift al sumar meses. */
  diaCobro:         integer('dia_cobro'),
  fechaInicio:      date('fecha_inicio').notNull(),
  fechaFin:         date('fecha_fin'),
  proximaEmision:   date('proxima_emision').notNull(),
  estado:           varchar('estado', { length: 20 }).notNull().default('activa'),
  items:            text('items').notNull().default('[]'),
  notas:            text('notas'),
  totalEstimado:    integer('total_estimado').notNull().default(0),
  /** Override de mora por plan (bps; 200=2%). null → usa config global del team. */
  moraPorcentaje:   integer('mora_porcentaje'),
  /** Override de días de gracia por plan. null → usa config global del team. */
  moraDiasGracia:   integer('mora_dias_gracia'),
  facturasEmitidas: integer('facturas_emitidas').notNull().default(0),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Pagos recibidos (cuentas por cobrar) ──────────────────────────
// Múltiples pagos por factura. El saldo pendiente = ecfDocuments.montoTotal -
// SUM(pagosRecibidos.montoCentavos WHERE ecfDocumentId = doc.id).
// Si saldo > 0 y fechaLimitePago < hoy → cuenta vencida.

export const pagosRecibidos = pgTable('pagos_recibidos', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  ecfDocumentId:   integer('ecf_document_id').notNull().references(() => ecfDocuments.id),
  /** Monto en centavos (DOP). */
  montoCentavos:   integer('monto_centavos').notNull(),
  /** Método: efectivo, transferencia, tarjeta, cheque, otro, saldo_favor, nota_credito. */
  metodo:          varchar('metodo', { length: 30 }).notNull(),
  /** NC consumida cuando metodo='nota_credito' (voucher por código, uso único). */
  notaCreditoId:   integer('nota_credito_id'),
  /** Identificador opcional: número de cheque, últimos 4 de tarjeta, etc. */
  referencia:      varchar('referencia', { length: 100 }),
  /** Cuenta bancaria/caja a la que entró (free-text). */
  cuenta:          varchar('cuenta', { length: 100 }),
  /** Fecha del pago (YYYY-MM-DD), separada de createdAt para registros backdated. */
  fechaPago:       date('fecha_pago').notNull(),
  notas:           text('notas'),
  /** Cuadre de caja: turno en el que entró el cobro. Nullable (cobros fuera de
   *  turno o empresas sin caja). El efectivo del cierre suma los pagos con
   *  metodo='efectivo' de este turno. */
  turnoCajaId:     integer('turno_caja_id').references(() => cajaTurnos.id),
  /** Usuario que registró el pago. */
  createdBy:       integer('created_by').references(() => users.id),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('pagos_team_doc_idx').on(t.teamId, t.ecfDocumentId),
  index('pagos_team_fecha_idx').on(t.teamId, t.fechaPago),
  index('pagos_turno_idx').on(t.turnoCajaId),
]);

// ─── Pasarelas de pago (links de pago — CardNet / Azul) ───────────────────────

/**
 * Credenciales de comercio por empresa. Cada tenant conecta SU cuenta de la
 * pasarela. Los secretos (`authKey`, `apiKey`) se guardan cifrados AES-256-GCM
 * con lib/crypto/cert.ts (mismo esquema que el P12). NUNCA texto plano.
 */
export const paymentProviderConfig = pgTable('payment_provider_config', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  /** 'cardnet' | 'azul' */
  provider:   varchar('provider', { length: 20 }).notNull(),
  merchantId: varchar('merchant_id', { length: 50 }),
  terminalId: varchar('terminal_id', { length: 50 }),
  /** Encrypted (jsonb: {iv, ciphered, tag}) — AuthKey / clave de firma. */
  authKey:    jsonb('auth_key'),
  /** Encrypted (jsonb) — API key adicional si el proveedor la usa. */
  apiKey:     jsonb('api_key'),
  /** 'sandbox' | 'prod' */
  ambiente:   varchar('ambiente', { length: 10 }).notNull().default('sandbox'),
  enabled:    boolean('enabled').notNull().default(false),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('ppc_team_provider_uq').on(t.teamId, t.provider),
]);

/**
 * Intención de cobro = link de pago. Exactamente uno de `ecfDocumentId` /
 * `cotizacionId` está seteado. `ordenId` es la llave de idempotencia frente a
 * la pasarela y frente a callbacks duplicados: un link jamás registra el pago
 * dos veces. Nada se pierde: el pago solo se marca tras verificación server-side.
 */
export const paymentLinks = pgTable('payment_links', {
  id:            serial('id').primaryKey(),
  /** Token público en la URL (pay.zero.com.do/{token}). */
  token:         varchar('token', { length: 40 }).notNull().unique(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  provider:      varchar('provider', { length: 20 }).notNull(),
  ecfDocumentId: integer('ecf_document_id').references(() => ecfDocuments.id),
  cotizacionId:  integer('cotizacion_id').references(() => cotizaciones.id),
  /** Monto total a cobrar, centavos DOP. */
  montoCentavos: integer('monto_centavos').notNull(),
  /** ITBIS incluido en el total, centavos. */
  itbisCentavos: integer('itbis_centavos').notNull().default(0),
  currency:      varchar('currency', { length: 3 }).notNull().default('DOP'),
  /** OrdenId/OrderNumber enviado al proveedor — idempotencia. */
  ordenId:       varchar('orden_id', { length: 50 }).notNull(),
  /** pendiente | procesando | pagado | fallido | expirado | cancelado */
  estado:        varchar('estado', { length: 20 }).notNull().default('pendiente'),
  /** SESSION uuid de CardNet. */
  sessionId:     varchar('session_id', { length: 64 }),
  /** session-key para GET /sessions/{id}?sk= */
  sessionKey:    varchar('session_key', { length: 128 }),
  /** AuthorizationCode / RetrievalReferenceNumber de la pasarela. */
  providerRef:   varchar('provider_ref', { length: 64 }),
  /** Tarjeta enmascarada devuelta por la pasarela. */
  cardMask:      varchar('card_mask', { length: 25 }),
  /** Pago registrado en pagos_recibidos (evita doble inserción). */
  pagoRecibidoId: integer('pago_recibido_id').references(() => pagosRecibidos.id),
  expiresAt:     timestamp('expires_at'),
  paidAt:        timestamp('paid_at'),
  createdBy:     integer('created_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('paylink_team_estado_idx').on(t.teamId, t.estado),
  index('paylink_ecf_idx').on(t.ecfDocumentId),
  index('paylink_cotiz_idx').on(t.cotizacionId),
  uniqueIndex('paylink_orden_uq').on(t.teamId, t.ordenId),
]);

// ─── Relaciones ───────────────────────────────────────────────────────────────

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  clients: many(clients),
  products: many(products),
  sequences: many(sequences),
  ecfDocuments: many(ecfDocuments),
  cotizaciones: many(cotizaciones),
  categorias: many(categorias),
  facturasRecurrentes: many(facturasRecurrentes),
  impresoras: many(impresoras),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const teamRolesRelations = relations(teamRoles, ({ one, many }) => ({
  team: one(teams, {
    fields: [teamRoles.teamId],
    references: [teams.id],
  }),
  permissions: many(teamRolePermissions),
}));

export const teamRolePermissionsRelations = relations(teamRolePermissions, ({ one }) => ({
  role: one(teamRoles, {
    fields: [teamRolePermissions.teamRoleId],
    references: [teamRoles.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  team: one(teams, {
    fields: [clients.teamId],
    references: [teams.id],
  }),
  ecfDocuments: many(ecfDocuments),
  dependientes: many(dependientes),
}));

export const dependientesRelations = relations(dependientes, ({ one }) => ({
  team: one(teams, { fields: [dependientes.teamId], references: [teams.id] }),
  client: one(clients, { fields: [dependientes.clientId], references: [clients.id] }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  team: one(teams, {
    fields: [products.teamId],
    references: [teams.id],
  }),
  categoria: one(categorias, {
    fields: [products.categoriaId],
    references: [categorias.id],
  }),
}));

export const sequencesRelations = relations(sequences, ({ one }) => ({
  team: one(teams, {
    fields: [sequences.teamId],
    references: [teams.id],
  }),
}));

export const ecfDocumentsRelations = relations(ecfDocuments, ({ one }) => ({
  team: one(teams, {
    fields: [ecfDocuments.teamId],
    references: [teams.id],
  }),
  client: one(clients, {
    fields: [ecfDocuments.clientId],
    references: [clients.id],
  }),
  createdByUser: one(users, {
    fields: [ecfDocuments.createdBy],
    references: [users.id],
  }),
}));

export const cotizacionesRelations = relations(cotizaciones, ({ one }) => ({
  team: one(teams, { fields: [cotizaciones.teamId], references: [teams.id] }),
  client: one(clients, { fields: [cotizaciones.clientId], references: [clients.id] }),
}));

export const categoriasRelations = relations(categorias, ({ one }) => ({
  team: one(teams, { fields: [categorias.teamId], references: [teams.id] }),
}));

export const facturasRecurrentesRelations = relations(facturasRecurrentes, ({ one }) => ({
  team: one(teams, { fields: [facturasRecurrentes.teamId], references: [teams.id] }),
  client: one(clients, { fields: [facturasRecurrentes.clientId], references: [clients.id] }),
}));

export const pagosRecibidosRelations = relations(pagosRecibidos, ({ one }) => ({
  team:        one(teams,        { fields: [pagosRecibidos.teamId],        references: [teams.id] }),
  ecfDocument: one(ecfDocuments, { fields: [pagosRecibidos.ecfDocumentId], references: [ecfDocuments.id] }),
  createdByUser: one(users,      { fields: [pagosRecibidos.createdBy],     references: [users.id] }),
}));

// ─── EmiteDO — System Logs ───────────────────────────────────────────────────

export const systemLogs = pgTable('system_logs', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').references(() => teams.id),
  userId:    integer('user_id').references(() => users.id),
  level:     varchar('level', { length: 10 }).notNull().default('error'),  // 'error'|'warn'|'info'
  source:    varchar('source', { length: 255 }),                           // e.g. '/api/ecf/emitir'
  message:   text('message').notNull(),
  details:   text('details'),                                              // JSON string
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type SystemLog = typeof systemLogs.$inferSelect;

// ─── EmiteDO — Almacenes ──────────────────────────────────────────────────────

export const almacenes = pgTable('almacenes', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  nombre:      varchar('nombre', { length: 255 }).notNull(),
  direccion:   varchar('direccion', { length: 500 }),
  observacion: text('observacion'),
  esDefault:   varchar('es_default', { length: 5 }).notNull().default('false'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

// ─── EmiteDO — Vendedores ─────────────────────────────────────────────────────

export const vendedores = pgTable('vendedores', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  nombre:         varchar('nombre', { length: 255 }).notNull(),
  identificacion: varchar('identificacion', { length: 100 }),
  observacion:    text('observacion'),
  activo:         varchar('activo', { length: 5 }).notNull().default('true'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});

// ─── EmiteDO — Inventario: Movimientos ───────────────────────────────────────

export const inventoryMovements = pgTable('inventory_movements', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  productoId:      integer('producto_id').notNull().references(() => products.id),
  // VENTA | ENTRADA | AJUSTE_SALIDA | AJUSTE_ENTRADA | DEVOLUCION | STOCK_INICIAL
  tipo:            varchar('tipo', { length: 20 }).notNull(),
  cantidad:        integer('cantidad').notNull(),   // siempre positivo
  esEntrada:       boolean('es_entrada').notNull(), // true = suma, false = resta
  stockAntes:      integer('stock_antes').notNull(),
  stockDespues:    integer('stock_despues').notNull(),
  referenciaId:    integer('referencia_id').references(() => ecfDocuments.id),
  referenciaEncf:  varchar('referencia_encf', { length: 40 }),
  motivo:          text('motivo'),
  createdBy:       integer('created_by').references(() => users.id),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('inv_mov_team_idx').on(t.teamId),
  index('inv_mov_producto_idx').on(t.teamId, t.productoId),
]);

// ─── EmiteDO — Inventario: Stock por almacén ─────────────────────────────────

export const productAlmacenStock = pgTable('product_almacen_stock', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  productId:   integer('product_id').notNull().references(() => products.id),
  almacenId:   integer('almacen_id').notNull().references(() => almacenes.id),
  stockActual: integer('stock_actual').notNull().default(0),
}, (t) => [
  index('pas_team_idx').on(t.teamId),
  index('pas_almacen_idx').on(t.almacenId),
]);

// ─── EmiteDO — Compras locales ────────────────────────────────────────────────

export const comprasLocales = pgTable('compras_locales', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  proveedorRnc:     varchar('proveedor_rnc',    { length: 20 }),
  proveedorNombre:  varchar('proveedor_nombre', { length: 255 }),
  fecha:            date('fecha').notNull().defaultNow(),
  referenciaEncf:   varchar('referencia_encf',  { length: 40 }),
  notas:            text('notas'),
  montoTotal:       integer('monto_total').notNull().default(0),
  createdBy:        integer('created_by').references(() => users.id),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
});

export const comprasLocalesItems = pgTable('compras_locales_items', {
  id:            serial('id').primaryKey(),
  compraId:      integer('compra_id').notNull().references(() => comprasLocales.id),
  productoId:    integer('producto_id').notNull().references(() => products.id),
  almacenId:     integer('almacen_id').references(() => almacenes.id),
  cantidad:      integer('cantidad').notNull(),
  costoUnitario: integer('costo_unitario').notNull().default(0),
});

export type CompraLocal     = typeof comprasLocales.$inferSelect;
export type CompraLocalItem = typeof comprasLocalesItems.$inferSelect;

// ─── EmiteDO — Listas de Precios ──────────────────────────────────────────────

export const listasPrecios = pgTable('listas_precios', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  nombre:      varchar('nombre', { length: 255 }).notNull(),
  tipo:        varchar('tipo', { length: 10 }).notNull().default('valor'),    // 'valor' | 'porcentaje'
  porcentaje:  integer('porcentaje').notNull().default(0),                    // basis points (1100 = 11.00%)
  esDescuento: varchar('es_descuento', { length: 5 }).notNull().default('true'),
  descripcion: text('descripcion'),
  esDefault:   varchar('es_default', { length: 5 }).notNull().default('false'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export const listasPrecios_items = pgTable('listas_precios_items', {
  id:             serial('id').primaryKey(),
  listaPreciosId: integer('lista_precios_id').notNull().references(() => listasPrecios.id),
  productoId:     integer('producto_id').notNull().references(() => products.id),
  precio:         integer('precio').notNull().default(0),  // centavos DOP * 100
});

// ─── EmiteDO: Audit Log de Seguridad ─────────────────────────────────────────
// Registra accesos y operaciones sobre datos sensibles (certs, firmas, DGII).
// Distinto de activityLogs (que es para el historial UX del usuario).

export const auditLogs = pgTable('audit_logs', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').references(() => teams.id),
  userId:    integer('user_id').references(() => users.id),
  actor:     text('actor').notNull(),                        // email o 'system'
  action:    varchar('action', { length: 50 }).notNull(),    // ver AuditAction en lib/audit.ts
  resource:  text('resource'),                               // encf, serial del cert, etc.
  ipAddress: varchar('ip_address', { length: 45 }),
  metadata:  text('metadata'),                               // JSON string con detalles
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('audit_logs_team_idx').on(t.teamId),
  index('audit_logs_action_idx').on(t.action),
  index('audit_logs_created_idx').on(t.createdAt),
]);

// ─── EmiteDO: Notas genéricas por entidad ─────────────────────────────────────
// Notas adjuntas a cualquier entidad (factura, cliente, producto, etc.).
// Reusable vía <EntityNotes entityType="..." entityId={n} />.

export const entityNotes = pgTable('entity_notes', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId:   integer('entity_id').notNull(),
  userId:     integer('user_id').references(() => users.id),
  text:       text('text').notNull(),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
  deletedAt:  timestamp('deleted_at'),
}, (t) => [
  index('entity_notes_entity_idx').on(t.teamId, t.entityType, t.entityId),
]);

export type EntityNote    = typeof entityNotes.$inferSelect;
export type NewEntityNote = typeof entityNotes.$inferInsert;

// ─── EmiteDO: Row Audit Log (DB triggers) ────────────────────────────────────
// Captura cada INSERT/UPDATE/DELETE en business tables vía Postgres triggers.
// Ver migration 0029_row_audit_log.sql y lib/db/audit-context.ts.

export const rowAuditLog = pgTable('row_audit_log', {
  id:          bigserial('id', { mode: 'number' }).primaryKey(),
  tableName:   text('table_name').notNull(),
  rowPk:       text('row_pk'),
  operation:   char('operation', { length: 1 }).notNull(), // 'I' | 'U' | 'D'
  oldData:     jsonb('old_data'),
  newData:     jsonb('new_data'),
  changedCols: text('changed_cols').array(),
  userId:      integer('user_id'),
  teamId:      integer('team_id'),
  actor:       text('actor'),
  ipAddress:   varchar('ip_address', { length: 45 }),
  changedAt:   timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('row_audit_log_table_idx').on(t.tableName),
  index('row_audit_log_table_pk_idx').on(t.tableName, t.rowPk),
  index('row_audit_log_user_idx').on(t.userId),
  index('row_audit_log_team_idx').on(t.teamId),
  index('row_audit_log_changed_idx').on(t.changedAt),
  index('row_audit_log_op_idx').on(t.operation),
]);

export type RowAuditLog = typeof rowAuditLog.$inferSelect;

// ─── EmiteDO: Recargo por mora (cobranza) ────────────────────────────────────
//
// ARQUITECTURA (Opción A): el recargo por mora es un dato EXCLUSIVO de cobranza.
// NO se modifica el e-CF ya emitido (xmlFirmado, montoTotal, lineasJson) porque
// las facturas ACEPTADAS/FIRMADAS en DGII son inmutables — alterarlas rompería
// la integridad fiscal y la urlVerificacion DGII.
//
// El recargo se SUMA al saldo visible en cuentas por cobrar y en el ticket PDF
// de cobranza, pero el documento fiscal permanece intacto.
//
// El constraint UNIQUE en ecf_document_id garantiza idempotencia: "una sola vez"
// por factura, incluso si el cron corre múltiples veces.

export const recargosMora = pgTable('recargos_mora', {
  id:                   serial('id').primaryKey(),
  teamId:               integer('team_id').notNull().references(() => teams.id),
  ecfDocumentId:        integer('ecf_document_id').notNull().references(() => ecfDocuments.id),
  montoCentavos:        integer('monto_centavos').notNull(),
  porcentajeAplicado:   integer('porcentaje_aplicado').notNull(),   // basis points (igual que listasPrecios.porcentaje)
  diasGraciaAplicados:  integer('dias_gracia_aplicados').notNull(),
  baseSaldoCentavos:    integer('base_saldo_centavos').notNull(),   // saldo sobre el que se calculó el recargo
  diasVencidoAlAplicar: integer('dias_vencido_al_aplicar'),
  fechaAplicacion:      timestamp('fecha_aplicacion').notNull().defaultNow(),
  createdBy:            integer('created_by'),                      // null = cron 'system'
}, (t) => [
  index('recargos_mora_team_idx').on(t.teamId),
]);

export type RecargoMora    = typeof recargosMora.$inferSelect;
export type NewRecargoMora = typeof recargosMora.$inferInsert;

// ─── EmiteDO: Counter por team+año para código factura F-YYYY-NNNNNN ──────────
// Atomic upsert vía INSERT ... ON CONFLICT DO UPDATE RETURNING garantiza unicidad.
export const facturaCodigoCounter = pgTable('factura_codigo_counter', {
  teamId: integer('team_id').notNull().references(() => teams.id),
  anio:   smallint('anio').notNull(),
  ultimo: integer('ultimo').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.teamId, t.anio] }),
]);

// ─── EmiteDO: Rate Limits (distribuido — funciona en multi-instancia) ─────────

export const rateLimits = pgTable('rate_limits', {
  key:     text('key').primaryKey(),
  count:   integer('count').notNull().default(1),
  resetAt: timestamp('reset_at').notNull(),
});

// ─── Auth: Password Reset Tokens ─────────────────────────────────────────────

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  token: varchar('token', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('prt_token_idx').on(t.token)]);

// ─── Auth: Email Verification Tokens ─────────────────────────────────────────

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  token: varchar('token', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('evt_token_idx').on(t.token)]);

// ─── EmiteDO: Payments (registro de cobros por factura) ──────────────────────

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  ecfDocumentId: integer('ecf_document_id').references(() => ecfDocuments.id),
  monto: integer('monto').notNull().default(0),       // centavos DOP
  metodo: varchar('metodo', { length: 50 }),           // efectivo|transferencia|cheque|tarjeta
  referencia: varchar('referencia', { length: 255 }),  // número de cheque, transacción, etc.
  notas: text('notas'),
  fecha: date('fecha').notNull(),
  registradoPorId: integer('registrado_por_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── EmiteDO: API Keys ────────────────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  keyHash: text('key_hash').notNull(),          // bcrypt hash de la key
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // primeros 8 chars p/ mostrar
  permisos: text('permisos').notNull().default('read'), // 'read' | 'write' | 'full'
  ultimoUsoAt: timestamp('ultimo_uso_at'),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('api_keys_team_idx').on(t.teamId)]);

// ─── EmiteDO: Outbound Webhooks ───────────────────────────────────────────────

export const outboundWebhooks = pgTable('outbound_webhooks', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  url: text('url').notNull(),
  secret: varchar('secret', { length: 64 }).notNull(), // HMAC signing secret
  eventos: text('eventos').notNull().default('ecf.emitido'), // JSON array de eventos
  activo: boolean('activo').notNull().default(true),
  ultimoDisparo: timestamp('ultimo_disparo'),
  ultimoEstatus: integer('ultimo_estatus'),            // HTTP status code del último disparo
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO: RNC Padrón sync tracking ───────────────────────────────────────

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Impresoras ─────────────────────────────────────────────────────
// Configuración de impresoras por team. La impresora marcada esDefault
// determina qué PDF se abre al hacer clic en "Imprimir" desde una factura.
// No incluye drivers nativos — la impresión real la realiza el navegador.

export const impresoras = pgTable('impresoras', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  nombre:    varchar('nombre', { length: 100 }).notNull(),
  // termica_80mm | termica_58mm | a4
  tipo:      varchar('tipo', { length: 20 }).notNull().default('a4'),
  esDefault: boolean('es_default').notNull().default(false),
  // IP opcional para impresoras de red (referencia visual, sin integración driver)
  ip:        varchar('ip', { length: 100 }),
  // backend intencional: cups | browser | escpos (solo informativo en esta versión)
  backend:   varchar('backend', { length: 20 }).notNull().default('browser'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('impresoras_team_idx').on(t.teamId)]);

// ─── POS — Terminales (puntos de venta) ──────────────────────────────────────
// Cada caja física es una entidad con config FIJA: almacén del que vende y
// descuenta stock, impresora, lista de precios y tipo de comprobante por
// defecto. El cajero no elige nada al abrir turno: ya viene pegado a la terminal.
export const posTerminales = pgTable('pos_terminales', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  nombre:         varchar('nombre', { length: 100 }).notNull(),
  /** Almacén FIJO del que esta caja vende y descuenta stock. */
  almacenId:      integer('almacen_id').notNull().references(() => almacenes.id),
  /** Config fija opcional (si null, el POS usa el default del equipo). */
  impresoraId:    integer('impresora_id').references(() => impresoras.id),
  listaPreciosId: integer('lista_precios_id').references(() => listasPrecios.id),
  /** Tipo de comprobante por defecto al cobrar: 'sin-ncf' (ticket) o un e-CF. */
  tipoEcf:        varchar('tipo_ecf', { length: 10 }).notNull().default('sin-ncf'),
  /** Capacidad restaurante: si true, la terminal opera con mesas/comandas. */
  mesas:          boolean('mesas').notNull().default(false),
  activo:         boolean('activo').notNull().default(true),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('pos_terminales_team_idx').on(t.teamId),
  index('pos_terminales_almacen_idx').on(t.almacenId),
]);

export const posTerminalesRelations = relations(posTerminales, ({ one }) => ({
  team:         one(teams,         { fields: [posTerminales.teamId],         references: [teams.id] }),
  almacen:      one(almacenes,     { fields: [posTerminales.almacenId],      references: [almacenes.id] }),
  impresora:    one(impresoras,    { fields: [posTerminales.impresoraId],    references: [impresoras.id] }),
  listaPrecios: one(listasPrecios, { fields: [posTerminales.listaPreciosId], references: [listasPrecios.id] }),
}));

export type PosTerminal    = typeof posTerminales.$inferSelect;
export type NewPosTerminal = typeof posTerminales.$inferInsert;

// ─── POS — Modo Restaurante (mesas + comandas + meseros) ─────────────────────
//
// Capacidad componible: una terminal con `mesas=true` opera con salón. Las
// cuentas (comandas) viven server-side porque varios meseros las tocan desde la
// misma pantalla compartida. Al cobrar, la comanda se convierte en un e-CF.

export const posMeseros = pgTable('pos_meseros', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  nombre:    varchar('nombre', { length: 80 }).notNull(),
  /** PIN corto para identificarse en la pantalla compartida. */
  pin:       varchar('pin', { length: 6 }).notNull(),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('pos_meseros_team_idx').on(t.teamId),
]);

export const mesas = pgTable('mesas', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  terminalId: integer('terminal_id').notNull().references(() => posTerminales.id),
  nombre:     varchar('nombre', { length: 40 }).notNull(),
  zona:       varchar('zona', { length: 40 }),
  activo:     boolean('activo').notNull().default(true),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('mesas_team_idx').on(t.teamId),
  index('mesas_terminal_idx').on(t.terminalId),
]);

export const comandas = pgTable('comandas', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  terminalId:    integer('terminal_id').notNull().references(() => posTerminales.id),
  mesaId:        integer('mesa_id').notNull().references(() => mesas.id),
  meseroId:      integer('mesero_id').references(() => posMeseros.id),
  turnoId:       integer('turno_id').references(() => cajaTurnos.id),
  /** 'abierta' | 'cobrada' | 'cancelada' */
  estado:        varchar('estado', { length: 12 }).notNull().default('abierta'),
  ecfDocumentId: integer('ecf_document_id').references(() => ecfDocuments.id),
  totalCentavos: integer('total_centavos').notNull().default(0),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('comandas_team_idx').on(t.teamId),
  index('comandas_mesa_idx').on(t.mesaId),
]);

export const comandaItems = pgTable('comanda_items', {
  id:            serial('id').primaryKey(),
  comandaId:     integer('comanda_id').notNull().references(() => comandas.id, { onDelete: 'cascade' }),
  productoId:    integer('producto_id').references(() => products.id),
  nombre:        varchar('nombre', { length: 200 }).notNull(),
  precioCentavos: integer('precio_centavos').notNull(),
  qty:           integer('qty').notNull().default(1),
  tasaItbis:     varchar('tasa_itbis', { length: 10 }).notNull().default('0.18'),
  tipo:          varchar('tipo', { length: 10 }).notNull().default('bien'),
  descuentoPct:  integer('descuento_pct').notNull().default(0),
  notas:         varchar('notas', { length: 200 }),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('comanda_items_comanda_idx').on(t.comandaId),
]);

export type PosMesero   = typeof posMeseros.$inferSelect;
export type Mesa        = typeof mesas.$inferSelect;
export type Comanda     = typeof comandas.$inferSelect;
export type ComandaItem = typeof comandaItems.$inferSelect;

// ─── EmiteDO — Cuadre de Caja (turnos) ───────────────────────────────────────
//
// Modelo "una caja por cajero": cada usuario operativo abre y cierra su propio
// turno. Puede haber varios turnos abiertos en una misma empresa a la vez (uno
// por cajero). El índice único parcial garantiza un solo turno vivo por usuario.
//
// Ciclo de vida (estado):
//   ABIERTO            → turno operando; se le atan ventas/cobros/movimientos.
//   CIERRE_SOLICITADO  → el cajero pidió cerrar CON descuadre; espera supervisor.
//   CERRADO            → cierre finalizado (sin diferencia, o aprobado).
//   (rechazo)          → el supervisor regresa el turno a ABIERTO para reconteo.
//
// Inmutabilidad: el monto de apertura y los movimientos no los edita el cajero.
// Los descuadres exigen `cierre_obs` (justificación) + aprobación admin/owner.
export const cajaTurnos = pgTable('caja_turnos', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** Cajero dueño del turno. */
  usuarioId: integer('usuario_id').notNull().references(() => users.id),
  /** Terminal POS en la que se abrió el turno (define almacén/lista/impresora). Nullable: turnos de caja fuera del POS. */
  terminalId: integer('terminal_id').references(() => posTerminales.id),
  estado:    varchar('estado', { length: 20 }).notNull().default('ABIERTO'),
  // ABIERTO | CIERRE_SOLICITADO | CERRADO

  // ── Apertura (bloqueada tras confirmar) ──────────────────────────────────
  montoAperturaCentavos: integer('monto_apertura_centavos').notNull(),
  aperturaPor:           integer('apertura_por').notNull().references(() => users.id),
  aperturaObs:           text('apertura_obs'),
  aperturaAt:            timestamp('apertura_at').notNull().defaultNow(),

  // ── Cierre (lo solicita el cajero; el esperado lo calcula el sistema) ─────
  numeroCierre:            varchar('numero_cierre', { length: 20 }), // CC-YYYY-NNNNNN
  efectivoContadoCentavos: integer('efectivo_contado_centavos'),
  montoEsperadoCentavos:   integer('monto_esperado_centavos'),
  /** contado − esperado. > 0 sobrante, < 0 faltante (snapshot al solicitar cierre). */
  diferenciaCentavos:      integer('diferencia_centavos'),
  cierreObs:               text('cierre_obs'),
  cierreSolicitadoAt:      timestamp('cierre_solicitado_at'),

  // ── Aprobación del descuadre (admin/owner) ────────────────────────────────
  aprobadoPor:    integer('aprobado_por').references(() => users.id),
  aprobadoAt:     timestamp('aprobado_at'),
  aprobacionObs:  text('aprobacion_obs'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('caja_turnos_team_idx').on(t.teamId),
  index('caja_turnos_usuario_estado_idx').on(t.teamId, t.usuarioId, t.estado),
  // Un solo turno vivo (ABIERTO o CIERRE_SOLICITADO) por usuario POR EQUIPO.
  // Incluye team_id: un cajero que opera en dos empresas no debe quedar bloqueado
  // por tener un turno abierto en otra. La lógica de app ya es per-team.
  uniqueIndex('caja_turnos_usuario_abierto_uniq')
    .on(t.teamId, t.usuarioId)
    .where(sql`estado IN ('ABIERTO', 'CIERRE_SOLICITADO')`),
]);

// Movimientos de caja que NO son ventas: entradas, salidas, gastos, retiros y
// ajustes del supervisor. Las ventas/cobros viven en ecf_documents/pagos_recibidos
// (atados al turno por turno_caja_id) — NO se duplican aquí.
export const cajaMovimientos = pgTable('caja_movimientos', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  turnoId:       integer('turno_id').notNull().references(() => cajaTurnos.id),
  tipo:          varchar('tipo', { length: 20 }).notNull(),
  // ENTRADA | SALIDA | GASTO | RETIRO | AJUSTE
  /** Siempre positivo en centavos; `tipo` define el signo en el cálculo. */
  montoCentavos: integer('monto_centavos').notNull(),
  metodo:        varchar('metodo', { length: 30 }).notNull().default('efectivo'),
  descripcion:   text('descripcion'),
  /** Requerido para AJUSTE (corrección de supervisor). */
  motivo:        text('motivo'),
  /** SISTEMA (flujo normal) | SUPERVISOR (ajuste manual con caja:aprobar). */
  origen:        varchar('origen', { length: 20 }).notNull().default('SISTEMA'),
  createdBy:     integer('created_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('caja_movimientos_turno_idx').on(t.turnoId),
]);

// Counter atómico por (team, año) para el número de cierre CC-YYYY-NNNNNN.
// Mismo patrón que factura_codigo_counter (lib/facturas/codigo.ts).
export const cajaCierreCounter = pgTable('caja_cierre_counter', {
  teamId: integer('team_id').notNull().references(() => teams.id),
  anio:   smallint('anio').notNull(),
  ultimo: integer('ultimo').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.teamId, t.anio] }),
]);

export const cajaTurnosRelations = relations(cajaTurnos, ({ one, many }) => ({
  team:        one(teams, { fields: [cajaTurnos.teamId],    references: [teams.id] }),
  cajero:      one(users, { fields: [cajaTurnos.usuarioId], references: [users.id] }),
  movimientos: many(cajaMovimientos),
}));

export const cajaMovimientosRelations = relations(cajaMovimientos, ({ one }) => ({
  team:  one(teams,      { fields: [cajaMovimientos.teamId],  references: [teams.id] }),
  turno: one(cajaTurnos, { fields: [cajaMovimientos.turnoId], references: [cajaTurnos.id] }),
}));

export type CajaTurno        = typeof cajaTurnos.$inferSelect;
export type NewCajaTurno     = typeof cajaTurnos.$inferInsert;
export type CajaMovimiento   = typeof cajaMovimientos.$inferSelect;
export type NewCajaMovimiento = typeof cajaMovimientos.$inferInsert;

// ─── Administración Escolar ───────────────────────────────────────────────────
// Módulo escolar con reglas propias (períodos, matrículas por período, cargos
// por mes, conceptos escolares, tutores responsables). Separado de Contactos,
// pero con campos de enlace (dependienteId / clientId) para integración futura.
// Montos en centavos, siguiendo el patrón del resto del sistema.

/** Año escolar (ej. 2025-2026). Solo uno activo por team en la práctica. */
export const adminEscolarPeriodos = pgTable('admin_escolar_periodos', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  nombre:      varchar('nombre', { length: 60 }).notNull(),
  fechaInicio: date('fecha_inicio'),
  fechaFin:    date('fecha_fin'),
  activo:      boolean('activo').notNull().default(true),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_periodos_team_idx').on(t.teamId),
]);

/** Curso/grado (ej. Primero A, Segundo B). `orden` para ordenar en la UI. */
export const adminEscolarCursos = pgTable('admin_escolar_cursos', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  nombre:    varchar('nombre', { length: 80 }).notNull(),
  nivel:     varchar('nivel', { length: 60 }),
  orden:     integer('orden').notNull().default(0),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_cursos_team_idx').on(t.teamId),
]);

/** Materia/asignatura. Catálogo simple; aún no ligado a matrícula en el MVP. */
export const adminEscolarMaterias = pgTable('admin_escolar_materias', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  nombre:    varchar('nombre', { length: 120 }).notNull(),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_materias_team_idx').on(t.teamId),
]);

/** Estudiante. El curso NO vive aquí — pertenece a la matrícula (por período). */
export const adminEscolarEstudiantes = pgTable('admin_escolar_estudiantes', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  /** Código interno del estudiante (matrícula/expediente). Opcional. */
  codigo:          varchar('codigo', { length: 30 }),
  nombres:         varchar('nombres', { length: 120 }).notNull(),
  apellidos:       varchar('apellidos', { length: 120 }).notNull(),
  fechaNacimiento: date('fecha_nacimiento'),
  /** masculino | femenino | otro. Opcional. La edad se deriva de fechaNacimiento. */
  sexo:            varchar('sexo', { length: 20 }),
  /** activo | inactivo | retirado | graduado */
  estado:          varchar('estado', { length: 20 }).notNull().default('activo'),
  /** Enlace futuro con Contactos (dependientes). Nullable — integración post-MVP. */
  dependienteId:   integer('dependiente_id').references(() => dependientes.id),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_estudiantes_team_idx').on(t.teamId),
]);

/** Tutor/padre responsable. Enlace futuro con clients vía clientId. */
export const adminEscolarTutores = pgTable('admin_escolar_tutores', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** Enlace futuro con Contactos (clients). Nullable — integración post-MVP. */
  clientId:  integer('client_id').references(() => clients.id),
  nombre:    varchar('nombre', { length: 160 }).notNull(),
  documento: varchar('documento', { length: 30 }),
  telefono:  varchar('telefono', { length: 30 }),
  email:     varchar('email', { length: 160 }),
  direccion: varchar('direccion', { length: 300 }),
  /** Foto del tutor (data URL base64, mismo patrón que products.imagen/teams.logo).
   *  Útil para identificar a un tutor que no es padre/contacto (ej. chofer, cuidador). */
  imagen:    text('imagen'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_tutores_team_idx').on(t.teamId),
]);

/** Relación N:M estudiante↔tutor. Solo un tutor responsable de pago por estudiante
 *  (regla de negocio aplicada en la capa de app, no por constraint). */
export const adminEscolarEstudianteTutores = pgTable('admin_escolar_estudiante_tutores', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  estudianteId:    integer('estudiante_id').notNull().references(() => adminEscolarEstudiantes.id, { onDelete: 'cascade' }),
  tutorId:         integer('tutor_id').notNull().references(() => adminEscolarTutores.id, { onDelete: 'cascade' }),
  /** padre | madre | tutor | cuidador | otro */
  relacion:        varchar('relacion', { length: 20 }).notNull().default('tutor'),
  responsablePago: boolean('responsable_pago').notNull().default(false),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_est_tutor_uniq').on(t.estudianteId, t.tutorId),
  index('admin_escolar_est_tutor_team_idx').on(t.teamId),
]);

/** Matrícula del estudiante en un período+curso. Historial por año escolar.
 *  Solo una matrícula 'activa' por (estudiante, período) — índice parcial abajo. */
export const adminEscolarMatriculas = pgTable('admin_escolar_matriculas', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  estudianteId:     integer('estudiante_id').notNull().references(() => adminEscolarEstudiantes.id),
  periodoId:        integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  cursoId:          integer('curso_id').notNull().references(() => adminEscolarCursos.id),
  codigoMatricula:  varchar('codigo_matricula', { length: 40 }),
  fechaInscripcion: date('fecha_inscripcion'),
  /** activa | finalizada | retirada | anulada */
  estado:           varchar('estado', { length: 20 }).notNull().default('activa'),
  /** Plan genérico que genera la mensualidad automática de esta matrícula. */
  facturaRecurrenteId: integer('factura_recurrente_id').references(() => facturasRecurrentes.id),
  /** Concepto escolar que recibirá cada cargo generado por el plan. */
  conceptoMensualidadId: integer('concepto_mensualidad_id').references(() => adminEscolarConceptosPago.id),
  notas:            text('notas'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_matriculas_team_idx').on(t.teamId),
  index('admin_escolar_matriculas_estudiante_idx').on(t.estudianteId),
  index('admin_escolar_matriculas_periodo_idx').on(t.periodoId),
  uniqueIndex('admin_escolar_matriculas_factura_recurrente_uniq').on(t.facturaRecurrenteId),
]);

/** Concepto de cargo escolar. `recurrente` = mensualidad (genera por mes). */
export const adminEscolarConceptosPago = pgTable('admin_escolar_conceptos_pago', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  nombre:     varchar('nombre', { length: 80 }).notNull(),
  /** inscripcion | mensualidad | uniforme | actividad | otro */
  tipo:       varchar('tipo', { length: 20 }).notNull().default('otro'),
  recurrente: boolean('recurrente').notNull().default(false),
  /** Enlace opcional al catálogo de productos/servicios. Si viene, la factura
   *  generada desde el cargo hereda nombre/ITBIS del producto — evita duplicar
   *  catálogo. El monto sigue viniendo del cargo, no del producto. */
  productId:  integer('product_id').references(() => products.id),
  activo:     boolean('activo').notNull().default(true),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_conceptos_team_idx').on(t.teamId),
]);

/** Cargo/deuda escolar. La deuda vive AQUÍ, no depende de facturas.
 *  `saldoCentavos` = pendiente; el pago lo reduce. `mes` solo para mensualidad. */
export const adminEscolarCargos = pgTable('admin_escolar_cargos', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  estudianteId:     integer('estudiante_id').notNull().references(() => adminEscolarEstudiantes.id),
  matriculaId:      integer('matricula_id').notNull().references(() => adminEscolarMatriculas.id),
  periodoId:        integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  conceptoId:       integer('concepto_id').notNull().references(() => adminEscolarConceptosPago.id),
  /** Mes 1-12 solo si es mensualidad; null para inscripción/uniforme/etc. */
  mes:              smallint('mes'),
  anio:             smallint('anio').notNull(),
  montoCentavos:    integer('monto_centavos').notNull(),
  saldoCentavos:    integer('saldo_centavos').notNull(),
  fechaVencimiento: date('fecha_vencimiento'),
  /** pendiente | parcial | pagado | vencido | anulado */
  estado:           varchar('estado', { length: 20 }).notNull().default('pendiente'),
  /** Enlace OPCIONAL a la factura (e-CF) que cubre este cargo. El cargo sigue
   *  siendo la fuente de verdad de la deuda (saldoCentavos); la factura es el
   *  documento fiscal/cobrable. Muchos cargos → una factura. */
  ecfDocumentId:    integer('ecf_document_id').references(() => ecfDocuments.id),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_cargos_team_idx').on(t.teamId),
  index('admin_escolar_cargos_estudiante_idx').on(t.estudianteId),
  index('admin_escolar_cargos_matricula_idx').on(t.matriculaId),
  index('admin_escolar_cargos_periodo_idx').on(t.periodoId),
]);

/** Pago escolar aplicado a un cargo. Enlace OPCIONAL a factura/pago_recibido,
 *  pero no depende de ellos para existir. */
export const adminEscolarPagos = pgTable('admin_escolar_pagos', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  estudianteId:   integer('estudiante_id').notNull().references(() => adminEscolarEstudiantes.id),
  matriculaId:    integer('matricula_id').references(() => adminEscolarMatriculas.id),
  cargoId:        integer('cargo_id').references(() => adminEscolarCargos.id),
  /** Enlace opcional a un e-CF emitido. */
  ecfDocumentId:  integer('ecf_document_id').references(() => ecfDocuments.id),
  /** Enlace opcional a un pago recibido del módulo de cobros. */
  pagoRecibidoId: integer('pago_recibido_id').references(() => pagosRecibidos.id),
  montoCentavos:  integer('monto_centavos').notNull(),
  fechaPago:      date('fecha_pago').notNull(),
  metodo:         varchar('metodo', { length: 30 }),
  referencia:     varchar('referencia', { length: 100 }),
  notas:          text('notas'),
  createdBy:      integer('created_by').references(() => users.id),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_pagos_team_idx').on(t.teamId),
  index('admin_escolar_pagos_estudiante_idx').on(t.estudianteId),
  index('admin_escolar_pagos_cargo_idx').on(t.cargoId),
]);

export type AdminEscolarPeriodo    = typeof adminEscolarPeriodos.$inferSelect;
export type NewAdminEscolarPeriodo = typeof adminEscolarPeriodos.$inferInsert;
export type AdminEscolarCurso      = typeof adminEscolarCursos.$inferSelect;
export type NewAdminEscolarCurso   = typeof adminEscolarCursos.$inferInsert;
export type AdminEscolarMateria    = typeof adminEscolarMaterias.$inferSelect;
export type NewAdminEscolarMateria = typeof adminEscolarMaterias.$inferInsert;
export type AdminEscolarEstudiante    = typeof adminEscolarEstudiantes.$inferSelect;
export type NewAdminEscolarEstudiante = typeof adminEscolarEstudiantes.$inferInsert;
export type AdminEscolarTutor      = typeof adminEscolarTutores.$inferSelect;
export type NewAdminEscolarTutor   = typeof adminEscolarTutores.$inferInsert;
export type AdminEscolarEstudianteTutor    = typeof adminEscolarEstudianteTutores.$inferSelect;
export type NewAdminEscolarEstudianteTutor = typeof adminEscolarEstudianteTutores.$inferInsert;
export type AdminEscolarMatricula    = typeof adminEscolarMatriculas.$inferSelect;
export type NewAdminEscolarMatricula = typeof adminEscolarMatriculas.$inferInsert;
export type AdminEscolarConceptoPago    = typeof adminEscolarConceptosPago.$inferSelect;
export type NewAdminEscolarConceptoPago = typeof adminEscolarConceptosPago.$inferInsert;
export type AdminEscolarCargo      = typeof adminEscolarCargos.$inferSelect;
export type NewAdminEscolarCargo   = typeof adminEscolarCargos.$inferInsert;
export type AdminEscolarPago       = typeof adminEscolarPagos.$inferSelect;
export type NewAdminEscolarPago    = typeof adminEscolarPagos.$inferInsert;

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Impresora    = typeof impresoras.$inferSelect;
export type NewImpresora = typeof impresoras.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Dependiente = typeof dependientes.$inferSelect;
export type NewDependiente = typeof dependientes.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type EcfDocument = typeof ecfDocuments.$inferSelect;
export type NewEcfDocument = typeof ecfDocuments.$inferInsert;
export type EcfDocumentRecibido = typeof ecfDocumentsRecibidos.$inferSelect;
export type NewEcfDocumentRecibido = typeof ecfDocumentsRecibidos.$inferInsert;
export type RncPadron = typeof rncPadron.$inferSelect;
export type DgiiCatalogo = typeof dgiiCatalogos.$inferSelect;
export type NewDgiiCatalogo = typeof dgiiCatalogos.$inferInsert;
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type NewCotizacion = typeof cotizaciones.$inferInsert;
export type Categoria = typeof categorias.$inferSelect;
export type PagoRecibido    = typeof pagosRecibidos.$inferSelect;
export type NewPagoRecibido = typeof pagosRecibidos.$inferInsert;
export type FacturaRecurrente = typeof facturasRecurrentes.$inferSelect;
export type NewFacturaRecurrente = typeof facturasRecurrentes.$inferInsert;
export type Almacen = typeof almacenes.$inferSelect;
export type Vendedor = typeof vendedores.$inferSelect;
export type ListaPrecios = typeof listasPrecios.$inferSelect;
export type ListaPreciosItem = typeof listasPrecios_items.$inferSelect;

export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

// ─── Cobranza — seguimiento de cartera (migración 0082) ──────────────────────
// FK unidireccional: cobranza conoce la factura, la factura no sabe de cobranza.
// Nada de esto entra al XML de la DGII ni afecta el saldo — es gestión interna.

/** Log de gestión de cobro: contactos, notas internas y promesas de pago. */
export const cobranzaEventos = pgTable('cobranza_eventos', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  ecfDocumentId: integer('ecf_document_id').notNull().references(() => ecfDocuments.id),
  /** 'contacto' | 'nota' | 'promesa' */
  tipo:          varchar('tipo', { length: 20 }).notNull(),
  /** Fecha del hecho, no del registro: permite cargar gestiones atrasadas. */
  fecha:         date('fecha').notNull(),
  /** Solo tipo='contacto': llamada | whatsapp | correo | presencial | otro */
  canal:         varchar('canal', { length: 20 }),
  comentario:    text('comentario'),
  /** Solo tipo='promesa'. El CHECK exige fecha + estado si tipo='promesa'. */
  promesaFecha:      date('promesa_fecha'),
  promesaMontoCents: integer('promesa_monto_cents'),
  /** pendiente | cumplida | incumplida */
  promesaEstado:     varchar('promesa_estado', { length: 20 }),
  createdBy:     integer('created_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('cobranza_eventos_doc_idx').on(t.teamId, t.ecfDocumentId, t.fecha),
]);

/** Estado actual del seguimiento: una fila por documento, se sobrescribe. */
export const cobranzaSeguimiento = pgTable('cobranza_seguimiento', {
  ecfDocumentId:      integer('ecf_document_id').primaryKey().references(() => ecfDocuments.id),
  teamId:             integer('team_id').notNull().references(() => teams.id),
  responsableUserId:  integer('responsable_user_id').references(() => users.id),
  /** Texto libre: cada empresa cobra distinto, un enum obligaría a migrar. */
  proximaAccion:      text('proxima_accion'),
  proximaAccionFecha: date('proxima_accion_fecha'),
  updatedBy:          integer('updated_by').references(() => users.id),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('cobranza_seguimiento_team_idx').on(t.teamId, t.proximaAccionFecha),
]);

export type CobranzaEvento      = typeof cobranzaEventos.$inferSelect;
export type NewCobranzaEvento   = typeof cobranzaEventos.$inferInsert;
export type CobranzaSeguimiento = typeof cobranzaSeguimiento.$inferSelect;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type OutboundWebhook = typeof outboundWebhooks.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
  // EmiteDO
  EMIT_ECF = 'EMIT_ECF',
  VOID_ECF = 'VOID_ECF',
  UPLOAD_CERT = 'UPLOAD_CERT',
  REGISTER_SEQUENCES = 'REGISTER_SEQUENCES',
}
