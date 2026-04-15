CREATE TABLE "almacenes" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"direccion" varchar(500),
	"observacion" text,
	"es_default" varchar(5) DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"permisos" text DEFAULT 'read' NOT NULL,
	"ultimo_uso_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"descripcion" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"client_id" integer,
	"numero" varchar(20) NOT NULL,
	"estado" varchar(20) DEFAULT 'borrador' NOT NULL,
	"razon_social_comprador" varchar(255),
	"rnc_comprador" varchar(11),
	"email_comprador" varchar(255),
	"fecha_emision" timestamp DEFAULT now() NOT NULL,
	"fecha_vencimiento" timestamp,
	"monto_subtotal" integer DEFAULT 0 NOT NULL,
	"monto_descuento" integer DEFAULT 0 NOT NULL,
	"total_itbis" integer DEFAULT 0 NOT NULL,
	"monto_total" integer DEFAULT 0 NOT NULL,
	"items" text,
	"notas" text,
	"terminos_condiciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "facturas_recurrentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"client_id" integer,
	"nombre" varchar(100) NOT NULL,
	"tipo_ecf" varchar(2) DEFAULT '31' NOT NULL,
	"tipo_pago" integer DEFAULT 1 NOT NULL,
	"frecuencia" varchar(20) DEFAULT 'mensual' NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date,
	"proxima_emision" date NOT NULL,
	"estado" varchar(20) DEFAULT 'activa' NOT NULL,
	"items" text DEFAULT '[]' NOT NULL,
	"notas" text,
	"total_estimado" integer DEFAULT 0 NOT NULL,
	"facturas_emitidas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listas_precios" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"tipo" varchar(10) DEFAULT 'valor' NOT NULL,
	"porcentaje" integer DEFAULT 0 NOT NULL,
	"es_descuento" varchar(5) DEFAULT 'true' NOT NULL,
	"descripcion" text,
	"es_default" varchar(5) DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listas_precios_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"lista_precios_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"precio" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(64) NOT NULL,
	"eventos" text DEFAULT 'ecf.emitido' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_disparo" timestamp,
	"ultimo_estatus" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"ecf_document_id" integer,
	"monto" integer DEFAULT 0 NOT NULL,
	"metodo" varchar(50),
	"referencia" varchar(255),
	"notas" text,
	"fecha" date NOT NULL,
	"registrado_por_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnc_padron" (
	"rnc" varchar(20) PRIMARY KEY NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"nombre_comercial" varchar(255),
	"categoria" varchar(3),
	"estado" varchar(2) DEFAULT '2',
	"actividad" varchar(10),
	"actualizado_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer,
	"user_id" integer,
	"level" varchar(10) DEFAULT 'error' NOT NULL,
	"source" varchar(255),
	"message" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"identificacion" varchar(100),
	"observacion" text,
	"activo" varchar(5) DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "total_retenciones" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "terminos_condiciones" text;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pie_factura" text;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "retenciones" text;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "comentario" text;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pago_recibido" varchar(5) DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pago_metodo" varchar(30);--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pago_cuenta" varchar(100);--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pago_valor_cts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD COLUMN "pago_fecha" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_recurrentes" ADD CONSTRAINT "facturas_recurrentes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_recurrentes" ADD CONSTRAINT "facturas_recurrentes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios" ADD CONSTRAINT "listas_precios_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios_items" ADD CONSTRAINT "listas_precios_items_lista_precios_id_listas_precios_id_fk" FOREIGN KEY ("lista_precios_id") REFERENCES "public"."listas_precios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_precios_items" ADD CONSTRAINT "listas_precios_items_producto_id_products_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ecf_document_id_ecf_documents_id_fk" FOREIGN KEY ("ecf_document_id") REFERENCES "public"."ecf_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_registrado_por_id_users_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_team_idx" ON "api_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "evt_token_idx" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "prt_token_idx" ON "password_reset_tokens" USING btree ("token");