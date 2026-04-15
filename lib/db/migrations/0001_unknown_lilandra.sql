CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"rnc" varchar(11),
	"razon_social" varchar(255) NOT NULL,
	"email" varchar(255),
	"telefono" varchar(20),
	"direccion" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecf_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"client_id" integer,
	"encf" varchar(13) NOT NULL,
	"tipo_ecf" varchar(2) NOT NULL,
	"estado" varchar(30) DEFAULT 'BORRADOR' NOT NULL,
	"track_id" varchar(100),
	"codigo_seguridad" varchar(6),
	"mensajes_dgii" text,
	"xml_original" text,
	"xml_firmado" text,
	"xml_url" text,
	"pdf_url" text,
	"rnc_comprador" varchar(11),
	"razon_social_comprador" varchar(255),
	"email_comprador" varchar(255),
	"monto_total" integer DEFAULT 0 NOT NULL,
	"total_itbis" integer DEFAULT 0 NOT NULL,
	"ncf_modificado" varchar(13),
	"fecha_emision" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"tipo_ecf" varchar(2) NOT NULL,
	"secuencia_actual" bigint NOT NULL,
	"secuencia_hasta" bigint NOT NULL,
	"fecha_vencimiento" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sequences_team_tipo_unique" UNIQUE("team_id","tipo_ecf")
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "rnc" varchar(11);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "razon_social" varchar(255);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "nombre_comercial" varchar(255);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "direccion" varchar(500);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cert_p12" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cert_password" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "dgii_environment" varchar(20) DEFAULT 'TesteCF';--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "dgii_token" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "dgii_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;