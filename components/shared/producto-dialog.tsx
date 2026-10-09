'use client';

/**
 * ProductoDialog — modal compartido de creación rápida de producto/servicio.
 *
 * ÚNICA fuente para crear productos inline: lo usan el POS ("Nuevo producto"
 * en la pantalla de venta) y cualquier pantalla del módulo Facturación que
 * necesite alta rápida. Soporta bien|servicio (mismo modal para registrar un
 * servicio, como en la pantalla de servicios). POST /api/productos.
 *
 * Para el form completo (stock por almacén, categorías, código de barras)
 * está la pantalla dashboard/productos — este modal enlaza el caso rápido.
 */

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import { Camera, X, Package, Wrench, Star } from 'lucide-react';
import {
  OPCIONES_DONDE_SE_VENDE, aBanderas, defaultPorTipo, type DondeSeVende,
} from '@/lib/productos/donde-se-vende';
import { toast } from 'sonner';

interface CategoriaOpt { id: number; nombre: string }

export interface ProductoCreado {
  id?: number;
  nombre?: string;
}

const IMG_MAX_BYTES = 800 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProductoDialog({ open, onClose, onCreated, tipoInicial = 'bien' }: {
  open: boolean;
  onClose: () => void;
  onCreated: (p?: ProductoCreado) => void;
  tipoInicial?: 'bien' | 'servicio';
}) {
  const [tipo, setTipo]           = useState<'bien' | 'servicio'>(tipoInicial);
  const [nombre, setNombre]       = useState('');
  const [precio, setPrecio]       = useState('');
  const [tasaItbis, setTasaItbis] = useState('0.18');
  const [imagen, setImagen]       = useState('');
  const [guardando, setGuardando] = useState(false);
  // Una sola pregunta en vez de dos interruptores sueltos: ver
  // lib/productos/donde-se-vende.ts.
  const [donde, setDonde] = useState<DondeSeVende>(defaultPorTipo(tipoInicial));
  const [favorito, setFavorito]     = useState(false);
  const [categoriaId, setCategoriaId] = useState<number | ''>('');
  const [categorias, setCategorias]   = useState<CategoriaOpt[]>([]);
  const [tocóVisible, setTocóVisible] = useState(false);

  // Cargar categorías al abrir (para la sección del POS).
  useEffect(() => {
    if (!open) return;
    fetch('/api/categorias').then(r => r.json()).then(d => setCategorias(d.categorias ?? [])).catch(() => {});
  }, [open]);

  // Default inteligente: un bien se vende en los dos lados; un servicio
  // (mensualidad, matrícula) solo en Facturación. Se respeta mientras el usuario
  // no haya elegido explícitamente.
  function cambiarTipo(val: 'bien' | 'servicio') {
    setTipo(val);
    if (!tocóVisible) setDonde(defaultPorTipo(val));
  }

  async function handleImagen(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { toast.error('Imagen demasiado grande (máx 800 KB)'); return; }
    setImagen(await fileToBase64(file));
  }

  async function guardar() {
    const p = Number(precio);
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!precio || isNaN(p) || p < 0) { toast.error('Precio inválido'); return; }
    setGuardando(true);
    const res = await fetch('/api/productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre, precio: p, tasaItbis, tipo, imagen: imagen || null,
        ...aBanderas(donde), posFavorito: favorito,
        categoriaId: categoriaId === '' ? null : categoriaId,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo crear el producto');
      return;
    }
    const data = await res.json().catch(() => ({}));
    toast.success(tipo === 'servicio' ? 'Servicio creado' : 'Producto creado');
    setNombre(''); setPrecio(''); setImagen(''); setCategoriaId(''); setFavorito(false);
    onCreated(data?.producto);
  }

  if (!open) return null;

  return (
    <Dialog open onClose={() => { if (!guardando) onClose(); }} fullWidth maxWidth={false} slotProps={{ paper: { sx: { maxWidth: 384, m: 2, borderRadius: '12px' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: 16, fontWeight: 500 }}>
            {tipo === 'servicio' ? 'Nuevo servicio' : 'Nuevo producto'}
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af' }}><X style={{ width: 18, height: 18 }} /></IconButton>
        </Box>

        {/* Toggle bien/servicio — mismo modal para ambos */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 0.5, bgcolor: '#f3f4f6', borderRadius: '10px', mb: 1.5 }}>
          {([['bien', 'Producto', Package], ['servicio', 'Servicio', Wrench]] as const).map(([val, label, Icon]) => (
            <Box
              key={val}
              component="button"
              type="button"
              onClick={() => cambiarTipo(val)}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                py: 0.875, borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: 500, transition: 'all 0.15s',
                bgcolor: tipo === val ? '#e0e7fd' : 'transparent',
                color: tipo === val ? '#24377d' : '#6b7280',
              }}
            >
              <Icon style={{ width: 14, height: 14 }} /> {label}
            </Box>
          ))}
        </Box>

        {tipo === 'bien' && (
          <Box component="label" sx={{ position: 'relative', mx: 'auto', mb: 1.5, display: 'flex', height: 80, width: 80, cursor: 'pointer', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '8px', border: '2px dashed #e5e7eb', bgcolor: '#f9fafb', color: '#9ca3af' }}>
            <Box component="input" type="file" accept="image/*" sx={{ display: 'none' }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleImagen(f); }} />
            {imagen ? <Box component="img" src={imagen} alt="" sx={{ height: '100%', width: '100%', objectFit: 'cover' }} /> : <Camera style={{ width: 24, height: 24 }} />}
          </Box>
        )}

        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Nombre</Typography>
        <TextField value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
          placeholder={tipo === 'servicio' ? 'Ej. Mensualidad escolar' : 'Ej. Café con leche'} fullWidth sx={{ mb: 1.5 }} />

        <Box sx={{ mb: 1.5, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          <Box>
            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Precio (DOP)</Typography>
            <TextField type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00" fullWidth slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
          </Box>
          <Box>
            <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>ITBIS</Typography>
            <TextField select value={tasaItbis} onChange={(e) => setTasaItbis(e.target.value)} fullWidth>
              <MenuItem value="0.18">18%</MenuItem>
              <MenuItem value="0.16">16%</MenuItem>
              <MenuItem value="0">0%</MenuItem>
              <MenuItem value="exento">Exento</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* Categoría — sección/chip en la grilla del POS */}
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>Categoría (sección del POS)</Typography>
        <TextField select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value === '' ? '' : Number(e.target.value))} fullWidth sx={{ mb: 1.5 }}>
          <MenuItem value="">Sin categoría</MenuItem>
          {categorias.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
        </TextField>

        {/* Dónde se vende — una pregunta, tres respuestas. Antes eran dos
            interruptores sueltos y se podían apagar los dos, dejando el producto
            invisible en todas partes sin aviso. */}
        <Typography component="label" sx={{ mb: 0.5, display: 'block', fontSize: 12, color: '#6b7280' }}>¿Dónde se vende?</Typography>
        <TextField
          select
          value={donde}
          onChange={(e) => { setDonde(e.target.value as DondeSeVende); setTocóVisible(true); }}
          fullWidth
          sx={{ mb: 1.5 }}
        >
          {OPCIONES_DONDE_SE_VENDE.map(o => (
            <MenuItem key={o.valor} value={o.valor}>
              <Box>
                <Typography sx={{ fontSize: 14 }}>{o.label}</Typography>
                <Typography sx={{ fontSize: 11, color: '#9ca3af' }}>{o.ayuda}</Typography>
              </Box>
            </MenuItem>
          ))}
        </TextField>

        <Box sx={{ mb: 1.5, borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, opacity: donde === 'facturacion' ? 0.5 : 1, pointerEvents: donde === 'facturacion' ? 'none' : 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Star style={{ width: 16, height: 16, color: '#fbbf24' }} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Favorito (se muestra primero)</Typography>
            </Box>
            <Switch checked={favorito} onChange={(_, v) => setFavorito(v)} color="primary" />
          </Box>
        </Box>

        <Button
          disabled={guardando}
          onClick={guardar}
          variant="contained" color="primary" fullWidth
          sx={{ py: 1.5, fontWeight: 500 }}
        >
          {guardando ? 'Creando…' : 'Crear y agregar al catálogo'}
        </Button>
      </Box>
    </Dialog>
  );
}
