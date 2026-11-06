'use client';

/**
 * Activos fijos: listado + alta + botón de "Generar depreciaciones".
 *
 * El listado enseña por activo su costo, la depreciación acumulada y el valor en
 * libros (costo − acumulada). Los importes del alta se escriben en pesos y se
 * pasan a centavos con Math.round, para no arrastrar el error de coma flotante
 * de `parseFloat(x) * 100`.
 */

import { useState, useMemo } from 'react';
import { RangoFechas } from '@/components/reportes/rango-fechas';
import { ExportarListado } from '@/components/reportes/exportar-listado';
import { armarEnvioTabla, type ExportTabla } from '@/lib/export/tabla';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { CATEGORIAS_ACTIVO, categoriaActivo } from '@/lib/contabilidad/activos-fijos';

interface ActivoFijo {
  id: number;
  nombre: string;
  costoCents: number;
  valorResidualCents: number;
  vidaUtilMeses: number;
  fechaAdquisicion: string;
  activa: boolean;
  acumuladaCents: number;
  valorLibrosCents: number;
  cuotasHechas: number;
  /** Unidades que cubría la ficha y las que quedan. */
  cantidad: number;
  cantidadVigente: number;
  ubicacion: string | null;
  categoria: string | null;
  /** Abierta desde una compra: falta confirmar categoría y vida útil. */
  enRevision: boolean;
  costoVigenteCents: number;
  acumuladaVigenteCents: number;
  /** Aula donde está, estado y «solo control» (migración 0236). */
  espacioId?: number | null;
  estado?: string;
  soloControl?: boolean;
}

interface EspacioOpcion { id: number; nombre: string }

interface CuentaCobro { id: number; codigo: string; nombre: string }

const fmtDOP = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Pesos en texto → centavos enteros, sin el error de coma flotante de ×100. */
function aCentavos(pesos: string): number {
  const n = parseFloat(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Vida útil en meses → "N años M meses" para leerlo rápido. */
function vidaLegible(meses: number): string {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes = [];
  if (a > 0) partes.push(`${a} ${a === 1 ? 'año' : 'años'}`);
  if (m > 0) partes.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
  return partes.join(' ') || `${meses} meses`;
}

const fechaCorta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Imprimir / PDF / Excel de los activos del rango de adquisición. */
const EXPORTAR: ExportTabla<ActivoFijo> = {
  titulo: 'Activos fijos',
  archivo: 'activos-fijos',
  tachada: a => !a.activa,
  columnas: [
    { titulo: 'Activo', valor: a => a.nombre, sub: a => (a.activa ? (a.ubicacion ?? null) : 'Dada de baja'), ancho: 2 },
    { titulo: 'Cant.', valor: a => (a.cantidad > 1 ? `${a.cantidadVigente} de ${a.cantidad}` : String(a.cantidadVigente)), ancho: 0.6 },
    { titulo: 'Categoría', valor: a => categoriaActivo(a.categoria)?.label ?? '—', ancho: 1.2 },
    { titulo: 'Adquirido', valor: a => fechaCorta(a.fechaAdquisicion), ancho: 0.8 },
    { titulo: 'Vida útil', valor: a => vidaLegible(a.vidaUtilMeses), sub: a => `${a.cuotasHechas} de ${a.vidaUtilMeses} cuotas`, ancho: 1.1 },
    { titulo: 'Costo', valor: a => a.costoVigenteCents, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Depreciación acum.', valor: a => a.acumuladaVigenteCents, tipo: 'moneda', total: true, ancho: 1.1 },
    { titulo: 'Valor en libros', valor: a => a.valorLibrosCents, tipo: 'moneda', total: true, ancho: 1.1 },
  ],
};

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

export function ActivosFijosClient({
  activos, hoy, puedeGestionar, cuentasCobro = [], espacios = [],
}: { activos: ActivoFijo[]; hoy: string; puedeGestionar: boolean; cuentasCobro?: CuentaCobro[]; espacios?: EspacioOpcion[] }) {
  const router = useRouter();
  // Rango por fecha de adquisición.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const visibles = useMemo(() => activos.filter(a => {
    const f = a.fechaAdquisicion.slice(0, 10);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }), [activos, desde, hasta]);
  const filtroTexto = desde && hasta ? `Adquiridos del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
    : desde ? `Adquiridos desde el ${fechaCorta(desde)}` : hasta ? `Adquiridos hasta el ${fechaCorta(hasta)}` : 'Todas las fechas';

  // Alta
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [costo, setCosto] = useState('');
  const [residual, setResidual] = useState('');
  const [vida, setVida] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [cantidad, setCantidad] = useState('1');
  const [ubicacion, setUbicacion] = useState('');
  const [categoria, setCategoria] = useState('');
  const [espacioId, setEspacioId] = useState('');
  const [soloControl, setSoloControl] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Baja y edición de una ficha
  const [baja, setBaja] = useState<ActivoFijo | null>(null);
  const [edita, setEdita] = useState<ActivoFijo | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  // Generar
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const costoCents = aCentavos(costo);
  const residualCents = residual.trim() === '' ? 0 : aCentavos(residual);
  const cat = categoriaActivo(categoria);
  const sinDepreciar = cat?.deprecia === false || soloControl;
  const vidaMeses = sinDepreciar ? 1 : parseInt(vida, 10);
  const cantidadN = parseInt(cantidad, 10);
  const cuotaMensual = useMemo(() => {
    if (costoCents <= 0 || !Number.isFinite(vidaMeses) || vidaMeses <= 0) return null;
    const base = costoCents - residualCents;
    if (base <= 0) return null;
    return Math.round(base / vidaMeses);
  }, [costoCents, residualCents, vidaMeses]);

  const puedeGuardar =
    nombre.trim() !== '' && costoCents > 0 && residualCents >= 0 &&
    residualCents < costoCents && Number.isFinite(vidaMeses) && vidaMeses > 0 &&
    Number.isInteger(cantidadN) && cantidadN >= 1 && fecha !== '' && !guardando;

  async function registrar() {
    setErrorAlta(null);
    setGuardando(true);
    try {
      const res = await fetch('/api/contabilidad/activos-fijos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          costoCents,
          valorResidualCents: residualCents,
          vidaUtilMeses: vidaMeses,
          fechaAdquisicion: fecha,
          cantidad: cantidadN,
          ubicacion: ubicacion.trim() || null,
          categoria: soloControl ? null : categoria || null,
          soloControl,
          espacioId: espacioId ? Number(espacioId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorAlta(data.error ?? 'No se pudo registrar el activo.');
        setGuardando(false);
        return;
      }
      setNombre(''); setCosto(''); setResidual(''); setVida(''); setFecha(hoy); setCantidad('1'); setUbicacion(''); setCategoria(''); setEspacioId(''); setSoloControl(false);
      setAbierto(false); setGuardando(false);
      router.refresh();
    } catch {
      setErrorAlta('No se pudo conectar. Inténtalo de nuevo.');
      setGuardando(false);
    }
  }

  async function generar() {
    setAviso(null);
    setGenerando(true);
    try {
      const res = await fetch('/api/contabilidad/activos-fijos/generar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setAviso({ tipo: 'error', texto: data.error ?? 'No se pudieron generar las depreciaciones.' });
        setGenerando(false);
        return;
      }
      setAviso({
        tipo: 'success',
        texto: data.creados > 0
          ? `Se generaron ${data.creados} ${data.creados === 1 ? 'cuota' : 'cuotas'} de depreciación.`
          : 'Todo al día: no había depreciaciones pendientes.',
      });
      setGenerando(false);
      router.refresh();
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo conectar. Inténtalo de nuevo.' });
      setGenerando(false);
    }
  }

  const celda = { fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 } as const;
  const celdaMonto = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
  const th = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1 } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Acciones */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
      {activos.length > 0 && (
        <RangoFechas label="Adquisición" desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, ml: 'auto' }}>
      <ExportarListado armar={() => armarEnvioTabla(EXPORTAR, visibles, filtroTexto)} deshabilitado={visibles.length === 0} testId="exportar-activos" />
      {puedeGestionar && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Button
            variant="contained" onClick={() => setAbierto((v) => !v)}
            startIcon={<Plus style={{ width: 16, height: 16 }} />}
            sx={{ bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
          >
            Registrar activo
          </Button>
          <Button
            variant="outlined" onClick={generar} disabled={generando}
            startIcon={<RefreshCw style={{ width: 16, height: 16 }} />}
            sx={{ color: '#2a45c4', borderColor: '#c7d2fc' }}
          >
            {generando ? 'Generando…' : 'Generar depreciaciones'}
          </Button>
        </Box>
      )}
      </Box>
      </Box>

      {aviso && (
        <Alert
          severity={aviso.tipo}
          icon={aviso.tipo === 'success'
            ? <CheckCircle2 style={{ width: 16, height: 16 }} />
            : <AlertTriangle style={{ width: 16, height: 16 }} />}
        >
          {aviso.texto}
        </Alert>
      )}

      {/* Formulario de alta */}
      {puedeGestionar && abierto && (
        <Box sx={{ ...CARD, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>Nuevo activo fijo</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {!soloControl && <TextField
              label="Categoría" select value={categoria} onChange={(e) => setCategoria(e.target.value)}
              helperText={cat ? `Cuenta ${cat.cuentaActivo}${cat.deprecia ? ` · depreciación ${cat.cuentaDeprecAcum}` : ' · no se deprecia'}` : 'Decide su cuenta contable'}
              sx={{ width: 260 }}
            >
              <MenuItem value="">Sin categoría (cuenta general)</MenuItem>
              {CATEGORIAS_ACTIVO.map((c) => <MenuItem key={c.clave} value={c.clave}>{c.label}</MenuItem>)}
            </TextField>}
            {espacios.length > 0 && (
              <TextField label="Aula" select value={espacioId} onChange={(e) => setEspacioId(e.target.value)} helperText="Opcional" sx={{ width: 200 }}>
                <MenuItem value="">Sin aula</MenuItem>
                {espacios.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.nombre}</MenuItem>)}
              </TextField>
            )}
            <TextField
              label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Edificio principal" sx={{ flex: 1, minWidth: 240 }}
            />
            <TextField
              label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              helperText="Unidades iguales en esta ficha"
              slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 130 }}
            />
            <TextField
              label="Ubicación" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Ej.: Aula 3, Oficina" slotProps={{ htmlInput: { maxLength: 160 } }} sx={{ width: 200 }}
            />
            <TextField
              label="Fecha de adquisición" type="date" value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 190 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <TextField
              label={cantidadN > 1 ? 'Costo total (RD$)' : 'Costo (RD$)'} type="number" value={costo}
              onChange={(e) => setCosto(e.target.value)} placeholder="0.00"
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 200 }}
            />
            <TextField
              label="Valor residual (RD$)" type="number" value={residual}
              onChange={(e) => setResidual(e.target.value)} placeholder="0.00"
              helperText="Opcional. Lo que valdrá al final."
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 200 }}
            />
            {!sinDepreciar && <TextField
              label="Vida útil (meses)" type="number" value={vida}
              onChange={(e) => setVida(e.target.value)} placeholder="Ej.: 240"
              helperText={Number.isFinite(vidaMeses) && vidaMeses > 0 ? vidaLegible(vidaMeses) : 'En meses'}
              slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 170 }}
            />}
          </Box>

          {espacios.length > 0 && (
            <FormControlLabel
              control={<Checkbox size="small" checked={soloControl} onChange={(e) => setSoloControl(e.target.checked)} />}
              label={<span style={{ fontSize: '0.8125rem' }}>Solo control de inventario (no se deprecia): para cosas baratas que se cuentan pero van al gasto</span>}
            />
          )}
          {sinDepreciar && (
            <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{soloControl ? 'Solo control: se cuenta en unidades, sin depreciación ni asientos.' : 'Un terreno no se deprecia: no hay vida útil que indicar.'}</Typography>
          )}
          {cuotaMensual !== null && !sinDepreciar && (
            <Typography sx={{ fontSize: '0.8125rem', color: '#2a45c4' }}>
              Depreciación mensual estimada: <strong>{fmtDOP(cuotaMensual)}</strong>
            </Typography>
          )}

          {errorAlta && (
            <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>{errorAlta}</Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="contained" onClick={registrar} disabled={!puedeGuardar}
              sx={{ bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}
            >
              {guardando ? 'Guardando…' : 'Guardar activo'}
            </Button>
            <Button color="inherit" onClick={() => setAbierto(false)} sx={{ color: '#6b7280' }}>
              Cancelar
            </Button>
          </Box>
        </Box>
      )}

      {/* Listado */}
      {visibles.length === 0 ? (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          {activos.length ? 'Ningún activo adquirido en estas fechas.' : 'Todavía no hay activos fijos registrados.'}
        </Typography>
      ) : (
        <Box sx={{ ...CARD, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <Box component="tr">
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Activo</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Cant.</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Adquirido</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Vida útil</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Costo</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Depreciación acum.</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Valor en libros</Box>
                  {puedeGestionar && <Box component="th" sx={th} />}
                </Box>
              </Box>
              <Box component="tbody">
                {visibles.map((a) => (
                  <Box component="tr" key={a.id} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                    <Box component="td" sx={celda}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <span>{a.nombre}</span>
                        {a.enRevision && (
                          <Chip label="Por confirmar" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#fef3c7', color: '#92400e' }} />
                        )}
                        {a.soloControl && (
                          <Chip label="Solo control" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#e0f2fe', color: '#075985' }} />
                        )}
                        {!a.activa && (
                          <Chip label="Dada de baja" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />
                        )}
                      </Box>
                      {(a.categoria || a.ubicacion) && (
                        <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af' }}>
                          {[categoriaActivo(a.categoria)?.label, a.ubicacion].filter(Boolean).join(' · ')}
                        </Typography>
                      )}
                    </Box>
                    <Box component="td" sx={celdaMonto}>
                      {a.cantidad > 1 ? `${a.cantidadVigente} de ${a.cantidad}` : a.cantidadVigente}
                    </Box>
                    <Box component="td" sx={celda}>{a.fechaAdquisicion}</Box>
                    <Box component="td" sx={celda}>
                      {vidaLegible(a.vidaUtilMeses)}
                      <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af' }}>
                        {a.cuotasHechas} de {a.vidaUtilMeses} cuotas
                      </Typography>
                    </Box>
                    <Box component="td" sx={celdaMonto}>{fmtDOP(a.costoVigenteCents)}</Box>
                    <Box component="td" sx={celdaMonto}>{fmtDOP(a.acumuladaVigenteCents)}</Box>
                    <Box component="td" sx={{ ...celdaMonto, fontWeight: 600, color: '#111827' }}>{fmtDOP(a.valorLibrosCents)}</Box>
                    {puedeGestionar && (
                      <Box component="td" sx={{ ...celda, whiteSpace: 'nowrap' }}>
                        <Button size="small" onClick={() => setEdita(a)}>{a.enRevision ? 'Confirmar' : 'Editar'}</Button>
                        {a.activa && !a.enRevision && <Button size="small" color="error" onClick={() => setBaja(a)}>Dar de baja</Button>}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {baja && <BajaDialogo activo={baja} hoy={hoy} onCerrar={() => setBaja(null)} onListo={() => { setBaja(null); router.refresh(); }} />}
      {edita && <EditarDialogo activo={edita} espacios={espacios} onCerrar={() => setEdita(null)} onListo={() => { setEdita(null); router.refresh(); }} />}
    </Box>
  );
}


/** Dar de baja una o varias unidades: cuánto se lleva del costo y de la depreciación, y la ganancia o pérdida. */
function BajaDialogo({ activo, hoy, onCerrar, onListo }: {
  activo: ActivoFijo; hoy: string; onCerrar: () => void; onListo: () => void;
}) {
  const [unidades, setUnidades] = useState('1');
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const k = parseInt(unidades, 10);
  const valida = Number.isInteger(k) && k >= 1 && k <= activo.cantidadVigente;
  // La misma proporción que usa el servidor, solo para enseñar la estimación.
  const esTotal = valida && k === activo.cantidadVigente;
  const costo = !valida ? 0 : esTotal ? activo.costoVigenteCents : Math.round((activo.costoVigenteCents * k) / activo.cantidadVigente);
  const deprec = !valida ? 0 : Math.min(costo, esTotal ? activo.acumuladaVigenteCents : Math.round((activo.acumuladaVigenteCents * k) / activo.cantidadVigente));
  const resultado = -(costo - deprec);

  async function enviar() {
    setError(null); setEnviando(true);
    try {
      const res = await fetch(`/api/contabilidad/activos-fijos/${activo.id}/baja`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, unidades: k, motivo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'No se pudo dar de baja.'); setEnviando(false); return; }
      onListo();
    } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); setEnviando(false); }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Dar de baja · {activo.nombre}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField label="Unidades" type="number" value={unidades} onChange={(e) => setUnidades(e.target.value)}
            helperText={`Quedan ${activo.cantidadVigente}`} slotProps={{ htmlInput: { min: 1, max: activo.cantidadVigente, step: '1' } }} sx={{ width: 140 }} />
          <TextField label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy } }} sx={{ width: 190 }} />
        </Box>
        <Alert severity="warning">
          La baja retira el activo: lo que valía en libros se va a pérdida. Si lo vendiste, emite la factura en Facturación
          y consulta a tu contable.
        </Alert>
        <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        {valida && (
          <Box sx={{ bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 1.5, p: 1.5, fontSize: '0.8125rem', color: '#374151' }}>
            <div>Costo que sale: <strong>{fmtDOP(costo)}</strong> · Depreciación que sale: <strong>{fmtDOP(deprec)}</strong></div>
            <div>Valía en libros: <strong>{fmtDOP(costo - deprec)}</strong></div>
            <div style={{ color: resultado < 0 ? '#b91c1c' : '#047857' }}>
              {resultado === 0 ? 'Sin pérdida: ya estaba totalmente depreciado.' : `Pérdida en la baja: ${fmtDOP(-resultado)}`}
            </div>
            <div style={{ color: '#6b7280', marginTop: 4 }}>Se genera el asiento de la baja. Las depreciaciones vencidas se asientan antes de calcular.</div>
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" color="error" onClick={enviar} disabled={!valida || enviando}>
          {enviando ? 'Guardando…' : 'Dar de baja'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Editar la ficha, o confirmar una abierta desde una compra (categoría y vida útil). */
function EditarDialogo({ activo, espacios, onCerrar, onListo }: { activo: ActivoFijo; espacios: EspacioOpcion[]; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(activo.nombre);
  const [ubicacion, setUbicacion] = useState(activo.ubicacion ?? '');
  const [categoria, setCategoria] = useState(activo.categoria ?? '');
  const [vida, setVida] = useState(String(activo.vidaUtilMeses));
  const [residual, setResidual] = useState((activo.valorResidualCents / 100).toFixed(2));
  const [espacioId, setEspacioId] = useState(activo.espacioId != null ? String(activo.espacioId) : '');
  const [estado, setEstado] = useState(activo.estado ?? 'bien');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const soloControl = activo.soloControl === true;
  const sinDepreciar = categoriaActivo(categoria)?.deprecia === false || soloControl;

  async function enviar() {
    setError(null); setEnviando(true);
    try {
      const res = await fetch(`/api/contabilidad/activos-fijos/${activo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre, ubicacion,
          // Una ficha de solo control no tiene categoría, vida útil ni residual que cambiar.
          ...(soloControl ? {} : { categoria: categoria || null, valorResidualPesos: residual.trim() === '' ? 0 : residual }),
          ...(sinDepreciar ? {} : { vidaUtilMeses: parseInt(vida, 10) }),
          confirmar: activo.enRevision,
          // Aula y estado: solo si la base ya los tiene (si no, la lista viene vacía y no se manda nada).
          ...(espacios.length > 0 ? { espacioId: espacioId ? Number(espacioId) : null, estado } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'No se pudo guardar.'); setEnviando(false); return; }
      onListo();
    } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); setEnviando(false); }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>{activo.enRevision ? 'Confirmar activo' : 'Editar activo'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        {activo.enRevision && (
          <Alert severity="info">Esta ficha se abrió sola desde una compra. Elige su categoría y su vida útil: hasta confirmarla no se deprecia.</Alert>
        )}
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField label="Categoría" select value={categoria} onChange={(e) => setCategoria(e.target.value)} sx={{ minWidth: 260, flex: 1 }}>
            <MenuItem value="">Sin categoría (cuenta general)</MenuItem>
            {CATEGORIAS_ACTIVO.map((c) => <MenuItem key={c.clave} value={c.clave}>{c.label}</MenuItem>)}
          </TextField>
          <TextField label="Ubicación" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} sx={{ minWidth: 200, flex: 1 }} />
        </Box>
        {espacios.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField label="Aula" select value={espacioId} onChange={(e) => setEspacioId(e.target.value)} sx={{ minWidth: 240, flex: 1 }}>
              <MenuItem value="">Sin aula</MenuItem>
              {espacios.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.nombre}</MenuItem>)}
            </TextField>
            <TextField label="Estado" select value={estado} onChange={(e) => setEstado(e.target.value)} sx={{ width: 160 }}>
              <MenuItem value="bien">Bien</MenuItem>
              <MenuItem value="regular">Regular</MenuItem>
              <MenuItem value="danado">Dañado</MenuItem>
            </TextField>
          </Box>
        )}
        {soloControl && <Alert severity="info">Ficha de solo control: se cuenta en unidades, no se deprecia ni genera asientos.</Alert>}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {!sinDepreciar && (
            <TextField label="Vida útil (meses)" type="number" value={vida} onChange={(e) => setVida(e.target.value)}
              helperText={Number.isFinite(parseInt(vida, 10)) && parseInt(vida, 10) > 0 ? vidaLegible(parseInt(vida, 10)) : 'En meses'}
              slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 180 }} />
          )}
          <TextField label="Valor residual (RD$)" type="number" value={residual} onChange={(e) => setResidual(e.target.value)}
            helperText="Solo cambia las cuotas que faltan" slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 210 }} />
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={enviando || nombre.trim() === ''} sx={{ bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
          {enviando ? 'Guardando…' : activo.enRevision ? 'Confirmar' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
