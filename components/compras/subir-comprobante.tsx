'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Upload, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';

/**
 * Subir el comprobante que ya está en el ordenador: el PDF que mandó el
 * proveedor por correo, el recibo escaneado.
 *
 * El enlace del móvil resuelve lo que se compra en la calle, pero la factura de
 * internet llega al correo y no había por dónde meterla: tocaba teclearla
 * entera. Esto la manda por el mismo camino —el QR del e-CF o la lectura con
 * IA— y termina en el formulario de siempre, ya relleno, para comprobarlo
 * contra el papel antes de registrar.
 *
 * No registra nada: solo deja el gasto preparado.
 */

/** Los mismos que acepta el servidor (`detectarTipo`). */
const ACEPTA = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX_ARCHIVOS = 4;

/**
 * El techo de verdad no es el del servidor (10 MB por archivo), sino el body de
 * 4,5 MB de las funciones de Vercel: por encima de eso la subida muere en la
 * plataforma, antes de llegar al código, con un error que no dice nada. Se mide
 * sobre la SUMA, que es lo que viaja, y se deja aire para el resto del formulario.
 */
const MAX_TOTAL_MB = 4;

/**
 * Las imágenes se recomprimen aquí, como hace el teléfono. A 2000 px se sigue
 * leyendo el QR del e-CF y la letra pequeña, que es lo que la lectura necesita.
 * Un PDF pasa intacto: no hay forma de encogerlo en el navegador.
 */
const LADO_MAX_IMAGEN = 2000;
const CALIDAD_IMAGEN = 0.85;

/** Cada cuánto se pregunta si la lectura terminó, y cuántas veces. */
const ESPERA_MS = 1500;
const INTENTOS = 40;

const pesoMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export function SubirComprobante({ etiqueta = 'Subir comprobante', variante = 'outline' }: {
  etiqueta?: string;
  variante?: 'outline' | 'default';
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [nota, setNota] = useState('');
  const [fase, setFase] = useState<'eligiendo' | 'subiendo' | 'leyendo'>('eligiendo');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ocupado = fase !== 'eligiendo';

  const cerrar = useCallback((v: boolean) => {
    if (ocupado) return;
    setAbierto(v);
    if (!v) { setArchivos([]); setNota(''); }
  }, [ocupado]);

  async function elegir(lista: FileList | null) {
    if (!lista) return;
    const nuevos = await Promise.all(
      Array.from(lista).map((f) => comprimirImagen(f, { ladoMax: LADO_MAX_IMAGEN, calidad: CALIDAD_IMAGEN })),
    );
    setArchivos((previos) => {
      const juntos = [...previos, ...nuevos].slice(0, MAX_ARCHIVOS);
      const total = juntos.reduce((n, f) => n + f.size, 0);
      if (total > MAX_TOTAL_MB * 1024 * 1024) {
        toast.error(
          `Entre todos suman ${pesoMb(total)} MB y el tope es ${MAX_TOTAL_MB} MB. `
          + 'Si es un PDF pesado, vuelve a guardarlo con menos calidad o sube solo las páginas con los datos.',
        );
        return previos;
      }
      return juntos;
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  /**
   * La lectura corre después de responder la subida, así que aquí se espera a
   * que la factura deje de estar «procesando». Si tarda más de la cuenta no se
   * pierde nada: queda en la bandeja y se abre desde ahí.
   */
  async function esperarLectura(id: number): Promise<boolean> {
    for (let i = 0; i < INTENTOS; i++) {
      await new Promise((r) => setTimeout(r, ESPERA_MS));
      const res = await fetch(`/api/gastos/capturas/${id}`).catch(() => null);
      if (!res?.ok) continue;
      const j = await res.json().catch(() => null);
      const estado = j?.captura?.estado;
      if (estado && estado !== 'procesando') return true;
    }
    return false;
  }

  async function subir() {
    if (!archivos.length || ocupado) return;
    setFase('subiendo');
    try {
      const form = new FormData();
      archivos.forEach((f) => form.append('archivos', f, f.name));
      if (nota.trim()) form.append('nota', nota.trim());
      const res = await fetch('/api/gastos/capturas', { method: 'POST', body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'No se pudo subir el comprobante');

      if (j.repetida) toast.info('Ese comprobante ya se había subido: se abre el que ya estaba.');
      setFase('leyendo');
      const leida = await esperarLectura(j.id);
      setAbierto(false);
      setArchivos([]);
      setNota('');
      if (leida) {
        router.push(`/dashboard/gastos/registrar?captura=${j.id}`);
      } else {
        toast.info('La lectura está tardando: la factura te espera en «Facturas por revisar».');
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setFase('eligiendo');
    }
  }

  return (
    <>
      <Button type="button" variant={variante} size="sm" onClick={() => setAbierto(true)}
        className="gap-1.5" data-testid="boton-subir-comprobante">
        <Upload className="h-4 w-4" /> {etiqueta}
      </Button>

      <Dialog open={abierto} onOpenChange={cerrar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Subir el comprobante</DialogTitle>
            <DialogDescription>
              El PDF o la foto de la factura del proveedor. Se lee sola y te deja el gasto listo para comprobarlo
              contra el papel antes de registrarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 p-6 text-center hover:bg-gray-50">
              <FileUp className="h-7 w-7 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Elige el archivo</span>
              <span className="text-xs text-gray-500">PDF o imagen · hasta {MAX_ARCHIVOS} archivos, {MAX_TOTAL_MB} MB en total</span>
              <input ref={inputRef} type="file" accept={ACEPTA} multiple className="sr-only"
                data-testid="archivo-comprobante" disabled={ocupado}
                onChange={(e) => void elegir(e.target.files)} />
            </label>

            {archivos.length > 0 && (
              <ul className="space-y-1.5" data-testid="archivos-elegidos">
                {archivos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{pesoMb(f.size)} MB</span>
                    <button type="button" aria-label={`Quitar ${f.name}`} disabled={ocupado}
                      onClick={() => setArchivos((previos) => previos.filter((_, j) => j !== i))}
                      className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-40">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {archivos.length > 1 && (
              <p className="text-xs text-gray-500">Van como una sola factura, en este orden.</p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="nota-comprobante" className="text-sm font-medium">Nota (opcional)</label>
              <Textarea id="nota-comprobante" rows={2} value={nota} disabled={ocupado}
                onChange={(e) => setNota(e.target.value)} placeholder="Para quien lo revise…" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cerrar(false)} disabled={ocupado}>Cancelar</Button>
            <Button type="button" onClick={subir} disabled={!archivos.length || ocupado} className="gap-1.5"
              data-testid="enviar-comprobante">
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              {fase === 'subiendo' ? 'Subiendo…' : fase === 'leyendo' ? 'Leyendo la factura…' : 'Subir y leer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
