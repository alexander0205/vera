'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Zap, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';

const EVENTOS_OPTIONS = ['ecf.emitido', 'ecf.anulado', 'ecf.aceptado', 'ecf.rechazado', 'pago.registrado'];

interface Webhook {
  id: number; nombre: string; url: string; secret: string;
  eventos: string; activo: boolean; ultimoDisparo: string | null;
  ultimoEstatus: number | null;
}

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nombre: '', url: '', eventos: ['ecf.emitido'] });
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => { fetch('/api/webhooks').then(r => r.json()).then(setHooks); }, []);

  async function create() {
    setLoading(true);
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setHooks(h => [...h, data]);
      setForm({ nombre: '', url: '', eventos: ['ecf.emitido'] });
      setShowNew(false);
      toast.success('Webhook creado');
    } else {
      toast.error(data.error ?? 'Error');
    }
    setLoading(false);
  }

  async function toggle(hook: Webhook) {
    await fetch(`/api/webhooks/${hook.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !hook.activo }),
    });
    setHooks(h => h.map(x => x.id === hook.id ? { ...x, activo: !x.activo } : x));
  }

  async function remove(id: number) {
    if (!confirm('¿Eliminar este webhook?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    setHooks(h => h.filter(x => x.id !== id));
    toast.success('Webhook eliminado');
  }

  function copySecret(hook: Webhook) {
    navigator.clipboard.writeText(hook.secret);
    setCopiedId(hook.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Webhooks
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Notifica a tus sistemas cuando ocurran eventos en Zero
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
          Nuevo Webhook
        </MuiButton>
      </Box>

      {/* New webhook form */}
      {showNew && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Nuevo Webhook
            </Typography>
            <MuiTextField
              label="Nombre"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: ERP de ventas"
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <MuiTextField
              label="URL de destino"
              type="url"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://tusistema.com/webhooks/zero"
              size="small"
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', display: 'block', mb: 1 }}>
                Eventos
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {EVENTOS_OPTIONS.map(e => (
                  <FormControlLabel
                    key={e}
                    control={
                      <Checkbox
                        size="small"
                        checked={form.eventos.includes(e)}
                        onChange={() => setForm(f => ({
                          ...f,
                          eventos: f.eventos.includes(e) ? f.eventos.filter(x => x !== e) : [...f.eventos, e],
                        }))}
                        color="primary"
                      />
                    }
                    label={
                      <Box component="code" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', bgcolor: 'grey.100', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
                        {e}
                      </Box>
                    }
                    sx={{ '& .MuiFormControlLabel-label': { lineHeight: 1 } }}
                  />
                ))}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <MuiButton
                variant="contained"
                color="primary"
                disableElevation
                onClick={create}
                disabled={loading || !form.nombre || !form.url || form.eventos.length === 0}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
              >
                {loading ? 'Guardando...' : 'Crear webhook'}
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

      {/* Hooks list */}
      {hooks.length === 0 ? (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Zap style={{ width: 40, height: 40, color: '#e5e7eb', margin: '0 auto 12px' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No hay webhooks configurados
            </Typography>
          </Box>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {hooks.map(hook => (
            <Card key={hook.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <CardContent sx={{ p: '16px 20px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {hook.nombre}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                      {hook.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, ml: 2 }}>
                    {hook.ultimoEstatus && (
                      <Chip
                        label={hook.ultimoEstatus}
                        size="small"
                        sx={{
                          height: 22, fontSize: '0.6875rem', fontWeight: 600,
                          '& .MuiChip-label': { px: 1 },
                          ...(hook.ultimoEstatus >= 200 && hook.ultimoEstatus < 300
                            ? { bgcolor: '#ecfdf5', color: '#065f46' }
                            : { bgcolor: '#fef2f2', color: '#991b1b' }),
                        }}
                      />
                    )}
                    <Switch
                      checked={hook.activo}
                      onChange={() => toggle(hook)}
                      color="primary"
                      size="small"
                    />
                    <IconButton size="small" onClick={() => remove(hook.id)} sx={{ color: 'error.light', '&:hover': { color: 'error.main' } }}>
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </IconButton>
                  </Box>
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Eventos: <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>{hook.eventos}</Box>
                  </Typography>
                  <MuiButton
                    size="small"
                    variant="text"
                    startIcon={copiedId === hook.id ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                    onClick={() => copySecret(hook)}
                    sx={{ fontSize: '0.6875rem', textTransform: 'none', color: copiedId === hook.id ? 'success.main' : 'text.secondary', minWidth: 0, p: '2px 6px' }}
                  >
                    {copiedId === hook.id ? 'Copiado' : 'Copiar secret'}
                  </MuiButton>
                  {hook.ultimoDisparo && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Último: {new Date(hook.ultimoDisparo).toLocaleDateString('es-DO')}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
