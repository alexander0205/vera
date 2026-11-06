'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { fmtDOP } from '@/lib/utils/format';
import { partidasCuadreInventario } from '@/lib/inventario/costo';

interface Fila {
  productoId: number; varianteId: number | null; nombre: string; referencia: string | null;
  existencia: number; costoUnitarioCents: number; valorCents: number;
}
interface Props {
  valor: {
    filas: Fila[]; valorInventarioCents: number; saldoContableCents: number; diferenciaCents: number;
    cuadra: boolean; sinCosto: number; cuentaInventario: { id: number; codigo: string; nombre: string } | null;
  };
  cuentas: { id: number; codigo: string; nombre: string }[];
  contraSobraId: number | null;
  contraFaltaId: number | null;
  activa: boolean;
  puedeGestionar: boolean;
}

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2 } as const;
const NUM = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

export function InventarioValorClient({ valor, cuentas, contraSobraId, contraFaltaId, activa, puedeGestionar }: Props) {
  const router = useRouter();
  const sobra = valor.diferenciaCents > 0;
  const [abierto, setAbierto] = useState(false);
  const [contraId, setContraId] = useState<number | ''>((sobra ? contraSobraId : contraFaltaId) ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const ocupado = useRef(false);

  const cuentaInv = valor.cuentaInventario;
  const contra = cuentas.find((c) => c.id === contraId);
  const partidas = cuentaInv && contraId
    ? partidasCuadreInventario(valor.diferenciaCents, cuentaInv.id, Number(contraId)) : [];
  const nombreCuenta = (id: number) => {
    const c = id === cuentaInv?.id ? cuentaInv : cuentas.find((x) => x.id === id);
    return c ? `${c.codigo} ${c.nombre}` : `#${id}`;
  };

  async function confirmar() {
    if (ocupado.current || !contraId) return;
    ocupado.current = true; setGuardando(true); setError(null);
    try {
      const res = await fetch('/api/contabilidad/inventario/cuadrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diferenciaCents: valor.diferenciaCents, contrapartidaId: contraId }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error ?? 'No se pudo registrar el asiento');
      setAbierto(false); setOk('Listo: el asiento quedó en el libro diario y el inventario cuadra.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { ocupado.current = false; setGuardando(false); }
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Valor del inventario</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Sale de las existencias de Inventario × el costo promedio de cada producto (el costo se actualiza con cada compra),
          comparado con el saldo de la cuenta {cuentaInv ? `${cuentaInv.codigo} ${cuentaInv.nombre}` : '1105 Inventario'} del libro.
        </Typography>
      </Box>

      {ok && <Alert severity="success" onClose={() => setOk(null)}>{ok}</Alert>}
      {!activa && <Alert severity="warning">La contabilidad automática está apagada: el libro no recibe ventas ni mermas. Enciéndela en Configuración.</Alert>}
      {!cuentaInv && <Alert severity="error">No hay una cuenta de Inventario (1105) en tu catálogo.</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
        <Box sx={CARD}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Valor del inventario</Typography>
          <Typography sx={{ ...NUM, fontSize: '1.5rem', fontWeight: 700 }}>{fmtDOP(valor.valorInventarioCents)}</Typography>
        </Box>
        <Box sx={CARD}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Saldo en el libro (1105)</Typography>
          <Typography sx={{ ...NUM, fontSize: '1.5rem', fontWeight: 700 }}>{fmtDOP(valor.saldoContableCents)}</Typography>
        </Box>
        <Box sx={{ ...CARD, borderColor: valor.cuadra ? '#bbf7d0' : '#fde68a', bgcolor: valor.cuadra ? '#f0fdf4' : '#fffbeb' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>Diferencia</Typography>
          <Typography sx={{ ...NUM, fontSize: '1.5rem', fontWeight: 700, color: valor.cuadra ? '#15803d' : '#b45309' }}>
            {valor.cuadra ? 'Cuadra' : fmtDOP(valor.diferenciaCents)}
          </Typography>
          {!valor.cuadra && (
            <Typography sx={{ fontSize: '0.75rem', color: '#92400e' }}>
              {sobra ? 'El inventario vale más de lo que dice el libro.' : 'El libro dice más de lo que vale el inventario.'}
            </Typography>
          )}
        </Box>
      </Box>

      {!valor.cuadra && cuentaInv && (
        <Box sx={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
            Típico de una empresa que ya tenía mercancía antes de usar Contabilidad, o de ventas viejas cuyo costo nunca se asentó.
            Puedes llevar 1105 al valor real con un asiento. Se te muestra antes de guardar.
          </Typography>
          {puedeGestionar && activa ? (
            <Box><Button variant="contained" onClick={() => { setError(null); setAbierto(true); }}>Asiento de ajuste para cuadrar 1105</Button></Box>
          ) : (
            <Typography sx={{ fontSize: '0.8rem', color: '#6b7280' }}>Necesitas el permiso de gestionar contabilidad para hacer este asiento.</Typography>
          )}
        </Box>
      )}

      {valor.sinCosto > 0 && (
        <Alert severity="info">
          {valor.sinCosto} producto(s) tienen existencia pero costo cero, así que valen cero aquí.
          El costo se llena al registrar una compra en <Link href="/dashboard/compras">Compras</Link> o editando el producto.
        </Alert>
      )}

      <Box sx={{ ...CARD, p: 0, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Producto</TableCell>
              <TableCell align="right">Existencia</TableCell>
              <TableCell align="right">Costo promedio</TableCell>
              <TableCell align="right">Valor</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {valor.filas.length === 0 && (
              <TableRow><TableCell colSpan={4} sx={{ color: '#6b7280' }}>No hay productos con existencia que controlen inventario.</TableCell></TableRow>
            )}
            {valor.filas.map((f) => (
              <TableRow key={`${f.productoId}-${f.varianteId ?? 0}`} hover>
                <TableCell>{f.nombre}{f.referencia ? <Box component="span" sx={{ color: '#9ca3af', ml: 1, fontSize: '0.75rem' }}>{f.referencia}</Box> : null}</TableCell>
                <TableCell align="right" sx={NUM}>{f.existencia}</TableCell>
                <TableCell align="right" sx={NUM}>{fmtDOP(f.costoUnitarioCents)}</TableCell>
                <TableCell align="right" sx={NUM}>{fmtDOP(f.valorCents)}</TableCell>
              </TableRow>
            ))}
            {valor.filas.length > 0 && (
              <TableRow sx={{ bgcolor: '#f9fafb' }}>
                <TableCell sx={{ fontWeight: 700 }}>Total</TableCell><TableCell /><TableCell />
                <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{fmtDOP(valor.valorInventarioCents)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={abierto} onClose={() => !guardando && setAbierto(false)} fullWidth maxWidth="sm">
        <DialogTitle>Asiento de ajuste para cuadrar 1105</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
            Se ajustará {fmtDOP(Math.abs(valor.diferenciaCents))} {sobra ? 'a favor' : 'en contra'} de Inventario para que el libro diga {fmtDOP(valor.valorInventarioCents)}.
            {sobra
              ? ' Si es mercancía que ya tenías antes de usar Zero, lo normal es llevarlo a Resultados acumulados.'
              : ' Si son ventas viejas sin costo asentado, lo normal es llevarlo a Costo de ventas.'}
          </Typography>
          <FormControl size="small" fullWidth>
            <Typography component="label" sx={{ fontSize: '0.8rem', color: '#374151', mb: 0.5 }}>Cuenta contra la que se ajusta</Typography>
            <Select value={contraId} onChange={(e) => setContraId(Number(e.target.value))} displayEmpty>
              {cuentas.filter((c) => c.id !== cuentaInv?.id).map((c) => <MenuItem key={c.id} value={c.id}>{c.codigo} {c.nombre}</MenuItem>)}
            </Select>
          </FormControl>
          {partidas.length > 0 && (
            <Table size="small">
              <TableHead><TableRow><TableCell>Cuenta</TableCell><TableCell align="right">Débito</TableCell><TableCell align="right">Crédito</TableCell></TableRow></TableHead>
              <TableBody>
                {partidas.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{nombreCuenta(l.cuentaId)}</TableCell>
                    <TableCell align="right" sx={NUM}>{l.debeCents ? fmtDOP(l.debeCents) : ''}</TableCell>
                    <TableCell align="right" sx={NUM}>{l.haberCents ? fmtDOP(l.haberCents) : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!contra && <Typography sx={{ fontSize: '0.8rem', color: '#b45309' }}>Elige la cuenta para ver el asiento.</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</Button>
          <Button variant="contained" onClick={confirmar} disabled={guardando || !contraId}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
