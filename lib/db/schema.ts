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
  // Cuándo aceptó Términos y Condiciones + Tratamiento de datos personales.
  // NULL en cuentas creadas antes de que este check existiera.
  termsAcceptedAt: timestamp('terms_accepted_at'),
  // El `sub` de Google, no su correo: el correo de una cuenta de Workspace se
  // puede cambiar y esto tiene que seguir apuntando a la misma persona.
  // NULL en todo el que entra con contraseña.
  googleId: varchar('google_id', { length: 64 }),
  // WhatsApp de quien abre la cuenta, pedido en el onboarding. En el usuario y
  // no en la empresa: es la persona con la que se habla, y una persona puede
  // tener varias empresas.
  telefono: varchar('telefono', { length: 30 }),
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

  // ── Ciclo de vida de la suscripción (migración 0133) ──────────────────────
  // El estado de Stripe dice QUÉ pasa; estas cuatro fechas dicen DESDE CUÁNDO,
  // que es lo que decide si todavía queda prueba, si la gracia por el cobro
  // fallido sigue viva, y hasta qué día sirve lo ya pagado. Se derivan en el
  // webhook para no llamar a Stripe en cada carga de página.
  // Ver lib/suscripcion/estado.ts.
  trialEnd:           timestamp('trial_end'),
  periodoFin:         timestamp('periodo_fin'),
  /** Cuándo falló el PRIMER cobro. No se toca en los reintentos: si se
   *  reiniciara con cada uno, la mora nunca se agotaría. */
  morosoDesde:        timestamp('moroso_desde'),
  cancelarAlFin:      boolean('cancelar_al_fin').notNull().default(false),
  /** Adicionales contratados sobre el plan (hoy solo 'pos'). Ver ADDONS. */
  adicionales:        jsonb('adicionales').notNull().default([]),
  /** Cuándo se le avisó que quedó en solo lectura. Evita repetir el correo
   *  cada día del barrido; se limpia al reactivar (migración 0135). */
  avisoSoloLecturaEn: timestamp('aviso_solo_lectura_en'),

  // ── EmiteDO — datos fiscales del negocio ──────────────────────────────────
  rnc: varchar('rnc', { length: 11 }),
  razonSocial: varchar('razon_social', { length: 255 }),
  nombreComercial: varchar('nombre_comercial', { length: 255 }),
  direccion: varchar('direccion', { length: 500 }),

  // Onboarding. NULL en `onboarding_completado_en` = todavía no pasó por él y
  // el muro lo manda allí; las empresas anteriores a la migración 0138 nacen
  // marcadas para que el muro no las eche de su propio sistema.
  onboardingCompletadoEn: timestamp('onboarding_completado_en'),
  onboardingPaso: smallint('onboarding_paso').notNull().default(1),
  onboardingDatos: jsonb('onboarding_datos'),
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
  /** 'porcentaje' → usa recargoMoraPorcentaje; 'fijo' → usa recargoMoraMontoCents. */
  recargoMoraModo:        varchar('recargo_mora_modo', { length: 12 }).notNull().default('porcentaje'),
  /** Cargo en centavos cuando el modo es 'fijo'. */
  recargoMoraMontoCents:  integer('recargo_mora_monto_cents').notNull().default(0),
  /** Cada cuántos días se recobra mientras siga vencida. 0 = una sola vez. */
  recargoMoraPeriodicidadDias: integer('recargo_mora_periodicidad_dias').notNull().default(0),
  /** true = la base incluye las moras anteriores impagas (mora sobre mora). */
  recargoMoraCompuesta:   boolean('recargo_mora_compuesta').notNull().default(false),
  /** Tope de mora ACUMULADA como % del documento, en bps. 0 = sin tope. */
  recargoMoraTopeBps:     integer('recargo_mora_tope_bps').notNull().default(0),
  /** Máximo de períodos a cobrar. 0 = sin límite. */
  recargoMoraMaxPeriodos: integer('recargo_mora_max_periodos').notNull().default(0),

  // ── Alerta double-check del método de pago ────────────────────────────────
  // Toggle por empresa. Si está activo (Y el rol tiene el permiso
  // 'pagos:alerta-metodo'), al cobrar una factura/POS se pide reconfirmar el
  // método de pago antes de finalizar. Nace apagado.
  alertaMetodoPagoActivo: boolean('alerta_metodo_pago_activo').notNull().default(false),

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

  // ── Módulos del producto ─────────────────────────────────────────────────
  // Qué módulos tiene activos la empresa. Fuente de verdad para el gate de
  // acceso (lib/auth/modules.ts). Toda empresa arranca con los módulos base
  // (facturación + administración) y los demás se encienden uno a uno desde
  // el panel admin (/admin/empresas/[id]); `modulosOverride` fuerza la lista
  // por encima de esta. Mientras el billing esté apagado (lib/config/billing)
  // esta columna la administramos nosotros, no Stripe.
  // posHabilitado (arriba) queda como columna legacy hasta retirar su lectura.
  modulosHabilitados:     jsonb('modulos_habilitados').notNull().default(['facturacion', 'administracion']),
  modulosOverride:        jsonb('modulos_override'),

  // ── Métodos de pago que EXIGEN comprobante adjunto ────────────────────────
  // Mismo patrón que metodosObligaDgii. Al registrar un cobro con alguno de
  // estos métodos hay que adjuntar la imagen o el archivo del comprobante.
  // Vacío = sin restricción, que es como nacen todas las empresas.
  metodosExigeComprobante: jsonb('metodos_exige_comprobante').notNull().default([]),

  // ── Textos por defecto de los comprobantes ────────────────────────────────
  // Se copian al crear una factura o cotización nueva para no reescribirlos
  // cada vez. Es una plantilla, no una atadura: el texto queda en el documento
  // y ahí se puede editar. Cambiarlo aquí NO reescribe lo ya emitido.
  terminosCondicionesDefault: text('terminos_condiciones_default'),
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
  // PIN de autorización del POS (4–6 dígitos). Un supervisor (admin/owner) lo
  // configura para autorizar que un cajero quite un ítem de un recibo cobrado.
  posPin: varchar('pos_pin', { length: 6 }),
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
  /** El móvil al que se llama. Distinto del fijo y, a veces, del WhatsApp. */
  celular: varchar('celular', { length: 30 }),
  /** Por donde se le escribe de verdad; puede no ser el `telefono`. */
  whatsapp: varchar('whatsapp', { length: 30 }),
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
  // Espejo de visiblePos: permite sacar un producto del catálogo de Facturación
  // sin borrarlo. Ver lib/productos/visibilidad.ts para la regla completa.
  visibleFacturacion: boolean('visible_facturacion').notNull().default(true),
  // POS: favorito → se muestra primero en la grilla.
  posFavorito: boolean('pos_favorito').notNull().default(false),
  esMora: boolean('es_mora').notNull().default(false),                        // servicio de sistema: línea de las ND de mora (1 por team)
  // Definición de ejes de variante DEL PRODUCTO (MVP "por producto"): el usuario
  // define aquí sus propios atributos y valores. Formato:
  //   [{ nombre: "Talla", valores: ["M","L","XL"] }, { nombre: "Color", valores: [...] }]
  // Vacío ([]) = producto sin variantes (comportamiento actual: stock plano en stockActual).
  variantAtributos: jsonb('variant_atributos').notNull().default([]),
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

  // Registro operativo de gasto: comprobante recibido del proveedor, no e-NCF
  // emitido por la empresa. Solo se usa en 43/47 y no va al XML DGII.
  categoriaGasto: varchar('categoria_gasto', { length: 100 }),
  ncfProveedor:   varchar('ncf_proveedor', { length: 40 }),
  fechaGasto:     date('fecha_gasto'),

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

  // POS: cómo se despacha la orden ('comer-aqui' | 'para-llevar' | 'delivery' |
  // 'mostrador'). Dato operativo, NO fiscal (no entra al XML DGII). Nullable:
  // ventas no-POS, legacy y tickets sin-ncf quedan en NULL. 'comer-aqui' solo
  // aplica a órdenes con mesa (comanda). Ver mig 0109.
  tipoOrden: varchar('tipo_orden', { length: 20 }),

  // Si fue generado por una recurrente, la fecha de cobro (período) del schedule
  // a la que corresponde. Permite el timeline de períodos y detección de duplicados.
  periodoRecurrente: date('periodo_recurrente'),

  // Si este documento es una Nota de Débito por mora (tipo 33, BORRADOR interno,
  // no se envía a DGII), apunta al ecf_document padre que la originó. Self-reference
  // sin .references() para evitar import circular (FK declarada en la migración).
  moraOrigenId: integer('mora_origen_id'),

  /** Período que cubre esta nota de mora (inicio del período). Solo en las notas. */
  moraPeriodo:    date('mora_periodo'),

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
  // Reusan el form de Nueva Factura → mismos extras que ecf_documents.
  retenciones: text('retenciones'),   // JSON string de Retencion[]
  comentario: text('comentario'),
  pieFactura: text('pie_factura'),
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
  /** Códigos de e-CF ('31', '32', …) o el sentinel 'sin-ncf' (7 chars) para
   *  planes que generan facturas internas sin comprobante fiscal. */
  tipoEcf:          varchar('tipo_ecf', { length: 10 }).notNull().default('31'),
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

// ─── Comprobantes de pago (imagen / PDF que respalda un cobro) ────────────────
/**
 * El adjunto cuelga del DOCUMENTO, no de la fila del ledger: las filas de
 * `pagosRecibidos` no son estables. `/api/facturas/[id]/pago` borra y reinserta
 * el pago completo en cada guardado, y `registrarPagoFacturaConMora` parte un
 * pago en varias filas (factura + cada ND de mora). `pagoRecibidoId` queda como
 * referencia fina con ON DELETE SET NULL, para que el archivo sobreviva.
 *
 * El binario vive en S3 (bucket privado). `contenido` es el fallback base64
 * para desarrollo local sin credenciales de AWS.
 */
export const pagoAdjuntos = pgTable('pago_adjuntos', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  ecfDocumentId:  integer('ecf_document_id').notNull().references(() => ecfDocuments.id),
  /** Abono concreto que respalda. Null si su fila del ledger fue reescrita. */
  pagoRecibidoId: integer('pago_recibido_id').references(() => pagosRecibidos.id, { onDelete: 'set null' }),
  nombre:         varchar('nombre', { length: 255 }).notNull(),
  mime:           varchar('mime', { length: 100 }).notNull(),
  tamanoBytes:    integer('tamano_bytes').notNull(),
  /** Hash del binario: evita guardar dos veces el mismo comprobante. */
  sha256:         char('sha256', { length: 64 }).notNull(),
  /** 's3' → el binario está en s3Key. 'db' → está en contenido (base64). */
  storage:        varchar('storage', { length: 10 }).notNull().default('s3'),
  /** prod/team_12/pago/<uuid>.jpg — UUID, nunca el id, para que no se enumere. */
  s3Key:          text('s3_key'),
  /** Miniatura ~300px derivada del binario guardado. NULL en PDF. */
  thumbS3Key:     text('thumb_s3_key'),
  contenido:      text('contenido'),
  subidoPor:      integer('subido_por').references(() => users.id),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('pago_adjuntos_doc_idx').on(t.teamId, t.ecfDocumentId),
  index('pago_adjuntos_pago_idx').on(t.pagoRecibidoId),
  // Un archivo, una fila por factura. La garantía vive en la DB porque dos
  // subidas simultáneas del mismo comprobante ven ambas la tabla vacía.
  uniqueIndex('pago_adjuntos_sha_uq').on(t.teamId, t.ecfDocumentId, t.sha256),
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

// ─── Anulación de rangos de e-NCF ante DGII (ANECF) ──────────────────────────

/**
 * Un registro por envío ANECF. DGII solo permite anular e-NCF que nunca se
 * transmitieron; los aceptados se revierten con Nota de Crédito (tipo 34).
 *
 * Los tramos en estado ACEPTADO son la fuente de verdad de "este número quedó
 * anulado ante DGII" que consume Contabilidad → Consulta de e-NCF.
 */
export const anulacionesNcf = pgTable('anulaciones_ncf', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  tipoEcf:       varchar('tipo_ecf', { length: 10 }).notNull(),
  desde:         bigint('desde', { mode: 'number' }).notNull(),
  hasta:         bigint('hasta', { mode: 'number' }).notNull(),
  /** hasta - desde + 1, denormalizado para reportes. */
  cantidad:      integer('cantidad').notNull(),
  /** PENDIENTE | ENVIADO | ACEPTADO | RECHAZADO | ERROR (espejo de ecf-api). */
  estado:        varchar('estado', { length: 20 }).notNull().default('PENDIENTE'),
  /** Id del registro `Anulacion` en ecf-api. */
  anulacionId:   varchar('anulacion_id', { length: 40 }),
  trackId:       varchar('track_id', { length: 64 }),
  respuestaDgii: jsonb('respuesta_dgii'),
  /** Nota interna del usuario — no viaja a DGII (el XSD ANECF no lo lleva). */
  motivo:        varchar('motivo', { length: 500 }),
  createdBy:     integer('created_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('anulncf_team_tipo_idx').on(t.teamId, t.tipoEcf, t.desde, t.hasta),
  index('anulncf_team_estado_idx').on(t.teamId, t.estado),
]);

// ─── Zero Tickets ───────────────────────────────────────────────────────────

export const tickets = pgTable('tickets', {
  id:                 serial('id').primaryKey(),
  teamId:             integer('team_id').notNull().references(() => teams.id),
  userId:             integer('user_id').notNull().references(() => users.id),
  assignedAgentId:    integer('assigned_agent_id').references(() => users.id),
  status:             varchar('status', { length: 20 }).notNull().default('esperando'), // esperando | abierto | cerrado
  lastMessageAt:      timestamp('last_message_at').notNull().defaultNow(),
  lastReadByUserAt:   timestamp('last_read_by_user_at'),
  lastReadByAgentAt:  timestamp('last_read_by_agent_at'),
  userTypingUntil:    timestamp('user_typing_until'),
  agentTypingUntil:   timestamp('agent_typing_until'),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
  closedAt:           timestamp('closed_at'),
  onHold:             boolean('on_hold').notNull().default(false),
});

export const ticketMessages = pgTable('ticket_messages', {
  id:          serial('id').primaryKey(),
  ticketId:    integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  senderType:  varchar('sender_type', { length: 10 }).notNull(), // user | agent | system
  senderId:    integer('sender_id').references(() => users.id),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'), // text | screenshot_request
  content:     text('content'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export const ticketAttachments = pgTable('ticket_attachments', {
  id:            serial('id').primaryKey(),
  messageId:     integer('message_id').notNull().references(() => ticketMessages.id, { onDelete: 'cascade' }),
  fileName:      varchar('file_name', { length: 255 }).notNull(),
  mimeType:      varchar('mime_type', { length: 100 }).notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  kind:          varchar('kind', { length: 10 }).notNull(), // image | video | file
  storage:       varchar('storage', { length: 10 }).notNull(), // s3 | db
  s3Key:         varchar('s3_key', { length: 500 }),
  dataBase64:    text('data_base64'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export const ticketCalls = pgTable('ticket_calls', {
  id:           serial('id').primaryKey(),
  ticketId:     integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  requestedBy:  integer('requested_by').notNull().references(() => users.id),
  status:       varchar('status', { length: 20 }).notNull().default('pendiente'), // pendiente | activa | terminada | rechazada
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  answeredAt:   timestamp('answered_at'),
  endedAt:      timestamp('ended_at'),
  endedReason:  varchar('ended_reason', { length: 20 }), // colgada | rechazada | timeout | error | desconexion
}, (t) => [
  // Una sola llamada viva (pendiente o activa) por ticket — el segundo
  // agente que intente llamar al mismo ticket choca acá, no en el código.
  uniqueIndex('ticket_calls_activa_uniq').on(t.ticketId).where(sql`status IN ('pendiente', 'activa')`),
]);

export const ticketCallSignals = pgTable('ticket_call_signals', {
  id:         serial('id').primaryKey(),
  callId:     integer('call_id').notNull().references(() => ticketCalls.id, { onDelete: 'cascade' }),
  fromRole:   varchar('from_role', { length: 10 }).notNull(), // user | agent
  kind:       varchar('kind', { length: 10 }).notNull(),      // offer | answer
  payload:    jsonb('payload').notNull(),                     // RTCSessionDescriptionInit completo
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});

export const ticketCallRecordings = pgTable('ticket_call_recordings', {
  id:                serial('id').primaryKey(),
  callId:            integer('call_id').notNull().references(() => ticketCalls.id, { onDelete: 'cascade' }),
  role:              varchar('role', { length: 10 }).notNull(), // user | agent
  s3Key:             varchar('s3_key', { length: 500 }).notNull(),
  duracionSegundos:  integer('duracion_segundos').notNull(),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
});

export const agentPresence = pgTable('agent_presence', {
  userId:      integer('user_id').primaryKey().references(() => users.id),
  isAvailable: boolean('is_available').notNull().default(false),
  lastSeenAt:  timestamp('last_seen_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export const supportAgents = pgTable('support_agents', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().unique().references(() => users.id),
  active:    boolean('active').notNull().default(true),
  addedBy:   integer('added_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const ticketRatings = pgTable('ticket_ratings', {
  id:        serial('id').primaryKey(),
  ticketId:  integer('ticket_id').notNull().unique().references(() => tickets.id, { onDelete: 'cascade' }),
  agentId:   integer('agent_id').references(() => users.id),
  rating:    integer('rating').notNull(), // 1 a 5
  comment:   text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const cannedResponses = pgTable('canned_responses', {
  id:        serial('id').primaryKey(),
  label:     varchar('label', { length: 100 }).notNull(),
  category:  varchar('category', { length: 30 }).notNull().default('general'), // saludo | espera | cierre | general
  content:   text('content').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  team: one(teams, { fields: [tickets.teamId], references: [teams.id] }),
  user: one(users, { fields: [tickets.userId], references: [users.id] }),
  assignedAgent: one(users, { fields: [tickets.assignedAgentId], references: [users.id] }),
  messages: many(ticketMessages),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one, many }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  sender: one(users, { fields: [ticketMessages.senderId], references: [users.id] }),
  attachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  message: one(ticketMessages, { fields: [ticketAttachments.messageId], references: [ticketMessages.id] }),
}));

export const supportAgentsRelations = relations(supportAgents, ({ one }) => ({
  user: one(users, { fields: [supportAgents.userId], references: [users.id] }),
  addedByUser: one(users, { fields: [supportAgents.addedBy], references: [users.id] }),
}));

export const ticketRatingsRelations = relations(ticketRatings, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketRatings.ticketId], references: [tickets.id] }),
  agent: one(users, { fields: [ticketRatings.agentId], references: [users.id] }),
}));

export const cannedResponsesRelations = relations(cannedResponses, ({ one }) => ({
  creator: one(users, { fields: [cannedResponses.createdBy], references: [users.id] }),
}));

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
  tickets: many(tickets),
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

export const pagoAdjuntosRelations = relations(pagoAdjuntos, ({ one }) => ({
  team:         one(teams,          { fields: [pagoAdjuntos.teamId],         references: [teams.id] }),
  ecfDocument:  one(ecfDocuments,   { fields: [pagoAdjuntos.ecfDocumentId],  references: [ecfDocuments.id] }),
  pagoRecibido: one(pagosRecibidos, { fields: [pagoAdjuntos.pagoRecibidoId], references: [pagosRecibidos.id] }),
  subidoPorUser: one(users,         { fields: [pagoAdjuntos.subidoPor],      references: [users.id] }),
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

/**
 * Cuánto se tardó en hacer cada factura.
 *
 * Tiempo de PARED: del momento en que se abre el formulario al momento en que
 * se guarda. Incluye que alguien se levante por un café. Por eso lo que se mira
 * es la mediana y no el promedio — una factura que quedó abierta toda la tarde
 * arrastra la media a un número que no describe a nadie.
 */
export const facturaTiempos = pgTable('factura_tiempos', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId:        integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  ecfDocumentId: integer('ecf_document_id'),
  /** 'escolar' | 'formulario' | 'pos' | 'recurrente' */
  origen:        varchar('origen', { length: 24 }).notNull(),
  ms:            integer('ms').notNull(),
  lineas:        smallint('lineas').notNull().default(0),
  montoCentavos: bigint('monto_centavos', { mode: 'number' }),
  emitida:       boolean('emitida').notNull().default(false),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export type FacturaTiempo = typeof facturaTiempos.$inferSelect;

// ─── EmiteDO — Almacenes ──────────────────────────────────────────────────────

export const almacenes = pgTable('almacenes', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  nombre:      varchar('nombre', { length: 255 }).notNull(),
  direccion:   varchar('direccion', { length: 500 }),
  observacion: text('observacion'),
  esDefault:   varchar('es_default', { length: 5 }).notNull().default('false'),
  // Almacén de uso exclusivo del punto de venta (p. ej. la cafetería). Lo que
  // vive solo acá no ensucia el catálogo de Facturación.
  soloPos:     boolean('solo_pos').notNull().default(false),
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
  // Variante afectada (null = producto sin variantes / movimiento a nivel producto).
  variantId:       integer('variant_id').references(() => productVariants.id),
  // VENTA | ENTRADA | AJUSTE_SALIDA | AJUSTE_ENTRADA | DEVOLUCION | STOCK_INICIAL
  tipo:            varchar('tipo', { length: 20 }).notNull(),
  cantidad:        integer('cantidad').notNull(),   // siempre positivo
  esEntrada:       boolean('es_entrada').notNull(), // true = suma, false = resta
  stockAntes:      integer('stock_antes').notNull(),
  stockDespues:    integer('stock_despues').notNull(),
  referenciaId:    integer('referencia_id').references(() => ecfDocuments.id),
  referenciaEncf:  varchar('referencia_encf', { length: 40 }),
  // En qué almacén ocurrió. NULL = no se supo (ventas sin almacén, ajustes
  // globales, y todo el histórico anterior a la migración 0094).
  almacenId:       integer('almacen_id').references(() => almacenes.id),
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

// ─── EmiteDO — Inventario: Variantes de producto ─────────────────────────────
// MVP "global": cada variante lleva su propio stock (una sola cifra, sin desglose
// por almacén). Un producto con variantes deja de usar products.stockActual para
// el conteo real; la verdad del stock vive por variante. Los atributos de cada
// variante (p.ej. { Talla:"M", Color:"Rojo" }) se guardan como jsonb libre, así
// la misma estructura sirve para ropa, bebidas, ferretería, etc.

export const productVariants = pgTable('product_variants', {
  id:           serial('id').primaryKey(),
  teamId:       integer('team_id').notNull().references(() => teams.id),
  productId:    integer('product_id').notNull().references(() => products.id),
  // Combinación concreta de valores: { "Talla": "M", "Color": "Rojo" }.
  atributos:    jsonb('atributos').notNull().default({}),
  // Display listo para mostrar/imprimir: "M" ó "Rojo · M". Lo arma el cliente.
  nombre:       varchar('nombre', { length: 255 }).notNull(),
  referencia:   varchar('referencia', { length: 100 }),   // SKU propio (opcional)
  codigoBarras: varchar('codigo_barras', { length: 64 }), // EAN/UPC (opcional)
  // Override de precio: null = usa el precio del producto padre.
  precio:       integer('precio'),                        // centavos, nullable
  costo:        integer('costo').notNull().default(0),    // centavos
  stockActual:  integer('stock_actual').notNull().default(0),
  stockMinimo:  integer('stock_minimo').notNull().default(0),
  activo:       boolean('activo').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('product_variants_team_idx').on(t.teamId),
  index('product_variants_product_idx').on(t.teamId, t.productId),
]);

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  team:    one(teams,    { fields: [productVariants.teamId],    references: [teams.id] }),
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

// Stock de variante por almacén (Opción B) — fuente de verdad del stock de
// variantes. product_variants.stock_actual = suma por todos los almacenes.
export const productVariantAlmacenStock = pgTable('product_variant_almacen_stock', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  variantId:   integer('variant_id').notNull().references(() => productVariants.id),
  almacenId:   integer('almacen_id').notNull().references(() => almacenes.id),
  stockActual: integer('stock_actual').notNull().default(0),
}, (t) => [
  uniqueIndex('pvas_variant_almacen_uniq').on(t.variantId, t.almacenId),
  index('pvas_team_idx').on(t.teamId),
  index('pvas_almacen_idx').on(t.almacenId),
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
  /** ITBIS incluido en montoTotal; 4.3 lo separa solo para régimen gravado. */
  itbisCents:       integer('itbis_cents').notNull().default(0),
  montoTotal:       integer('monto_total').notNull().default(0),
  formaPago:        varchar('forma_pago', { length: 10 }).notNull().default('credito'),
  metodoPago:       varchar('metodo_pago', { length: 30 }).notNull().default('efectivo'),
  fechaVencimiento: date('fecha_vencimiento'),
  estadoPago:       varchar('estado_pago', { length: 12 }).notNull().default('PENDIENTE'),
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

/**
 * Catálogo de COMPRAS: artículos/servicios que el negocio COMPRA a sus
 * proveedores. Es el simétrico del catálogo de venta (`products`) pero
 * separado a propósito: en una compra/gasto no quieres ver lo que vendes.
 * Alimenta el buscador de líneas de gasto (e43/e47) y compra (e41).
 * `costoCents` es solo una referencia editable; el costo real se fija en cada
 * compra. No toca inventario/stock (eso vive en Compras registradas).
 */
export const catalogoCompras = pgTable('catalogo_compras', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  nombre:          varchar('nombre', { length: 255 }).notNull(),
  descripcion:     text('descripcion'),
  referencia:      varchar('referencia', { length: 100 }),
  costoCents:      integer('costo_cents').notNull().default(0),
  tasaItbis:       varchar('tasa_itbis', { length: 8 }).notNull().default('0.18'),
  proveedorNombre: varchar('proveedor_nombre', { length: 255 }),
  proveedorRnc:    varchar('proveedor_rnc',    { length: 20 }),
  activo:          boolean('activo').notNull().default(true),
  createdBy:       integer('created_by').references(() => users.id),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});
export type CatalogoCompra = typeof catalogoCompras.$inferSelect;

export const pagosProveedores = pgTable('pagos_proveedores', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull().references(() => teams.id),
  compraId: integer('compra_id').notNull().references(() => comprasLocales.id),
  montoCents: integer('monto_cents').notNull(),
  metodo: varchar('metodo', { length: 30 }).notNull(),
  fechaPago: date('fecha_pago').notNull(),
  referencia: varchar('referencia', { length: 100 }),
  notas: text('notas'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('pagos_proveedores_team_compra_idx').on(t.teamId, t.compraId)]);

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
  // Almacén de uso exclusivo del punto de venta (p. ej. la cafetería). Lo que
  // vive solo acá no ensucia el catálogo de Facturación.
  soloPos:     boolean('solo_pos').notNull().default(false),
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
  // Documento (gasto/compra) que originó la salida. Permite reconciliar el
  // movimiento al editar el borrador. Sin .references() para evitar import
  // circular con ecfDocuments (FK en migración 0141).
  ecfDocumentId: integer('ecf_document_id'),
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

/**
 * Grado (Primero, Segundo…) dentro de un nivel/servicio. Agrupa las secciones.
 * Modelo SIGERD: Servicio → Grado → Sección. `orden` ordena en la UI.
 */
/**
 * Servicio = la TANDA/nivel del centro (como SIGERD): "Inicial-Matutina",
 * "Secundario-Matutina"… Es el nivel más alto de la estructura académica.
 * Debajo van los grados.
 */
export const adminEscolarServicios = pgTable('admin_escolar_servicios', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** Período (año escolar) al que pertenece. Jerarquía: Período → Servicio →
   *  Curso(grado) → Sección. */
  periodoId: integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  /** Nivel: "Inicial", "Primario", "Secundario", "Bachillerato"… */
  nombre:    varchar('nombre', { length: 100 }).notNull(),
  /** Tanda: "Matutina" | "Vespertina" | "Nocturna" | "Sabatina"… */
  tanda:     varchar('tanda', { length: 30 }),
  orden:     integer('orden').notNull().default(0),
  /** IdServicio de SIGERD (reconciliación). Nullable. */
  sigerdServicioId: integer('sigerd_servicio_id'),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_servicios_team_idx').on(t.teamId),
]);

export const adminEscolarGrados = pgTable('admin_escolar_grados', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** Servicio/tanda al que pertenece este grado. */
  servicioId: integer('servicio_id').notNull().references(() => adminEscolarServicios.id),
  /** Ej. "Primero", "Primer grado (7mo Nivel Básico)". */
  nombre:    varchar('nombre', { length: 100 }).notNull(),
  /** Nivel/servicio al que pertenece: "Primaria", "Secundario-Matutina"… */
  nivel:     varchar('nivel', { length: 80 }),
  orden:     integer('orden').notNull().default(0),
  /** IdGrado de SIGERD (reconciliación). Nullable. */
  sigerdGradoId: integer('sigerd_grado_id'),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_grados_team_idx').on(t.teamId),
]);

/**
 * Sección (A, B, C…) de un grado. Es a lo que se matricula el estudiante.
 *
 * Tabla física histórica `admin_escolar_cursos`; ahora representa la SECCIÓN
 * (se conserva el nombre físico para no reescribir las FK de matrículas/cargos,
 * pero en producto/UI es "Sección"). `nombre` es la etiqueta ("A", "B").
 */
export const adminEscolarCursos = pgTable('admin_escolar_cursos', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** Grado al que pertenece esta sección. */
  gradoId:   integer('grado_id').notNull().references(() => adminEscolarGrados.id),
  nombre:    varchar('nombre', { length: 80 }).notNull(),
  nivel:     varchar('nivel', { length: 60 }),
  /** IdSeccion de SIGERD. Reconcilia sin depender del nombre. Nullable. */
  sigerdSeccionId: integer('sigerd_seccion_id'),
  /** Cupo máximo de estudiantes (opcional; `tope` en SIGERD). */
  cupo:      integer('cupo'),
  orden:     integer('orden').notNull().default(0),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_cursos_team_idx').on(t.teamId),
  index('admin_escolar_cursos_grado_idx').on(t.gradoId),
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
  /** IdEstudiante de SIGERD. Clave estable de reconciliación (no cambia aunque
   *  cambie el RNE). Nullable — solo lo llevan los importados de SIGERD. */
  sigerdId:        integer('sigerd_id'),
  /** activo | inactivo | retirado | graduado */
  estado:          varchar('estado', { length: 20 }).notNull().default('activo'),
  /**
   * A quién se le factura si NO es el tutor responsable.
   *
   * El caso que lo justifica: el padre pide que la mensualidad salga a nombre
   * de su empresa para deducirla. La empresa no es tutor del alumno —no recoge
   * a nadie ni firma permisos— y aun así es a quien hay que facturarle todos
   * los meses. Va en el estudiante y no en la matrícula porque ese acuerdo no
   * se renegocia cada agosto. NULL = al tutor responsable, que es lo normal.
   */
  facturarAClientId: integer('facturar_a_client_id').references(() => clients.id),
  /** Enlace futuro con Contactos (dependientes). Nullable — integración post-MVP. */
  dependienteId:   integer('dependiente_id').references(() => dependientes.id),

  // ── Ficha extendida (misma forma que la ficha de SIGERD). TODO opcional; se
  //    llena a mano en el alta o llegará de SIGERD al reconciliar. Ver
  //    lib/administracion-escolar/estudiante-sigerd-campos.ts.
  nacionalidad:                varchar('nacionalidad', { length: 60 }),
  estadoCivil:                 varchar('estado_civil', { length: 30 }),
  codigoRne:                   varchar('codigo_rne', { length: 40 }),
  telefono:                    varchar('telefono', { length: 30 }),
  celular:                     varchar('celular', { length: 30 }),
  whatsapp:                    varchar('whatsapp', { length: 30 }),
  actaEstado:                  varchar('acta_estado', { length: 40 }),
  actaNumero:                  varchar('acta_numero', { length: 40 }),
  actaMunicipioJce:            varchar('acta_municipio_jce', { length: 120 }),
  actaOficialiaJce:            varchar('acta_oficialia_jce', { length: 120 }),
  actaLibro:                   varchar('acta_libro', { length: 30 }),
  actaFolio:                   varchar('acta_folio', { length: 30 }),
  actaAnio:                    varchar('acta_anio', { length: 10 }),
  dirProvincia:                varchar('dir_provincia', { length: 80 }),
  dirMunicipio:                varchar('dir_municipio', { length: 80 }),
  dirDistritoMunicipal:        varchar('dir_distrito_municipal', { length: 80 }),
  dirSeccion:                  varchar('dir_seccion', { length: 80 }),
  dirBarrio:                   varchar('dir_barrio', { length: 120 }),
  dirSubBarrio:                varchar('dir_sub_barrio', { length: 120 }),
  direccion:                   varchar('direccion', { length: 255 }),
  programa:                    varchar('programa', { length: 80 }),
  tarjetaSolidaridad:          varchar('tarjeta_solidaridad', { length: 60 }),
  tarjetaSolidaridadFamiliar:  varchar('tarjeta_solidaridad_familiar', { length: 60 }),

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
  /**
   * Id de la persona en SIGERD. Mejor llave que la cédula para no duplicar al
   * mismo padre cada año: la cédula llega con guiones, sin ellos o mal escrita,
   * y entonces la misma madre entra dos veces. Nulo en los tutores creados a
   * mano, que no vienen del portal.
   */
  sigerdIdPersona: integer('sigerd_id_persona'),
  telefono:  varchar('telefono', { length: 30 }),
  /** El colegio escribe por aquí, y no siempre es el mismo número que el fijo. */
  whatsapp:  varchar('whatsapp', { length: 30 }),
  email:     varchar('email', { length: 160 }),
  direccion: varchar('direccion', { length: 300 }),
  /** Foto del tutor (data URL base64, mismo patrón que products.imagen/teams.logo).
   *  Útil para identificar a un tutor que no es padre/contacto (ej. chofer, cuidador). */
  imagen:    text('imagen'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_tutores_team_idx').on(t.teamId),
  // Parciales: la cédula y el id de SIGERD son opcionales, y NULL no choca con
  // NULL. Dos filas con la misma cédula son la misma madre metida dos veces —
  // a partir de ahí los avisos salen duplicados y el histórico queda partido.
  uniqueIndex('admin_escolar_tutores_documento_uniq').on(t.teamId, t.documento)
    .where(sql`documento IS NOT NULL`),
  uniqueIndex('admin_escolar_tutores_sigerd_uniq').on(t.teamId, t.sigerdIdPersona)
    .where(sql`sigerd_id_persona IS NOT NULL`),
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
  /**
   * Qué papeles se le pidieron a esta familia. Lo elige quien matricula.
   * Nulo en las matrículas anteriores a los listados: su checklist sale por el
   * camino viejo (nivel + tipo) hasta que alguien le asigne uno.
   */
  documentoListaId: integer('documento_lista_id'),
  codigoMatricula:  varchar('codigo_matricula', { length: 40 }),
  fechaInscripcion: date('fecha_inscripcion'),
  /** Condición académica final de SIGERD (Promovido/Reprobado/Aplazado…). Nullable. */
  sigerdCondicion:  varchar('sigerd_condicion', { length: 40 }),
  /** activa | finalizada | retirada | anulada */
  estado:           varchar('estado', { length: 20 }).notNull().default('activa'),
  /** Plan genérico que genera la mensualidad automática de esta matrícula. */
  facturaRecurrenteId: integer('factura_recurrente_id').references(() => facturasRecurrentes.id),
  /** Concepto escolar que recibirá cada cargo generado por el plan. */
  conceptoMensualidadId: integer('concepto_mensualidad_id').references(() => adminEscolarConceptosPago.id),
  /**
   * Beca. Es de la persona, no del aula: en una misma sección conviven quien
   * paga completo y quien tiene media beca, todos contra la misma tarifa. Solo
   * afecta la colegiatura; inscripción y materiales se cobran completos.
   *
   * `'porcentaje'` → `becaValor` es el % que se descuenta (50 = media beca,
   * 100 = completa). `'monto'` → `becaValor` es lo que paga, en centavos.
   * NULL en ambos = paga la tarifa que le toque.
   */
  becaTipo:   varchar('beca_tipo', { length: 12 }),
  becaValor:  integer('beca_valor'),
  /** Por qué: hermano, hijo de empleado, mérito. Sin esto nadie sabe explicarlo después. */
  becaMotivo: varchar('beca_motivo', { length: 80 }),
  /**
   * Qué conceptos se le cobran a ESTE alumno, decidido al matricular.
   *
   * La decisión vivía en el catálogo (`conceptos.aplicaPorDefecto`): se cobraba
   * a todos o a nadie, y lo que la secretaria desmarcaba no quedaba anotado, así
   * que el devengo mensual no podía distinguir "a este no le toca" de "todavía
   * no le ha tocado" y volvía a añadirlo al mes siguiente. Guardado aquí,
   * desmarcar pega y el devengo sigue esta lista y nada más.
   */
  conceptosIds:     jsonb('conceptos_ids').$type<number[]>().notNull().default([]),
  notas:            text('notas'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_matriculas_team_idx').on(t.teamId),
  index('admin_escolar_matriculas_estudiante_idx').on(t.estudianteId),
  index('admin_escolar_matriculas_periodo_idx').on(t.periodoId),
  uniqueIndex('admin_escolar_matriculas_factura_recurrente_uniq').on(t.facturaRecurrenteId),
]);

/** Concepto de cargo escolar. La `frecuencia` decide cuántas cuotas genera. */
export const adminEscolarConceptosPago = pgTable('admin_escolar_conceptos_pago', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  nombre:     varchar('nombre', { length: 80 }).notNull(),
  /** inscripcion | mensualidad | uniforme | actividad | otro */
  tipo:       varchar('tipo', { length: 20 }).notNull().default('otro'),
  /**
   * unico | mensual | trimestral | semestral. Sustituye al viejo booleano
   * `recurrente`, que solo distinguía "cada mes" de "una vez": el trimestre y
   * el semestre —que los colegios que siguen los cortes del MINERD sí usan—
   * había que fingirlos sembrando filas del calendario a mano.
   *
   * De ella sale el calendario entero: el número de cuotas es el largo del año
   * escolar dividido por su paso.
   */
  frecuencia: varchar('frecuencia', { length: 12 }).notNull().default('unico')
    .$type<'unico' | 'mensual' | 'trimestral' | 'semestral'>(),
  /**
   * Si llega marcado al matricular. La inscripción y la colegiatura las paga
   * todo el mundo; el uniforme no, y desmarcarlo 465 veces es peor que
   * marcarlo cuando toca.
   */
  aplicaPorDefecto: boolean('aplica_por_defecto').notNull().default(false),
  /**
   * Si la beca lo descuenta. La beca escolar es sobre lo que se paga cada mes,
   * y la inscripción, los uniformes y los materiales se cobran completos. No
   * se pregunta en pantalla —se derivaba en una casilla que nadie sabía para
   * qué era— pero se guarda aparte porque el motor de tarifas lo consulta y
   * porque un colegio con transporte mensual sin beca podría necesitar
   * separarlos más adelante.
   */
  admiteBeca: boolean('admite_beca').notNull().default(false),
  /**
   * Si se le cobra recargo por atraso, y desde cuándo: el mismo día que vence.
   *
   * OJO: la empresa tiene su propio `teams.recargoMoraDiasGracia` (default 5)
   * que el motor de recargo aplica cuando el plan no dice otra cosa. Aquí NO
   * hay días de gracia que heredar: "recargo al vencer" significa gracia CERO,
   * y quien conecte el recargo escolar tiene que forzarla explícitamente en
   * vez de dejar que caiga el default del negocio.
   */
  cobraMora: boolean('cobra_mora').notNull().default(false),
  /**
   * Ciclo de cobro. Va en el concepto y no en un ajuste único del colegio
   * porque no todo se cobra igual: la colegiatura puede vencer el día 5 y el
   * transporte el 10. En los conceptos periódicos estos números se copian al
   * plan de factura recurrente que se crea al matricular — el módulo escolar
   * configura la facturación, no la reimplementa.
   */
  /** Día del mes en que se EMITE, 1-30. En meses cortos se recorta al último. */
  diaEmision:     smallint('dia_emision'),
  /** Días desde la emisión hasta el vencimiento. NULL = no vence nunca. */
  diasParaPago:   smallint('dias_para_pago'),
  /**
   * Interruptor maestro de los avisos. Apagado no sale nada aunque los días
   * estén puestos: así se para el envío sin perder la configuración.
   */
  avisosActivos: boolean('avisos_activos').notNull().default(false),
  /**
   * Días antes de EMITIR en que se avisa. El colegio piensa "el 28 se genera
   * la factura y cinco días antes le aviso": el ancla es el día en que sale la
   * factura, no el vencimiento. NULL = no avisar.
   */
  /** Avisar el día que sale la factura: "ya se generó, tienes que pagar". */
  avisoDiaEmision: boolean('aviso_dia_emision').notNull().default(false),
  /**
   * Días antes de la MORA en que se avisa. Es el aviso que de verdad hace
   * pagar: el único que le ahorra dinero al padre.
   *
   * Cuelga de la fecha del recargo —vencimiento + `moraDiasGracia`— y no del
   * vencimiento a secas. Anclarlo al vencimiento haría que cambiar los días de
   * gracia moviera el aviso sin que nadie lo pidiera.
   */
  avisoAntesMoraDias: smallint('aviso_antes_mora_dias'),
  /**
   * Avisar el día del vencimiento, que es el mismo en que entra el recargo: no
   * hay días de gracia. Es un aviso aparte del anterior y no su sustituto —uno
   * llega a tiempo de evitar la mora y el otro dice que ya la tiene—, y por eso
   * el de antes exige al menos un día: con cero, los dos caerían juntos.
   */
  avisoDiaVencimiento: boolean('aviso_dia_vencimiento').notNull().default(false),
  /**
   * Días entre que la factura vence y le entra el recargo. 0 = el mismo día.
   *
   * Es del CONCEPTO y no del colegio porque no todo se cobra igual: la
   * colegiatura puede dar cinco días de margen y la inscripción ninguno.
   */
  moraDiasGracia: smallint('mora_dias_gracia').notNull().default(0),
  avisoCorreo:   boolean('aviso_correo').notNull().default(false),
  avisoWhatsapp: boolean('aviso_whatsapp').notNull().default(false),
  avisoSms:      boolean('aviso_sms').notNull().default(false),
  /**
   * Rebaja por saldar de una vez todo lo que queda pendiente, en porcentaje.
   * NULL = no se ofrece. Es el descuento que los colegios ya dan por teléfono
   * y que hoy se aplica bajando el monto de la factura a mano, sin dejar
   * rastro de por qué; se registra como línea propia del estado de cuenta para
   * que se vea cuánto se rebajó y para que reversar el pago lo reverse con él.
   */
  descuentoAdelantoPct: smallint('descuento_adelanto_pct'),
  /** Enlace opcional al catálogo de productos/servicios. Si viene, la factura
   *  generada desde el cargo hereda nombre/ITBIS del producto — evita duplicar
   *  catálogo. El monto sigue viniendo del cargo, no del producto. */
  productId:  integer('product_id').references(() => products.id),
  activo:     boolean('activo').notNull().default(true),
  /**
   * Orden en que el colegio quiere verlos. El alfabeto no es el orden en que se
   * piensa el año: primero la inscripción, luego la colegiatura, al final los
   * extras. Se empata por nombre para que dos conceptos con el mismo orden
   * —heredado o recién creado— no bailen entre recargas.
   */
  orden:      smallint('orden').notNull().default(0),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_conceptos_team_idx').on(t.teamId),
]);

/**
 * Precio de un concepto ATADO a un nodo de la estructura (servicio/grado/
 * sección), con su propio monto. Así "Mensualidad" puede costar distinto en
 * Secundario vs Primario, o por grado/sección. `objetivoTipo` + `objetivoId`
 * apuntan a servicios / grados / cursos(=sección).
 */
export const adminEscolarConceptoPrecios = pgTable('admin_escolar_concepto_precios', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  conceptoId:    integer('concepto_id').notNull().references(() => adminEscolarConceptosPago.id),
  /**
   * Año escolar al que pertenece esta tarifa. La colegiatura sube cada año; sin
   * esto habría que duplicar el catálogo entero por año (que es justo como los
   * colegios terminan con 30+ productos "Pago de colegiatura").
   */
  periodoId:     integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  /** 'servicio' | 'grado' | 'seccion' */
  objetivoTipo:  varchar('objetivo_tipo', { length: 12 }).notNull(),
  /** id del servicio / grado / curso(sección) según `objetivoTipo`. */
  objetivoId:    integer('objetivo_id').notNull(),
  montoCentavos: integer('monto_centavos').notNull(),
  /**
   * Servicio de facturación con el que se cobra esta tarifa. Va aquí y no en el
   * concepto porque los colegios tienen un producto por grado. Opcional: quien
   * hereda el precio del servicio hereda también su producto.
   */
  productId:     integer('product_id').references(() => products.id),
  activo:        boolean('activo').notNull().default(true),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_concepto_precios_team_idx').on(t.teamId),
  index('admin_escolar_concepto_precios_periodo_idx').on(t.periodoId),
  uniqueIndex('admin_escolar_concepto_precios_uniq').on(t.teamId, t.conceptoId, t.periodoId, t.objetivoTipo, t.objetivoId),
]);

/** Cargo/deuda escolar. La deuda vive AQUÍ, no depende de facturas.
 *  `saldoCentavos` = pendiente; el pago lo reduce. `mes` solo para mensualidad. */
/**
 * En cuántas partes se paga un concepto y cuándo vence cada una.
 *
 * Una fila por cuota. Inscripción de un solo pago = una fila. Inscripción en
 * dos = dos filas al 50%. Colegiatura mensual = diez filas. Los tres casos que
 * conviven en los colegios dominicanos salen del mismo mecanismo, sin código
 * especial para ninguno.
 *
 * El calendario se configura UNA vez por concepto y año, no por estudiante: si
 * viviera en la pantalla de matrícula, la secretaria contestaría la misma
 * pregunta cientos de veces y cambiar de dos a tres cuotas en octubre obligaría
 * a tocar todas las matrículas.
 */
export const adminEscolarConceptoCuotas = pgTable('admin_escolar_concepto_cuotas', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  conceptoId: integer('concepto_id').notNull().references(() => adminEscolarConceptosPago.id),
  /** Año escolar: 2026-2027 puede repartirse distinto que 2027-2028. */
  periodoId:  integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  numero:     smallint('numero').notNull(),
  /** "1ra inscripción", "Agosto". Sin esto el padre ve líneas iguales. */
  etiqueta:   varchar('etiqueta', { length: 60 }).notNull(),
  /** Mes 1-12 si la cuota es de un mes concreto; alimenta `cargos.mes`. */
  mes:        smallint('mes'),
  /**
   * El día que SALE la factura de esta cuota, no el día que vence.
   *
   * El vencimiento no se guarda: es `fechaEmision + conceptos.diasParaPago`.
   * Guardar los dos obligaría a reescribir el calendario entero cada vez que
   * el colegio cambia los días para pagar, y basta con que una fila se quede
   * atrás para que a un padre le llegue una fecha límite que ya no es cierta.
   */
  fechaEmision: date('fecha_emision').notNull(),
  /**
   * Qué parte del monto se cobra aquí, en milésimas de por ciento
   * (100000 = 100%). En milésimas porque partir en tres da 33,333% y con
   * enteros se pierde un peso por cuota.
   */
  porcentajeMilesimas: integer('porcentaje_milesimas').notNull().default(100000),
  activo:     boolean('activo').notNull().default(true),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_concepto_cuotas_unica').on(t.conceptoId, t.periodoId, t.numero),
  index('admin_escolar_concepto_cuotas_periodo').on(t.teamId, t.periodoId),
]);

/**
 * Qué avisos de cobro ya se mandaron.
 *
 * El cron corre a diario y "venció hace 3 días" sigue siendo verdad mañana:
 * sin esta tabla el mismo recordatorio le llegaría al padre toda la semana. El
 * índice único por (cargo, tipo, día, canal) es lo que lo impide.
 */
/**
 * Interruptor maestro de cada canal de aviso, por colegio.
 *
 * Los conceptos deciden QUÉ se avisa y por dónde; esto decide si el canal
 * existe. Sin ello, callar el correo obligaba a apagarlo concepto por concepto
 * —y a encenderlo igual después.
 *
 * La fila puede faltar: eso son los tres encendidos. Es lo que hace que un
 * colegio que nunca tocó esta pantalla siga comportándose como antes.
 */
export const adminEscolarCanales = pgTable('admin_escolar_canales', {
  teamId:         integer('team_id').primaryKey().references(() => teams.id),
  correoActivo:   boolean('correo_activo').notNull().default(true),
  whatsappActivo: boolean('whatsapp_activo').notNull().default(true),
  smsActivo:      boolean('sms_activo').notNull().default(true),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

export const adminEscolarAvisosEnviados = pgTable('admin_escolar_avisos_enviados', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  /** De qué cuota. NULL en los avisos que no son de cobro. */
  cargoId: integer('cargo_id').references(() => adminEscolarCargos.id),
  /** De qué matrícula, cuando el aviso es del expediente y no de una cuota:
   *  el enlace para subir documentos, un formulario mandado a la familia. */
  matriculaId: integer('matricula_id').references(() => adminEscolarMatriculas.id, { onDelete: 'cascade' }),
  /** al-emitir | antes-vencer | al-vencer (cobro) · documentos | formulario. */
  tipo:    varchar('tipo', { length: 20 }).notNull(),
  /** Días respecto al hito del `tipo`: 5 = cinco días antes. */
  offsetDias: smallint('offset_dias').notNull(),
  canal:   varchar('canal', { length: 12 }).notNull(),
  destino: varchar('destino', { length: 200 }),
  /** Qué se mandó, en palabras: «Acta de nacimiento», «Ficha de datos». */
  detalle: varchar('detalle', { length: 200 }),
  /**
   * El id del mensaje en el CRM. Sin esto no se puede volver a preguntar si
   * LLEGÓ: el 201 del envío solo dice que Meta aceptó la petición, y un aviso
   * que falla después queda marcado como enviado para siempre —esta tabla es la
   * de idempotencia— así que el cron no lo reintenta y el padre nunca se entera.
   */
  mensajeId: varchar('mensaje_id', { length: 80 }),
  /** enviado | entregado | leido | fallido · null = todavía sin preguntar. */
  estadoEntrega: varchar('estado_entrega', { length: 16 }),
  /** El motivo real de Meta cuando falla. */
  errorEntrega: text('error_entrega'),
  revisadoAt: timestamp('revisado_at'),
  enviadoAt: timestamp('enviado_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_avisos_unico').on(t.cargoId, t.tipo, t.offsetDias, t.canal),
  index('admin_escolar_avisos_team_fecha').on(t.teamId, t.enviadoAt),
]);

export const adminEscolarCargos = pgTable('admin_escolar_cargos', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  estudianteId:     integer('estudiante_id').notNull().references(() => adminEscolarEstudiantes.id),
  matriculaId:      integer('matricula_id').notNull().references(() => adminEscolarMatriculas.id),
  periodoId:        integer('periodo_id').notNull().references(() => adminEscolarPeriodos.id),
  conceptoId:       integer('concepto_id').notNull().references(() => adminEscolarConceptosPago.id),
  /** Mes 1-12 solo si es mensualidad; null para inscripción/uniforme/etc. */
  mes:              smallint('mes'),
  /**
   * De qué cuota del calendario salió. Con el índice único
   * `(matricula_id, cuota_id)` es lo que impide que dos clics en "Matricular"
   * le cobren la inscripción dos veces al mismo padre. Nullable: los cargos
   * hechos a mano no vienen de ningún calendario.
   */
  cuotaId:          integer('cuota_id').references(() => adminEscolarConceptoCuotas.id),
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

// ─── Link de pago del padre ──────────────────────────────────────────────────

/**
 * Lo que NO se multiplica: el contacto del colegio.
 *
 * El documento (RNC o cédula) y el teléfono son del colegio, no de la cuenta.
 * Repetirlos en cada cuenta serían tres oportunidades de que uno quede mal
 * escrito, y el padre vería tres RNC distintos del mismo colegio.
 *
 * Aparte de `teams` porque son datos del colegio como RECEPTOR de
 * transferencias, no como contribuyente.
 */
export const adminEscolarDatosPago = pgTable('admin_escolar_datos_pago', {
  id:                  serial('id').primaryKey(),
  teamId:              integer('team_id').notNull().unique().references(() => teams.id, { onDelete: 'cascade' }),
  /**
   * El documento por defecto. Lo heredan las cuentas que no digan otro, que es
   * lo normal: escribir el mismo RNC en las tres son tres sitios donde
   * equivocarse.
   */
  documento:           varchar('documento', { length: 20 }),
  telefonoAyuda:       varchar('telefono_ayuda', { length: 40 }),
  horarioAyuda:        varchar('horario_ayuda', { length: 120 }),
  instrucciones:       text('instrucciones'),
  aceptaTransferencia: boolean('acepta_transferencia').notNull().default(true),
  creadoEn:            timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn:       timestamp('actualizado_en').notNull().defaultNow(),
});

/**
 * Las cuentas a las que el padre puede transferir.
 *
 * Varias porque un colegio cobra por más de un banco: el padre que tiene
 * Popular no quiere pagar comisión interbancaria por mandar a un BHD, así que
 * se le ofrecen las dos y elige la suya.
 *
 * El titular SÍ va por cuenta —una puede estar a nombre del colegio y otra de
 * la fundación— y el padre necesita saber a quién le manda dinero.
 */
export const adminEscolarCuentasBanco = pgTable('admin_escolar_cuentas_banco', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  banco:         varchar('banco', { length: 120 }).notNull(),
  tipoCuenta:    varchar('tipo_cuenta', { length: 40 }),
  numeroCuenta:  varchar('numero_cuenta', { length: 60 }).notNull(),
  titular:       varchar('titular', { length: 200 }),
  /**
   * RNC o cédula del TITULAR de esta cuenta, que no siempre es el del colegio:
   * una cuenta puede estar a nombre de la fundación y otra del dueño. El padre
   * lo teclea en la app del banco al registrar el beneficiario, así que un
   * documento que no cuadra con el titular hace que el banco rebote la
   * transferencia. Vacío = hereda el del colegio.
   */
  documento:     varchar('documento', { length: 20 }),
  /** En qué orden se le enseñan al padre. La primera es la que más se usa. */
  orden:         smallint('orden').notNull().default(0),
  /**
   * Se apaga en vez de borrarse: una cuenta cerrada sigue apareciendo en
   * comprobantes viejos, y borrarla dejaría al colegio sin saber qué es ese
   * número al revisar un pago de hace tres meses.
   */
  activa:        boolean('activa').notNull().default(true),
  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  // La misma cuenta dos veces es un error de dedo, no una cuenta más.
  uniqueIndex('admin_escolar_cuentas_banco_uq').on(t.teamId, t.banco, t.numeroCuenta),
  index('admin_escolar_cuentas_banco_team_idx').on(t.teamId, t.activa, t.orden),
]);

/**
 * El enlace que se le manda al padre.
 *
 * La llave es `clients` y no `adminEscolarTutores`: quien paga es el contacto
 * de Facturación al que apunta `estudiantes.facturarAClientId`, que es a quien
 * el motor de avisos ya le escribe. Un alumno puede tener cuatro tutores y no
 * se le cobra a los cuatro.
 *
 * UNO por responsable, no uno por aviso: el mismo padre recibe el enlace muchas
 * veces al año y tiene que caer siempre en la misma página con la MISMA
 * referencia, o el colegio recibe transferencias con referencias distintas del
 * mismo padre y no puede casarlas.
 */
export const adminEscolarLinksPago = pgTable('admin_escolar_links_pago', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  clientId:      integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  /** Va en la URL. Es la única credencial de la página: largo y aleatorio. */
  token:         varchar('token', { length: 48 }).notNull().unique(),
  /** Lo que el padre escribe en el concepto de la transferencia (ZER-8F32A1). */
  referencia:    varchar('referencia', { length: 24 }).notNull(),
  /** abierto | revocado */
  estado:        varchar('estado', { length: 20 }).notNull().default('abierto'),
  ultimoAcceso:  timestamp('ultimo_acceso'),
  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_links_pago_client_uq').on(t.teamId, t.clientId),
  index('admin_escolar_links_pago_team_idx').on(t.teamId),
]);

/** Un cargo tal como estaba cuando el padre subió el comprobante. */
export interface CargoDelComprobante {
  cargoId: number;
  estudiante: string;
  concepto: string;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

/**
 * Alguien DICE que transfirió, y trae una foto. No mueve un peso.
 *
 * No es un pago a propósito: el cobro de verdad vive en `pagos_recibidos`,
 * atado a la factura, y el saldo del cargo se deriva de ahí. Meter esto como
 * pago escolar le daría al colegio dos verdades de cuánto le deben.
 */
export const adminEscolarComprobantes = pgTable('admin_escolar_comprobantes', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  linkId:        integer('link_id').references(() => adminEscolarLinksPago.id, { onDelete: 'set null' }),
  clientId:      integer('client_id').references(() => clients.id, { onDelete: 'set null' }),

  montoCentavos: integer('monto_centavos').notNull(),
  referencia:    varchar('referencia', { length: 120 }),
  bancoOrigen:   varchar('banco_origen', { length: 120 }),
  nota:          text('nota'),

  /** s3 | db — igual que los comprobantes de facturación. */
  storage:       varchar('storage', { length: 10 }).notNull().default('s3'),
  archivoKey:    varchar('archivo_key', { length: 300 }),
  archivoBase64: text('archivo_base64'),
  archivoMime:   varchar('archivo_mime', { length: 80 }).notNull(),
  archivoNombre: varchar('archivo_nombre', { length: 200 }),
  archivoBytes:  integer('archivo_bytes').notNull().default(0),

  /**
   * Foto de qué se debía al subirlo. Para cuando el colegio revise, el cargo
   * pudo cambiar de monto, quedar facturado o anularse — y sin esto no hay
   * forma de saber qué creyó el padre que estaba pagando.
   */
  cargos:        jsonb('cargos').$type<CargoDelComprobante[]>().notNull().default([]),

  /** pendiente | aprobado | rechazado */
  estado:        varchar('estado', { length: 20 }).notNull().default('pendiente'),
  revisadoPor:   integer('revisado_por').references(() => users.id),
  revisadoEn:    timestamp('revisado_en'),
  motivoRechazo: text('motivo_rechazo'),
  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_comprobantes_team_estado_idx').on(t.teamId, t.estado),
  index('admin_escolar_comprobantes_link_idx').on(t.linkId),
  index('admin_escolar_comprobantes_client_idx').on(t.clientId),
]);

export type AdminEscolarCuentaBanco   = typeof adminEscolarCuentasBanco.$inferSelect;
export type NewAdminEscolarCuentaBanco = typeof adminEscolarCuentasBanco.$inferInsert;
export type AdminEscolarDatosPago     = typeof adminEscolarDatosPago.$inferSelect;
export type NewAdminEscolarDatosPago  = typeof adminEscolarDatosPago.$inferInsert;
export type AdminEscolarLinkPago      = typeof adminEscolarLinksPago.$inferSelect;
export type NewAdminEscolarLinkPago   = typeof adminEscolarLinksPago.$inferInsert;
export type AdminEscolarComprobante   = typeof adminEscolarComprobantes.$inferSelect;
export type NewAdminEscolarComprobante = typeof adminEscolarComprobantes.$inferInsert;

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
/**
 * Un listado de documentos con nombre.
 *
 * El colegio arma los que necesite —«Admisión inicial», «Traslado de otro
 * centro», «Reinscripción»— y al matricular se elige uno. Antes esto se
 * deducía cruzando el nivel del alumno con el tipo de inscripción, y salían
 * doce listas casi iguales que nadie mantenía. Quien recibe a la familia no
 * piensa en ese cruce: piensa «este viene de traslado».
 */
export const adminEscolarDocumentoListas = pgTable('admin_escolar_documento_listas', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  nombre:    varchar('nombre', { length: 120 }).notNull(),
  orden:     smallint('orden').notNull().default(0),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_doc_listas_team_idx').on(t.teamId, t.orden),
]);

/**
 * Lo que el colegio le EXIGE a la familia al matricular.
 *
 * `listaId` es el dueño real desde 0129. `nivel` y `tipoInscripcion` se quedan
 * por las filas viejas —y porque la columna del tipo es NOT NULL— pero ya no
 * deciden qué se pide: eso lo dice el listado elegido en la matrícula.
 */
export const adminEscolarDocumentosRequeridos = pgTable('admin_escolar_documentos_requeridos', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  listaId:         integer('lista_id').references(() => adminEscolarDocumentoListas.id, { onDelete: 'cascade' }),
  /** Puesto = se le pide SOLO a esa matrícula, no al listado entero. Es el
   *  caso suelto: la carta del pediatra, el permiso de viaje. */
  matriculaId:     integer('matricula_id').references(() => adminEscolarMatriculas.id, { onDelete: 'cascade' }),
  /** El renglón no es un papel que se sube, sino un formulario que la familia
   *  contesta por un enlace. */
  formularioId:    integer('formulario_id').references(() => adminEscolarFormularios.id, { onDelete: 'set null' }),
  /** NULL = vale para todos los niveles. */
  nivel:           varchar('nivel', { length: 60 }),
  /** 'nuevo' | 'reinscripcion' */
  tipoInscripcion: varchar('tipo_inscripcion', { length: 20 }).notNull(),
  nombre:          varchar('nombre', { length: 160 }).notNull(),
  /** Lo que la familia necesita saber para no mandarlo mal: «original con
   *  sello», «las dos caras», «foto reciente, fondo blanco». Se le enseña a
   *  ella —en el enlace y en el correo—, no al colegio. */
  ayuda:           varchar('ayuda', { length: 300 }),
  /** 'requerido' | 'si_aplica' — "si aplica" NO es opcional: hay que resolverlo. */
  exigencia:       varchar('exigencia', { length: 20 }).notNull().default('requerido'),
  cantidad:        smallint('cantidad').notNull().default(1),
  orden:           smallint('orden').notNull().default(0),
  activo:          boolean('activo').notNull().default(true),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_docs_req_lista_idx').on(t.teamId, t.tipoInscripcion, t.orden),
]);

/**
 * Lo que la familia ENTREGÓ, por matrícula.
 *
 * `recibido` y `aprobado` son estados distintos porque subir el archivo y darlo
 * por bueno son dos actos de dos personas, y el colegio necesita el rastro del
 * segundo. Lo que llega por el enlace público entra siempre como `recibido`.
 */
export const adminEscolarDocumentosEntregados = pgTable('admin_escolar_documentos_entregados', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  matriculaId:   integer('matricula_id').notNull().references(() => adminEscolarMatriculas.id, { onDelete: 'cascade' }),
  requeridoId:   integer('requerido_id').notNull().references(() => adminEscolarDocumentosRequeridos.id, { onDelete: 'cascade' }),
  /** pendiente | recibido | aprobado | rechazado | no_aplica */
  estado:        varchar('estado', { length: 20 }).notNull().default('pendiente'),
  archivoNombre: varchar('archivo_nombre', { length: 255 }),
  mime:          varchar('mime', { length: 100 }),
  tamanoBytes:   integer('tamano_bytes'),
  sha256:        char('sha256', { length: 64 }),
  /** 's3' → el binario está en s3Key. 'db' → en `contenido` (base64). */
  storage:       varchar('storage', { length: 10 }),
  s3Key:         text('s3_key'),
  contenido:     text('contenido'),
  subidoEn:      timestamp('subido_en'),
  subidoPor:     integer('subido_por').references(() => users.id),
  /** Entró por el enlace de la familia; `subidoPor` va NULL (no hay sesión). */
  subidoFamilia: boolean('subido_familia').notNull().default(false),
  aprobadoEn:    timestamp('aprobado_en'),
  aprobadoPor:   integer('aprobado_por').references(() => users.id),
  /** Por qué se rechazó, o por qué no aplica. */
  motivo:        text('motivo'),
  notas:         text('notas'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_docs_ent_unico_idx').on(t.matriculaId, t.requeridoId),
  index('admin_escolar_docs_ent_team_idx').on(t.teamId, t.estado),
]);

/**
 * Los archivos de un documento entregado. Varios por documento.
 *
 * El acta de nacimiento tiene dos caras y la tarjeta de vacunas varias páginas,
 * así que el binario no puede vivir en la fila de `entregados`: esa fila es el
 * ESTADO del requisito —quién lo aprobó, cuándo, si no aplica— y se aprueba el
 * documento entero, no cada foto. Por eso la aprobación no se repite aquí.
 */
export const adminEscolarDocumentoArchivos = pgTable('admin_escolar_documento_archivos', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  entregadoId:   integer('entregado_id').notNull()
                   .references(() => adminEscolarDocumentosEntregados.id, { onDelete: 'cascade' }),
  archivoNombre: varchar('archivo_nombre', { length: 255 }),
  mime:          varchar('mime', { length: 100 }).notNull(),
  tamanoBytes:   integer('tamano_bytes').notNull(),
  sha256:        char('sha256', { length: 64 }).notNull(),
  /** 's3' → el binario está en s3Key. 'db' → en `contenido` (base64). */
  storage:       varchar('storage', { length: 10 }).notNull(),
  s3Key:         text('s3_key'),
  contenido:     text('contenido'),
  /** "cara 1", "cara 2": el orden en que se fotografiaron es el de revisión. */
  orden:         smallint('orden').notNull().default(0),
  subidoEn:      timestamp('subido_en').notNull().defaultNow(),
  subidoPor:     integer('subido_por').references(() => users.id),
  /** Entró por el enlace de la familia; `subidoPor` va NULL (no hay sesión). */
  subidoFamilia: boolean('subido_familia').notNull().default(false),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_doc_archivos_entregado_idx').on(t.entregadoId, t.orden),
  // El mismo binario no entra dos veces en el mismo documento: el padre que
  // dispara dos veces sin querer no genera dos filas idénticas.
  uniqueIndex('admin_escolar_doc_archivos_sha_uniq').on(t.entregadoId, t.sha256),
]);

/**
 * Enlace para que la familia suba sin cuenta.
 *
 * Se guarda el SHA-256 del token, nunca el token: quien lea la tabla —un dump,
 * un backup, alguien con acceso a la base— no puede usarlo para entrar. El
 * token en claro existe una sola vez, en el enlace que se copia.
 */
export const adminEscolarDocumentosEnlaces = pgTable('admin_escolar_documentos_enlaces', {
  id:          serial('id').primaryKey(),
  teamId:      integer('team_id').notNull().references(() => teams.id),
  matriculaId: integer('matricula_id').notNull().references(() => adminEscolarMatriculas.id, { onDelete: 'cascade' }),
  /**
   * Acota el enlace a UN documento. NULL = el expediente entero.
   *
   * Un enlace por documento es lo que permite pedir solo lo que falta —"súbeme
   * el certificado médico"— sin enseñarle a quien lo reciba el resto de la
   * lista del alumno.
   */
  requeridoId: integer('requerido_id')
                 .references(() => adminEscolarDocumentosRequeridos.id, { onDelete: 'cascade' }),
  tokenHash:   char('token_hash', { length: 64 }).notNull(),
  expiraEn:    timestamp('expira_en').notNull(),
  creadoPor:   integer('creado_por').references(() => users.id),
  creadoEn:    timestamp('creado_en').notNull().defaultNow(),
  ultimoUsoEn: timestamp('ultimo_uso_en'),
  revocadoEn:  timestamp('revocado_en'),
}, (t) => [
  uniqueIndex('admin_escolar_docs_enlace_token_idx').on(t.tokenHash),
  index('admin_escolar_docs_enlace_matricula_idx').on(t.matriculaId),
  index('admin_escolar_docs_enlace_requerido_idx').on(t.requeridoId),
]);

export type AdminEscolarDocumentoRequerido = typeof adminEscolarDocumentosRequeridos.$inferSelect;
export type AdminEscolarDocumentoEntregado = typeof adminEscolarDocumentosEntregados.$inferSelect;
export type AdminEscolarDocumentoArchivo   = typeof adminEscolarDocumentoArchivos.$inferSelect;
export type AdminEscolarDocumentoEnlace    = typeof adminEscolarDocumentosEnlaces.$inferSelect;

export type AdminEscolarPago       = typeof adminEscolarPagos.$inferSelect;
export type NewAdminEscolarPago    = typeof adminEscolarPagos.$inferInsert;

// ─── Administración Escolar — Formularios ─────────────────────────────────────
// Formularios que el colegio arma a mano (ficha de inscripción, permisos,
// encuestas) y las respuestas que llegan de las familias. Ver migración
// 0121_formularios_escolares.sql — sus comentarios explican por qué una
// respuesta NO toca la ficha del alumno hasta que alguien la revisa.
//
// Portado del constructor del CRM (crm-escolar), que es Mongo/Mongoose: allí
// un formulario es un documento con `campos: ICampo[]` embebido. Aquí van en
// JSONB por la misma razón que allí van embebidos —se leen y se guardan
// siempre enteros, nunca se consulta "dame los formularios que tengan un
// campo de tipo firma"—. El vocabulario de tipos (`TipoCampo`, `ICampo`,
// `IFormularioConfig`) vive en lib/administracion-escolar/formularios.ts y no
// aquí, para no atar este fichero a un import de otra capa.

export const adminEscolarFormularios = pgTable('admin_escolar_formularios', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  nombre:        varchar('nombre', { length: 200 }).notNull(),
  descripcion:   text('descripcion'),
  /** Parte de la URL pública /f/<slug>. Único por colegio, no global — dos
   *  colegios pueden tener los dos su "inscripcion-2026". */
  slug:          varchar('slug', { length: 120 }).notNull(),
  activo:        boolean('activo').notNull().default(true),
  /** ICampo[] del constructor. */
  campos:        jsonb('campos').notNull().default([]),
  /** Colores, logo, mensaje de confirmación, expiración, tope de envíos. */
  configuracion: jsonb('configuracion').notNull().default({}),
  vistas:        integer('vistas').notNull().default(0),
  envios:        integer('envios').notNull().default(0),
  creadoPor:     integer('creado_por').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_escolar_formularios_slug_idx').on(t.teamId, t.slug),
  index('admin_escolar_formularios_team_idx').on(t.teamId, t.activo),
]);

/**
 * Lo que respondió una familia. `datos` guarda TODO por id de campo — lo
 * accesorio se queda solo ahí. Lo que además tiene `mapaA` en el campo baja a
 * su columna real del estudiante o del tutor, pero solo cuando alguien REVISA
 * y aplica la respuesta (estado 'aplicada'): aplicar automáticamente lo que
 * escribe un padre en un enlace público dejaría que cualquiera con el enlace
 * reescribiera la dirección o el teléfono de un menor. Esa es la diferencia
 * deliberada con el CRM, donde una respuesta es un lead y un blob basta.
 */
export const adminEscolarFormularioRespuestas = pgTable('admin_escolar_formulario_respuestas', {
  id:               serial('id').primaryKey(),
  teamId:           integer('team_id').notNull().references(() => teams.id),
  formularioId:     integer('formulario_id').notNull().references(() => adminEscolarFormularios.id, { onDelete: 'cascade' }),
  /** Copiado al responder: si renombran el formulario después, la respuesta
   *  sigue diciendo a qué contestó la familia. */
  formularioNombre: varchar('formulario_nombre', { length: 200 }).notNull(),
  /** NULL si llegó por un enlace abierto y todavía nadie la ha emparejado con
   *  un alumno. */
  estudianteId:     integer('estudiante_id').references(() => adminEscolarEstudiantes.id, { onDelete: 'set null' }),
  matriculaId:      integer('matricula_id').references(() => adminEscolarMatriculas.id, { onDelete: 'set null' }),
  datos:            jsonb('datos').notNull().default({}),
  /** 'borrador' | 'pendiente' | 'aplicada' | 'rechazada'.
   *  'borrador' es una ficha a medio llenar: NO cuenta como respuesta y no
   *  debe aparecerle al colegio en la bandeja. */
  estado:           varchar('estado', { length: 20 }).notNull().default('pendiente'),
  /** Llave del enlace de continuación (`/f/<slug>/r/<token>`). 32 bytes al
   *  azar en base64url. NULL en las respuestas enviadas de una sentada. */
  token:            varchar('token', { length: 43 }),
  /** Por qué paso iba, para devolverlo donde lo dejó y no al principio. */
  pagina:           integer('pagina').notNull().default(0),
  /** Cuándo se envió de verdad. NULL mientras sea borrador. */
  enviadoEn:        timestamp('enviado_en'),
  aplicadaEn:       timestamp('aplicada_en'),
  aplicadaPor:      integer('aplicada_por').references(() => users.id),
  motivo:           text('motivo'),
  /** Para rastrear un envío raro. No se usa para identificar a nadie. */
  ip:               varchar('ip', { length: 60 }),
  userAgent:        text('user_agent'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('admin_escolar_form_resp_form_idx').on(t.formularioId, t.createdAt),
  uniqueIndex('admin_escolar_form_resp_token_idx').on(t.token),
  index('admin_escolar_form_resp_estudiante_idx').on(t.estudianteId),
  index('admin_escolar_form_resp_pendientes_idx').on(t.teamId, t.estado),
]);

export type AdminEscolarFormulario           = typeof adminEscolarFormularios.$inferSelect;
export type NewAdminEscolarFormulario        = typeof adminEscolarFormularios.$inferInsert;
export type AdminEscolarFormularioRespuesta    = typeof adminEscolarFormularioRespuestas.$inferSelect;
export type NewAdminEscolarFormularioRespuesta = typeof adminEscolarFormularioRespuestas.$inferInsert;

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
export type PagoAdjunto     = typeof pagoAdjuntos.$inferSelect;
export type NewPagoAdjunto  = typeof pagoAdjuntos.$inferInsert;
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

// ─── Contabilidad: catálogo de cuentas (Paso 2) ──────────────────────────────
// El mapa contable de cada empresa. Aquí no hay movimientos: los asientos
// llegan en el Paso 4. No toca products ni ecf_documents — la relación con las
// entidades genéricas se resuelve en el Paso 3 y apunta hacia la cuenta.

/** Cuenta del catálogo contable. Jerárquica por self-FK; solo las hojas imputan. */
export const contabilidadCuentas = pgTable('contabilidad_cuentas', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  /** Estable: inmutable una vez que la cuenta tiene movimientos. */
  codigo:  varchar('codigo', { length: 20 }).notNull(),
  nombre:  varchar('nombre', { length: 120 }).notNull(),
  /** activo | pasivo | patrimonio | ingreso | costo | gasto */
  tipo:    varchar('tipo', { length: 20 }).notNull(),
  /**
   * deudora | acreedora. Se guarda, no se deriva de `tipo`: las cuentas de
   * contrapartida invierten la naturaleza de su clase (ej. "Descuentos y
   * devoluciones sobre ventas" es ingreso de naturaleza deudora).
   */
  naturaleza:    varchar('naturaleza', { length: 10 }).notNull(),
  /** NULL = cuenta raíz. Mismo team y sin ciclos: se valida en la aplicación. */
  cuentaPadreId: integer('cuenta_padre_id'),
  /** Si acepta asientos directos. Las cuentas padre agrupan, no imputan. */
  imputable: boolean('imputable').notNull().default(true),
  /** Desactivar en vez de borrar: los reportes históricos deben seguir cuadrando. */
  activa:    boolean('activa').notNull().default(true),
  /** Creada por la siembra del catálogo base, no por el usuario. */
  esBase:    boolean('es_base').notNull().default(false),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contabilidad_cuentas_team_codigo_idx').on(t.teamId, t.codigo),
  index('contabilidad_cuentas_padre_idx').on(t.teamId, t.cuentaPadreId),
]);

export type ContabilidadCuenta    = typeof contabilidadCuentas.$inferSelect;
export type NewContabilidadCuenta = typeof contabilidadCuentas.$inferInsert;

// ─── Contabilidad: configuración de cuentas automáticas (Paso 3) ─────────────
// Traduce operaciones a cuentas sin preguntarle al usuario en cada factura.
// No genera asientos — eso es el Paso 4; esto solo dice DÓNDE va cada cosa.

/** Cuentas generales + el interruptor del módulo. Una fila por empresa. */
export const contabilidadConfig = pgTable('contabilidad_config', {
  teamId: integer('team_id').primaryKey().references(() => teams.id),
  /**
   * Modo "sin contabilidad" del plan. Arranca apagado: entrar a la pantalla no
   * hace que la empresa empiece a generar asientos. La API se niega a
   * encenderlo mientras falte configuración.
   */
  activa: boolean('activa').notNull().default(false),
  cuentaPorCobrarId: integer('cuenta_por_cobrar_id').references(() => contabilidadCuentas.id),
  cuentaItbisId:     integer('cuenta_itbis_id').references(() => contabilidadCuentas.id),
  cuentaIngresosId:  integer('cuenta_ingresos_id').references(() => contabilidadCuentas.id),
  cuentaDescuentosId: integer('cuenta_descuentos_id').references(() => contabilidadCuentas.id),
  cuentaMoraId:      integer('cuenta_mora_id').references(() => contabilidadCuentas.id),
  /** Pasivo: el sobrante de una nota de crédito es dinero que se le debe al cliente. */
  cuentaSaldosFavorId: integer('cuenta_saldos_favor_id').references(() => contabilidadCuentas.id),
  /** Activo: lo que el cliente retuvo deja un crédito fiscal, no un menor ingreso. */
  cuentaRetencionesId: integer('cuenta_retenciones_id').references(() => contabilidadCuentas.id),
  /** Nivel 3.2 — destino de las compras de inventario (Debe). Default 1105. */
  cuentaInventarioId: integer('cuenta_inventario_id').references(() => contabilidadCuentas.id),
  /** Nivel 3.2 — el pasivo de una compra a crédito (Haber). Default 2101. */
  cuentaPorPagarId:   integer('cuenta_por_pagar_id').references(() => contabilidadCuentas.id),
  /** Nivel 3.2 — cuenta de gasto de la caja chica (Debe). Default 6101. */
  cuentaGastosId:     integer('cuenta_gastos_id').references(() => contabilidadCuentas.id),
  /** Nivel 4.2 — activo fijo, donde se registra el bien (Debe al alta). Default 1201. */
  cuentaActivoFijoId:  integer('cuenta_activo_fijo_id').references(() => contabilidadCuentas.id),
  /** Nivel 4.2 — depreciación acumulada, contra-activo (Haber mensual). Default 1202. */
  cuentaDeprecAcumId:  integer('cuenta_deprec_acum_id').references(() => contabilidadCuentas.id),
  /** Nivel 4.2 — gasto por depreciación (Debe mensual). Default 6103. */
  cuentaGastoDeprecId: integer('cuenta_gasto_deprec_id').references(() => contabilidadCuentas.id),
  /** Nivel 4.3 — exento capitaliza ITBIS; gravado registra crédito fiscal 1104. */
  regimenItbis: varchar('regimen_itbis', { length: 10 }).notNull().default('exento'),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Cuenta por método de cobro.
 *
 * `clave` NO es `pagosRecibidos.metodo` tal cual: un cobro por CardNet/Azul se
 * guarda como `metodo='tarjeta'` y solo se distingue por el vínculo desde
 * `paymentLinks`. Contablemente son distintos — el cobro en línea no entra al
 * banco hasta que la pasarela liquida. Lo resuelve `claveContableDePago()`.
 */
export const contabilidadConfigMetodosPago = pgTable('contabilidad_config_metodos_pago', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  clave:   varchar('clave', { length: 30 }).notNull(),
  cuentaId: integer('cuenta_id').notNull().references(() => contabilidadCuentas.id),
  /** Solo pasarelas: la comisión retenida al liquidar. Es gasto, no menor ingreso. */
  cuentaComisionId: integer('cuenta_comision_id').references(() => contabilidadCuentas.id),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contabilidad_config_metodos_team_clave_idx').on(t.teamId, t.clave),
]);

/**
 * Override de la cuenta de ingreso por categoría o producto. Exactamente uno de
 * los dos va seteado (lo obliga un CHECK).
 *
 * Resolución: producto → categoría → tipo del producto → ingresos general.
 */
export const contabilidadConfigIngresos = pgTable('contabilidad_config_ingresos', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  categoriaId: integer('categoria_id').references(() => categorias.id),
  productoId:  integer('producto_id').references(() => products.id),
  cuentaId: integer('cuenta_id').notNull().references(() => contabilidadCuentas.id),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Contabilidad: asientos (Paso 4) ─────────────────────────────────────────
// Donde el módulo empieza a escribir números. Partida doble: cada asiento tiene
// líneas de débito y de crédito que suman lo mismo.

/** Encabezado del asiento. Un origen produce exactamente uno (índice único). */
export const contabilidadAsientos = pgTable('contabilidad_asientos', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  /** Fecha contable del hecho, no del registro. */
  fecha:   date('fecha').notNull(),
  concepto: varchar('concepto', { length: 255 }).notNull(),
  /** 'factura' | 'pago' | 'nota' | 'anulacion' (los dos últimos, Paso 5). */
  origenTipo: varchar('origen_tipo', { length: 20 }).notNull(),
  origenId:   integer('origen_id').notNull(),
  /** debe == haber == esto. Lo garantiza la aplicación antes de insertar. */
  totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contabilidad_asientos_origen_idx').on(t.teamId, t.origenTipo, t.origenId),
  index('contabilidad_asientos_team_fecha_idx').on(t.teamId, t.fecha),
]);

/** Apunte. Es débito o crédito, nunca los dos ni ninguno (lo obliga un CHECK). */
export const contabilidadAsientoLineas = pgTable('contabilidad_asiento_lineas', {
  id:        serial('id').primaryKey(),
  asientoId: integer('asiento_id').notNull().references(() => contabilidadAsientos.id),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  cuentaId:  integer('cuenta_id').notNull().references(() => contabilidadCuentas.id),
  debeCents:  bigint('debe_cents', { mode: 'number' }).notNull().default(0),
  haberCents: bigint('haber_cents', { mode: 'number' }).notNull().default(0),
  descripcion: varchar('descripcion', { length: 255 }),
  orden:      integer('orden').notNull().default(0),
}, (t) => [
  index('contabilidad_asiento_lineas_asiento_idx').on(t.asientoId, t.orden),
  index('contabilidad_asiento_lineas_cuenta_idx').on(t.teamId, t.cuentaId),
]);

export type ContabilidadAsiento      = typeof contabilidadAsientos.$inferSelect;
export type ContabilidadAsientoLinea = typeof contabilidadAsientoLineas.$inferSelect;

// ─── Contabilidad: activos fijos y depreciación (Nivel 4.2) ──────────────────
// El sistema deprecia solo, método lineal, una cuota por mes por activo. El
// activo fijo ES del dominio contable: tabla propia, no se contamina inventario.

/** Inventario de activos fijos: costo, valor residual y vida útil en meses. */
export const contabilidadActivosFijos = pgTable('contabilidad_activos_fijos', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  nombre:  varchar('nombre', { length: 160 }).notNull(),
  costoCents: bigint('costo_cents', { mode: 'number' }).notNull(),
  /** Piso de la depreciación: nunca se deprecia por debajo de esto. */
  valorResidualCents: bigint('valor_residual_cents', { mode: 'number' }).notNull().default(0),
  vidaUtilMeses: integer('vida_util_meses').notNull(),
  fechaAdquisicion: date('fecha_adquisicion').notNull(),
  /** Baja lógica: deja de generar cuotas, pero conserva su historia. */
  activa:    boolean('activa').notNull().default(true),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('contabilidad_activos_fijos_team_idx').on(t.teamId, t.activa),
]);

/**
 * Cuota de depreciación ya generada. El único (team, activo, periodo) es la
 * idempotencia mensual: un activo no se deprecia dos veces el mismo mes.
 */
export const contabilidadDepreciaciones = pgTable('contabilidad_depreciaciones', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  activoId:  integer('activo_id').notNull().references(() => contabilidadActivosFijos.id),
  /** Primer día del mes depreciado. */
  periodo:   date('periodo').notNull(),
  montoCents: bigint('monto_cents', { mode: 'number' }).notNull(),
  asientoId: integer('asiento_id').references(() => contabilidadAsientos.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contabilidad_depreciaciones_periodo_uq').on(t.teamId, t.activoId, t.periodo),
  index('contabilidad_depreciaciones_activo_idx').on(t.teamId, t.activoId),
]);

export type ContabilidadActivoFijo    = typeof contabilidadActivosFijos.$inferSelect;
export type ContabilidadDepreciacion  = typeof contabilidadDepreciaciones.$inferSelect;

// ─── Contabilidad: cierre de ejercicio (cierre anual) ────────────────────────
// Un asiento de cierre lleva los saldos de resultado (4/5/6) a 3102 al terminar
// el año. El único (team, ejercicio) impide cerrar dos veces el mismo año.

export const contabilidadCierres = pgTable('contabilidad_cierres', {
  id:        serial('id').primaryKey(),
  teamId:    integer('team_id').notNull().references(() => teams.id),
  /** El año que se cierra (p. ej. 2025). */
  ejercicio: integer('ejercicio').notNull(),
  fechaCierre: date('fecha_cierre').notNull(),
  /** Resultado del ejercicio: utilidad (+) o pérdida (−). */
  resultadoCents: bigint('resultado_cents', { mode: 'number' }).notNull(),
  asientoId: integer('asiento_id').references(() => contabilidadAsientos.id),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contabilidad_cierres_ejercicio_uq').on(t.teamId, t.ejercicio),
]);

export type ContabilidadCierre = typeof contabilidadCierres.$inferSelect;

export type ContabilidadConfig       = typeof contabilidadConfig.$inferSelect;
export type ContabilidadConfigMetodo = typeof contabilidadConfigMetodosPago.$inferSelect;
export type ContabilidadConfigIngreso = typeof contabilidadConfigIngresos.$inferSelect;

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

// ─── Integración SIGERD (MINERD) ────────────────────────────────────────────

/**
 * Trabajo de sincronización + snapshot fiel de un centro en SIGERD.
 *
 * Una fila por (team, centro, año académico). Cumple TRES roles:
 *  1. CANDADO de concurrencia: `estado='corriendo'` bloquea otra sync del mismo
 *     colegio. La lógica de "una a la vez" se apoya en esto.
 *  2. ESTADO para la UI: `pendiente | corriendo | error | completado` + mensaje.
 *  3. ARCHIVO fiel: `dump` guarda TODO lo que SIGERD entregó (estructura +
 *     estudiantes + condición + personal + fichas). Así no hay que reconectar:
 *     el dato ya vive aquí.
 */
export const sigerdImportaciones = pgTable('sigerd_importaciones', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  /** Se llena tras la descarga (sale de la sesión SIGERD). El candado se
   *  identifica por (team, año), no por centro — un colegio = un centro. */
  idCentro:      integer('id_centro'),
  idRegional:    integer('id_regional'),
  idDistrito:    integer('id_distrito'),
  anoAcademico:  integer('ano_academico').notNull(),
  /** pendiente | corriendo | error | completado */
  estado:        varchar('estado', { length: 20 }).notNull().default('pendiente'),
  /** Último mensaje: progreso o causa del error (ej. "SIGERD no disponible"). */
  mensaje:       text('mensaje'),
  /** Volcado completo (DumpCentro). Se llena al completar. */
  dump:          jsonb('dump'),
  nEstudiantes:  integer('n_estudiantes'),
  nSecciones:    integer('n_secciones'),
  nEmpleados:    integer('n_empleados'),
  iniciadoEn:    timestamp('iniciado_en'),
  completadoEn:  timestamp('completado_en'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sigerd_importaciones_team_ano_uniq').on(t.teamId, t.anoAcademico),
  index('sigerd_importaciones_estado_idx').on(t.estado),
]);

/**
 * Empleado del centro proyectado desde SIGERD. El módulo escolar no tiene tabla
 * de personal, así que vive aquí — consultable por cargo. Se repuebla en cada
 * sync (upsert por `sigerd_id_persona`).
 */
/**
 * Credenciales de SIGERD del colegio, para reconectar sin intervención.
 *
 * Rompe a propósito la regla que seguía `lib/sigerd/sesion-cookie.ts` —"la
 * contraseña no se persiste en ningún lado"—, y conviene saber por qué: traer
 * los expedientes de un colegio son ~1.860 llamadas y unos 25 minutos, y la
 * sesión del portal dura menos. Sin reconexión automática, la importación no
 * termina nunca.
 *
 * Lo que cuesta: quien consiga la base Y la llave de cifrado entra al portal
 * como el colegio. La llave vive en el entorno, jamás en la base, así que hacen
 * falta las dos piezas. Es la misma postura que con los certificados fiscales.
 *
 * La contraseña NO se devuelve nunca por la API: se escribe, no se consulta.
 */
export const sigerdCredenciales = pgTable('sigerd_credenciales', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').notNull().references(() => teams.id),
  /** Cédula con la que se entra. No es secreta: el portal la pide a la vista. */
  usuario: varchar('usuario', { length: 20 }).notNull(),
  // Las tres piezas de AES-256-GCM, separadas y no en un blob: así se ve de un
  // vistazo que hay authTag, sin el cual el descifrado no detecta manipulación.
  claveCifrada: text('clave_cifrada').notNull(),
  claveIv:      varchar('clave_iv', { length: 32 }).notNull(),
  claveTag:     varchar('clave_tag', { length: 32 }).notNull(),
  /** Perfil elegido cuando la cédula pertenece a varios centros. */
  idCentro:     integer('id_centro'),
  centroNombre: varchar('centro_nombre', { length: 200 }),
  /** Última vez que el portal las aceptó. */
  verificadoEn: timestamp('verificado_en'),
  /** Motivo del último fallo, para poder decirle al colegio qué pasó. */
  ultimoError:  varchar('ultimo_error', { length: 300 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  // Una sola por colegio: dos juegos para el mismo centro solo sirven para que
  // la mitad de las importaciones use el caducado.
  uniqueIndex('sigerd_credenciales_team_uniq').on(t.teamId),
]);

export const sigerdPersonal = pgTable('sigerd_personal', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  idCentro:       integer('id_centro').notNull(),
  /** IdPersona de SIGERD. Clave estable de reconciliación. */
  sigerdIdPersona: integer('sigerd_id_persona').notNull(),
  cedula:         varchar('cedula', { length: 20 }),
  nombres:        varchar('nombres', { length: 160 }),
  apellidos:      varchar('apellidos', { length: 160 }),
  cargo:          varchar('cargo', { length: 120 }),
  estado:         varchar('estado', { length: 40 }),
  sexo:           varchar('sexo', { length: 20 }),
  fechaNacimiento: date('fecha_nacimiento'),
  nacionalidad:   varchar('nacionalidad', { length: 60 }),
  telefono:       varchar('telefono', { length: 30 }),
  email:          varchar('email', { length: 160 }),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('sigerd_personal_persona_uniq').on(t.teamId, t.sigerdIdPersona),
  index('sigerd_personal_team_idx').on(t.teamId),
]);

/**
 * Personal AGREGADO A MANO por el colegio (no viene de SIGERD). Es el "overlay"
 * editable sobre el mirror de solo-lectura `sigerd_personal`: la sync NUNCA toca
 * esta tabla, así lo que el usuario escribe no se pierde al re-sincronizar.
 *
 * La pantalla Personal une ambas: filas de SIGERD (read-only) + estas (editables
 * y borrables). `sigerdIdPersona` queda para un futuro enlace/reconciliación,
 * hoy siempre null (alta manual pura).
 */
export const escolarPersonal = pgTable('escolar_personal', {
  id:              serial('id').primaryKey(),
  teamId:          integer('team_id').notNull().references(() => teams.id),
  /** Enlace opcional a una persona de SIGERD (reconciliación futura). Hoy null. */
  sigerdIdPersona: integer('sigerd_id_persona'),
  cedula:          varchar('cedula', { length: 20 }),
  nombres:         varchar('nombres', { length: 160 }),
  apellidos:       varchar('apellidos', { length: 160 }),
  cargo:           varchar('cargo', { length: 120 }),
  /** 'maestro' | 'otro'. Si null, se deriva del cargo como en las filas SIGERD. */
  tipo:            varchar('tipo', { length: 20 }),
  estado:          varchar('estado', { length: 40 }).notNull().default('Activo'),
  sexo:            varchar('sexo', { length: 20 }),
  fechaNacimiento: date('fecha_nacimiento'),
  nacionalidad:    varchar('nacionalidad', { length: 60 }),
  telefono:        varchar('telefono', { length: 30 }),
  email:           varchar('email', { length: 160 }),
  notas:           text('notas'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('escolar_personal_team_idx').on(t.teamId),
]);

// ── WhatsApp — conexión por negocio (vía crm-escolar, API pública /api/v1) ────
// Ver docs/superpowers/specs/2026-08-03-whatsapp-conexion-envio-design.md.
export const whatsappConfig = pgTable('whatsapp_config', {
  id:       serial('id').primaryKey(),
  teamId:   integer('team_id').notNull().unique().references(() => teams.id),
  negocioId: text('negocio_id').notNull(),

  apiKeyCiphered: text('api_key_ciphered').notNull(),
  apiKeyIv:       text('api_key_iv').notNull(),
  apiKeyAuthTag:  text('api_key_auth_tag').notNull(),

  webhookSecretCiphered: text('webhook_secret_ciphered'),
  webhookSecretIv:       text('webhook_secret_iv'),
  webhookSecretAuthTag:  text('webhook_secret_auth_tag'),

  conectado:      boolean('conectado').notNull().default(false),
  numeroWhatsapp: text('numero_whatsapp'),

  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
});

/** Una variable del cuerpo. Meta solo conoce la posición; el resto es nuestro. */
export interface VariablePlantilla {
  pos: number;
  nombre: string;
  tipo: 'texto' | 'monto' | 'fecha';
  ejemplo: string;
}

/**
 * El botón de una plantilla. Meta admite UNA variable en la URL y solo al
 * final, siempre numerada `{{1}}` aunque el cuerpo tenga otras.
 */
export interface BotonPlantilla {
  /** Máx. 25 caracteres. */
  texto: string;
  url: string;
  /** La URL completa con la variable resuelta. Meta lo exige si hay variable. */
  ejemplo: string;
}

/**
 * El contenido de las plantillas de WhatsApp.
 *
 * Meta manda sobre el ESTADO (aprobada / en revisión / rechazada); esta tabla
 * manda sobre el CONTENIDO, porque el CRM no lo devuelve. Se cruzan por
 * (nombre, idioma). Ver lib/whatsapp/plantillas.ts.
 */
export const whatsappPlantillas = pgTable('whatsapp_plantillas', {
  id:        serial('id').primaryKey(),
  nombre:    varchar('nombre', { length: 128 }).notNull(),
  idioma:    varchar('idioma', { length: 8 }).notNull().default('es'),
  categoria: varchar('categoria', { length: 24 }).notNull().default('utility'),

  cuerpo:     text('cuerpo').notNull(),
  encabezado: text('encabezado'),
  pie:        text('pie'),

  /** NULL = disponible para todos los negocios. */
  teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),

  /** Mientras es borrador no existe en Meta y se puede editar. */
  borrador:   boolean('borrador').notNull().default(true),
  metaId:     varchar('meta_id', { length: 128 }),
  metaEstado: varchar('meta_estado', { length: 32 }),

  variables: jsonb('variables').$type<VariablePlantilla[]>().notNull().default([]),
  /** Botón de enlace. NULL = sin botón. */
  boton: jsonb('boton').$type<BotonPlantilla | null>(),

  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
});

/**
 * Qué plantilla aprobada usa cada aviso escolar.
 *
 * `teamId` NULL es la asignación por defecto de la plataforma: la que se usa
 * cuando el colegio no tiene la suya. Ver lib/whatsapp/plantillas.ts.
 */
export const whatsappPlantillasAviso = pgTable('whatsapp_plantillas_aviso', {
  id:      serial('id').primaryKey(),
  teamId:  integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  /** Uno de los 5 huecos: al-emitir, al-vencer-*, antes-mora. */
  aviso:            varchar('aviso', { length: 32 }).notNull(),
  plantillaNombre:  varchar('plantilla_nombre', { length: 128 }).notNull(),
  /**
   * La versión con botón «Ver factura», para cuando el cargo YA está facturado.
   *
   * Vacío = ese colegio no tiene versión con enlace y usa siempre la de arriba.
   * Un cargo sin factura no se puede cobrar, así que mandarle el enlace lleva
   * al padre a transferir para que nadie pueda aplicarlo.
   */
  plantillaConLink: varchar('plantilla_con_link', { length: 128 }),
  idioma:           varchar('idioma', { length: 8 }).notNull().default('es'),
  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
});

export const whatsappMensajes = pgTable('whatsapp_mensajes', {
  id:             serial('id').primaryKey(),
  teamId:         integer('team_id').notNull().references(() => teams.id),
  telefono:       text('telefono').notNull(),
  nombreContacto: text('nombre_contacto'),
  texto:          text('texto'),
  tipo:           text('tipo').notNull(),
  conversationId: text('conversation_id').notNull(),
  messageId:      text('message_id').notNull().unique(),
  recibidoEn:     timestamp('recibido_en').notNull().defaultNow(),
}, (t) => ({
  teamIdx: index('whatsapp_mensajes_team_idx').on(t.teamId, t.recibidoEn),
}));

export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type WhatsappMensaje = typeof whatsappMensajes.$inferSelect;

// ── Fotos — genéricas por entidad (ver lib/fotos/) ───────────────────────────
// La foto no es una columna de cada tabla: (entidad, entidadId) permite que un
// solo componente y un solo par de endpoints sirvan a estudiantes, personal,
// productos y el logo de la empresa. Ver migración 0108_fotos.sql.

export const fotos = pgTable('fotos', {
  id:            serial('id').primaryKey(),
  teamId:        integer('team_id').notNull().references(() => teams.id),
  /** Clave del registro de lib/fotos/entidades.ts ('estudiante', 'personal'…). */
  entidad:       varchar('entidad', { length: 30 }).notNull(),
  entidadId:     integer('entidad_id').notNull(),
  /** Ref de storage: 's3:<key>' o 'data:image/jpeg;base64,…'. */
  ref:           text('ref').notNull(),
  refMiniatura:  text('ref_miniatura'),
  bytes:         integer('bytes').notNull().default(0),
  ancho:         integer('ancho'),
  alto:          integer('alto'),
  /** 'movil' (capturada por QR) | 'archivo' (subida desde el escritorio). */
  origen:        varchar('origen', { length: 20 }).notNull().default('archivo'),
  subidaPor:     integer('subida_por').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fotos_entidad_uniq').on(t.teamId, t.entidad, t.entidadId),
]);

/** Sesión de captura: el permiso temporal que lleva el QR al teléfono. */
export const fotosSesiones = pgTable('fotos_sesiones', {
  id:         serial('id').primaryKey(),
  teamId:     integer('team_id').notNull().references(() => teams.id),
  entidad:    varchar('entidad', { length: 30 }).notNull(),
  entidadId:  integer('entidad_id').notNull(),
  /** SHA-256 del token. El token en claro solo vive en el QR y en la URL. */
  tokenHash:  char('token_hash', { length: 64 }).notNull(),
  expiraEn:   timestamp('expira_en').notNull(),
  /** Sellada al subir la foto: un token sirve para una sola captura. */
  usadaEn:    timestamp('usada_en'),
  fotoId:     integer('foto_id').references(() => fotos.id, { onDelete: 'set null' }),
  creadaPor:  integer('creada_por').references(() => users.id),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fotos_sesiones_token_uniq').on(t.tokenHash),
  index('fotos_sesiones_expira_idx').on(t.expiraEn),
]);

export type Foto        = typeof fotos.$inferSelect;
export type NewFoto     = typeof fotos.$inferInsert;
export type FotoSesion  = typeof fotosSesiones.$inferSelect;
