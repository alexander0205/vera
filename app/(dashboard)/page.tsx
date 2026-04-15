import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Shield, Zap, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      {/* Hero */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <CheckCircle className="h-4 w-4" />
              Certificado DGII · Ley 32-23 · e-CF
            </span>
            <h1 className="text-5xl font-bold text-gray-900 tracking-tight sm:text-6xl">
              Facturación Electrónica{' '}
              <span className="text-blue-700">para República Dominicana</span>
            </h1>
            <p className="mt-6 text-xl text-gray-500 leading-relaxed">
              Emite Comprobantes Fiscales Electrónicos (e-CF) de forma rápida y
              segura. Integrado directamente con la DGII. Cumple con la Ley
              32-23 desde el primer día.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button asChild size="lg" className="rounded-full bg-blue-700 hover:bg-blue-800 text-lg px-8">
                <Link href="/sign-up">
                  Empieza gratis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full text-lg">
                <Link href="/pricing">Ver planes</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              30 facturas gratis · Sin tarjeta de crédito
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-gray-900 mb-12">
            Todo lo que necesitas para emitir e-CF
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-700 text-white mb-5">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Envío inmediato a la DGII
              </h3>
              <p className="text-gray-500">
                Firma digital XMLDSig RSA-SHA256 y envío automático. Recibe el
                trackId y sigue el estado en tiempo real.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-700 text-white mb-5">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                10 tipos de comprobantes
              </h3>
              <p className="text-gray-500">
                Facturas crédito fiscal, consumo, notas débito/crédito,
                compras, gastos menores, exportaciones y más.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-blue-700 text-white mb-5">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Multi-empresa
              </h3>
              <p className="text-gray-500">
                Maneja múltiples RNC desde una sola cuenta. Cada negocio con
                su certificado, secuencias y documentos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tipos de e-CF */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Todos los tipos de e-CF disponibles
          </h2>
          <p className="text-gray-500 mb-10">
            Compatible con la normativa DGII vigente.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { code: '31', name: 'Crédito Fiscal' },
              { code: '32', name: 'Consumo' },
              { code: '33', name: 'Nota de Débito' },
              { code: '34', name: 'Nota de Crédito' },
              { code: '41', name: 'Compras' },
              { code: '43', name: 'Gastos Menores' },
              { code: '44', name: 'Regímenes Especiales' },
              { code: '45', name: 'Gubernamental' },
              { code: '46', name: 'Exportaciones' },
              { code: '47', name: 'Pagos al Exterior' },
            ].map((tipo) => (
              <div
                key={tipo.code}
                className="flex flex-col items-center p-4 bg-gray-50 rounded-xl border border-gray-100 text-center"
              >
                <span className="text-2xl font-bold text-blue-700 mb-1">
                  e-{tipo.code}
                </span>
                <span className="text-xs text-gray-600">{tipo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            ¿Listo para cumplir con la Ley 32-23?
          </h2>
          <p className="text-blue-200 text-lg mb-8">
            Empieza con 30 facturas gratis. Sin contrato, cancela cuando quieras.
          </p>
          <Button
            asChild
            size="lg"
            className="rounded-full bg-white text-blue-700 hover:bg-blue-50 text-lg px-8"
          >
            <Link href="/sign-up">
              Crear cuenta gratis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
