'use client';

import { ArrowLeft, ChevronDown, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useVolver } from '@/lib/hooks/useVolver';
import type {
  AlmacenItem, ListaPrecioItem, VendedorItem,
} from '../hooks/useDropdownsCatalog';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

interface Props {
  /** Esconde «Personalizar opciones»: almacén, lista de precios y vendedor no
   *  aplican a un colegio, y el menú solo ofrece cosas que no va a usar. */
  ocultarPersonalizar?: boolean;
  showAlmacen: boolean;
  setShowAlmacen: (v: boolean) => void;
  showListaPrecios: boolean;
  setShowListaPrecios: (v: boolean) => void;
  showVendedor: boolean;
  setShowVendedor: (v: boolean) => void;
  toggleOpcion: (key: string, value: boolean) => void;
  almacenes: AlmacenItem[];
  listasPrecios: ListaPrecioItem[];
  vendedores: VendedorItem[];
  almacenId: number | null;
  setAlmacenId: (v: number | null) => void;
  setAlmacenNombre: (v: string) => void;
  listaPreciosId: number | null;
  setListaPreciosId: (v: number | null) => void;
  setListaPreciosNombre: (v: string) => void;
  vendedorId: number | null;
  setVendedorId: (v: number | null) => void;
  setVendedorNombre: (v: string) => void;
  onOpenNuevoAlmacen: () => void;
  onOpenNuevaLista: () => void;
  onOpenNuevoVendedor: () => void;
}

export function NavBar({
  ocultarPersonalizar = false,
  showAlmacen, setShowAlmacen,
  showListaPrecios, setShowListaPrecios,
  showVendedor, setShowVendedor,
  toggleOpcion,
  title = 'Nueva factura',
  onVolver,
}: Pick<Props, 'showAlmacen' | 'setShowAlmacen' | 'showListaPrecios' | 'setShowListaPrecios' | 'showVendedor' | 'setShowVendedor' | 'toggleOpcion'>
  & { title?: string; ocultarPersonalizar?: boolean; onVolver?: () => void }) {
  const personalizarRef = useRef<HTMLDivElement>(null);
  const [showPersonalizar, setShowPersonalizar] = useState(false);
  // Esta barra la comparten factura y cotización, y el respaldo siempre fue el
  // listado de facturas. Con el historial delante, el que entró a cotizar
  // vuelve a cotizaciones sin tener que parametrizar nada.
  const historial = useVolver('/dashboard/facturas');
  // Dentro de un cajón no hay a dónde volver: navegar cambiaría la página que
  // está DEBAJO —la ficha desde la que se está facturando— y al cerrar el
  // cajón uno aparecería en el listado de facturas sin haberlo pedido.
  const volver = onVolver ?? historial;

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (personalizarRef.current && !personalizarRef.current.contains(e.target as Node)) {
        setShowPersonalizar(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
      <Button
        onClick={volver}
        variant="text"
        size="small"
        startIcon={<ArrowLeft size={16} />}
        sx={{ textTransform: 'none', color: '#4b5563', '&:hover': { color: '#111827', bgcolor: 'transparent' }, px: 1 }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Volver</Box>
      </Button>
      <Typography sx={{ fontSize: { xs: '1rem', sm: '1.125rem' }, fontWeight: 600, color: '#374151', flex: { xs: 1, sm: 'none' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </Typography>

      {!ocultarPersonalizar && (
      <Box ref={personalizarRef} sx={{ position: 'relative', ml: 'auto' }}>
        <Button
          type="button"
          variant="outlined"
          size="small"
          aria-label="Personalizar opciones"
          onClick={() => setShowPersonalizar(v => !v)}
          endIcon={<ChevronDown size={14} style={{ opacity: 0.6 }} />}
          startIcon={<Settings size={16} />}
          sx={{ textTransform: 'none', borderRadius: '8px', color: '#4b5563', borderColor: '#e5e7eb', fontSize: '0.875rem' }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Personalizar opciones</Box>
        </Button>
        {showPersonalizar && (
          <Box sx={{ position: 'absolute', right: 0, top: '100%', mt: 0.5, zIndex: 50, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', p: 2, width: 208 }}>
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1.5 }}>
              Opciones disponibles
            </Typography>
            {[
              { key: 'almacen',      label: 'Almacén',         state: showAlmacen,      setter: setShowAlmacen },
              { key: 'listaPrecios', label: 'Lista de Precio', state: showListaPrecios, setter: setShowListaPrecios },
              { key: 'vendedor',     label: 'Vendedor',        state: showVendedor,     setter: setShowVendedor },
            ].map(({ key, label, state, setter }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    size="small"
                    checked={state}
                    onChange={(e) => { setter(e.target.checked); toggleOpcion(key, e.target.checked); }}
                    sx={{ color: '#d1d5db', '&.Mui-checked': { color: '#3658e1' }, p: 0.5 }}
                  />
                }
                label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>{label}</Typography>}
                labelPlacement="start"
                sx={{ display: 'flex', justifyContent: 'space-between', mx: 0, px: 0.75, py: 0.75, borderRadius: '6px', '&:hover': { bgcolor: '#f9fafb' } }}
              />
            ))}
          </Box>
        )}
      </Box>
      )}
    </Box>
  );
}

export function TopBar({
  showAlmacen, showListaPrecios, showVendedor,
  almacenes, listasPrecios, vendedores,
  almacenId, setAlmacenId, setAlmacenNombre,
  listaPreciosId, setListaPreciosId, setListaPreciosNombre,
  vendedorId, setVendedorId, setVendedorNombre,
  onOpenNuevoAlmacen, onOpenNuevaLista, onOpenNuevoVendedor,
}: Props) {
  if (!showAlmacen && !showListaPrecios && !showVendedor) return null;

  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 3 }, py: 2, mb: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'auto auto auto 1fr' }, alignItems: 'center', gap: 1.5 }}>
        {showAlmacen && (
          <Box sx={{ minWidth: 160 }}>
            <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, mb: 0.5 }}>Almacén</Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={almacenId?.toString() ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__nuevo') { onOpenNuevoAlmacen(); return; }
                  const alm = almacenes.find(a => a.id.toString() === v);
                  setAlmacenId(alm?.id ?? null);
                  setAlmacenNombre(alm?.nombre ?? '');
                }}
                displayEmpty
                sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
              >
                <MenuItem value="" disabled sx={{ fontSize: '0.875rem' }}>Seleccionar...</MenuItem>
                {almacenes.map(a => <MenuItem key={a.id} value={a.id.toString()} sx={{ fontSize: '0.875rem' }}>{a.nombre}</MenuItem>)}
                <MenuItem value="__nuevo" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>+ Nuevo almacén</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}

        {showListaPrecios && (
          <Box sx={{ minWidth: 160 }}>
            <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, mb: 0.5 }}>Lista de precios</Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={listaPreciosId?.toString() ?? '__none'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__nuevo') { onOpenNuevaLista(); return; }
                  if (v === '__none') { setListaPreciosId(null); setListaPreciosNombre(''); return; }
                  const lista = listasPrecios.find(l => l.id.toString() === v);
                  setListaPreciosId(lista?.id ?? null);
                  setListaPreciosNombre(lista?.nombre ?? '');
                }}
                sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
              >
                <MenuItem value="__none" sx={{ fontSize: '0.875rem' }}>General</MenuItem>
                {listasPrecios.map(l => (
                  <MenuItem key={l.id} value={l.id.toString()} sx={{ fontSize: '0.875rem' }}>
                    {l.nombre}{l.tipo === 'porcentaje' && l.porcentaje > 0 ? ` (${(l.porcentaje / 100).toFixed(2)}%)` : ''}
                  </MenuItem>
                ))}
                <MenuItem value="__nuevo" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>+ Nueva lista</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}

        {showVendedor && (
          <Box sx={{ minWidth: 160 }}>
            <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, mb: 0.5 }}>Vendedor</Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={vendedorId?.toString() ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__nuevo') { onOpenNuevoVendedor(); return; }
                  const ven = vendedores.find(v2 => v2.id.toString() === v);
                  setVendedorId(ven?.id ?? null);
                  setVendedorNombre(ven?.nombre ?? '');
                }}
                displayEmpty
                sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
              >
                <MenuItem value="" disabled sx={{ fontSize: '0.875rem' }}>Buscar...</MenuItem>
                {vendedores.map(v => <MenuItem key={v.id} value={v.id.toString()} sx={{ fontSize: '0.875rem' }}>{v.nombre}</MenuItem>)}
                <MenuItem value="__nuevo" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>+ Nuevo vendedor</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
      </Box>
    </Box>
  );
}
