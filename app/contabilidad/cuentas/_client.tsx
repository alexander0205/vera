'use client';

import { useState, useMemo, useTransition, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Power, Trash2, ChevronRight, ChevronDown, Download, Upload } from 'lucide-react';
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
import type { ResultadoImportacion } from '@/lib/contabilidad/cuentas-importar';

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

  /**
   * Qué cuenta se está creando o editando, con sus valores INICIALES.
   *
   * Lo que se teclea no vive aquí sino dentro de `CuentaDialog`. Antes vivía en
   * este componente, que es el que pinta la tabla entera, y cada letra del código
   * o del nombre volvía a renderizar todas las filas del catálogo con sus ~20
   * componentes MUI cada una: escribir se volvía más lento con cada cuenta que se
   * agregaba. Con el estado dentro del diálogo, una tecla solo toca el diálogo.
   */
  const [dialogo, setDialogo]     = useState<FormState | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [aviso, setAviso]         = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
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
        if (!n.imputable && n.id !== dialogo?.id) {
          out.push({ id: n.id, codigo: n.codigo, nombre: n.nombre });
        }
        recorrer(n.hijas);
      }
    };
    recorrer(cuentasIniciales);
    return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [cuentasIniciales, dialogo?.id]);

  // `useCallback` en todo lo que reciben las filas: `FilaCuenta` está
  // memorizada, y una función nueva en cada render la haría re-renderizar igual.
  const alternarColapso = useCallback((id: number) => {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const abrirNueva = useCallback((padre?: CuentaNodo) => {
    setError(null);
    setDialogo({
      ...FORM_VACIO,
      cuentaPadreId: padre?.id ?? null,
      tipo: padre?.tipo ?? 'activo',
      naturaleza: naturalezaPorTipo(padre?.tipo ?? 'activo'),
    });
  }, []);

  const abrirEditar = useCallback((c: Cuenta) => {
    setError(null);
    setDialogo({
      id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo,
      naturaleza: c.naturaleza, cuentaPadreId: c.cuentaPadreId, imputable: c.imputable,
    });
  }, []);

  const alGuardar = useCallback(() => {
    setDialogo(null);
    startTransition(() => router.refresh());
  }, [router]);

  const alternarActiva = useCallback(async (c: Cuenta) => {
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
  }, [router]);

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

  const borrar = useCallback(async (c: Cuenta) => {
    if (!confirm(`¿Eliminar la cuenta ${c.codigo} ${c.nombre}?`)) return;
    setError(null);
    const res = await fetch(`/api/contabilidad/cuentas/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'No se pudo eliminar la cuenta.');
      return;
    }
    startTransition(() => router.refresh());
  }, [router]);

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

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          {/* Exportar lo ve cualquiera que vea el catálogo: es de lectura, y el
              archivo sirve también de plantilla para importar. */}
          <Button
            component="a" href="/api/contabilidad/cuentas/export"
            variant="outlined" color="inherit" size="small"
            startIcon={<Download style={{ width: 16, height: 16 }} />}
            sx={{ color: '#374151', borderColor: '#d1d5db' }}
          >
            Exportar a Excel
          </Button>
        {puedeConfigurar && (
          <>
            <Button
              variant="outlined" color="inherit" size="small"
              onClick={() => { setAviso(null); setImportando(true); }}
              startIcon={<Upload style={{ width: 16, height: 16 }} />}
              sx={{ color: '#374151', borderColor: '#d1d5db' }}
            >
              Importar desde Excel
            </Button>
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
          </>
        )}
        </Box>
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
              {filas.map((c) => (
                <FilaCuenta
                  key={c.id}
                  c={c}
                  colapsada={colapsadas.has(c.id)}
                  puedeConfigurar={puedeConfigurar}
                  onColapso={alternarColapso}
                  onNueva={abrirNueva}
                  onEditar={abrirEditar}
                  onActiva={alternarActiva}
                  onBorrar={borrar}
                />
              ))}

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

      {/* Se monta al abrir y se desmonta al cerrar: cada apertura empieza con los
          valores de la cuenta elegida, sin restos de la anterior. */}
      {importando && (
        <ImportarCatalogoDialog
          onCerrar={() => setImportando(false)}
          onAplicado={(r) => {
            setImportando(false);
            setAviso(
              `Catálogo importado: ${r.creadas.length} cuenta(s) nueva(s), ` +
              `${r.actualizadas.length} actualizada(s), ${r.sinCambios} sin cambios.`,
            );
            startTransition(() => router.refresh());
          }}
        />
      )}

      {dialogo && (
        <CuentaDialog
          inicial={dialogo}
          padresPosibles={padresPosibles}
          onCerrar={() => setDialogo(null)}
          onGuardada={alGuardar}
          ocupado={pending}
        />
      )}
    </Box>
  );
}

// ─── Fila del catálogo ───────────────────────────────────────────────────────

/**
 * Una fila de la tabla, memorizada.
 *
 * Solo se vuelve a pintar si cambia SU cuenta o si se colapsa. Sin el `memo`,
 * cualquier cambio de estado del catálogo —abrir un diálogo, un aviso, el
 * `pending` de un refresh— repintaba todas las filas a la vez.
 */
const FilaCuenta = memo(function FilaCuenta({
  c, colapsada, puedeConfigurar, onColapso, onNueva, onEditar, onActiva, onBorrar,
}: {
  c: CuentaNodo;
  colapsada: boolean;
  puedeConfigurar: boolean;
  onColapso: (id: number) => void;
  onNueva: (padre?: CuentaNodo) => void;
  onEditar: (c: Cuenta) => void;
  onActiva: (c: Cuenta) => void;
  onBorrar: (c: Cuenta) => void;
}) {
  const tono = TIPO_TONO[c.tipo] ?? TIPO_FALLBACK;
  return (
    <TableRow sx={c.activa ? undefined : { bgcolor: '#f9fafb', '& td': { color: '#9ca3af' } }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', pl: `${c.nivel * 20}px` }}>
          {c.hijas.length > 0 ? (
            <IconButton
              size="small"
              onClick={() => onColapso(c.id)}
              aria-label={colapsada ? 'Expandir' : 'Colapsar'}
              sx={{ mr: 0.5, p: 0.25, color: '#9ca3af' }}
            >
              {colapsada
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
                onClick={() => onNueva(c)}
                sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
              >
                <Plus style={{ width: 16, height: 16 }} />
              </IconButton>
            )}
            <IconButton
              size="small" title="Editar"
              onClick={() => onEditar(c)}
              sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}
            >
              <Pencil style={{ width: 16, height: 16 }} />
            </IconButton>
            <IconButton
              size="small" title={c.activa ? 'Desactivar' : 'Activar'}
              onClick={() => onActiva(c)}
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
                onClick={() => onBorrar(c)}
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
});

// ─── Diálogo de crear / editar ───────────────────────────────────────────────

/**
 * El formulario de una cuenta, con su estado DENTRO.
 *
 * Es la razón de que exista como componente aparte: lo que se teclea en código o
 * nombre cambia este estado y re-renderiza solo este diálogo, no la tabla del
 * catálogo que hay detrás. El error de guardado también vive aquí — antes se
 * pintaba arriba de la página, tapado por el fondo del propio diálogo, y un
 * «Ya existe una cuenta con ese código» no lo veía nadie.
 */
function CuentaDialog({
  inicial, padresPosibles, onCerrar, onGuardada, ocupado,
}: {
  inicial: FormState;
  padresPosibles: { id: number; codigo: string; nombre: string }[];
  onCerrar: () => void;
  onGuardada: () => void;
  ocupado: boolean;
}) {
  const [form, setForm]           = useState<FormState>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Las opciones del padre no dependen de lo que se teclea: se arman una vez.
  // Un `TextField select` clona todos sus hijos en cada render.
  const opcionesPadre = useMemo(() => [
    <MenuItem key="" value="">Ninguna (cuenta raíz)</MenuItem>,
    ...padresPosibles.map((p) => (
      <MenuItem key={p.id} value={p.id}>{p.codigo} — {p.nombre}</MenuItem>
    )),
  ], [padresPosibles]);

  async function guardar() {
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
    onGuardada();
  }

  return (
    <Dialog open onClose={onCerrar} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>
        {form.id ? 'Editar cuenta' : 'Nueva cuenta'}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 1.5 }}>
            <TextField
              label="Código"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              placeholder="1101"
              autoFocus={!form.id}
              slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
            />
            <TextField
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Caja chica"
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField
              label="Tipo" select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({
                ...f,
                tipo: e.target.value,
                // Al cambiar la clase se repropone su naturaleza. Si el
                // usuario la invierte después, esa elección se respeta.
                naturaleza: naturalezaPorTipo(e.target.value),
              }))}
            >
              {TIPOS.map((t) => (
                <MenuItem key={t.valor} value={t.valor}>{t.label}</MenuItem>
              ))}
            </TextField>
            <Box>
              <TextField
                label="Naturaleza" select fullWidth
                value={form.naturaleza}
                onChange={(e) => setForm((f) => ({ ...f, naturaleza: e.target.value }))}
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
              onChange={(e) => setForm((f) => ({
                ...f,
                cuentaPadreId: e.target.value ? Number(e.target.value) : null,
              }))}
            >
              {opcionesPadre}
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
                onChange={(e) => setForm((f) => ({ ...f, imputable: e.target.checked }))}
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
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="outlined" color="inherit"
          onClick={onCerrar} disabled={guardando}
          sx={{ color: '#374151', borderColor: '#d1d5db' }}
        >
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || ocupado}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Importar desde Excel ────────────────────────────────────────────────────

/**
 * Sube un catálogo en Excel en dos pasos: primero la vista previa, después
 * aplicar.
 *
 * La vista previa no es un cálculo aparte: el servidor corre la importación
 * entera con las mismas reglas y la deshace. Por eso «se crearán 12» es
 * exactamente lo que pasa al aplicar, y un error de regla —cambiar el tipo de
 * una cuenta con movimientos— aparece AQUÍ, con su fila, y no a mitad del
 * guardado.
 */
function ImportarCatalogoDialog({
  onCerrar, onAplicado,
}: {
  onCerrar: () => void;
  onAplicado: (r: ResultadoImportacion) => void;
}) {
  const [archivo, setArchivo]       = useState<File | null>(null);
  const [resultado, setResultado]   = useState<ResultadoImportacion | null>(null);
  const [trabajando, setTrabajando] = useState<'revisando' | 'aplicando' | null>(null);
  const [error, setError]           = useState<string | null>(null);

  async function enviar(f: File, aplicar: boolean): Promise<ResultadoImportacion | null> {
    const fd = new FormData();
    fd.append('archivo', f);
    if (aplicar) fd.append('aplicar', '1');
    const res = await fetch('/api/contabilidad/cuentas/importar', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'No se pudo procesar el archivo.');
      return null;
    }
    return body as ResultadoImportacion;
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f);
    setResultado(null);
    setError(null);
    setTrabajando('revisando');
    const r = await enviar(f, false);
    setTrabajando(null);
    if (r) setResultado(r);
  }

  async function aplicar() {
    if (!archivo) return;
    setError(null);
    setTrabajando('aplicando');
    const r = await enviar(archivo, true);
    setTrabajando(null);
    if (!r) return;
    // Entre la vista previa y el clic alguien pudo tocar el catálogo: si la
    // corrida real encontró errores, se enseñan en vez de dar por hecho.
    if (!r.aplicado) {
      setResultado(r);
      return;
    }
    onAplicado(r);
  }

  const hayErrores = (resultado?.errores.length ?? 0) > 0;
  const hayCambios = !!resultado && (resultado.creadas.length + resultado.actualizadas.length) > 0;

  return (
    <Dialog open onClose={trabajando ? undefined : onCerrar} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>Importar catálogo desde Excel</DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>
            Usa como plantilla el archivo de <strong>Exportar a Excel</strong>. El código es la
            llave: los códigos nuevos se crean y los que ya existen se actualizan.
            Importar <strong>nunca borra</strong> cuentas.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              component="label" variant="outlined" size="small"
              startIcon={<Upload style={{ width: 16, height: 16 }} />}
              disabled={trabajando !== null}
            >
              {archivo ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
              <input
                hidden type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ''; }}
              />
            </Button>
            {archivo && (
              <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>{archivo.name}</Typography>
            )}
            {trabajando === 'revisando' && (
              <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280' }}>Revisando el archivo…</Typography>
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          {resultado && hayErrores && (
            <>
              <Alert severity="error">
                No se aplicó nada: {resultado.errores.length === 1 ? 'hay 1 fila' : `hay ${resultado.errores.length} filas`} con
                problemas. Corrígelas en Excel y vuelve a subir el archivo.
              </Alert>
              <Box sx={{ ...CARD, maxHeight: 280, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 64 }}>Fila</TableCell>
                      <TableCell sx={{ width: 110 }}>Código</TableCell>
                      <TableCell>Qué revisar</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resultado.errores.map((e, i) => (
                      <TableRow key={`${e.fila}-${i}`}>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{e.fila}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.codigo || '—'}</TableCell>
                        <TableCell sx={{ color: '#374151' }}>{e.mensaje}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}

          {resultado && !hayErrores && !hayCambios && (
            <Alert severity="info">
              El archivo coincide con el catálogo actual: no hay nada que cambiar
              ({resultado.sinCambios} cuenta(s) iguales).
            </Alert>
          )}

          {resultado && !hayErrores && hayCambios && (
            <>
              <Alert severity="success">
                Todo en orden. Al aplicar: <strong>{resultado.creadas.length}</strong> cuenta(s) nueva(s),{' '}
                <strong>{resultado.actualizadas.length}</strong> actualizada(s) y {resultado.sinCambios} sin cambios.
              </Alert>
              <Box sx={{ ...CARD, maxHeight: 280, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 110 }}>Código</TableCell>
                      <TableCell sx={{ width: 110 }}>Qué pasa</TableCell>
                      <TableCell>Detalle</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resultado.creadas.map((c) => (
                      <TableRow key={`c-${c.codigo}`}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.codigo}</TableCell>
                        <TableCell sx={{ color: '#047857', fontWeight: 500 }}>Se crea</TableCell>
                        <TableCell>{c.nombre}</TableCell>
                      </TableRow>
                    ))}
                    {resultado.actualizadas.map((a) => (
                      <TableRow key={`a-${a.codigo}`}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{a.codigo}</TableCell>
                        <TableCell sx={{ color: '#1d4ed8', fontWeight: 500 }}>Cambia</TableCell>
                        <TableCell sx={{ color: '#4b5563' }}>{a.cambios.join(', ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="outlined" color="inherit"
          onClick={onCerrar} disabled={trabajando !== null}
          sx={{ color: '#374151', borderColor: '#d1d5db' }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained" onClick={aplicar}
          disabled={!hayCambios || hayErrores || trabajando !== null}
        >
          {trabajando === 'aplicando' ? 'Aplicando…' : 'Aplicar cambios'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
