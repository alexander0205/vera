import Link from 'next/link';
import { NuevaEmpresaForm } from './form';
import { catalogos } from '@/lib/ecf-api/client';

export default async function NuevaEmpresaPage() {
  // Cargar provincias server-side — fallback a [] si ecf-api no responde
  let provincias: { codigo: string; nombre: string }[] = [];
  try {
    provincias = await catalogos.provincias();
  } catch {
    // ecf-api offline — el select queda vacío, usuario puede escribir manualmente
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/empresas" className="text-sm text-gray-500 hover:text-gray-700">
          ← Empresas
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Nueva empresa</h1>
      </div>

      <NuevaEmpresaForm provincias={provincias} />
    </div>
  );
}
