'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Power, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import type { CuentaNodo, Cuenta } from '@/lib/contabilidad/cuentas';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

const TIPOS = [
  { valor: 'activo',     label: 'Activo' },
  { valor: 'pasivo',     label: 'Pasivo' },
  { valor: 'patrimonio', label: 'Patrimonio' },
  { valor: 'ingreso',    label: 'Ingresos' },
  { valor: 'costo',      label: 'Costos' },
  { valor: 'gasto',      label: 'Gastos' },
] as const;

const TIPO_TONO: Record<string, { bg: string; fg: string; border: string }> = {
  activo:     { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  pasivo:     { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  patrimonio: { bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' },
  ingreso:    { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  costo:      { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  gasto:      { bg: '#fff1f2', fg: '#be123c', border: '#fecdd3' },
};
const TIPO_FALLBACK = { bg: '#f9fafb', fg: '#4b5563', border: '#e5e7eb' };

/** Naturaleza que le toca a la clase. Espeja `naturalezaPorTipo` del servidor. */
function naturalezaPorTipo(tipo: string) {
  return tipo === 'activo' || tipo === 'costo' || tipo === 'gasto' ? 'deudora' : 'acreedora';
}

interface FormState {
  id?:            number;
  codigo:         string;
  nombre:         string;
  tipo:           string;
  naturaleza:     string;
  cuentaPadreId:  number | null;
  imputable:      boolean;
}

const FORM_VACIO: FormState = {
  codigo: '', nombre: '', tipo: 'activo', naturaleza: 'deudora',
  cuentaPadreId: null, imputable: true,
};

export function CatalogoClient({
  cuentasIniciales,
  puedeConfigurar,
}: {
  cuentasIniciales: CuentaNodo[];
  puedeConfigurar: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm]           = useState<FormState | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [aviso, setAviso]         = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [colapsadas, setColapsadas] = useState<Set<number>>(new Set());
  const [verInactivas, setVerInactivas] = useState(false);

  /** Aplana el árbol respetando el colapso, para pintarlo como tabla indentada. */
  const filas = useMemo(() => {
    const out: CuentaNodo[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!verInactivas && !n.activa) continue;
        out.push(n);
        if (!colapsadas.has(n.id)) recorrer(n.hijas);
      }
    };
    recorrer(cuentasIniciales);
    return out;
  }, [cuentasIniciales, colapsadas, verInactivas]);

  /** Candidatas a cuenta padre: solo las de agrupación, y nunca la propia cuenta. */
  const padresPosibles = useMemo(() => {
    const out: { id: number; codigo: string; nombre: string }[] = [];
    const recorrer = (nodos: CuentaNodo[]) => {
      for (const n of nodos) {
        if (!n.imputable && n.id !== form?.id) {
          out.push({ id: n.id, codigo: n.codigo, nombre: n.nombre });
        }
        recorrer(n.hijas);
      }
    };
    recorrer(cuentasIniciales);
    return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [cuentasIniciales, form?.id]);

  function alternarColapso(id: number) {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function abrirNueva(padre?: CuentaNodo) {
    setError(null);
    setForm({
      ...FORM_VACIO,
      cuentaPadreId: padre?.id ?? null,
      tipo: padre?.tipo ?? 'activo',
      naturaleza: naturalezaPorTipo(padre?.tipo ?? 'activo'),
    });
  }

  function abrirEditar(c: Cuenta) {
    setError(null);
    setForm({
      id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo,
      naturaleza: c.naturaleza, cuentaPadreId: c.cuentaPadreId, imputable: c.imputable,
    });
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setError(null);

    const esEdicion = form.id !== undefined;
    const res = await fetch(
      esEdicion ? `/api/contabilidad/cuentas/${form.id}` : '/api/contabilidad/cuentas',
      {
        method: esEdicion ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: form.codigo,
          nombre: form.nombre,
          tipo: form.tipo,
          naturaleza: form.naturaleza,
          cuentaPadreId: form.cuentaPadreId,
          imputable: form.imputable,
        }),
      },
    );

    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo guardar la cuenta.');
      return;
    }

    setForm(null);
    startTransition(() => router.refresh());
  }

  async function alternarActiva(c: Cuenta) {
    setError(null);
    const res = await fetch(`/api/contabilidad/cuentas/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !c.activa }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo cambiar el estado de la cuenta.');
      return;
    }
    startTransition(() => router.refresh());
  }

  /**
   * Reinserta las cuentas del catálogo base que falten. Hace falta porque la
   * siembra automática se planta si el team ya tiene cuentas: un catálogo
   * creado antes de que el Paso 3 agregara `1106`, `4104` y `6102` no las
   * tendría nunca.
   */
  async function restaurarBase() {
    setGuardando(true);
    setError(null);
    const res = await fetch('/api/contabilidad/cuentas/restaurar-base', { method: 'POST' });
    setGuardando(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudieron restaurar las cuentas base.');
      return;
    }
    const { insertadas } = await res.json();
    setAviso(insertadas > 0
      ? `Se agregaron ${insertadas} cuenta(s) que faltaban del catálogo base.`
      : 'El catálogo base ya está completo, no faltaba ninguna.');
    startTransition(() => router.refresh());
  }

  async function borrar(c: Cuenta) {
    if (!confirm(`¿Eliminar la cuenta ${c.codigo} ${c.nombre}?`)) return;
    setError(null);
    const res = await fetch(`/api/contabilidad/cuentas/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo eliminar la cuenta.');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {aviso && <Alert severity="info">{aviso}</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={verInactivas}
              onChange={(e) => setVerInactivas(e.target.checked)}
            />
          }
          label="Mostrar cuentas desactivadas"
          slotProps={{ typography: { sx: { fontSize: '0.875rem', color: '#4b5563' } } }}
          sx={{ mr: 0 }}
        />

        {puedeConfigurar && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outlined" color="inherit" size="small"
              onClick={restaurarBase} disabled={guardando}
              sx={{ color: '#374151', borderColor: '#d1d5db' }}
            >
              Restaurar cuentas base
            </Button>
            <Button
              variant="contained" size="small"
              onClick={() => abrirNueva()}
              startIcon={<Plus style={{ width: 16, height: 16 }} />}
              sx={{ px: 2 }}
            >
              Nueva cuenta
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Cuenta</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Naturaleza</TableCell>
                <TableCell>Movimientos</TableCell>
                {puedeConfigurar && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((c) => {
                const tono = TIPO_TONO[c.tipo] ?? TIPO_FALLBACK;
                return (
                  <TableRow key={c.id} sx={c.activa ? undefined : { bgcolor: '#f9fafb', '& td': { color: '#9ca3af' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', pl: `${c.nivel * 20}px` }}>
                        {c.hijas.length > 0 ? (
                          <IconButton
                            size="small"
                            onClick={() => alternarColapso(c.id)}
                            aria-label={colapsadas.has(c.id) ? 'Expandir' : 'Colapsar'}
                            sx={{ mr: 0.5, p: 0.25, color: '#9ca3af' }}
                          >
                            {colapsadas.has(c.id)
                              ? <ChevronRight style={{ width: 16, height: 16 }} />
                              : <ChevronDown style={{ width: 16, height: 16 }} />}
                          </IconButton>
                        ) : (
                          <Box component="span" sx={{ mr: 0.5, width: 24 }} />
                        )}
                        <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>
                          {c.codigo}
                        </Box>
                        <Box component="span" sx={{ ml: 1.5, ...(c.imputable ? {} : { fontWeight: 600, color: '#111827' }) }}>
                          {c.nombre}
                        </Box>
                        {!c.activa && (
                          <Box component="span" sx={{
                            ml: 1, fontSize: '10px', px: 0.75, py: 0.25, borderRadius: '4px',
                            bgcolor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb',
                          }}>
                            Desactivada
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box component="span" sx={{
                        display: 'inline-block', fontSize: '0.75rem', fontWeight: 500,
                        px: 1, py: 0.25, borderRadius: '4px', whiteSpace: 'nowrap',
                        bgcolor: tono.bg, color: tono.fg, border: `1px solid ${tono.border}`,
                      }}>
                        {TIPOS.find((t) => t.valor === c.tipo)?.label ?? c.tipo}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: '#4b5563' }}>
                      {c.naturaleza === 'deudora' ? 'Deudora' : 'Acreedora'}
                      {/* Señal de cuenta de contrapartida: naturaleza invertida
                          respecto a su clase. Vale la pena que salte a la vista. */}
                      {c.naturaleza !== naturalezaPorTipo(c.tipo) && (
                        <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', color: '#d97706' }}>
                          (invertida)
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ color: '#4b5563' }}>
                      {c.imputable ? 'Acepta' : <Box component="span" sx={{ color: '#9ca3af' }}>Agrupa</Box>}
                    </TableCell>
                    {puedeConfigurar && (
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                          {!c.imputable && (
                            <IconButton
                              size="small" title="Agregar cuenta hija"
                              onClick={() => abrirNueva(c)}
                              sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
                            >
                              <Plus style={{ width: 16, height: 16 }} />
                            </IconButton>
                          )}
                          <IconButton
                            size="small" title="Editar"
                            onClick={() => abrirEditar(c)}
                            sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
                          >
                            <Pencil style={{ width: 16, height: 16 }} />
                          </IconButton>
                          <IconButton
                            size="small" title={c.activa ? 'Desactivar' : 'Activar'}
                            onClick={() => alternarActiva(c)}
                            sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
                          >
                            <Power style={{ width: 16, height: 16 }} />
                          </IconButton>
                          {/* Las cuentas del catálogo base son estructurales; se
                              desactivan, no se borran. Borrar queda para las que
                              creó el usuario. */}
                          {!c.esBase && (
                            <IconButton
                              size="small" title="Eliminar"
                              onClick={() => borrar(c)}
                              sx={{ color: '#9ca3af', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}
                            >
                              <Trash2 style={{ width: 16, height: 16 }} />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={puedeConfigurar ? 5 : 4} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    No hay cuentas en el catálogo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
        Las cuentas que <strong>agrupan</strong> no reciben movimientos: su saldo es la suma
        de las que cuelgan de ellas. Los asientos van siempre en las cuentas que
        <strong> aceptan</strong> movimientos.
      </Typography>

      <Dialog open={form !== null} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
          {form?.id ? 'Editar cuenta' : 'Nueva cuenta'}
        </DialogTitle>

        <DialogContent>
          {form && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 1.5 }}>
                <TextField
                  label="Código"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="1101"
                  slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
                />
                <TextField
                  label="Nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Caja chica"
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <TextField
                  label="Tipo" select
                  value={form.tipo}
                  onChange={(e) => setForm({
                    ...form,
                    tipo: e.target.value,
                    // Al cambiar la clase se repropone su naturaleza. Si el
                    // usuario la invierte después, esa elección se respeta.
                    naturaleza: naturalezaPorTipo(e.target.value),
                  })}
                >
                  {TIPOS.map((t) => (
                    <MenuItem key={t.valor} value={t.valor}>{t.label}</MenuItem>
                  ))}
                </TextField>
                <Box>
                  <TextField
                    label="Naturaleza" select fullWidth
                    value={form.naturaleza}
                    onChange={(e) => setForm({ ...form, naturaleza: e.target.value })}
                  >
                    <MenuItem value="deudora">Deudora</MenuItem>
                    <MenuItem value="acreedora">Acreedora</MenuItem>
                  </TextField>
                  {form.naturaleza !== naturalezaPorTipo(form.tipo) && (
                    <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#d97706' }}>
                      Invertida respecto a su tipo. Es lo correcto para cuentas que
                      restan, como descuentos o devoluciones.
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <TextField
                  label="Cuenta padre" select fullWidth
                  value={form.cuentaPadreId ?? ''}
                  onChange={(e) => setForm({
                    ...form,
                    cuentaPadreId: e.target.value ? Number(e.target.value) : null,
                  })}
                >
                  <MenuItem value="">Ninguna (cuenta raíz)</MenuItem>
                  {padresPosibles.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</MenuItem>
                  ))}
                </TextField>
                <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: '#6b7280' }}>
                  Solo aparecen las cuentas que agrupan. Una cuenta que acepta
                  movimientos no puede tener hijas.
                </Typography>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={form.imputable}
                    onChange={(e) => setForm({ ...form, imputable: e.target.checked })}
                    sx={{ alignSelf: 'flex-start', pt: 0 }}
                  />
                }
                label={
                  <Box>
                    Acepta movimientos
                    <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Desmárcalo si esta cuenta solo agrupa a otras.
                    </Typography>
                  </Box>
                }
                slotProps={{ typography: { sx: { fontSize: '0.875rem' } } }}
                sx={{ alignItems: 'flex-start', mr: 0 }}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined" color="inherit"
            onClick={() => setForm(null)} disabled={guardando}
            sx={{ color: '#374151', borderColor: '#d1d5db' }}
          >
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || pending}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
