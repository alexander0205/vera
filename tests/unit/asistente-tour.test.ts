import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anteriorPasoTour, GRUPOS_TOUR, PASOS_TOUR, pasoTour, posicionTour, siguientePasoTour, tourDeRuta, urlDeTour } from '@/lib/asistente/tour';
import { construirPrimerosPasos } from '@/lib/asistente/primeros-pasos';
import { rutaEsReal } from '@/lib/asistente/enlaces';

const RAIZ = process.cwd();
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8');

/** Dónde se marca cada destino en el código (para que renombrar un botón no rompa el tour en silencio). */
const MARCAS: Record<string, { archivo: string[]; texto: string }> = {
  'empresa-datos': { archivo: ['app', '(dashboard)', 'dashboard', 'configuracion', 'page.tsx'], texto: 'data-tour="empresa-datos"' },
  'producto-importar': { archivo: ['app', '(dashboard)', 'dashboard', 'productos', '_page-client.tsx'], texto: 'data-tour="producto-importar"' },
  'factura-pago': { archivo: ['app', '(dashboard)', 'dashboard', 'facturas', 'nueva', 'sections', 'ResumenSidebar.tsx'], texto: 'data-tour="factura-pago"' },
  'factura-vista-previa': { archivo: ['app', '(dashboard)', 'dashboard', 'facturas', 'nueva', 'sections', 'BottomActionBar.tsx'], texto: 'data-tour="factura-vista-previa"' },
  'certificado-subir': { archivo: ['app', '(dashboard)', 'dashboard', 'certificado', 'page.tsx'], texto: 'data-tour="certificado-subir"' },
  'secuencias-nueva': { archivo: ['app', '(dashboard)', 'dashboard', 'secuencias', 'page.tsx'], texto: 'data-tour="secuencias-nueva"' },
  'producto-nuevo': { archivo: ['app', '(dashboard)', 'dashboard', 'productos', '_page-client.tsx'], texto: 'data-tour="producto-nuevo"' },
  'cliente-nuevo': { archivo: ['app', '(dashboard)', 'dashboard', 'clientes', '_page-client.tsx'], texto: 'data-tour="cliente-nuevo"' },
  'factura-cliente': { archivo: ['app', '(dashboard)', 'dashboard', 'facturas', 'nueva', 'NuevaFacturaForm.tsx'], texto: 'tour="factura-cliente"' },
  'factura-lineas': { archivo: ['app', '(dashboard)', 'dashboard', 'facturas', 'nueva', 'NuevaFacturaForm.tsx'], texto: 'tour="factura-lineas"' },
  'factura-emitir': { archivo: ['app', '(dashboard)', 'dashboard', 'facturas', 'nueva', 'sections', 'BottomActionBar.tsx'], texto: 'data-tour="factura-emitir"' },
};

describe('tour guiado', () => {
  it('cada paso tiene id y destino únicos', () => {
    expect(new Set(PASOS_TOUR.map((p) => p.id)).size).toBe(PASOS_TOUR.length);
    expect(new Set(PASOS_TOUR.map((p) => p.destino)).size).toBe(PASOS_TOUR.length);
  });

  it('todas las pantallas del tour existen', () => {
    for (const p of PASOS_TOUR) expect(rutaEsReal(p.ruta), p.ruta).toBe(true);
  });

  it('cada destino está marcado en el código de su pantalla', () => {
    for (const p of PASOS_TOUR) {
      const m = MARCAS[p.destino];
      expect(m, `falta registrar ${p.destino}`).toBeTruthy();
      expect(leer(...m.archivo), `${p.destino} en ${m.archivo.join('/')}`).toContain(m.texto);
    }
  });

  it('el tour se recorre de principio a fin sin ciclos', () => {
    const vistos = new Set<string>();
    let p = PASOS_TOUR[0];
    while (p) {
      expect(vistos.has(p.id)).toBe(false);
      vistos.add(p.id);
      const s = siguientePasoTour(p.id);
      if (!s) break;
      p = s;
    }
    expect(vistos.size).toBe(PASOS_TOUR.length);
  });

  it('se puede volver al paso anterior', () => {
    expect(anteriorPasoTour('empresa')).toBeNull();
    expect(anteriorPasoTour('certificado')?.id).toBe('empresa');
  });

  it('cada paso pertenece a un grupo con nombre', () => {
    for (const p of PASOS_TOUR) expect(GRUPOS_TOUR[p.grupo], p.id).toBeTruthy();
  });

  it('un id desconocido no abre nada', () => {
    expect(pasoTour('x')).toBeNull();
    expect(pasoTour(null)).toBeNull();
    expect(urlDeTour('x')).toBeNull();
    expect(siguientePasoTour('x')).toBeNull();
  });

  it('la dirección lleva la pantalla y el paso', () => {
    expect(urlDeTour('producto')).toBe('/dashboard/productos?tour=producto');
    expect(posicionTour('producto')).toEqual({ actual: 4, total: PASOS_TOUR.length });
  });

  it('los pasos de primeros pasos abren su tour', () => {
    expect(tourDeRuta('/dashboard/productos')).toBe('producto');
    const p = construirPrimerosPasos({ certificado: false, secuencias: 0, clientes: 0, productos: 0, facturasEmitidas: 0 });
    expect(p.pasos[0].tour).toBe('/dashboard/configuracion?tour=empresa');
    expect(p.siguiente?.tour).toBe('/dashboard/certificado?tour=certificado');
    for (const paso of p.pasos) expect(paso.tour.startsWith(paso.ruta === '/dashboard/clientes/nuevo' ? '/dashboard/clientes?' : paso.ruta)).toBe(true);
  });
});
