'use client';

import { useState } from 'react';
import { ConfirmButton } from './confirm-button';
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
  Zap, ShieldCheck, ShieldAlert, FileText, Boxes, RefreshCw, CheckCircle2, AlertCircle,
  Link2, Calendar, Hash, ChevronRight,
} from 'lucide-react';
import type {
  ContribuyenteResponseDto,
  CertificateResponseDto,
  NcfRangoResponseDto,
  EmisionResponseDto,
  DgiiStatusDto,
} from '@/lib/ecf-api/client';

interface Props {
  teamId: number;
  autoLinked: boolean;
  contrib: ContribuyenteResponseDto;
  certs: CertificateResponseDto[] | null;
  rangos: NcfRangoResponseDto[] | null;
  status: DgiiStatusDto | null;
  emisiones: EmisionResponseDto[] | null;
}

type Tab = 'resumen' | 'certificados' | 'rangos' | 'emisiones';

export function EcfApiTabs({ teamId, autoLinked, contrib, certs, rangos, status, emisiones }: Props) {
  const [tab, setTab] = useState<Tab>('resumen');

  const certActivo = certs?.find(c => c.activo) ?? null;
  const rangosActivos = rangos?.filter(r => r.activo) ?? [];
  const certOk = status?.certificado.vigente && !status?.certificado.revocado;

  const stats = {
    certificados: certs?.length ?? 0,
    rangosActivos: rangosActivos.length,
    emisiones: emisiones?.length ?? 0,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header con info principal + tabs */}
      <div className="px-5 pt-4 pb-0 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="w-5 h-5 text-teal-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Integración ecf-api</h2>
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />vinculado
              </span>
              {autoLinked && (
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Link2 className="w-2.5 h-2.5" />auto
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
              cp <span className="text-gray-700">{contrib.codigoPublico}</span> · RNC <span className="text-gray-700">{contrib.rnc}</span> · {contrib.ambiente}
            </p>
          </div>
          <StatusBadge ok={!!certOk} label={certOk ? 'DGII OK' : 'DGII alerta'} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px overflow-x-auto">
          <TabBtn active={tab === 'resumen'} onClick={() => setTab('resumen')}>Resumen</TabBtn>
          <TabBtn active={tab === 'certificados'} onClick={() => setTab('certificados')} count={stats.certificados}>Certificados</TabBtn>
          <TabBtn active={tab === 'rangos'} onClick={() => setTab('rangos')} count={stats.rangosActivos}>Rangos NCF</TabBtn>
          <TabBtn active={tab === 'emisiones'} onClick={() => setTab('emisiones')} count={stats.emisiones}>Emisiones</TabBtn>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === 'resumen' && (
          <ResumenTab teamId={teamId} contrib={contrib} status={status} certActivo={certActivo} />
        )}
        {tab === 'certificados' && <CertificadosTab teamId={teamId} certs={certs} />}
        {tab === 'rangos' && <RangosTab teamId={teamId} rangos={rangos} />}
        {tab === 'emisiones' && <EmisionesTab emisiones={emisiones} ambiente={contrib.ambiente} />}
      </div>
    </div>
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card cert */}
      <StatusCard
        icon={<ShieldCheck className="w-4 h-4" />}
        title="Certificado P12"
        ok={!!(certActivo && status?.certificado.vigente && !status.certificado.revocado)}
        lines={
          certActivo
            ? [
                ['Vigente', status?.certificado.vigente ? 'Sí' : 'No'],
                ['Días restantes', status?.certificado.diasRestantes?.toString() ?? '—'],
                ['Vence', status?.certificado.validTo ? new Date(status.certificado.validTo).toLocaleDateString('es-DO') : '—'],
              ]
            : [['Estado', 'Sin certificado']]
        }
      />

      {/* Card token DGII */}
      <StatusCard
        icon={<RefreshCw className="w-4 h-4" />}
        title="Token DGII"
        ok={!!status?.dgiiToken.cached}
        lines={[
          ['Cached', status?.dgiiToken.cached ? 'Sí' : 'No'],
          ['Ambiente', status?.dgiiToken.ambiente ?? '—'],
          ['Vigente hasta', status?.dgiiToken.vigenteHasta ? new Date(status.dgiiToken.vigenteHasta).toLocaleTimeString('es-DO') : '—'],
        ]}
        action={
          <form action={refrescarTokenDgii}>
            <input type="hidden" name="teamId" value={teamId} />
            <button type="submit" className="text-xs text-teal-600 hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />Refrescar
            </button>
          </form>
        }
      />

      {/* Card webhook DGII */}
      <StatusCard
        icon={<Link2 className="w-4 h-4" />}
        title="Última emisión"
        ok={!!status?.ultimaEmisionExitosa}
        lines={[
          ['Fecha', status?.ultimaEmisionExitosa
            ? new Date(status.ultimaEmisionExitosa).toLocaleDateString('es-DO')
            : 'Sin emisiones'],
          ['Hora', status?.ultimaEmisionExitosa
            ? new Date(status.ultimaEmisionExitosa).toLocaleTimeString('es-DO')
            : '—'],
        ]}
      />

      {/* Cambiar ambiente */}
      <form action={actualizarContribuyente} className="md:col-span-3 bg-gray-50 rounded-lg p-3 flex items-end gap-3">
        <input type="hidden" name="teamId" value={teamId} />
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Cambiar ambiente DGII</label>
          <select
            name="ambiente"
            defaultValue={contrib.ambiente}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="TesteCF">TesteCF (testing)</option>
            <option value="CerteCF">CerteCF (certificación)</option>
            <option value="Produccion">Producción</option>
          </select>
        </div>
        <button type="submit" className="text-xs bg-gray-900 hover:bg-gray-800 text-white font-medium px-4 py-2 rounded-lg">
          Aplicar
        </button>
      </form>

      {/* Webhook DGII (info de postulación) */}
      {contrib.urlsDgii?.webhookBaseUrl && (
        <div className="md:col-span-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-900 mb-1">Webhook DGII (para postulación)</p>
          <code className="text-xs font-mono text-blue-700 break-all">{contrib.urlsDgii.webhookBaseUrl}</code>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Certificados ────────────────────────────────────────────────────────

function CertificadosTab({ teamId, certs }: { teamId: number; certs: CertificateResponseDto[] | null }) {
  return (
    <div className="space-y-4">
      {!certs ? (
        <EmptyState text="Datos no disponibles" />
      ) : certs.length === 0 ? (
        <EmptyState text="Sin certificados subidos" />
      ) : (
        <div className="space-y-2">
          {certs.map(c => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:border-gray-300 transition-colors">
              {c.activo ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-mono text-xs text-gray-700 truncate flex-1">{c.subject ?? '—'}</p>
                  {c.activo ? (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">activo</span>
                  ) : (
                    <span className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full">revocado</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 flex items-center gap-3">
                  <span><Calendar className="w-3 h-3 inline mr-1" />Vence {new Date(c.validTo).toLocaleDateString('es-DO')}</span>
                  <span>Subido {new Date(c.createdAt).toLocaleDateString('es-DO')}</span>
                </p>
              </div>
              {c.activo && (
                <ConfirmButton
                  action={revocarCertificado}
                  message="¿Revocar este certificado?"
                  className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
                  fields={{ teamId, certId: c.id }}
                >
                  Revocar
                </ConfirmButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form subir */}
      <form action={subirCertificado} encType="multipart/form-data" className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
        <input type="hidden" name="teamId" value={teamId} />
        <p className="text-sm font-medium text-gray-700 mb-3">Subir nuevo certificado P12</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <input
            type="file"
            name="file"
            accept=".p12,.pfx"
            required
            className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-1.5 rounded-lg">
            Subir
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Tab: Rangos NCF ──────────────────────────────────────────────────────────

function RangosTab({ teamId, rangos }: { teamId: number; rangos: NcfRangoResponseDto[] | null }) {
  return (
    <div className="space-y-4">
      {!rangos ? (
        <EmptyState text="Datos no disponibles" />
      ) : rangos.length === 0 ? (
        <EmptyState text="Sin rangos NCF registrados" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rangos.map(r => {
            const pctColor = r.pctUtilizado > 90 ? 'bg-red-500' : r.pctUtilizado > 70 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={r.id} className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">e{r.tipoComprobante}</span>
                      {r.activo ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">activo</span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full">inactivo</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {r.desde.toLocaleString()}–{r.hasta.toLocaleString()} · Vence {new Date(r.fechaVencimiento).toLocaleDateString('es-DO')}
                    </p>
                  </div>
                  <ConfirmButton
                    action={eliminarRango}
                    message={`¿Desactivar rango e${r.tipoComprobante} ${r.desde}-${r.hasta}?`}
                    className="text-[11px] text-red-500 hover:text-red-700"
                    fields={{ teamId, rangoId: r.id }}
                  >
                    Desactivar
                  </ConfirmButton>
                </div>
                <div className="text-xs text-gray-600 mb-1.5 flex items-center justify-between">
                  <span>Próximo: <span className="font-mono text-gray-900">{r.siguienteENCF}</span></span>
                  <span className="text-gray-500">{r.capacidadDisponible.toLocaleString()} disp.</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${pctColor} transition-all`} style={{ width: `${Math.min(r.pctUtilizado, 100)}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{r.pctUtilizado.toFixed(1)}% utilizado</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Form registrar */}
      <form action={registrarRango} className="bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300">
        <input type="hidden" name="teamId" value={teamId} />
        <p className="text-sm font-medium text-gray-700 mb-3">Registrar nuevo rango NCF</p>
        <div className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr_140px_auto] gap-2 items-end">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo</label>
            <select name="tipoComprobante" required className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {['31','32','33','34','41','43','44','45','46','47'].map(t => <option key={t} value={t}>e{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Desde</label>
            <input type="number" name="desde" required min={1} placeholder="1" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Hasta</label>
            <input type="number" name="hasta" required min={1} placeholder="1000" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Vence</label>
            <input type="date" name="fechaVencimiento" required className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
            Registrar
          </button>
        </div>
      </form>
    </div>
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
    <div className="space-y-3">
      {/* Banner ambiente */}
      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
        <Hash className="w-3.5 h-3.5" />
        Ambiente actual del contribuyente: <strong>{ambiente}</strong>. Filtra por ambiente para ver emisiones históricas de cada uno.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Total" value={filtradas.length.toString()} />
        <Stat label="Aceptadas" value={aceptadas.toString()} />
        <Stat label="Errores" value={errores.toString()} />
        <Stat label="Monto" value={`$${(totalMonto / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`} />
      </div>

      {/* Filtros */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <span>Filtros</span>
          {hasFilters && (
            <button onClick={resetFiltros} className="ml-auto text-teal-600 hover:underline">
              Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input
            type="text"
            placeholder="Buscar e-NCF…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">Todos los estados</option>
            {estados.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">Todos los tipos</option>
            {tipos.map(t => <option key={t} value={t}>e{t}</option>)}
          </select>
          <select value={filtroAmbiente} onChange={e => setFiltroAmbiente(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">Todos ambientes</option>
            {ambientes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            placeholder="Desde"
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            placeholder="Hasta"
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <EmptyState text="Ninguna emisión coincide con los filtros" />
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">e-NCF</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Ambiente</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Estado</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Monto</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(e => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="hover:bg-teal-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs text-gray-900">{e.eNcf}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">e{e.tipoComprobante}</td>
                  <td className="px-4 py-2">
                    <AmbienteBadge ambiente={e.ambiente ?? '—'} />
                  </td>
                  <td className="px-4 py-2">
                    <EstadoBadge estado={e.estado} />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-700 text-right tabular-nums">
                    ${(e.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(e.fechaEmision).toLocaleDateString('es-DO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-gray-400 text-right">{filtradas.length} de {emisiones.length} emisiones</p>

      {selected && <EmisionDetailModal emision={selected} onClose={() => setSelected(null)} />}
    </div>
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
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={ev => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10 flex items-start gap-3">
          <FileText className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-base font-bold text-gray-900">{e.eNcf}</h3>
              <EstadoBadge estado={e.estado} />
              <AmbienteBadge ambiente={e.ambiente ?? '—'} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              e{e.tipoComprobante} · {e.formato} · RNC {e.rnc}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Banner error */}
          {isError && mensajes && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <h4 className="text-sm font-semibold text-red-900">Errores DGII</h4>
              </div>
              <pre className="text-xs text-red-800 bg-red-100/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(mensajes, null, 2)}
              </pre>
            </div>
          )}

          {/* Datos generales */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Datos</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <DetailItem label="ID interno" value={e.id} mono />
              <DetailItem label="Track ID DGII" value={e.trackId ?? '—'} mono />
              <DetailItem label="Código seguridad" value={e.codigoSeguridad ?? '—'} mono />
              <DetailItem label="Monto total" value={`$${(e.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`} />
              <DetailItem label="Fecha emisión" value={new Date(e.fechaEmision).toLocaleString('es-DO')} />
              <DetailItem label="Firmado en" value={e.fechaHoraFirma ?? '—'} />
              <DetailItem label="Creado en sistema" value={new Date(e.createdAt).toLocaleString('es-DO')} />
            </div>
          </div>

          {/* URLs */}
          {(e.urlPdf || e.urlXml || e.urlVerificacion || e.urlEstadoDgii) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Recursos</h4>
              <div className="flex flex-wrap gap-2">
                {e.urlPdf && (
                  <a href={e.urlPdf} target="_blank" rel="noreferrer" className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />PDF
                  </a>
                )}
                {e.urlXml && (
                  <a href={e.urlXml} target="_blank" rel="noreferrer" className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />XML firmado
                  </a>
                )}
                {e.urlVerificacion && (
                  <a href={e.urlVerificacion} target="_blank" rel="noreferrer" className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />Verificar en DGII
                  </a>
                )}
                {e.urlEstadoDgii && (
                  <a href={e.urlEstadoDgii} target="_blank" rel="noreferrer" className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />Estado DGII (JSON)
                  </a>
                )}
              </div>
            </div>
          )}

          {/* QR */}
          {e.qrCodeData && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">QR / URL verificación timbre</h4>
              <code className="block text-[10px] font-mono bg-gray-50 border border-gray-200 rounded p-2 break-all text-gray-700">
                {e.qrCodeData}
              </code>
            </div>
          )}

          {/* Mensajes DGII (si no es error y tiene) */}
          {!isError && mensajes && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Mensajes DGII</h4>
              <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(mensajes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-gray-900 ${mono ? 'font-mono text-xs break-all' : 'text-sm'}`}>{value}</p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, count, children }: {
  active: boolean; onClick: () => void; count?: number; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-teal-600 text-teal-700'
          : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1.5 inline-flex items-center justify-center text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
          active ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-500'
        }`}>{count}</span>
      )}
    </button>
  );
}

function StatusCard({ icon, title, ok, lines, action }: {
  icon: React.ReactNode;
  title: string;
  ok: boolean;
  lines: Array<[string, string]>;
  action?: React.ReactNode;
}) {
  return (
    <div className={`border rounded-lg p-3 ${ok ? 'bg-emerald-50/30 border-emerald-200' : 'bg-amber-50/30 border-amber-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={ok ? 'text-emerald-700' : 'text-amber-700'}>{icon}</span>
        <h3 className="text-xs font-semibold text-gray-700 flex-1">{title}</h3>
        {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
      </div>
      <div className="space-y-0.5 text-xs">
        {lines.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="text-gray-500">{k}</span>
            <span className="text-gray-900 font-medium truncate">{v}</span>
          </div>
        ))}
      </div>
      {action && <div className="mt-2 pt-2 border-t border-gray-200/60">{action}</div>}
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
      ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function AmbienteBadge({ ambiente }: { ambiente: string }) {
  const map: Record<string, string> = {
    Produccion: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CerteCF: 'bg-purple-50 text-purple-700 border-purple-200',
    TesteCF: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const cls = map[ambiente] ?? 'bg-gray-100 text-gray-500 border-gray-200';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cls}`}>{ambiente}</span>;
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    aceptado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    enviado: 'bg-blue-50 text-blue-700 border-blue-200',
    rechazado: 'bg-red-50 text-red-700 border-red-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const cls = map[estado.toLowerCase()] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cls}`}>{estado}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums truncate">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-sm text-gray-400">{text}</div>
  );
}

// ─── NoLink (cuando no está vinculado) ────────────────────────────────────────

export function EcfApiNoLink({ teamId, rnc }: { teamId: number; rnc: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-teal-600" />
        <h2 className="text-sm font-semibold text-gray-700">Integración ecf-api</h2>
        <span className="ml-auto text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">sin vincular</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        RNC <code className="font-mono text-gray-700">{rnc}</code> no está registrado en ecf-api.
      </p>
      <form action={vincularContribuyente}>
        <input type="hidden" name="teamId" value={teamId} />
        <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2 rounded-lg flex items-center gap-2">
          Registrar en ecf-api
          <ChevronRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
