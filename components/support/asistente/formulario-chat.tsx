'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import {
  armarPayload, resultadoDeCreacion, validarFormulario,
  type DefFormulario, type Valores,
} from '@/lib/asistente/formulario';
import s from './asistente.module.css';

/**
 * Formulario dentro del chat. Envía a la MISMA ruta de la API que la pantalla
 * equivalente, con la sesión de quien lo llena; no hay una vía propia del
 * asistente. Los valores que adelantó el asistente son solo un punto de partida.
 */

interface ResumenImportacion {
  total: number; created: number; updated: number; skipped: number; errors: string[];
}

type Fase =
  | { t: 'editando' }
  | { t: 'enviando' }
  | { t: 'duplicado'; nombre: string }
  | { t: 'previa'; resumen: ResumenImportacion }
  | { t: 'listo'; mensaje: string; enlace: string }
  | { t: 'error'; mensaje: string };

const MAX_ARCHIVO = 5 * 1024 * 1024;

function mensajeDeError(status: number, cuerpo: unknown): string {
  const c = (cuerpo ?? {}) as { error?: string; detalles?: { fieldErrors?: Record<string, string[]> } };
  const campos = c.detalles?.fieldErrors ? Object.values(c.detalles.fieldErrors).flat().filter(Boolean) : [];
  if (campos.length) return campos.join(' · ');
  if (status === 401) return 'Tu sesión venció. Recarga la página e inicia sesión de nuevo.';
  if (status === 403) return 'Tu usuario no tiene permiso para hacer esto.';
  if (status === 429) return 'Demasiados intentos seguidos. Espera un momento.';
  return c.error && c.error.length < 200 ? c.error : 'No se pudo completar. No se guardó nada; revisa los datos e intenta de nuevo.';
}

export function FormularioChat({ def, inicial }: { def: DefFormulario; inicial: Valores }) {
  const base = useId();
  const [valores, setValores] = useState<Valores>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<Fase>({ t: 'editando' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const ocupado = fase.t === 'enviando';
  const cerrado = fase.t === 'listo';

  function cambiar(id: string, v: string) {
    setValores((x) => ({ ...x, [id]: v }));
    if (errores[id]) setErrores((e) => { const n = { ...e }; delete n[id]; return n; });
  }

  async function enviarJson(forzar = false) {
    const e = validarFormulario(def, valores);
    setErrores(e);
    if (Object.keys(e).length) return;
    setFase({ t: 'enviando' });
    try {
      const cuerpo = { ...armarPayload(def, valores), ...(forzar ? { force: true } : {}) };
      const r = await fetch(def.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 409 && d?.duplicado) {
        setFase({ t: 'duplicado', nombre: String(d.duplicado.razonSocial ?? 'otro cliente') });
        return;
      }
      if (!r.ok) { setFase({ t: 'error', mensaje: mensajeDeError(r.status, d) }); return; }
      const res = resultadoDeCreacion(def, d);
      setFase({ t: 'listo', mensaje: res.mensaje, enlace: res.enlace });
    } catch {
      setFase({ t: 'error', mensaje: 'No hay conexión. No se guardó nada; revisa tu internet e intenta de nuevo.' });
    }
  }

  async function subir(modo: 'preview' | 'commit') {
    if (!archivo) { setErrorArchivo('Elige un archivo CSV'); return; }
    setFase({ t: 'enviando' });
    try {
      const fd = new FormData();
      fd.set('file', archivo);
      fd.set('mode', modo);
      const r = await fetch(def.endpoint, { method: 'POST', body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setFase({ t: 'error', mensaje: mensajeDeError(r.status, d) }); return; }
      const resumen: ResumenImportacion = {
        total: Number(d?.total ?? 0), created: Number(d?.created ?? 0), updated: Number(d?.updated ?? 0),
        skipped: Number(d?.skipped ?? 0), errors: Array.isArray(d?.errors) ? d.errors.slice(0, 5).map(String) : [],
      };
      if (modo === 'preview') { setFase({ t: 'previa', resumen }); return; }
      setFase({
        t: 'listo', enlace: def.pantalla,
        mensaje: `Listo: importé ${resumen.created} ${def.id === 'importar-clientes' ? 'clientes' : 'productos'}` +
          (resumen.skipped ? ` (omití ${resumen.skipped}).` : '.'),
      });
    } catch {
      setFase({ t: 'error', mensaje: 'No hay conexión. No se importó nada; intenta de nuevo.' });
    }
  }

  function elegirArchivo(f: File | null) {
    setErrorArchivo(null);
    setFase({ t: 'editando' });
    if (!f) { setArchivo(null); return; }
    if (f.size > MAX_ARCHIVO) { setArchivo(null); setErrorArchivo('El archivo pesa más de 5 MB'); return; }
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') { setArchivo(null); setErrorArchivo('Debe ser un archivo CSV (.csv)'); return; }
    setArchivo(f);
  }

  if (cerrado && fase.t === 'listo') {
    return (
      <section className={`${s.formulario} ${s.formularioListo}`} aria-live="polite">
        <CheckCircle2 size={18} aria-hidden />
        <div>
          <strong>{fase.mensaje}</strong>
          <Link href={fase.enlace}>Ver en Zero</Link>
        </div>
      </section>
    );
  }

  const esArchivo = def.modo === 'archivo';

  return (
    <section className={s.formulario} aria-label={def.titulo}>
      <header>
        <strong>{def.titulo}</strong>
        <p>{def.descripcion}</p>
      </header>

      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          if (ocupado) return;
          if (esArchivo) void subir('preview'); else void enviarJson();
        }}
      >
        {esArchivo ? (
          <div className={s.campo}>
            <label htmlFor={`${base}-archivo`}>{def.campos[0].etiqueta}</label>
            <div className={s.archivo}>
              <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado}>
                {archivo ? <FileSpreadsheet size={16} aria-hidden /> : <Upload size={16} aria-hidden />}
                <span>{archivo ? archivo.name : 'Elegir archivo…'}</span>
              </button>
              <input
                id={`${base}-archivo`}
                ref={entrada}
                type="file"
                accept={def.campos[0].accept}
                hidden
                onChange={(ev) => elegirArchivo(ev.target.files?.[0] ?? null)}
              />
            </div>
            {errorArchivo && <p className={s.campoError} role="alert">{errorArchivo}</p>}
          </div>
        ) : (
          def.campos.map((c) => {
            const id = `${base}-${c.id}`;
            const err = errores[c.id];
            const comun = {
              id, value: valores[c.id] ?? '', disabled: ocupado,
              'aria-invalid': err ? true : undefined,
              'aria-describedby': err ? `${id}-e` : c.ayuda ? `${id}-a` : undefined,
            };
            return (
              <div className={s.campo} key={c.id}>
                <label htmlFor={id}>{c.etiqueta}{c.requerido && <span aria-hidden> *</span>}</label>
                {c.tipo === 'select' ? (
                  <select {...comun} onChange={(ev) => cambiar(c.id, ev.target.value)}>
                    <option value="">Elige…</option>
                    {c.opciones?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                  </select>
                ) : c.tipo === 'area' ? (
                  <textarea {...comun} rows={2} maxLength={c.max} placeholder={c.placeholder} onChange={(ev) => cambiar(c.id, ev.target.value)} />
                ) : (
                  <input
                    {...comun}
                    type={c.tipo === 'email' ? 'email' : 'text'}
                    inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                    maxLength={c.max}
                    placeholder={c.placeholder}
                    onChange={(ev) => cambiar(c.id, ev.target.value)}
                  />
                )}
                {err ? <p id={`${id}-e`} className={s.campoError} role="alert">{err}</p>
                  : c.ayuda ? <p id={`${id}-a`} className={s.campoAyuda}>{c.ayuda}</p> : null}
              </div>
            );
          })
        )}

        {fase.t === 'previa' && (
          <div className={s.previa} role="status">
            <strong>Esto es lo que encontré en el archivo</strong>
            <ul>
              <li>{fase.resumen.total} filas leídas</li>
              <li>{fase.resumen.created} se van a importar</li>
              {fase.resumen.skipped > 0 && <li>{fase.resumen.skipped} se omiten (sin nombre o ya existen)</li>}
            </ul>
            {fase.resumen.errors.length > 0 && <p className={s.campoError}>{fase.resumen.errors.join(' · ')}</p>}
          </div>
        )}

        {fase.t === 'duplicado' && (
          <div className={s.avisoForm} role="alert">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <strong>Ya existe «{fase.nombre}» con ese RNC.</strong>
              <div className={s.avisoAcciones}>
                <button type="button" onClick={() => void enviarJson(true)}>Crear de todos modos</button>
                <button type="button" onClick={() => setFase({ t: 'editando' })}>Corregir</button>
              </div>
            </div>
          </div>
        )}

        {fase.t === 'error' && (
          <p className={s.campoError} role="alert"><AlertTriangle size={14} aria-hidden /> {fase.mensaje}</p>
        )}

        {fase.t !== 'duplicado' && (
          <div className={s.formularioAcciones}>
            {fase.t === 'previa' && fase.resumen.created > 0 && (
              <button type="button" className={s.primario} onClick={() => void subir('commit')}>
                Importar {fase.resumen.created}
              </button>
            )}
            {fase.t === 'previa' ? (
              <button type="button" className={s.secundario} onClick={() => entrada.current?.click()}>Elegir otro archivo</button>
            ) : (
              <button type="submit" className={s.primario} disabled={ocupado}>
                {ocupado ? <><Loader2 size={15} className={s.girar} aria-hidden /> Un momento…</> : def.boton}
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
