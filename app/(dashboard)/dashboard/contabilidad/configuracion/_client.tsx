'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Plus, Trash2, Info } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import type { Cuenta } from '@/lib/contabilidad/cuentas';
// Valores desde `metodos` (sin dependencias de base) y tipos desde `config`.
// Importar valores de `config` aquí rompe el bundle del cliente: arrastra
// `postgres` y falla con "Can't resolve 'fs'".
import {
  CLAVE_METODO_LABEL, CLAVES_SIN_COBRO, esPasarela, type ClaveMetodo,
} from '@/lib/contabilidad/metodos';
import type {
  ConfigContable, MetodoConfigurado, OverrideIngreso,
} from '@/lib/contabilidad/config';
import type { EstadoConfiguracion } from '@/lib/contabilidad/validacion';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/** Las 7 generales, con la explicación que ve el usuario. */
const GENERALES: { campo: keyof ConfigContable; label: string; ayuda: string }[] = [
  { campo: 'cuentaPorCobrarId', label: 'Cuenta por cobrar',
    ayuda: 'Lo que un cliente queda debiendo al emitirle una factura a crédito.' },
  { campo: 'cuentaItbisId', label: 'ITBIS por pagar',
    ayuda: 'El ITBIS que cobras no es tuyo: es de la DGII hasta que lo declares.' },
  { campo: 'cuentaIngresosId', label: 'Ingresos por defecto',
    ayuda: 'La red de seguridad, para lo que no cae en ninguna regla más específica.' },
  { campo: 'cuentaDescuentosId', label: 'Descuentos y devoluciones',
    ayuda: 'Donde restan las notas de crédito. Sin esto, las ventas netas salen infladas.' },
  { campo: 'cuentaMoraId', label: 'Ingresos por mora',
    ayuda: 'Los recargos por atraso son un ingreso distinto de las ventas.' },
  { campo: 'cuentaSaldosFavorId', label: 'Saldos a favor de clientes',
    ayuda: 'Si una nota de crédito supera la deuda, el sobrante es dinero que le debes al cliente.' },
  { campo: 'cuentaRetencionesId', label: 'Retenciones por cobrar',
    ayuda: 'Lo que el cliente retiene no entra a tu banco, pero te deja un crédito fiscal.' },
];

/** Cuentas usadas por compras, gastos operativos y activos fijos. */
const COMPRAS_Y_ACTIVOS: { campo: keyof ConfigContable; label: string; ayuda: string }[] = [
  { campo: 'cuentaInventarioId', label: 'Inventario',
    ayuda: 'Recibe el valor de las compras de bienes, sin ITBIS acreditable.' },
  { campo: 'cuentaPorPagarId', label: 'Cuentas por pagar',
    ayuda: 'La deuda que queda con el proveedor al registrar una compra a crédito.' },
  { campo: 'cuentaGastosId', label: 'Gastos de caja chica',
    ayuda: 'Registra los gastos operativos pagados desde caja chica.' },
  { campo: 'cuentaActivoFijoId', label: 'Activos fijos',
    ayuda: 'Donde se registra el costo de un bien de uso duradero.' },
  { campo: 'cuentaDeprecAcumId', label: 'Depreciación acumulada',
    ayuda: 'Contra-activo que acumula el desgaste reconocido de cada activo.' },
  { campo: 'cuentaGastoDeprecId', label: 'Gasto por depreciación',
    ayuda: 'Gasto mensual que reconoce el uso de los activos fijos.' },
];

/** Cuentas dedicadas del asiento de nómina. Vacías → usa gastos/por-pagar. */
const NOMINA: { campo: keyof ConfigContable; label: string; ayuda: string }[] = [
  { campo: 'cuentaNominaSueldoId', label: 'Gasto de sueldos',
    ayuda: 'El sueldo bruto del período (Debe). Vacío: usa la de gastos.' },
  { campo: 'cuentaNominaAportesGastoId', label: 'Gasto de aportes patronales',
    ayuda: 'Lo que aporta la empresa a la TSS (AFP/SFS/SRL/INFOTEP) como gasto (Debe).' },
  { campo: 'cuentaNominaRetencionesId', label: 'Retenciones por pagar',
    ayuda: 'AFP, SFS e ISR que le retienes al empleado y le debes a la TSS/DGII (Haber).' },
  { campo: 'cuentaNominaAportesPagarId', label: 'Aportes patronales por pagar',
    ayuda: 'Los aportes de la empresa que quedan por pagar a la TSS (Haber).' },
  { campo: 'cuentaNominaPorPagarId', label: 'Sueldos netos por pagar',
    ayuda: 'El neto que se le debe al empleado hasta que se dispersa (Haber).' },
];

/** Métodos que se ofrecen para configurar, sin los que no mueven dinero. */
const METODOS_CONFIGURABLES = (Object.keys(CLAVE_METODO_LABEL) as ClaveMetodo[])
  .filter((c) => !CLAVES_SIN_COBRO.includes(c));


export function ConfigClient({
  configInicial, metodosIniciales, overridesIniciales, estadoInicial,
  cuentas, categorias, productos, puedeConfigurar,
}: {
  configInicial:      ConfigContable;
  metodosIniciales:   MetodoConfigurado[];
  overridesIniciales: OverrideIngreso[];
  estadoInicial:      EstadoConfiguracion;
  cuentas:            Cuenta[];
  categorias:         { id: number; nombre: string }[];
  productos:          { id: number; nombre: string }[];
  puedeConfigurar:    boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nuevoOverride, setNuevoOverride] = useState<{
    tipo: 'categoria' | 'producto'; destinoId: string; cuentaId: string;
  } | null>(null);

  const metodoPorClave = new Map(metodosIniciales.map((m) => [m.clave, m]));

  async function enviar(payload: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    const res = await fetch('/api/contabilidad/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setGuardando(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo guardar.');
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  const selectCuenta = (
    valor: number | null,
    onChange: (id: number | null) => void,
    placeholder = 'Sin configurar',
  ) => (
    <TextField
      select fullWidth
      value={valor ?? ''}
      disabled={!puedeConfigurar || guardando}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <MenuItem value="">{placeholder}</MenuItem>
      {cuentas.map((c) => (
        <MenuItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</MenuItem>
      ))}
    </TextField>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {error && <Alert severity="error">{error}</Alert>}

      {/* ─── Estado: qué falta ─────────────────────────────────────────── */}
      <Box sx={{
        borderRadius: '12px', px: 2, py: 2, border: '1px solid',
        ...(estadoInicial.completa
          ? { borderColor: '#a7f3d0', bgcolor: '#ecfdf5' }
          : { borderColor: '#fde68a', bgcolor: '#fffbeb' }),
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {estadoInicial.completa
            ? <CheckCircle2 style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#059669' }} />
            : <AlertTriangle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#d97706' }} />}

          <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{
              fontSize: '0.875rem', fontWeight: 600,
              color: estadoInicial.completa ? '#065f46' : '#78350f',
            }}>
              {estadoInicial.completa
                ? 'La configuración está completa.'
                : `Faltan ${estadoInicial.huecos.length} cosa(s) por configurar.`}
            </Typography>

            {estadoInicial.huecos.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {estadoInicial.huecos.map((h) => (
                  <Box component="li" key={h.clave} sx={{ fontSize: '0.875rem', color: '#78350f' }}>
                    <strong>{h.que}</strong> — {h.porque}
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 0.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
                Contabilidad automática:{' '}
                <strong>{estadoInicial.activa ? 'encendida' : 'apagada'}</strong>
              </Typography>
              {puedeConfigurar && (
                <Button
                  size="small"
                  variant={estadoInicial.activa ? 'outlined' : 'contained'}
                  color={estadoInicial.activa ? 'inherit' : 'primary'}
                  disabled={guardando || (!estadoInicial.completa && !estadoInicial.activa)}
                  onClick={() => enviar({ seccion: 'activar', activa: !estadoInicial.activa })}
                  sx={estadoInicial.activa ? { color: '#374151', borderColor: '#d1d5db', bgcolor: '#fff' } : undefined}
                >
                  {estadoInicial.activa ? 'Apagar' : 'Encender'}
                </Button>
              )}
            </Box>

            {!estadoInicial.completa && !estadoInicial.activa && (
              <Typography sx={{ fontSize: '0.75rem', color: '#92400e' }}>
                No se puede encender con la configuración incompleta: los asientos
                saldrían descuadrados, y eso es peor que no generarlos.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* ─── Régimen ITBIS de compras ─────────────────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            ITBIS de compras
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Define cómo se registra el ITBIS pagado al proveedor. El total de la compra sigue siendo la deuda con el proveedor.
          </Typography>
        </Box>
        <TextField
          select fullWidth label="Régimen de ITBIS" value={configInicial.regimenItbis}
          disabled={!puedeConfigurar || guardando}
          onChange={(e) => enviar({ seccion: 'itbis-compras', regimenItbis: e.target.value })}
        >
          <MenuItem value="exento">Exento — ITBIS forma parte del costo de inventario</MenuItem>
          <MenuItem value="gravado">Gravado — ITBIS va a 1104 Crédito fiscal</MenuItem>
        </TextField>
      </Box>

      {/* ─── 1. Cuentas generales ──────────────────────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Cuentas generales
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Lo que se usa en toda factura, sin importar el producto ni la forma de cobro.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          {GENERALES.map((g) => (
            <Box key={g.campo} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                {g.label}
              </Typography>
              {selectCuenta(
                configInicial[g.campo] as number | null,
                (id) => enviar({ seccion: 'general', [g.campo]: id }),
              )}
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{g.ayuda}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ─── 2. Compras, gastos y activos ─────────────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Compras, gastos y activos
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Cuentas que usa la contabilidad automática fuera de las ventas. Si las dejas sin configurar, se usa el catálogo base.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          {COMPRAS_Y_ACTIVOS.map((g) => (
            <Box key={g.campo} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                {g.label}
              </Typography>
              {selectCuenta(
                configInicial[g.campo] as number | null,
                (id) => enviar({ seccion: 'compras-activos', [g.campo]: id }),
              )}
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{g.ayuda}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ─── Nómina ────────────────────────────────────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Nómina
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Cuentas del asiento que nace al aprobar una corrida. Si las dejas sin configurar, usa la de gastos y la de por pagar generales.
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          {NOMINA.map((g) => (
            <Box key={g.campo} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                {g.label}
              </Typography>
              {selectCuenta(
                configInicial[g.campo] as number | null,
                (id) => enviar({ seccion: 'nomina', [g.campo]: id }),
              )}
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{g.ayuda}</Typography>
            </Box>
          ))}
        </Box>

        {/* Provisiones (regalía / vacaciones / cesantía) */}
        <Box sx={{ borderTop: '1px solid #e5e7eb', pt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                Provisionar en contabilidad
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Asienta cada mes la provisión de regalía, vacaciones y cesantía. Apagado por defecto.
              </Typography>
            </Box>
            {puedeConfigurar && (
              <Button
                size="small"
                variant={configInicial.provisionarNomina ? 'outlined' : 'contained'}
                color={configInicial.provisionarNomina ? 'inherit' : 'primary'}
                disabled={guardando}
                onClick={() => enviar({ seccion: 'nomina', provisionarNomina: !configInicial.provisionarNomina })}
                sx={configInicial.provisionarNomina ? { color: '#374151', borderColor: '#d1d5db', bgcolor: '#fff' } : undefined}
              >
                {configInicial.provisionarNomina ? 'Apagar' : 'Encender'}
              </Button>
            )}
          </Box>

          {configInicial.provisionarNomina && (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Gasto por provisiones
                </Typography>
                {selectCuenta(
                  configInicial.cuentaProvisionGastoId,
                  (id) => enviar({ seccion: 'nomina', cuentaProvisionGastoId: id }),
                )}
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>El gasto mensual (Debe). Vacío: usa la de gastos.</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Provisiones por pagar
                </Typography>
                {selectCuenta(
                  configInicial.cuentaProvisionPorPagarId,
                  (id) => enviar({ seccion: 'nomina', cuentaProvisionPorPagarId: id }),
                )}
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>El pasivo que se acumula (Haber). Vacío: usa la de por pagar.</Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* ─── 3. Métodos de cobro ───────────────────────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Formas de cobro
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            A qué cuenta entra el dinero según cómo te paguen.
          </Typography>
        </Box>

        <Alert severity="info" icon={<Info style={{ width: 16, height: 16 }} />}>
          <Typography sx={{ fontSize: '0.75rem' }}>
            <strong>Los links de pago van aparte de la tarjeta de mostrador.</strong>{' '}
            Cuando cobras por CardNet o Azul el dinero no entra a tu banco ese día:
            la pasarela liquida después y te retiene su comisión. Por eso conviene
            apuntarlos a <em>Cobros por liquidar</em> y no a Bancos — si no, el banco
            te muestra plata que todavía no tienes.
          </Typography>
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {METODOS_CONFIGURABLES.map((clave) => {
            const m = metodoPorClave.get(clave);
            const falta = estadoInicial.metodosSinCuenta.includes(clave);
            return (
              <Box key={clave} sx={{
                display: 'grid', gap: 1.5, alignItems: 'center',
                gridTemplateColumns: { xs: '1fr', sm: '200px 1fr 1fr' },
              }}>
                <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
                  {CLAVE_METODO_LABEL[clave]}
                  {falta && (
                    <Box component="span" sx={{
                      ml: 1, fontSize: '10px', px: 0.75, py: 0.25, borderRadius: '4px',
                      bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
                      whiteSpace: 'nowrap',
                    }}>
                      lo usas y falta
                    </Box>
                  )}
                </Typography>

                {selectCuenta(
                  m?.cuentaId ?? null,
                  (id) => enviar({
                    seccion: 'metodo', clave, cuentaId: id,
                    cuentaComisionId: m?.cuentaComisionId ?? null,
                  }),
                )}

                {esPasarela(clave) ? (
                  <Box>
                    {selectCuenta(
                      m?.cuentaComisionId ?? null,
                      (id) => m?.cuentaId
                        ? enviar({ seccion: 'metodo', clave, cuentaId: m.cuentaId, cuentaComisionId: id })
                        : setError('Primero elige la cuenta donde entra el cobro.'),
                      'Cuenta de comisión (opcional)',
                    )}
                  </Box>
                ) : <Box />}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ─── 3. Ingresos por categoría o producto ──────────────────────── */}
      <Box component="section" sx={{ ...CARD, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Ingresos por categoría o producto
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Solo para las excepciones. Por defecto los bienes van a{' '}
            <strong>4101 Ingresos por venta de mercancía</strong> y los servicios a{' '}
            <strong>4104 Ingresos por servicios</strong>, sin configurar nada.
          </Typography>
        </Box>

        {overridesIniciales.length > 0 && (
          <Box sx={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Aplica a</TableCell>
                  <TableCell>Va a la cuenta</TableCell>
                  {puedeConfigurar && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {overridesIniciales.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Box component="span" sx={{ color: '#9ca3af', fontSize: '0.75rem', mr: 0.75 }}>
                        {o.categoriaId !== null ? 'Categoría' : 'Producto'}
                      </Box>
                      {o.destinoNombre}
                    </TableCell>
                    <TableCell sx={{ color: '#4b5563' }}>
                      <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{o.cuentaCodigo}</Box>{' '}
                      {o.cuentaNombre}
                    </TableCell>
                    {puedeConfigurar && (
                      <TableCell align="right">
                        <IconButton
                          size="small" title="Quitar"
                          onClick={() => enviar({ seccion: 'ingreso', id: o.id, cuentaId: null })}
                          sx={{ color: '#9ca3af', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}
                        >
                          <Trash2 style={{ width: 16, height: 16 }} />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {puedeConfigurar && (nuevoOverride ? (
          <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', bgcolor: '#f9fafb', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              <TextField
                select
                value={nuevoOverride.tipo}
                onChange={(e) => setNuevoOverride({
                  ...nuevoOverride, tipo: e.target.value as 'categoria' | 'producto', destinoId: '',
                })}
              >
                <MenuItem value="categoria">Categoría</MenuItem>
                <MenuItem value="producto">Producto</MenuItem>
              </TextField>

              <TextField
                select
                value={nuevoOverride.destinoId}
                onChange={(e) => setNuevoOverride({ ...nuevoOverride, destinoId: e.target.value })}
              >
                <MenuItem value="">Elegir…</MenuItem>
                {(nuevoOverride.tipo === 'categoria' ? categorias : productos).map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.nombre}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                value={nuevoOverride.cuentaId}
                onChange={(e) => setNuevoOverride({ ...nuevoOverride, cuentaId: e.target.value })}
              >
                <MenuItem value="">Cuenta…</MenuItem>
                {cuentas.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</MenuItem>
                ))}
              </TextField>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained" size="small"
                disabled={guardando || !nuevoOverride.destinoId || !nuevoOverride.cuentaId}
                onClick={async () => {
                  const ok = await enviar({
                    seccion: 'ingreso',
                    categoriaId: nuevoOverride.tipo === 'categoria' ? Number(nuevoOverride.destinoId) : null,
                    productoId:  nuevoOverride.tipo === 'producto'  ? Number(nuevoOverride.destinoId) : null,
                    cuentaId: Number(nuevoOverride.cuentaId),
                  });
                  if (ok) setNuevoOverride(null);
                }}
              >
                Agregar
              </Button>
              <Button
                variant="outlined" color="inherit" size="small"
                onClick={() => setNuevoOverride(null)}
                sx={{ color: '#374151', borderColor: '#d1d5db' }}
              >
                Cancelar
              </Button>
            </Box>
          </Box>
        ) : (
          <Button
            variant="outlined" color="inherit" size="small"
            onClick={() => setNuevoOverride({ tipo: 'categoria', destinoId: '', cuentaId: '' })}
            startIcon={<Plus style={{ width: 16, height: 16 }} />}
            sx={{ alignSelf: 'flex-start', color: '#374151', borderColor: '#d1d5db' }}
          >
            Agregar excepción
          </Button>
        ))}
      </Box>
    </Box>
  );
}
