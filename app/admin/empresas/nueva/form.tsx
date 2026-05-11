'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Building2, Check } from 'lucide-react';
import { crearEmpresa } from './actions';
import { PLANS, FREE_PLAN, type PlanDef } from '@/lib/config/plans';

interface RncResult {
  rnc:             string;
  nombre:          string;
  nombreComercial: string | null;
  estadoLabel:     string;
}

interface CatalogItem {
  codigo: string;
  nombre: string;
}

interface Props {
  provincias: CatalogItem[];
}

export function NuevaEmpresaForm({ provincias }: Props) {
  // Campos del formulario
  const [rnc,             setRnc]             = useState('');
  const [razonSocial,     setRazonSocial]     = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [direccion,       setDireccion]       = useState('');
  const [telefono,        setTelefono]        = useState('');
  const [emailFact,       setEmailFact]       = useState('');
  const [ambiente,        setAmbiente]        = useState('TesteCF');
  const [provincia,       setProvincia]       = useState('');
  const [municipio,       setMunicipio]       = useState('');
  const [municipios,      setMunicipios]      = useState<CatalogItem[]>([]);
  const [loadingMunic,    setLoadingMunic]    = useState(false);
  const [planKey,         setPlanKey]         = useState('');
  const [inviteEmail,     setInviteEmail]     = useState('');

  // Buscador RNC
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<RncResult[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const wrapperRef              = useRef<HTMLDivElement>(null);
  const timer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Cargar municipios al cambiar provincia
  useEffect(() => {
    if (!provincia) { setMunicipios([]); setMunicipio(''); return; }
    setLoadingMunic(true);
    setMunicipio('');
    fetch(`/api/catalogos/municipios?provincia=${encodeURIComponent(provincia)}`)
      .then(r => r.json())
      .then((data: CatalogItem[]) => setMunicipios(data))
      .catch(() => setMunicipios([]))
      .finally(() => setLoadingMunic(false));
  }, [provincia]);

  const buscar = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/rnc/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
  }, []);

  function seleccionar(r: RncResult) {
    setRnc(r.rnc);
    setRazonSocial(r.nombre);
    setNombreComercial(r.nombreComercial ?? '');
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function limpiarBusqueda() {
    setQuery('');
    setResults([]);
    setOpen(false);
    setRnc('');
    setRazonSocial('');
    setNombreComercial('');
  }

  const rncSeleccionado = !!rnc && !!razonSocial;

  return (
    <form action={crearEmpresa} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

      {/* ─── Buscador de empresa ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Buscar empresa en el padrón DGII</h2>

        {rncSeleccionado ? (
          <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
            <Building2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-teal-900 text-sm truncate">{razonSocial}</p>
              <p className="text-xs text-teal-600 font-mono">RNC {rnc}</p>
            </div>
            <button type="button" onClick={limpiarBusqueda} className="text-teal-500 hover:text-teal-700 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div ref={wrapperRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => buscar(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder="Nombre o RNC de la empresa..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {open && results.length > 0 && (
              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {results.map(r => (
                  <li key={r.rnc}>
                    <button type="button" onClick={() => seleccionar(r)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono text-gray-500">{r.rnc}</span>
                        {r.nombreComercial && <span className="text-xs text-gray-400 truncate">· {r.nombreComercial}</span>}
                        <span className={`text-xs ml-auto flex-shrink-0 ${r.estadoLabel === 'Activo' ? 'text-green-600' : 'text-amber-600'}`}>
                          {r.estadoLabel}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {open && !loading && results.length === 0 && query.length >= 2 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow px-4 py-3 text-sm text-gray-400">
                Sin resultados para "{query}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campos ocultos con valores del buscador */}
      <input type="hidden" name="rnc"             value={rnc} />
      <input type="hidden" name="razonSocial"     value={razonSocial} />
      <input type="hidden" name="nombreComercial" value={nombreComercial} />

      {/* ─── Datos complementarios ───────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos complementarios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Razón social <span className="text-red-500">*</span>
            </label>
            <input
              value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              required
              placeholder="EMPRESA EJEMPLO SRL"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              RNC <span className="text-red-500">*</span>
            </label>
            <input
              value={rnc}
              onChange={e => setRnc(e.target.value)}
              required
              maxLength={11}
              placeholder="131000000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre comercial</label>
            <input
              value={nombreComercial}
              onChange={e => setNombreComercial(e.target.value)}
              placeholder="Empresa Ejemplo"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input
              name="direccion"
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
              placeholder="Calle, No., Sector"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Provincia */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
            <select
              name="provincia"
              value={provincia}
              onChange={e => setProvincia(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">— Seleccionar —</option>
              {provincias.map(p => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Municipio — dependiente de provincia */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Municipio
              {loadingMunic && (
                <span className="ml-2 inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin align-middle" />
              )}
            </label>
            <select
              name="municipio"
              value={municipio}
              onChange={e => setMunicipio(e.target.value)}
              disabled={!provincia || loadingMunic}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {!provincia ? 'Selecciona provincia primero' : loadingMunic ? 'Cargando...' : '— Seleccionar —'}
              </option>
              {municipios.map(m => (
                <option key={m.codigo} value={m.codigo}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              name="telefono"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="809-000-0000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email facturación</label>
            <input
              name="emailFacturacion"
              type="email"
              value={emailFact}
              onChange={e => setEmailFact(e.target.value)}
              placeholder="facturas@empresa.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ambiente DGII</label>
            <select
              name="dgiiEnvironment"
              value={ambiente}
              onChange={e => setAmbiente(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="TesteCF">TesteCF (pruebas)</option>
              <option value="Produccion">Producción</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Plan ────────────────────────────────────────────────────────── */}
      <input type="hidden" name="planName" value={planKey} />
      <div className="border-t border-gray-100 pt-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Plan</h2>
        <p className="text-xs text-gray-500 mb-4">
          Asignado manualmente — no requiere Stripe.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

          {/* Sin plan */}
          <PlanCard
            plan={FREE_PLAN}
            selected={planKey === ''}
            onSelect={() => setPlanKey('')}
          />

          {PLANS.map(p => (
            <PlanCard
              key={p.key}
              plan={p}
              selected={planKey === p.key}
              onSelect={() => setPlanKey(p.key)}
            />
          ))}
        </div>
      </div>

      {/* ─── Invitación ───────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Invitar usuario</h2>
        <p className="text-xs text-gray-500 mb-4">
          Opcional — le llegará un correo para crear su cuenta y acceder a esta empresa.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email del cliente</label>
          <input
            name="inviteEmail"
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="cliente@suempresa.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Crear empresa
        </button>
        <a href="/admin/empresas" className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5">
          Cancelar
        </a>
      </div>
    </form>
  );
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan, selected, onSelect,
}: {
  plan: PlanDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const isFree = plan.price === 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-lg border-2 px-3 py-2.5 transition-all ${
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      {selected && (
        <span className="absolute top-2 right-2 bg-teal-500 rounded-full p-0.5">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      <p className="text-sm font-semibold text-gray-900 pr-5">{plan.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {isFree ? 'Sin plan' : `$${plan.price}/mes`}
      </p>
      {!isFree && (
        <p className="text-xs text-gray-400 mt-1 leading-tight">
          {plan.limits.docs === -1 ? '∞ docs' : `${plan.limits.docs} docs/mes`}
          {' · '}
          {plan.limits.users === -1 ? '∞ usuarios' : `${plan.limits.users} usuario${plan.limits.users !== 1 ? 's' : ''}`}
        </p>
      )}
    </button>
  );
}
