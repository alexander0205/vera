import { SiteHeader } from '@/components/site-header';
import { ContactoForm } from '@/components/contacto-form';
import { Receipt } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <SiteHeader />

      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero compacto */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 mb-6">
              <Receipt className="h-8 w-8 text-teal-600" />
              <span className="text-2xl font-bold text-gray-900">Zero</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Facturación Electrónica DGII
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-xl mx-auto">
              Servicio de e-CF para empresas dominicanas. ¿Quieres integrar tu sistema con la DGII?
              Déjanos tus datos y te contactamos.
            </p>
          </div>

          {/* Formulario contacto */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8" id="contacto">
            <ContactoForm />
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            ¿Ya tienes cuenta?{' '}
            <a href="/sign-in" className="text-teal-600 hover:underline font-medium">Iniciar sesión</a>
          </p>
        </div>
      </section>
    </main>
  );
}
