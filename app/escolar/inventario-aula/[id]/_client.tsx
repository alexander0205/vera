'use client';

/**
 * Detalle de un aula: qué hay, cuántos, cuánto costó, cuánto vale hoy y en qué
 * estado. Desde aquí se cambia el estado, se mueven unidades a otra aula y se
 * agrega un activo con el aula ya elegida.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { ArrowLeft, Plus } from 'lucide-react';
import type { DetalleAula, FichaDeAula } from '@/lib/escolar/inventario-aula-db';
import {
  ESTADOS_ACTIVO, LABEL_ESTADO_VISIBLE, invertidoDe, labelTipoEspacio, mesesDeVidaRestantes, valeHoyDe,
} from '@/lib/escolar/inventario-aula';
import { CATEGORIAS_ACTIVO, categoriaActivo } from '@/lib/contabilidad/activos-fijos';
import { COLOR_ESTADO, aCentavos, fmtDOP, fmtNumero } from '../_formato';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;
const AZUL = { bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } } as const;

const fechaCorta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Box sx={{ ...CARD, p: 1.5, flex: '1 1 150px', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
    </Box>
  );
}

export function DetalleAulaClient({ detalle, hoy, puedeGestionar, puedeConfigurar }: {
  detalle: DetalleAula; hoy: string; puedeGestionar: boolean; puedeConfigurar: boolean;
}) {
  const router = useRouter();
  const { espacio, totales, fichas, traslados, espacios } = detalle;
  const [mueve, setMueve] = useState<FichaDeAula | null>(null);
  const [agrega, setAgrega] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiarEstado(f: FichaDeAula, estado: string) {
    setError(null);
    const res = await fetch(`/api/escolar/inventario-aula/activos/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? 'No se pudo cambiar el estado.');
      return;
    }
    router.refresh();
  }

  const celda = { fontSize: '0.8125rem', color: '#374151', px: 1.5, py: 1.25 } as const;
  const celdaMonto = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
  const th = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', px: 1.5, py: 1 } as const;

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Link href="/escolar/inventario-aula" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: '#3658e1' }}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> Inventario por aula
      </Link>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{totales.nombre}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            {espacio
              ? [labelTipoEspacio(espacio.tipo), espacio.responsable ? `Responsable: ${espacio.responsable}` : 'Sin responsable', espacio.capacidad != null ? `Capacidad ${espacio.capacidad}` : null].filter(Boolean).join(' · ')
              : 'Activos fijos que todavía no tienen aula. Muévelos a la que les toca para que no se pierdan.'}
          </Typography>
          {espacio && espacio.secciones.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
              {espacio.secciones.map((s) => (
                <Chip key={s.cursoId} label={`${s.etiqueta} · ${s.matriculados} ${s.matriculados === 1 ? 'estudiante' : 'estudiantes'}`} size="small" sx={{ height: 22, fontSize: '0.75rem', bgcolor: '#eef2ff', color: '#3730a3' }} />
              ))}
            </Box>
          )}
        </Box>
        {puedeConfigurar && espacio && (
          <Button variant="contained" onClick={() => setAgrega(true)} startIcon={<Plus style={{ width: 16, height: 16 }} />} sx={AZUL}>
            Agregar activo
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Dato titulo="Unidades" valor={fmtNumero(totales.unidades)} />
        <Dato titulo="Invertido" valor={fmtDOP(totales.invertidoCents)} />
        <Dato titulo="Vale hoy" valor={fmtDOP(totales.valeHoyCents)} />
        {espacio && <Dato titulo="Estudiantes" valor={fmtNumero(totales.estudiantes)} />}
        {espacio && <Dato titulo="Por estudiante" valor={totales.porEstudianteCents == null ? '—' : fmtDOP(totales.porEstudianteCents)} />}
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {fichas.length === 0 ? (
        <Typography sx={{ ...CARD, px: 2, py: 5, textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
          No hay activos en {espacio ? 'esta aula' : 'este grupo'}.
        </Typography>
      ) : (
        <Box sx={{ ...CARD, overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <Box component="thead" sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <Box component="tr">
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Qué hay</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Cantidad</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Costó</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'right' }}>Vale hoy</Box>
                  <Box component="th" sx={{ ...th, textAlign: 'left' }}>Estado</Box>
                  {puedeGestionar && <Box component="th" sx={th} />}
                </Box>
              </Box>
              <Box component="tbody">
                {fichas.map((f) => {
                  const col = COLOR_ESTADO[f.estadoVisible];
                  const meses = mesesDeVidaRestantes(f, hoy);
                  return (
                    <Box component="tr" key={f.id} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                      <Box component="td" sx={celda}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <span>{f.nombre}</span>
                          {f.soloControl && <Chip label="Solo control" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#e0f2fe', color: '#075985' }} />}
                          {f.enRevision && <Chip label="Por confirmar" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#fef3c7', color: '#92400e' }} />}
                        </Box>
                        <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: '#9ca3af' }}>
                          {[categoriaActivo(f.categoria)?.label, f.ubicacion, !f.soloControl && !f.enRevision && f.categoria !== 'terrenos' ? `Le quedan ${meses} ${meses === 1 ? 'mes' : 'meses'} de vida útil` : null].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <Box component="td" sx={celdaMonto}>{fmtNumero(f.cantidadVigente)}</Box>
                      <Box component="td" sx={celdaMonto}>{f.soloControl ? '—' : fmtDOP(invertidoDe(f))}</Box>
                      <Box component="td" sx={{ ...celdaMonto, fontWeight: 600, color: '#111827' }}>{f.soloControl ? '—' : fmtDOP(valeHoyDe(f))}</Box>
                      <Box component="td" sx={celda}>
                        <Chip label={LABEL_ESTADO_VISIBLE[f.estadoVisible]} size="small" sx={{ height: 22, fontSize: '0.75rem', bgcolor: col.bg, color: col.fg, fontWeight: 600 }} />
                      </Box>
                      {puedeGestionar && (
                        <Box component="td" sx={{ ...celda, whiteSpace: 'nowrap' }}>
                          <TextField
                            select size="small" value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                            aria-label={`Estado de ${f.nombre}`} sx={{ width: 110, mr: 1, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
                          >
                            {ESTADOS_ACTIVO.map((e) => <MenuItem key={e.clave} value={e.clave}>{e.label}</MenuItem>)}
                          </TextField>
                          <Button size="small" onClick={() => setMueve(f)}>Mover</Button>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {traslados.length > 0 && (
        <Box sx={{ ...CARD, p: 2 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', mb: 1 }}>Traslados recientes</Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {traslados.map((t) => (
              <Box component="li" key={t.id} sx={{ fontSize: '0.8125rem', color: '#374151' }}>
                {fechaCorta(t.fecha)} · {fmtNumero(t.unidades)} {t.unidades === 1 ? 'unidad' : 'unidades'} de «{t.nombre}» · de {t.origen ?? 'sin aula'} a {t.destino ?? 'sin aula'}
                {t.nota ? ` · ${t.nota}` : ''}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {mueve && (
        <MoverDialogo
          ficha={mueve} origenId={espacio?.id ?? null} destinos={espacios}
          onCerrar={() => setMueve(null)} onListo={() => { setMueve(null); router.refresh(); }}
        />
      )}
      {agrega && espacio && (
        <AgregarDialogo espacioId={espacio.id} hoy={hoy} onCerrar={() => setAgrega(false)} onListo={() => { setAgrega(false); router.refresh(); }} />
      )}
    </Box>
  );
}

/** Mover unidades de una ficha a otra aula. Todas: cambia el aula. Una parte: la ficha se divide. */
function MoverDialogo({ ficha, origenId, destinos, onCerrar, onListo }: {
  ficha: FichaDeAula; origenId: number | null; destinos: { id: number; nombre: string }[]; onCerrar: () => void; onListo: () => void;
}) {
  const opciones = destinos.filter((d) => d.id !== origenId);
  const [destino, setDestino] = useState(opciones[0] ? String(opciones[0].id) : '');
  const [unidades, setUnidades] = useState(String(ficha.cantidadVigente));
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const k = parseInt(unidades, 10);
  const valida = Number.isInteger(k) && k >= 1 && k <= ficha.cantidadVigente && destino !== '';
  const parcial = valida && k < ficha.cantidadVigente;

  async function enviar() {
    setError(null); setEnviando(true);
    try {
      const res = await fetch('/api/escolar/inventario-aula/trasladar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activoId: ficha.id, espacioDestinoId: Number(destino), unidades: k, nota }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'No se pudo mover.'); setEnviando(false); return; }
      onListo();
    } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); setEnviando(false); }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Mover · {ficha.nombre}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        {opciones.length === 0 ? (
          <Alert severity="info">No hay otra aula a donde mover. Crea una en Configuración, Planta física.</Alert>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <TextField label="Aula de destino" select value={destino} onChange={(e) => setDestino(e.target.value)} sx={{ minWidth: 240, flex: 1 }}>
                {opciones.map((d) => <MenuItem key={d.id} value={String(d.id)}>{d.nombre}</MenuItem>)}
              </TextField>
              <TextField
                label="Unidades" type="number" value={unidades} onChange={(e) => setUnidades(e.target.value)}
                helperText={`Hay ${ficha.cantidadVigente}`} slotProps={{ htmlInput: { min: 1, max: ficha.cantidadVigente, step: '1' } }} sx={{ width: 130 }}
              />
            </Box>
            <TextField label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            {parcial && (
              <Alert severity="info">
                Se mueve una parte: la ficha se divide en dos. El costo y lo ya depreciado se reparten por unidades, al centavo.
                No cambia nada en los asientos contables.
              </Alert>
            )}
          </>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={!valida || enviando || opciones.length === 0} sx={AZUL}>
          {enviando ? 'Moviendo…' : 'Mover'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Agregar un activo al aula. Es la misma ficha de contabilidad, con el aula ya puesta. */
function AgregarDialogo({ espacioId, hoy, onCerrar, onListo }: { espacioId: number; hoy: string; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [costo, setCosto] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [soloControl, setSoloControl] = useState(false);
  const [categoria, setCategoria] = useState('mobiliario');
  const [vida, setVida] = useState('60');
  const [residual, setResidual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cant = parseInt(cantidad, 10);
  const cat = categoriaActivo(categoria);
  const sinDepreciar = soloControl || cat?.deprecia === false;
  const vidaN = parseInt(vida, 10);
  const valida = nombre.trim() !== '' && aCentavos(costo) > 0 && Number.isInteger(cant) && cant >= 1 && fecha !== '' && (sinDepreciar || (Number.isFinite(vidaN) && vidaN > 0));

  async function enviar() {
    setError(null); setEnviando(true);
    try {
      const res = await fetch('/api/escolar/inventario-aula/activos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          espacioId, nombre: nombre.trim(), cantidad: cant, costoPesos: costo, fechaAdquisicion: fecha, soloControl,
          categoria: soloControl ? null : categoria || null,
          ...(sinDepreciar ? {} : { vidaUtilMeses: vidaN, valorResidualPesos: residual.trim() === '' ? 0 : residual }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'No se pudo guardar.'); setEnviando(false); return; }
      onListo();
    } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); setEnviando(false); }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Agregar activo al aula</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Butacas, pizarra, abanicos" />
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 120 }} />
          <TextField label={cant > 1 ? 'Costo total (RD$)' : 'Costo (RD$)'} type="number" value={costo} onChange={(e) => setCosto(e.target.value)} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 170 }} />
          <TextField label="Fecha de compra" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} />
        </Box>
        <FormControlLabel
          control={<Checkbox checked={soloControl} onChange={(e) => setSoloControl(e.target.checked)} />}
          label="Solo control de inventario (no se deprecia)"
        />
        {soloControl ? (
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Para cosas baratas que se cuentan pero van al gasto. Se cuentan en unidades; no tienen depreciación ni asientos.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField label="Categoría" select value={categoria} onChange={(e) => setCategoria(e.target.value)} sx={{ minWidth: 240, flex: 1 }}>
              {CATEGORIAS_ACTIVO.map((c) => <MenuItem key={c.clave} value={c.clave}>{c.label}</MenuItem>)}
            </TextField>
            {!sinDepreciar && (
              <>
                <TextField label="Vida útil (meses)" type="number" value={vida} onChange={(e) => setVida(e.target.value)} slotProps={{ htmlInput: { min: 1, step: '1' } }} sx={{ width: 150 }} />
                <TextField label="Valor residual (RD$)" type="number" value={residual} onChange={(e) => setResidual(e.target.value)} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} sx={{ width: 170 }} />
              </>
            )}
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onCerrar} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={!valida || enviando} sx={AZUL}>{enviando ? 'Guardando…' : 'Guardar'}</Button>
      </DialogActions>
    </Dialog>
  );
}
