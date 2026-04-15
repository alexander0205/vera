import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  date,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Auth & Teams (base del starter — no modificar estructura) ────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
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

  // Certificado digital P12 (base64) — solo en servidor
  certP12: text('cert_p12'),
  certPassword: text('cert_password'),

  // DGII
  dgiiEnvironment: varchar('dgii_environment', { length: 20 }).default('TesteCF'),
  dgiiToken: text('dgii_token'),
  dgiiTokenExpiresAt: timestamp('dgii_token_expires_at'),

  // ── Perfil visual (PDF, portal) ───────────────────────────────────────────
  logo: text('logo'),                          // base64 data URL
  firma: text('firma'),                        // base64 data URL
  telefono: varchar('telefono', { length: 30 }),
  sitioWeb: varchar('sitio_web', { length: 200 }),
  emailFacturacion: varchar('email_facturacion', { length: 255 }),
  colorPrimario: varchar('color_primario', { length: 7 }).default('#1e40af'),
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
  status: varchar('status', { length: 20 }).notNull().default('pending'),
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── EmiteDO — Productos y Servicios ─────────────────────────────────────────

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  descripcion: text('descripcion'),
  referencia: varchar('referencia', { length: 100 }),  // SKU / código interno
  precio: integer('precio').notNull().default(0),       // en centavos
  tasaItbis: varchar('tasa_itbis', { length: 6 }).notNull().default('0.18'), // '0.18'|'0.16'|'0'|'exento'
  tipo: varchar('tipo', { length: 10 }).notNull().default('servicio'),       // 'bien'|'servicio'
  activo: varchar('activo', { length: 5 }).notNull().default('true'),        // 'true'|'false'
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
  encf: varchar('encf', { length: 40 }).notNull(),        // E310000000001 (real) o BOR-XXXXXXXX (borrador)
  tipoEcf: varchar('tipo_ecf', { length: 2 }).notNull(),  // "31", "32", etc.

  // Estado del ciclo de vida
  estado: varchar('estado', { length: 30 }).notNull().default('BORRADOR'),
  // BORRADOR | EN_PROCESO | ACEPTADO | ACEPTADO_CONDICIONAL | RECHAZADO | ANULADO

  // Respuesta DGII
  trackId: varchar('track_id', { length: 100 }),
  codigoSeguridad: varchar('codigo_seguridad', { length: 6 }),
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

  fechaEmision: timestamp('fecha_emision').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── DGII — Padrón de Contribuyentes (RNC) ───────────────────────────────────
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
  tipoEcf:          varchar('tipo_ecf', { length: 2 }).notNull().default('31'),
  tipoPago:         integer('tipo_pago').notNull().default(1),
  frecuencia:       varchar('frecuencia', { length: 20 }).notNull().default('mensual'),
  fechaInicio:      date('fecha_inicio').notNull(),
  fechaFin:         date('fecha_fin'),
  proximaEmision:   date('proxima_emision').notNull(),
  estado:           varchar('estado', { length: 20 }).notNull().default('activa'),
  items:            text('items').notNull().default('[]'),
  notas:            text('notas'),
  totalEstimado:    integer('total_estimado').notNull().default(0),
  facturasEmitidas: integer('facturas_emitidas').notNull().default(0),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

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
}));

export const productsRelations = relations(products, ({ one }) => ({
  team: one(teams, {
    fields: [products.teamId],
    references: [teams.id],
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

// ─── TypeScript types ─────────────────────────────────────────────────────────

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
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type EcfDocument = typeof ecfDocuments.$inferSelect;
export type NewEcfDocument = typeof ecfDocuments.$inferInsert;
export type RncPadron = typeof rncPadron.$inferSelect;
export type Cotizacion = typeof cotizaciones.$inferSelect;
export type NewCotizacion = typeof cotizaciones.$inferInsert;
export type Categoria = typeof categorias.$inferSelect;
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

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type OutboundWebhook = typeof outboundWebhooks.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

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
