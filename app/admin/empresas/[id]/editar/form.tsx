'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { actualizarEmpresa } from './actions';
import { PLANS, FREE_PLAN, type PlanDef } from '@/lib/config/plans';

interface CatalogItem { codigo: string; nombre: string; }

interface InitialData {
  teamId:          number;
  rnc:             string;
  razonSocial:     string;
  nombreComercial: string;
  direccion:       string;
  telefono:        string;
  emailFacturacion:string;
  sitioWeb:        string;
  provincia:       string;
  municipio:       string;
  planName:        string; // key lowercase
}

interface Props {
  initial:    InitialData;
  provincias: CatalogItem[];
}

export function EditarEmpresaForm({ initial, provincias }: Props) {
  const [rnc,             setRnc]             = useState(initial.rnc);
  const [razonSocial,     setRazonSocial]     = useState(initial.razonSocial);
  const [nombreComercial, setNombreComercial] = useState(initial.nombreComercial);
  const [direccion,       setDireccion]       = useState(initial.direccion);
  const [telefono,        setTelefono]        = useState(initial.telefono);
  const [emailFact,       setEmailFact]       = useState(initial.emailFacturacion);
  const [sitioWeb,        setSitioWeb]        = useState(initial.sitioWeb);
  const [provincia,       setProvincia]       = useState(initial.provincia);
  const [municipio,       setMunicipio]       = useState(initial.municipio);
  const [municipios,      setMunicipios]      = useState<CatalogItem[]>([]);
  const [loadingMunic,    setLoadingMunic]    = useState(false);
  const [planKey,         setPlanKey]         = useState(initial.planName);

  // Cargar municipios al montar (si ya hay provincia) y al cambiar provincia
  const loadMunicipios = useCallback(async (prov: string, keepMunicipio = false) => {
    if (!prov) { setMunicipios([]); if (!keepMunicipio) setMunicipio(''); return; }
    setLoadingMunic(true);
    try {
      const res  = await fetch(`/api/catalogos/municipios?provincia=${encodeURIComponent(prov)}`);
      const data: CatalogItem[] = await res.json();
      setMunicipios(data);
    } catch { setMunicipios([]); }
    finally { setLoadingMunic(false); }
  }, []);

  // Al montar: carga municipios manteniendo el municipio actual
  useEffect(() => { loadMunicipios(initial.provincia, true); }, []);

  function handleProvincia(val: string) {
    setProvincia(val);
    setMunicipio('');
    loadMunicipios(val, false);
  }

  return (
    <form action={actualizarEmpresa} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <input type="hidden" name="teamId" value={initial.teamId} />

      {/* Datos fiscales */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos fiscales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Razón social <span className="text-red-500">*</span>
            </label>
            <input
              name="razonSocial" required value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              RNC <span className="text-red-500">*</span>
            </label>
            <input
              name="rnc" required maxLength={11} value={rnc}
              onChange={e => setRnc(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre comercial</label>
            <input
              name="nombreComercial" value={nombreComercial}
              onChange={e => setNombreComercial(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
            <input
              name="direccion" value={direccion}
              onChange={e => setDireccion(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Provincia */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
            <select
              name="provincia" value={provincia}
              onChange={e => handleProvincia(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">— Seleccionar —</option>
              {provincias.map(p => (
                <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Municipio */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Municipio
              {loadingMunic && <span className="ml-2 inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin align-middle" />}
            </label>
            <select
              name="municipio" value={municipio}
              onChange={e => setMunicipio(e.target.value)}
              disabled={!provincia || loadingMunic}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{!provincia ? 'Selecciona provincia primero' : '— Seleccionar —'}</option>
              {municipios.map(m => (
                <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input
              name="telefono" value={telefono}
              onChange={e => setTelefono(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email facturación</label>
            <input
              name="emailFacturacion" type="email" value={emailFact}
              onChange={e => setEmailFact(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sitio web</label>
            <input
              name="sitioWeb" value={sitioWeb}
              onChange={e => setSitioWeb(e.target.value)}
              placeholder="https://empresa.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

        </div>
      </div>

      {/* Plan */}
      <input type="hidden" name="planName" value={planKey} />
      <div className="border-t border-gray-100 pt-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <PlanCard plan={FREE_PLAN} selected={planKey === ''} onSelect={() => setPlanKey('')} />
          {PLANS.map(p => (
            <PlanCard key={p.key} plan={p} selected={planKey === p.key} onSelect={() => setPlanKey(p.key)} />
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Guardar cambios
        </button>
        <a
          href={`/admin/empresas/${initial.teamId}`}
          className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

function PlanCard({ plan, selected, onSelect }: { plan: PlanDef; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button" onClick={onSelect}
      className={`relative text-left rounded-lg border-2 px-3 py-2.5 transition-all ${
        selected ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      {selected && (
        <span className="absolute top-2 right-2 bg-teal-500 rounded-full p-0.5">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      <p className="text-sm font-semibold text-gray-900 pr-5">{plan.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {plan.price === 0 ? 'Sin plan' : `$${plan.price}/mes`}
      </p>
      {plan.price > 0 && (
        <p className="text-xs text-gray-400 mt-1 leading-tight">
          {plan.limits.docs === -1 ? '∞ docs' : `${plan.limits.docs} docs/mes`}
          {' · '}
          {plan.limits.users === -1 ? '∞ usuarios' : `${plan.limits.users} usuario${plan.limits.users !== 1 ? 's' : ''}`}
        </p>
      )}
    </button>
  );
}
