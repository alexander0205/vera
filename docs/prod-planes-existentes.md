# Planes de arranque para las empresas que ya existen en producción

No es una migración. Va a mano, con `psql`, contra producción, **después** de
correr 0129→0138 (que son las que crean `plan_name` y `adicionales`). Vive aquí
para que quede el rastro de qué se le concedió a quién y por qué.

> Va en `.md` y no en `.sql` a propósito: `.gitignore` bloquea `*.sql` fuera de
> `lib/db/migrations/` para que ningún dump de base entre al repo por descuido,
> y esa regla no se salta por comodidad.

## Qué se concede

| Empresa | Plan | POS |
|---|---|---|
| Todas | `multisucursal` — e-CF **sin tope**, 8 usuarios | sí |
| Yomalia (id 19) | `multisucursal` | **no**, por instrucción expresa |

Nadie paga por esto. Las 14 empresas reales llevan `subscription_status =
'admin'`, que en `lib/suscripcion/estado.ts` devuelve acceso abierto sin pasar
por Stripe y sin caducar. Es una concesión, no una suscripción.

## Por qué `multisucursal` y no otro

Es el único plan de la familia e-CF con `docs: -1`. Cualquier otro les pondría
un techo mensual de comprobantes que hoy no tienen, y a Andrés Bello (579
emitidos) o Yisrael Kids (395) se les notaría el primer mes.

## La clave, no el nombre

Se escribe `multisucursal`, **no** `Multi-sucursal`. `getPlan()` resuelve por
clave; guardar el nombre display fue el bug que dejó a 5 de 8 planes cayendo a
Gratis después de pagar. Hoy hay un fallback por nombre que lo repara, pero eso
es una red, no una excusa para volver a escribirlo mal.

## El SQL

```sql
BEGIN;


-- ── 1 · Todas menos Yomalia: facturación sin tope + punto de venta ─────────
UPDATE teams
   SET plan_name   = 'multisucursal',
       adicionales = '["pos"]'::jsonb
 WHERE id <> 19;

-- ── 2 · Yomalia: facturación sin tope, sin POS ────────────────────────────
-- CENTRO EDUCATIVO TECNOLOGICO INTERNACIONAL YOMALIA MARIA EIRL.
-- Hoy tiene exactamente `facturacion` + `administracion`, así que esto le
-- sube el techo de comprobantes y no le cambia ni una pantalla.
UPDATE teams
   SET plan_name   = 'multisucursal',
       adicionales = '[]'::jsonb
 WHERE id = 19;

-- ── 3 · Los dos que ya tienen el módulo escolar encendido ─────────────────
-- `multisucursal` es de la familia e-CF y NO incluye `escolar`. Con el billing
-- encendido, `getTeamModules` arma la lista desde el plan y estos dos
-- perderían el módulo que hoy ven.
--
-- `modulos_override` gana al plan (`MODULOS.overrideManualGanaAlPlan = true`),
-- que es justo para lo que existe: sostener a un cliente sin inventarle una
-- suscripción que no compró.
--
--   id 2 · YISRAEL TECHNOLOGY SRL      (nosotros)
--   id 9 · COLEGIO ANDRES BELLO SRL    (cliente real, 579 comprobantes)
--
-- Si se decide que Andrés Bello va a un tramo de colegio de verdad, esta
-- tercera parte se cae y su fila pasa a `colegio-*`, que ya trae escolar+pos.
UPDATE teams
   SET modulos_override = '["facturacion","administracion","pos","escolar"]'::jsonb
 WHERE id IN (2, 9);

-- ── 4 · Que nadie caiga en solo-lectura el día que se encienda el billing ──
-- Con `BILLING_ENABLED=true`, una fila con `subscription_status` NULL cae al
-- final de `evaluarSuscripcion` —«tu empresa no tiene un plan activo»— y se
-- queda sin emitir. Hoy hay 8 filas así (todas de prueba, pero da igual: la
-- que se escape queda muerta y nos enteramos por el cliente).
UPDATE teams
   SET subscription_status = 'admin'
 WHERE subscription_status IS NULL;

-- ── Comprobación antes de confirmar ───────────────────────────────────────
-- Esperado: 22 filas, todas `multisucursal`; `["pos"]` en todas menos la 19;
-- `admin` en las 22; override solo en 2 y 9.
SELECT id, left(name, 38) AS empresa, plan_name, adicionales,
       subscription_status AS estado, modulos_override AS override
  FROM teams
 ORDER BY id;

COMMIT;
```
