'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="flex justify-center mb-6">
          <div className="h-10 w-10 bg-teal-700 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-lg">e</span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 text-center mb-2">¿Olvidaste tu contraseña?</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Ingresa tu email y te enviaremos un enlace para restablecerla.
        </p>
        {sent ? (
          <div className="text-center">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              Si existe una cuenta con ese email, recibirás un enlace en breve.
            </p>
            <Link href="/sign-in" className="text-sm text-teal-600 hover:underline">Volver al inicio de sesión</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="tu@empresa.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link href="/sign-in" className="text-teal-600 hover:underline">Volver al inicio de sesión</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
