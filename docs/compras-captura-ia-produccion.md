# Compras por foto con IA — notas para producción

**Rama:** `feat/compras-captura-ia` (base v2) · **Estado:** completo y verificado en pruebas (navegador + celular), migración aplicada solo al branch aislado `ep-long-mud`. **Sin push / sin PR** todavía.

## Qué hace

El negocio genera **un enlace permanente** (revocable, sin vencimiento) que puede compartir o imprimir como QR. Quien lo abre —sin cuenta de Zero— ve una cámara, fotografía la factura del proveedor y la envía. Zero la interpreta:

1. **QR de la DGII primero** (si el e-CF trae QR y el navegador puede leerlo): datos deterministas, sin IA.
2. **IA de visión (Gemini Flash)** si no hay QR: lee proveedor, RNC, NCF, fecha, subtotal, ITBIS, total y líneas.

El resultado **nunca entra a los libros solo**: cae como **borrador** en una cola (pestaña *Capturas*) que alguien con sesión revisa y registra desde la pantalla de compras normal.

**Salvaguardas ya implementadas:** normalización fiscal (RNC a dígitos, NCF validado, montos en centavos), aviso si el **año** de la fecha se leyó raro, chequeos de **aritmética** (subtotal+ITBIS>total, ITBIS desproporcionado, líneas que no suman), **dedup** por NCF, autocompletar proveedor por RNC desde el historial, y tope de capturas pendientes por enlace.

**Resultado de pruebas:** subidas de PNG desde PC = 100% exactas. Fotos de celular: tras subir la resolución que se manda al modelo (1600px), leyeron perfecto incluidas NCF y fecha (antes fallaban esos dígitos a 800px).

---

## Contexto de merge / migración (para decidir)

- **PR** `feat/compras-captura-ia` → `v2` pendiente de tu revisión.
- **Migración `0183_compras_captura_ia.sql`**: el número es **provisional**. Choca con la `0181` de `fix/sigerd-candado-idcentro` y la `0182` de `feat/roles-adicionales`. El número final depende de qué rama suba primero a prod → **hay que decidir el orden y renumerar**. Las tres son aditivas e idempotentes.
- Migración de prod se aplica **a mano** (el CI de migraciones solo corre en `main`/`develop`; prod va manual).

---

## Checklist para producción

### B. IA / Gemini — decisión de privacidad (la más importante)

- **Key de tier PAGO o Vertex AI, obligatorio.** El tier gratis de AI Studio **entrena con los datos**; una foto de factura es dato fiscal de terceros → **no es lanzable con la key gratis**. El tier pago/Vertex **no entrena** + da cuota real + SLA.
- **Ojo:** pagar el tier **no mejora la lectura** — es el mismo modelo. Solo cambia privacidad, cuota y disponibilidad. La precisión sube por otras vías (imagen, modelo más grande, validaciones).
- Decidir: quién crea la key (cuenta Google/Cloud de la compañía), quién asume el costo, estimar costo por volumen esperado.
- **Recomendación (fallback de proveedor):** si vamos con **Vertex**, conviene tener también **una API key fuerte de respaldo (Anthropic Claude u OpenAI)** por si Vertex se queda corto —cuota, caída, o un tipo de factura que Gemini lea mal—. El extractor está detrás de una interfaz (`lib/compras/extraer-ticket.ts`), así que cambiar/añadir proveedor es aislado. Tener un segundo proveedor listo evita quedar bloqueados por un solo servicio.
- Variables en Vercel prod: `GOOGLE_GENERATIVE_AI_API_KEY` (o credenciales Vertex) + `GEMINI_MODELO`.

### C. Almacenamiento de fotos (S3)

- En dev sin S3 la foto se guarda **base64 dentro de Postgres** (fallback). En prod hay que **configurar S3** (bucket privado) para no meter imágenes en la base.
- Variables (ver `lib/fotos/storage.ts`): `FOTOS_S3_BUCKET`, `FOTOS_S3_REGION` (o `AWS_REGION`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Decidir bucket, región y política de retención de las imágenes.

### D. Seguridad del enlace público

- El enlace es **público y permanente**. Hoy la única defensa es un tope de **30 capturas pendientes por enlace**.
- Falta **rate-limit real** (por IP / por tiempo) y decidir si hace falta **anti-bot / CAPTCHA** (un enlace público permanente se puede filtrar).
- Confirmar el flujo **regenerar / desactivar** como control ante filtración (ya implementado: regenerar invalida el token viejo al instante).

### E. QR / DGII

- **Validar el formato real del QR de e-CF** contra facturas dominicanas reales. El parser asume los parámetros `RncEmisor`, `ENCF`, `FechaEmision`, `MontoTotal` en la URL del QR; hay que confirmarlo con e-CF reales.
- El QR solo se activa en **contexto seguro** (https o localhost) — regla del navegador. En prod (https) funciona también desde el celular; por LAN http queda apagado y cae a IA.
- **Opcional (validación fuerte del NCF):** fetch a la consulta de la DGII para confirmar que el e-NCF existe y traer datos autoritativos. **No hacerlo síncrono** en la subida (la DGII puede ir lenta/caerse): en segundo plano tras guardar la captura, con timeout corto (~3-4s) y aviso si no responde.

### F. Permisos / gating

- Hoy usa el permiso `productos:gestionar`. Decidir si quieren un permiso propio (p.ej. `compras:captura`).
- Decidir en **qué plan / suscripción** entra la feature (gating por módulo).

### G. Producto / precisión

- **Medir precisión con un set de facturas reales** dominicanas (tickets, e-CF, formatos variados) para decidir si hace falta el modelo **Pro** como fallback o la validación DGII.
- Revisar textos y logo del negocio en la página pública.
- Opcional: cámara **en vivo** con guía de encuadre (requiere `getUserMedia` + https; en prod ya hay https). Hoy usamos `<input capture>` nativo por robustez.

### H. Pruebas finales

- Recorrido end-to-end en prod con la key de pago y facturas reales.
- Ya hay tests unitarios del extractor (QR, normalización, guards, aritmética).

---

## Consideraciones

- **Privacidad es el go/no-go:** con key gratis no se puede lanzar. Punto de partida de cualquier decisión de prod.
- **QR > IA donde exista:** para e-CF con QR, el dato es determinista y gratis. La foto-IA es el caso de tickets sin QR / informales / formatos raros — ahí es donde importa la calidad del modelo.
- **La pantalla de revisión no es opcional:** el enlace es anónimo y la IA puede errar un dígito; nada se registra sin que una persona lo confirme. Es el seguro del diseño.
- **Extractor intercambiable:** si algún día Zero tiene servidores propios, se puede meter OCR/VLM local (PaddleOCR, Qwen) sin tocar enlace/cámara/revisión.

---

## Cómo montar el entorno para probar

### 1. Rama y dependencias
```bash
git checkout feat/compras-captura-ia
pnpm install
```

### 2. Variables de entorno (`.env.local`)
```
# Base de datos de dev (Neon aislada o la que uses)
POSTGRES_URL=postgres://...

# Gemini — key GRATIS de AI Studio para dev (aistudio.google.com -> Get API key).
# Solo facturas de PRUEBA por esta key (el tier gratis entrena con los datos).
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GEMINI_MODELO=gemini-3.6-flash
```
> **Gotcha:** `gemini-2.5-flash` da 404 para keys nuevas. Usar `gemini-3.6-flash` (o listar modelos disponibles de la key). Sin `FOTOS_S3_*`, las fotos se guardan en base64 en la DB (ok para probar).

### 3. Migración
Aplicar `lib/db/migrations/0183_compras_captura_ia.sql` a la DB de dev (a mano con `psql` o con un script que use la conexión de la app). Crea `compras_captura_links` y `compras_capturas`. Es idempotente.

### 4. Correr
```bash
pnpm dev
```
(o el server `emitedo-dev` de `.claude/launch.json`).

### 5. Recorrido de prueba
1. **Compras → botón "Enlace de captura"** → se genera el enlace + QR. Copiar / regenerar / desactivar.
2. Abrir el enlace en otra pestaña (o escanear el QR).
   - **En laptop / localhost**: el QR de la factura sí se lee (contexto seguro).
   - **Desde el celular**: usar la IP de LAN (`http://<ip-de-la-laptop>:3000/...`); ahí el QR queda apagado (http) y va por IA.
3. **"Tomar foto"** → subir/tirar la foto de la factura → ver lo que leyó.
4. **Compras → pestaña "Capturas"** → **Registrar** (form prellenado) o **Descartar**.

### 6. Notas para el demo
- Key gratis → **solo facturas inventadas**.
- El QR solo enciende en localhost o https (en prod funciona desde el celular).
- Si el celular no abre la página: revisar VPN (bloquea LAN), firewall del puerto 3000, y que esté en la misma wifi.
