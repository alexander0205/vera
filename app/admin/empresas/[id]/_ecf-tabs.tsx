'use client';

import { useState } from 'react';
import { ConfirmButton } from './confirm-button';
import { HabilitacionStepper } from './_habilitacion-stepper';
import {
  vincularContribuyente,
  actualizarContribuyente,
  subirCertificado,
  revocarCertificado,
  registrarRango,
  eliminarRango,
  refrescarTokenDgii,
} from './_ecf-actions';
import {
  Zap, ShieldCheck, ShieldAlert, FileText, RefreshCw, CheckCircle2, AlertCircle,
  Link2, Calendar, Hash, ChevronRight,
} from 'lucide-react';
import type {
  ContribuyenteResponseDto,
  CertificateResponseDto,
  NcfRangoResponseDto,
  EmisionResponseDto,
  DgiiStatusDto,
  MeResponseDto,
} from '@/lib/ecf-api/client';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Button,
  Chip,
  Alert,
  Paper,
  Grid,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const TEAL = '#0d9488';
const TEAL_HOVER = '#0f766e';

interface Props {
  teamId: number;
  autoLinked: boolean;
  contrib: ContribuyenteResponseDto;
  certs: CertificateResponseDto[] | null;
  rangos: NcfRangoResponseDto[] | null;
  status: DgiiStatusDto | null;
  emisiones: EmisionResponseDto[] | null;
  meData: MeResponseDto | null;
}

type Tab = 'resumen' | 'habilitacion' | 'certificados' | 'rangos' | 'emisiones';
const TABS: Tab[] = ['resumen', 'habilitacion', 'certificados', 'rangos', 'emisiones'];

export function EcfApiTabs({ teamId, autoLinked, contrib, certs, rangos, status, emisiones, meData }: Props) {
  const [tab, setTab] = useState<Tab>('resumen');

  const certActivo = certs?.find(c => c.activo) ?? null;
  const rangosActivos = rangos?.filter(r => r.activo) ?? [];
  const certOk = status?.certificado.vigente && !status?.certificado.revocado;

  const stats = {
    certificados: certs?.length ?? 0,
    rangosActivos: rangosActivos.length,
    emisiones: emisiones?.length ?? 0,
  };

  const tabCounts: Record<Tab, number | undefined> = {
    resumen: undefined,
    habilitacion: 15,
    certificados: stats.certificados,
    rangos: stats.rangosActivos,
    emisiones: stats.emisiones,
  };

  const tabLabels: Record<Tab, string> = {
    resumen: 'Resumen',
    habilitacion: 'Habilitación',
    certificados: 'Certificados',
    rangos: 'Rangos NCF',
    emisiones: 'Emisiones',
  };

  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 0, borderBottom: '1px solid #f3f4f6' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Zap size={18} color={TEAL} style={{ flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                Integración ecf-api
              </Typography>
              <Chip
                icon={<CheckCircle2 size={12} />}
                label="vinculado"
                size="small"
                sx={{
                  height: 20, fontSize: 11, fontWeight: 500,
                  bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
                  '& .MuiChip-icon': { color: '#065f46', ml: '6px' },
                }}
              />
              {autoLinked && (
                <Chip
                  icon={<Link2 size={10} />}
                  label="auto"
                  size="small"
                  sx={{
                    height: 18, fontSize: 10,
                    bgcolor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                    '& .MuiChip-icon': { color: '#1d4ed8', ml: '5px' },
                  }}
                />
              )}
            </Box>
            <Typography
              variant="caption"
              sx={{ color: '#6b7280', fontFamily: 'monospace', display: 'block', mt: 0.25 }}
            >
              cp <Box component="span" sx={{ color: '#374151' }}>{contrib.codigoPublico}</Box>
              {' · RNC '}
              <Box component="span" sx={{ color: '#374151' }}>{contrib.rnc}</Box>
              {' · '}{contrib.ambiente}
            </Typography>
          </Box>
          <StatusBadge ok={!!certOk} label={certOk ? 'DGII OK' : 'DGII alerta'} />
        </Box>

        {/* MUI Tabs */}
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v as Tab)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 36,
            '& .MuiTabs-indicator': { backgroundColor: TEAL },
            '& .MuiTab-root': {
              minHeight: 36, py: 1, px: 1.5, fontSize: 12, fontWeight: 500,
              textTransform: 'none', color: '#6b7280',
              '&.Mui-selected': { color: TEAL },
            },
          }}
        >
          {TABS.map(t => (
            <Tab
              key={t}
              value={t}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {tabLabels[t]}
                  {tabCounts[t] !== undefined && (
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 600, borderRadius: '999px',
                        px: 0.75, py: 0.25,
                        bgcolor: tab === t ? '#ccfbf1' : '#f3f4f6',
                        color: tab === t ? '#0f766e' : '#6b7280',
                      }}
                    >
                      {tabCounts[t]}
                    </Box>
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      {/* Tab content */}
      <Box sx={{ p: 2.5 }}>
        {tab === 'resumen' && (
          <ResumenTab teamId={teamId} contrib={contrib} status={status} certActivo={certActivo} />
        )}
        {tab === 'habilitacion' && (
          <HabilitacionStepper
            teamId={teamId}
            embedded
            software={meData?.software ?? null}
            webhookBaseUrl={contrib.urlsDgii?.webhookBaseUrl ?? null}
            codigoPublico={contrib.codigoPublico}
            rnc={contrib.rnc}
            ambiente={contrib.ambiente}
          />
        )}
        {tab === 'certificados' && <CertificadosTab teamId={teamId} certs={certs} />}
        {tab === 'rangos' && <RangosTab teamId={teamId} rangos={rangos} />}
        {tab === 'emisiones' && <EmisionesTab emisiones={emisiones} ambiente={contrib.ambiente} />}
      </Box>
    </Box>
  );
}

// ─── Tab: Resumen ─────────────────────────────────────────────────────────────

function ResumenTab({ teamId, contrib, status, certActivo }: {
  teamId: number;
  contrib: ContribuyenteResponseDto;
  status: DgiiStatusDto | null;
  certActivo: CertificateResponseDto | null;
}) {
  return (
    <Grid container spacing={2}>
      {/* Card cert */}
      <Grid size={{ xs: 12, md: 4 }}>
        <StatusCard
          icon={<ShieldCheck size={16} />}
          title="Certificado P12"
          ok={!!(certActivo && status?.certificado.vigente && !status.certificado.revocado)}
          lines={
            certActivo
              ? [
                  ['Vigente', status?.certificado.vigente ? 'Sí' : 'No'],
                  ['Días restantes', status?.certificado.diasRestantes?.toString() ?? '—'],
                  ['Vence', status?.certificado.validTo ? new Date(status.certificado.validTo).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' }) : '—'],
                ]
              : [['Estado', 'Sin certificado']]
          }
        />
      </Grid>

      {/* Card token DGII */}
      <Grid size={{ xs: 12, md: 4 }}>
        <StatusCard
          icon={<RefreshCw size={16} />}
          title="Token DGII"
          ok={!!status?.dgiiToken.cached}
          lines={[
            ['Cached', status?.dgiiToken.cached ? 'Sí' : 'No'],
            ['Ambiente', status?.dgiiToken.ambiente ?? '—'],
            ['Vigente hasta', status?.dgiiToken.vigenteHasta ? new Date(status.dgiiToken.vigenteHasta).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false }) : '—'],
          ]}
          action={
            <Box component="form" action={refrescarTokenDgii}>
              <input type="hidden" name="teamId" value={teamId} />
              <Button
                type="submit"
                size="small"
                startIcon={<RefreshCw size={12} />}
                disableElevation
                sx={{ fontSize: 11, textTransform: 'none', color: TEAL, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
              >
                Refrescar
              </Button>
            </Box>
          }
        />
      </Grid>

      {/* Card última emisión */}
      <Grid size={{ xs: 12, md: 4 }}>
        <StatusCard
          icon={<Link2 size={16} />}
          title="Última emisión"
          ok={!!status?.ultimaEmisionExitosa}
          lines={[
            ['Fecha', status?.ultimaEmisionExitosa
              ? new Date(status.ultimaEmisionExitosa).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })
              : 'Sin emisiones'],
            ['Hora', status?.ultimaEmisionExitosa
              ? new Date(status.ultimaEmisionExitosa).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false })
              : '—'],
          ]}
        />
      </Grid>

      {/* Cambiar ambiente */}
      <Grid size={{ xs: 12 }}>
        <Box
          component="form"
          action={actualizarContribuyente}
          sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 1.5, display: 'flex', alignItems: 'flex-end', gap: 2 }}
        >
          <input type="hidden" name="teamId" value={teamId} />
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel sx={{ fontSize: 12 }}>Cambiar ambiente DGII</InputLabel>
            <Select
              name="ambiente"
              defaultValue={contrib.ambiente}
              label="Cambiar ambiente DGII"
              sx={{ fontSize: 13, borderRadius: '8px' }}
            >
              <MenuItem value="TesteCF">TesteCF (testing)</MenuItem>
              <MenuItem value="CerteCF">CerteCF (certificación)</MenuItem>
              <MenuItem value="Produccion">Producción</MenuItem>
            </Select>
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            size="small"
            disableElevation
            sx={{
              bgcolor: '#111827', '&:hover': { bgcolor: '#1f2937' },
              textTransform: 'none', fontWeight: 500, fontSize: 12, borderRadius: '8px',
              px: 2, py: 1,
            }}
          >
            Aplicar
          </Button>
        </Box>
      </Grid>

      {/* Webhook DGII info */}
      {contrib.urlsDgii?.webhookBaseUrl && (
        <Grid size={{ xs: 12 }}>
          <Box sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1e3a8a', display: 'block', mb: 0.5 }}>
              Webhook DGII (para postulación)
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#1d4ed8', wordBreak: 'break-all', display: 'block' }}>
              {contrib.urlsDgii.webhookBaseUrl}
            </Typography>
          </Box>
        </Grid>
      )}
    </Grid>
  );
}

// ─── Tab: Certificados ────────────────────────────────────────────────────────

function CertificadosTab({ teamId, certs }: { teamId: number; certs: CertificateResponseDto[] | null }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {!certs ? (
        <EmptyState text="Datos no disponibles" />
      ) : certs.length === 0 ? (
        <EmptyState text="Sin certificados subidos" />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {certs.map(c => (
            <Box
              key={c.id}
              sx={{
                border: '1px solid #e5e7eb', borderRadius: '8px', p: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 1.5,
                '&:hover': { borderColor: '#d1d5db' },
                transition: 'border-color 0.15s',
              }}
            >
              {c.activo ? (
                <ShieldCheck size={18} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
              ) : (
                <ShieldAlert size={18} color="#9ca3af" style={{ flexShrink: 0, marginTop: 2 }} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {c.subject ?? '—'}
                  </Typography>
                  {c.activo ? (
                    <Chip label="activo" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }} />
                  ) : (
                    <Chip label="revocado" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }} />
                  )}
                </Box>
                <Typography variant="caption" sx={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Calendar size={11} />
                    Vence {new Date(c.validTo).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                  </Box>
                  <Box component="span">
                    Subido {new Date(c.createdAt).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                  </Box>
                </Typography>
              </Box>
              {c.activo && (
                <ConfirmButton
                  action={revocarCertificado}
                  message="¿Revocar este certificado?"
                  color="error"
                  fields={{ teamId, certId: c.id }}
                >
                  Revocar
                </ConfirmButton>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Form subir */}
      <Box
        component="form"
        action={subirCertificado}
        encType="multipart/form-data"
        sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 2, border: '1px dashed #d1d5db' }}
      >
        <input type="hidden" name="teamId" value={teamId} />
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1.5 }}>
          Subir nuevo certificado P12
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
          <input
            type="file"
            name="file"
            accept=".p12,.pfx"
            required
            style={{ fontSize: 13 }}
          />
          <TextField
            type="password"
            name="password"
            placeholder="Password"
            required
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 } }}
            slotProps={{ htmlInput: { autoComplete: 'new-password' } }}
          />
          <Button
            type="submit"
            variant="contained"
            size="small"
            disableElevation
            sx={{
              bgcolor: TEAL, '&:hover': { bgcolor: TEAL_HOVER },
              textTransform: 'none', fontWeight: 500, fontSize: 13, borderRadius: '8px',
              px: 2.5, py: 0.875,
            }}
          >
            Subir
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Tab: Rangos NCF ──────────────────────────────────────────────────────────

function RangosTab({ teamId, rangos }: { teamId: number; rangos: NcfRangoResponseDto[] | null }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {!rangos ? (
        <EmptyState text="Datos no disponibles" />
      ) : rangos.length === 0 ? (
        <EmptyState text="Sin rangos NCF registrados" />
      ) : (
        <Grid container spacing={1}>
          {rangos.map(r => {
            const pctColor = r.pctUtilizado > 90 ? '#ef4444' : r.pctUtilizado > 70 ? '#f59e0b' : '#10b981';
            return (
              <Grid key={r.id} size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    border: '1px solid #e5e7eb', borderRadius: '8px', p: 1.5,
                    '&:hover': { borderColor: '#d1d5db' }, transition: 'border-color 0.15s',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#111827' }}>
                          e{r.tipoComprobante}
                        </Typography>
                        {r.activo ? (
                          <Chip label="activo" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }} />
                        ) : (
                          <Chip label="inactivo" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }} />
                        )}
                      </Box>
                      <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mt: 0.25 }}>
                        {r.desde.toLocaleString()}–{r.hasta.toLocaleString()} · Vence {new Date(r.fechaVencimiento).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                      </Typography>
                    </Box>
                    <ConfirmButton
                      action={eliminarRango}
                      message={`¿Desactivar rango e${r.tipoComprobante} ${r.desde}-${r.hasta}?`}
                      color="error"
                      fields={{ teamId, rangoId: r.id }}
                    >
                      Desactivar
                    </ConfirmButton>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography variant="caption" sx={{ color: '#4b5563' }}>
                      Próximo:{' '}
                      <Box component="span" sx={{ fontFamily: 'monospace', color: '#111827' }}>
                        {r.siguienteENCF}
                      </Box>
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>
                      {r.capacidadDisponible.toLocaleString()} disp.
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(r.pctUtilizado, 100)}
                    sx={{
                      height: 6, borderRadius: 3, bgcolor: '#f3f4f6',
                      '& .MuiLinearProgress-bar': { bgcolor: pctColor, borderRadius: 3 },
                    }}
                  />
                  <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 0.5 }}>
                    {r.pctUtilizado.toFixed(1)}% utilizado
                  </Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Form registrar */}
      <Box
        component="form"
        action={registrarRango}
        sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 2, border: '1px dashed #d1d5db' }}
      >
        <input type="hidden" name="teamId" value={teamId} />
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 1.5 }}>
          Registrar nuevo rango NCF
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <InputLabel sx={{ fontSize: 11 }}>Tipo</InputLabel>
            <Select name="tipoComprobante" required label="Tipo" sx={{ fontSize: 13, borderRadius: '8px' }}>
              {['31','32','33','34','41','43','44','45','46','47'].map(t => (
                <MenuItem key={t} value={t}>e{t}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            name="desde"
            label="Desde"
            type="number"
            required
            size="small"
            placeholder="1"
            slotProps={{ htmlInput: { min: 1 } }}
            sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 } }}
          />
          <TextField
            name="hasta"
            label="Hasta"
            type="number"
            required
            size="small"
            placeholder="1000"
            slotProps={{ htmlInput: { min: 1 } }}
            sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 } }}
          />
          <TextField
            name="fechaVencimiento"
            label="Vence"
            type="date"
            required
            size="small"
            slotProps={{ htmlInput: {}, inputLabel: { shrink: true } }}
            sx={{ width: 150, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 } }}
          />
          <Button
            type="submit"
            variant="contained"
            size="small"
            disableElevation
            sx={{
              bgcolor: TEAL, '&:hover': { bgcolor: TEAL_HOVER },
              textTransform: 'none', fontWeight: 500, fontSize: 13, borderRadius: '8px',
              px: 2, py: 0.875,
            }}
          >
            Registrar
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Tab: Emisiones ───────────────────────────────────────────────────────────

function EmisionesTab({ emisiones, ambiente }: { emisiones: EmisionResponseDto[] | null; ambiente: string }) {
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [filtroTipo, setFiltroTipo] = useState<string>('all');
  const [filtroAmbiente, setFiltroAmbiente] = useState<string>('all');
  const [busqueda, setBusqueda] = useState<string>('');
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [selected, setSelected] = useState<EmisionResponseDto | null>(null);

  if (!emisiones) return <EmptyState text="Datos no disponibles" />;
  if (emisiones.length === 0) return <EmptyState text="Sin emisiones aún" />;

  const estados = Array.from(new Set(emisiones.map(e => e.estado))).sort();
  const tipos = Array.from(new Set(emisiones.map(e => e.tipoComprobante))).sort();
  const ambientes = Array.from(new Set(emisiones.map(e => e.ambiente).filter(Boolean))).sort() as string[];

  const filtradas = emisiones.filter(e => {
    if (filtroEstado !== 'all' && e.estado !== filtroEstado) return false;
    if (filtroTipo !== 'all' && e.tipoComprobante !== filtroTipo) return false;
    if (filtroAmbiente !== 'all' && e.ambiente !== filtroAmbiente) return false;
    if (busqueda && !e.eNcf.toLowerCase().includes(busqueda.toLowerCase())) return false;
    const fecha = new Date(e.fechaEmision);
    if (desde && fecha < new Date(desde)) return false;
    if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    return true;
  });

  const totalMonto = filtradas.reduce((acc, e) => acc + e.montoTotal, 0);
  const aceptadas = filtradas.filter(e => e.estado === 'ACEPTADO').length;
  const errores = filtradas.filter(e => e.estado === 'ERROR').length;

  function resetFiltros() {
    setFiltroEstado('all'); setFiltroTipo('all'); setFiltroAmbiente('all'); setBusqueda(''); setDesde(''); setHasta('');
  }

  const hasFilters = filtroEstado !== 'all' || filtroTipo !== 'all' || filtroAmbiente !== 'all' || !!busqueda || !!desde || !!hasta;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Banner ambiente */}
      <Alert
        severity="info"
        icon={<Hash size={14} />}
        sx={{ fontSize: 12, py: 0.5, '& .MuiAlert-icon': { alignItems: 'center' } }}
      >
        Ambiente actual del contribuyente: <strong>{ambiente}</strong>. Filtra por ambiente para ver emisiones históricas de cada uno.
      </Alert>

      {/* Stats */}
      <Grid container spacing={1}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Total" value={filtradas.length.toString()} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Aceptadas" value={aceptadas.toString()} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Errores" value={errores.toString()} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Stat label="Monto" value={`$${(totalMonto / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`} />
        </Grid>
      </Grid>

      {/* Filtros */}
      <Box sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 1.5, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 500, color: '#4b5563' }}>Filtros</Typography>
          {hasFilters && (
            <Button
              onClick={resetFiltros}
              size="small"
              disableElevation
              sx={{ ml: 'auto', fontSize: 12, textTransform: 'none', color: TEAL, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
            >
              Limpiar
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <TextField
            size="small"
            placeholder="Buscar e-NCF…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
            slotProps={{ htmlInput: {} }}
          />
          <TextField
            select
            size="small"
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
          >
            <MenuItem value="all">Todos los estados</MenuItem>
            {estados.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField
            select
            size="small"
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
          >
            <MenuItem value="all">Todos los tipos</MenuItem>
            {tipos.map(t => <MenuItem key={t} value={t}>e{t}</MenuItem>)}
          </TextField>
          <TextField
            select
            size="small"
            value={filtroAmbiente}
            onChange={e => setFiltroAmbiente(e.target.value)}
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
          >
            <MenuItem value="all">Todos ambientes</MenuItem>
            {ambientes.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </TextField>
          <TextField
            type="date"
            size="small"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            slotProps={{ htmlInput: {}, inputLabel: { shrink: true } }}
            label="Desde"
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
          />
          <TextField
            type="date"
            size="small"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            slotProps={{ htmlInput: {}, inputLabel: { shrink: true } }}
            label="Hasta"
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
          />
        </Box>
      </Box>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <EmptyState text="Ninguna emisión coincide con los filtros" />
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', maxHeight: 500 }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6', py: 0.75 } }}>
                {['e-NCF', 'Tipo', 'Ambiente', 'Estado', 'Monto', 'Fecha'].map((h, i) => (
                  <TableCell
                    key={h}
                    align={h === 'Monto' ? 'right' : 'left'}
                    sx={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtradas.map(e => (
                <TableRow
                  key={e.id}
                  onClick={() => setSelected(e)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f0fdfa' }, '& td': { borderColor: '#f9fafb', py: 0.75 } }}
                >
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#111827' }}>{e.eNcf}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#4b5563' }}>e{e.tipoComprobante}</TableCell>
                  <TableCell><AmbienteBadge ambiente={e.ambiente ?? '—'} /></TableCell>
                  <TableCell><EstadoBadge estado={e.estado} /></TableCell>
                  <TableCell align="right" sx={{ fontSize: 12, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    ${(e.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: '#6b7280' }}>
                    {new Date(e.fechaEmision).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" sx={{ color: '#9ca3af', textAlign: 'right', display: 'block' }}>
        {filtradas.length} de {emisiones.length} emisiones
      </Typography>

      {selected && <EmisionDetailModal emision={selected} onClose={() => setSelected(null)} />}
    </Box>
  );
}

// ─── Modal detalle emisión ────────────────────────────────────────────────────

function EmisionDetailModal({ emision, onClose }: { emision: EmisionResponseDto; onClose: () => void }) {
  const e = emision as EmisionResponseDto & {
    urlPdf?: string; urlXml?: string; urlVerificacion?: string;
    qrCodeData?: string; fechaHoraFirma?: string; urlEstadoDgii?: string;
    xmlFirmado?: string;
  };
  const estadoUpper = String(e.estado).toUpperCase();
  const isError = estadoUpper === 'ERROR' || estadoUpper === 'RECHAZADO';
  const mensajes = e.mensajesDgii;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 3, py: 2,
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        <FileText size={18} color={TEAL} style={{ flexShrink: 0, marginTop: 2 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#111827' }}>
              {e.eNcf}
            </Typography>
            <EstadoBadge estado={e.estado} />
            <AmbienteBadge ambiente={e.ambiente ?? '—'} />
          </Box>
          <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mt: 0.25 }}>
            e{e.tipoComprobante} · {e.formato} · RNC {e.rnc}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#9ca3af', '&:hover': { color: '#111827' } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Banner error */}
          {isError && mensajes && (
            <Alert severity="error" icon={<AlertCircle size={16} />}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                Errores DGII
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: 11, bgcolor: 'rgba(254,226,226,0.5)', borderRadius: '4px',
                  p: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0,
                }}
              >
                {JSON.stringify(mensajes, null, 2)}
              </Box>
            </Alert>
          )}

          {/* Datos generales */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
              Datos
            </Typography>
            <Grid container columnSpacing={3} rowSpacing={1.5}>
              <Grid size={{ xs: 6 }}><DetailItem label="ID interno" value={e.id} mono /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Track ID DGII" value={e.trackId ?? '—'} mono /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Código seguridad" value={e.codigoSeguridad ?? '—'} mono /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Monto total" value={`$${(e.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`} /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Fecha emisión" value={new Date(e.fechaEmision).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false })} /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Firmado en" value={e.fechaHoraFirma ?? '—'} /></Grid>
              <Grid size={{ xs: 6 }}><DetailItem label="Creado en sistema" value={new Date(e.createdAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', hour12: false })} /></Grid>
            </Grid>
          </Box>

          {/* URLs */}
          {(e.urlPdf || e.urlXml || e.urlVerificacion || e.urlEstadoDgii) && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                Recursos
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {e.urlPdf && (
                  <Button
                    component="a"
                    href={e.urlPdf}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    startIcon={<FileText size={13} />}
                    disableElevation
                    sx={{
                      fontSize: 12, textTransform: 'none', borderRadius: '8px',
                      bgcolor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
                      '&:hover': { bgcolor: '#fee2e2' },
                    }}
                  >
                    PDF
                  </Button>
                )}
                {e.urlXml && (
                  <Button
                    component="a"
                    href={e.urlXml}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    startIcon={<FileText size={13} />}
                    disableElevation
                    sx={{
                      fontSize: 12, textTransform: 'none', borderRadius: '8px',
                      bgcolor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                      '&:hover': { bgcolor: '#dbeafe' },
                    }}
                  >
                    XML firmado
                  </Button>
                )}
                {e.urlVerificacion && (
                  <Button
                    component="a"
                    href={e.urlVerificacion}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    startIcon={<Link2 size={13} />}
                    disableElevation
                    sx={{
                      fontSize: 12, textTransform: 'none', borderRadius: '8px',
                      bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
                      '&:hover': { bgcolor: '#d1fae5' },
                    }}
                  >
                    Verificar en DGII
                  </Button>
                )}
                {e.urlEstadoDgii && (
                  <Button
                    component="a"
                    href={e.urlEstadoDgii}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    startIcon={<RefreshCw size={13} />}
                    disableElevation
                    sx={{
                      fontSize: 12, textTransform: 'none', borderRadius: '8px',
                      bgcolor: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff',
                      '&:hover': { bgcolor: '#f3e8ff' },
                    }}
                  >
                    Estado DGII (JSON)
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {/* QR */}
          {e.qrCodeData && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                QR / URL verificación timbre
              </Typography>
              <Box
                component="code"
                sx={{
                  display: 'block', fontSize: 10, fontFamily: 'monospace',
                  bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px',
                  p: 1, wordBreak: 'break-all', color: '#374151',
                }}
              >
                {e.qrCodeData}
              </Box>
            </Box>
          )}

          {/* Mensajes DGII (si no es error y tiene) */}
          {!isError && mensajes && (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}>
                Mensajes DGII
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: 11, color: '#374151', bgcolor: '#f9fafb',
                  border: '1px solid #e5e7eb', borderRadius: '4px',
                  p: 1, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0,
                }}
              >
                {JSON.stringify(mensajes, null, 2)}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
        {label}
      </Typography>
      <Typography
        sx={{
          color: '#111827',
          ...(mono ? { fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' } : { fontSize: 14 }),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusCard({ icon, title, ok, lines, action }: {
  icon: React.ReactNode;
  title: string;
  ok: boolean;
  lines: Array<[string, string]>;
  action?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${ok ? '#a7f3d0' : '#fcd34d'}`,
        borderRadius: '8px', p: 1.5,
        bgcolor: ok ? 'rgba(236,253,245,0.3)' : 'rgba(255,251,235,0.3)',
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ color: ok ? '#047857' : '#b45309' }}>{icon}</Box>
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#374151', flex: 1 }}>{title}</Typography>
        {ok
          ? <CheckCircle2 size={13} color="#059669" />
          : <AlertCircle size={13} color="#d97706" />
        }
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {lines.map(([k, v], i) => (
          <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>{k}</Typography>
            <Typography variant="caption" sx={{ color: '#111827', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} suppressHydrationWarning>
              {v}
            </Typography>
          </Box>
        ))}
      </Box>
      {action && (
        <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(229,231,235,0.6)' }}>
          {action}
        </Box>
      )}
    </Box>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Chip
      icon={ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      label={label}
      size="small"
      sx={{
        height: 24, fontSize: 12, fontWeight: 500,
        bgcolor: ok ? '#ecfdf5' : '#fffbeb',
        color: ok ? '#065f46' : '#92400e',
        border: `1px solid ${ok ? '#a7f3d0' : '#fcd34d'}`,
        '& .MuiChip-icon': { color: ok ? '#065f46' : '#92400e', ml: '6px' },
      }}
    />
  );
}

function AmbienteBadge({ ambiente }: { ambiente: string }) {
  const map: Record<string, { bgcolor: string; color: string; border: string }> = {
    Produccion: { bgcolor: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
    CerteCF:    { bgcolor: '#faf5ff', color: '#6b21a8', border: '#e9d5ff' },
    TesteCF:    { bgcolor: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  };
  const style = map[ambiente] ?? { bgcolor: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', fontSize: 10, fontWeight: 500,
        px: 0.75, py: 0.25, borderRadius: '999px',
        border: `1px solid ${style.border}`,
        bgcolor: style.bgcolor, color: style.color,
      }}
    >
      {ambiente}
    </Box>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { bgcolor: string; color: string; border: string }> = {
    aceptado:  { bgcolor: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
    enviado:   { bgcolor: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    rechazado: { bgcolor: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    error:     { bgcolor: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    pendiente: { bgcolor: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  };
  const style = map[estado.toLowerCase()] ?? { bgcolor: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', fontSize: 10, fontWeight: 500,
        px: 0.75, py: 0.25, borderRadius: '999px',
        border: `1px solid ${style.border}`,
        bgcolor: style.bgcolor, color: style.color,
      }}
    >
      {estado}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ bgcolor: '#f9fafb', borderRadius: '8px', p: 1.5, border: '1px solid #f3f4f6' }}>
      <Typography variant="caption" sx={{ color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#111827', mt: 0.25, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Typography variant="body2" sx={{ color: '#9ca3af' }}>{text}</Typography>
    </Box>
  );
}

// ─── NoLink (cuando no está vinculado) ────────────────────────────────────────

export function EcfApiNoLink({ teamId, rnc }: { teamId: number; rnc: string }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Zap size={16} color={TEAL} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>Integración ecf-api</Typography>
        <Chip
          label="sin vincular"
          size="small"
          sx={{
            ml: 'auto', height: 20, fontSize: 11,
            bgcolor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
          }}
        />
      </Box>
      <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
        RNC{' '}
        <Box component="code" sx={{ fontFamily: 'monospace', color: '#374151' }}>{rnc}</Box>
        {' '}no está registrado en ecf-api.
      </Typography>
      <Box component="form" action={vincularContribuyente}>
        <input type="hidden" name="teamId" value={teamId} />
        <Button
          type="submit"
          variant="contained"
          size="small"
          endIcon={<ChevronRight size={16} />}
          disableElevation
          sx={{
            bgcolor: TEAL, '&:hover': { bgcolor: TEAL_HOVER },
            textTransform: 'none', fontWeight: 500, fontSize: 14, borderRadius: '8px',
            px: 2.5, py: 1,
          }}
        >
          Registrar en ecf-api
        </Button>
      </Box>
    </Box>
  );
}
