CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"descripcion" text,
	"referencia" varchar(100),
	"precio" integer DEFAULT 0 NOT NULL,
	"tasa_itbis" varchar(6) DEFAULT '0.18' NOT NULL,
	"tipo" varchar(10) DEFAULT 'servicio' NOT NULL,
	"activo" varchar(5) DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;