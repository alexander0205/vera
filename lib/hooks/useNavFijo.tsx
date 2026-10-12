'use client';

/**
 * Preferencia "menú fijo" — compartida por los 4 módulos.
 *
 *   suelto → rail de 68px que se expande al pasar el mouse (default)
 *   fijo   → 224px permanentes, con el texto siempre visible
 *
 * Va por contexto y no por props porque los layouts de POS, Escolar y
 * Administración son Server Components: no pueden pasarle una función a un
 * componente cliente ("Functions cannot be passed directly to Client
 * Components"). El provider vive en el shell, que sí es cliente, y el rail y el
 * header leen de ahí — así los dos ven el MISMO estado y no se desincronizan.
 *
 * SSR: arranca SIEMPRE en `false` y se corrige en un efecto. Leer localStorage
 * durante el render daría un HTML distinto en servidor y cliente, y React
 * tiraría error de hidratación.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CLAVE = 'zero:nav-fijo';

interface NavFijoCtx {
  fijo: boolean;
  alternar: () => void;
}

const Ctx = createContext<NavFijoCtx>({ fijo: false, alternar: () => {} });

export function NavFijoProvider({ children }: { children: React.ReactNode }) {
  const [fijo, setFijo] = useState(false);

  useEffect(() => {
    try {
      setFijo(window.localStorage.getItem(CLAVE) === '1');
    } catch {
      // Safari en modo privado tira al tocar localStorage: se queda en suelto.
    }
  }, []);

  const alternar = useCallback(() => {
    setFijo(prev => {
      const siguiente = !prev;
      try { window.localStorage.setItem(CLAVE, siguiente ? '1' : '0'); } catch { /* no crítico */ }
      return siguiente;
    });
  }, []);

  const valor = useMemo(() => ({ fijo, alternar }), [fijo, alternar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useNavFijo(): NavFijoCtx {
  return useContext(Ctx);
}
