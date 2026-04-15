ALTER TABLE "teams" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "firma" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "telefono" varchar(30);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "sitio_web" varchar(200);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "email_facturacion" varchar(255);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "color_primario" varchar(7) DEFAULT '#1e40af';