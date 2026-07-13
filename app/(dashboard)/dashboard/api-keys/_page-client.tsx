'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Key, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';

interface ApiKeyRow {
  id: number;
  nombre: string;
  keyPrefix: string;
  permisos: string;
  ultimoUsoAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [nombre, setNombre] = useState('');
  const [permisos, setPermisos] = useState('read');
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetch('/api/api-keys').then(r => r.json()).then(setKeys); }, []);

  async function create() {
    setLoading(true);
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, permisos }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewKey(data.rawKey);
      setKeys(k => [...k, data]);
      setNombre(''); setShowNew(false);
    } else {
      toast.error(data.error ?? 'Error creando API key');
    }
    setLoading(false);
  }

  async function revoke(id: number) {
    if (!confirm('¿Revocar esta API key? Esta acción no se puede deshacer.')) return;
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    setKeys(k => k.filter(x => x.id !== id));
    toast.success('API key revocada');
  }

  function copy() {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            API Keys
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Integra EmiteDO con tus sistemas externos
          </Typography>
        </Box>
        <MuiButton
          variant="contained"
          color="primary"
          disableElevation
          startIcon={<Plus style={{ width: 16, height: 16 }} />}
          onClick={() => setShowNew(true)}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
        >
          Nueva Key
        </MuiButton>
      </Box>

      {/* New key revealed */}
      {newKey && (
        <Alert
          severity="warning"
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
          sx={{ mb: 2, borderRadius: '12px' }}
          onClose={() => setNewKey('')}
        >
          <AlertTitle sx={{ fontWeight: 700 }}>Copia esta clave ahora — no se volverá a mostrar</AlertTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'warning.light', px: 1.5, py: 1, mt: 1 }}>
            <Box component="code" sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.primary', wordBreak: 'break-all' }}>
              {newKey}
            </Box>
            <IconButton size="small" onClick={copy} sx={{ color: copied ? 'success.main' : 'text.secondary', flexShrink: 0 }}>
              {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
            </IconButton>
          </Box>
        </Alert>
      )}

      {/* New key form */}
      {showNew && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Nueva API Key
            </Typography>
            <MuiTextField
              label="Nombre / descripción"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Integración ERP interno"
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Permisos</InputLabel>
              <Select
                value={permisos}
                label="Permisos"
                onChange={e => setPermisos(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                <MenuItem value="read">Solo lectura</MenuItem>
                <MenuItem value="write">Lectura + escritura</MenuItem>
                <MenuItem value="admin">Acceso completo</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <MuiButton
                variant="contained"
                color="primary"
                disableElevation
                onClick={create}
                disabled={loading || !nombre}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
              >
                {loading ? 'Generando...' : 'Generar key'}
              </MuiButton>
              <MuiButton
                variant="outlined"
                onClick={() => setShowNew(false)}
                sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}
              >
                Cancelar
              </MuiButton>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Keys table */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {keys.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Key style={{ width: 40, height: 40, color: '#e5e7eb', margin: '0 auto 12px' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No hay API keys creadas
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em' }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em' }}>Prefijo</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em' }}>Permisos</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em', display: { xs: 'none', md: 'table-cell' } }}>Último uso</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map(k => (
                <TableRow key={k.id} sx={{ '&:hover': { bgcolor: 'grey.50' } }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.875rem' }}>{k.nombre}</TableCell>
                  <TableCell>
                    <Box component="code" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', bgcolor: 'grey.100', borderRadius: 1, px: 0.75, py: 0.25 }}>
                      {k.keyPrefix}...
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={k.permisos}
                      size="small"
                      sx={{ bgcolor: '#f0fdfa', color: '#0d9488', border: '1px solid #99f6e4', height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 1 } }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', display: { xs: 'none', md: 'table-cell' } }}>
                    {k.ultimoUsoAt ? new Date(k.ultimoUsoAt).toLocaleDateString('es-DO') : 'Nunca'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => revoke(k.id)} sx={{ color: 'error.light', '&:hover': { bgcolor: 'error.lighter', color: 'error.main' } }}>
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Box>
  );
}
