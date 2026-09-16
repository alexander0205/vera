# Tarea 6 — Pagos masivos por API: investigación (2026-08-27)

Alcance: investigar cómo la plataforma podría **dispersar la nómina** (pagar a
los empleados y, si aplica, las obligaciones) mediante una API, en lugar de que
cada empresa pague uno por uno desde su banca. **Es investigación, no
implementación.** No se debe mover, custodiar ni distribuir fondos de clientes
sin confirmar proveedor, conciliación, seguridad, obligaciones regulatorias y
modelo de responsabilidad. Esta nota deja el mapa para decidir; la decisión y la
validación legal/regulatoria son de Darian/Alex + asesor.

## 1. Los tres modelos posibles (de menor a mayor riesgo)

| Modelo | Quién mueve el dinero | Riesgo regulatorio | Estado hoy |
| --- | --- | --- | --- |
| **A. Archivo de dispersión (actual)** | El banco de la empresa. La plataforma solo genera el CSV que el dueño sube a su banca en línea. | Ninguno: la plataforma no toca fondos. | ✅ Construido (`lib/nomina/dispersion.ts`, formatos por banco) |
| **B. Iniciación de pago vía proveedor licenciado** | Un proveedor regulado (ej. dLocal) ejecuta la transferencia; la plataforma solo la ordena por API. La empresa fondea al proveedor, no a nosotros. | Medio: el proveedor tiene la licencia; nosotros somos capa tecnológica. Conviene contrato + revisar si califica como "iniciación de pago" ante el BC. | 🔎 Candidato de esta investigación |
| **C. La plataforma custodia y paga** | La empresa deposita en una cuenta de la plataforma y la plataforma paga. | Alto: **te vuelve entidad regulada** (custodia/transmisión de fondos) bajo Ley 183-02 + Reglamento de Sistemas de Pago. Requiere autorización del Banco Central. | 🚫 No recomendado sin licencia |

**Recomendación de arquitectura:** perseguir **B** (integrar un proveedor
licenciado como rail), mantener **A** como opción/fallback, y **evitar C** salvo
que el negocio decida convertirse en entidad de pago regulada (proyecto aparte,
años, capital, cumplimiento).

## 2. Proveedores evaluados

- **dLocal — mejor candidato para RD.** Payouts para mercados emergentes con una
  sola API; **cubre República Dominicana**. Documentación concreta de payouts RD
  (ver §3). Es una empresa de pagos regulada que actúa como rail; encaja con el
  modelo B.
- **Kushki (PayOuts).** API de dispersión sólida, pero la documentación cubre
  Colombia, Perú, México y Chile; **RD no aparece documentado**. Descartado para
  RD salvo que confirmen cobertura por ventas.
- **Cobre / Mono / Floid.** Buenos para dispersión de nómina, pero foco
  Colombia/Chile; sin evidencia de cobertura RD. Descartados por ahora.
- **Acquirers locales (Azul, CardNet).** Son *inbound* (cobrar), **no hacen
  payout/dispersión**. No sirven para pagar nómina (ya anotado en sesiones
  previas).

## 3. Cobertura concreta de dLocal en RD (payouts)

- **Método:** solo **transferencia bancaria** (no efectivo ni wallet para
  payout).
- **Monedas:** **DOP** (principal) y **USD** (vía `currency_to_pay`).
- **Destinatarios:** **B2C** (a personas), **B2B** (a empresas) y **P2P**. Cubre
  pagar empleados (personas) y proveedores (empresas).
- **Datos del beneficiario requeridos:** tipo y número de documento
  (**RN/Cédula/Pasaporte**, 11 dígitos), **código de banco**, número de cuenta
  (5–17 caracteres según banco), tipo de cuenta (ej. ahorros), moneda.
- **Bancos:** ~**25 bancos** participantes documentados.
- **No documentado:** tiempos exactos de liquidación y límites de velocidad → a
  confirmar con dLocal en la etapa de cotización.

**Encaje con lo ya construido:** el maestro de empleados ya guarda banco, número
y tipo de cuenta; el motor ya arma la dispersión. Migrar de "CSV al banco" a
"payout por API dLocal" sería sustituir el paso de salida, reusando los mismos
datos.

## 4. Costos

**No son públicos.** dLocal y similares cotizan por volumen/contrato (típicamente
comisión por transacción + posible spread FX si hay conversión USD↔DOP). Sin
número confiable hasta pedir cotización formal. **Acción:** solicitar pricing a
dLocal para volumen estimado de nómina antes de comprometer roadmap.

## 5. Obligaciones al Estado (TSS/DGII) — límite importante

Los proveedores de payout **pagan a cuentas bancarias de personas/empresas, no a
la recaudación del Estado**. El pago de TSS (SUIR) y DGII se hace por el **portal
del banco** tras la autodeterminación. Por tanto:

- **Empleados:** dispersables por API (modelo B).
- **TSS/DGII:** siguen por el flujo actual (autodeterminación → portal bancario).
  Ya está construido el archivo de autodeterminación TSS y el registro de
  obligaciones pendientes. **No asumir que un payout provider las paga.**

## 6. Marco regulatorio RD (lo que hay que respetar)

- **Ley 183-02 (Monetaria y Financiera):** los sistemas de pago son servicio
  público de titularidad exclusiva del Banco Central; la Superintendencia de
  Bancos supervisa las entidades de intermediación financiera.
- **Reglamento de Sistemas de Pago — modificación integral aprobada por la Junta
  Monetaria (2ª Resolución, 28-ago-2025).** Incorpora **nuevas categorías de
  proveedores de servicios de pago**: *proveedor de billetera digital*,
  *proveedor de servicios de iniciación de pago* y *proveedor de pasarela de
  pago*. Exige **registro ante el Banco Central** (Art. 36 para billetera
  digital) con documentación corporativa.
- **Implicación para el modelo B:** el rol de "iniciar un pago sin custodiar
  fondos" ahora tiene figura propia (*iniciación de pago*), que se habilitará
  gradualmente. Hay que verificar con asesor si integrar dLocal nos deja como
  simple software (dLocal tiene la licencia) o si nuestra operación calificaría
  como iniciación de pago con registro propio.
- **Pagos instantáneos:** el Banco Central lanzará un **sistema de pagos
  instantáneos en RD en el primer semestre de 2027**. Rail futuro relevante para
  dispersión en tiempo real; a monitorear.

## 7. Modelo de responsabilidad (a cerrar con asesor)

- **Quién responde si un pago sale mal** (cuenta errada, doble pago, fraude):
  definir en contrato con el proveedor y en términos con la empresa cliente.
- **Conciliación:** cada payout necesita estado (enviado/confirmado/rechazado) y
  reconciliación contra el asiento contable y las líneas de nómina. El modelo de
  datos actual (líneas `pagada`, obligaciones) es una base; faltaría el ciclo de
  webhooks del proveedor.
- **KYC/AML, protección de datos, seguridad de credenciales del proveedor:**
  requisitos del proveedor + del BC; no minimizar.

## 8. Próximos pasos sugeridos (si se decide avanzar)

1. **Pedir cotización y contrato a dLocal** (cobertura RD confirmada, pricing,
   SLA de liquidación, webhooks, modelo de fondeo).
2. **Consulta legal/regulatoria:** confirmar que integrar dLocal nos mantiene
   como software (modelo B) y no dispara registro propio ante el BC; aclarar la
   figura de "iniciación de pago".
3. **No construir custodia (modelo C).**
4. Mantener el **modelo A (CSV) como opción** para empresas que prefieran pagar
   por su banca.
5. Diseñar el ciclo de conciliación (webhooks → estado de línea/obligación →
   asiento) **antes** de mover un solo peso.

## Fuentes

- dLocal — payouts RD: [documentación país](https://docs.dlocal.com/docs/dominican-republic), [requisitos de payouts](https://docs.dlocal.com/docs/country-requirements-payouts-v3), [solución de payouts](https://www.dlocal.com/our-solution/payouts/).
- Kushki PayOuts (cobertura CO/PE/MX/CL): [docs](https://docs.kushki.com/pe/en/payouts/transfer/transfer-out/).
- Reglamento de Sistemas de Pago (JM, 28-ago-2025) y nuevas figuras de PSP: [Diario Libre](https://www.diariolibre.com/economia/macroeconomia/2025/10/20/jm-aprueba-modificacion-integral-del-reglamento-de-sistemas-de-pago/3284187), [Banco Central](https://www.bancentral.gov.do/a/d/5056-nuevo-reglamento-de-sistemas-de-pago-hacia-una-mayor-transaccionalidad-de-pagos-electronicos).
- Ley 183-02 Monetaria y Financiera: [Superintendencia de Bancos](https://www.sb.gob.do/regulacion/compendio-de-leyes-y-reglamentos/ley-no-183-02-monetaria-y-financiera/).
- Pagos instantáneos RD 2027: [Diario Libre](https://www.diariolibre.com/economia/finanzas/2026/08/23/nuevo-sistema-de-pagos-instantaneos-en-rd-arrancara-en-2027/3637010).
