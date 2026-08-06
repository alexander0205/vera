'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Trash2, X, CalendarDays, Layers, GraduationCap, DoorOpen, CheckCircle2, Pencil, Check,
} from 'lucide-react';

interface Periodo { id: number; nombre: string; activo: boolean }
interface Servicio { id: number; periodoId: number; nombre: string; tanda: string | null; orden: number }
interface Curso { id: number; servicioId: number; nombre: string; orden: number }   // = grado
interface Seccion { id: number; gradoId: number; nombre: string }                   // = cursos físicos

type AddNivel = 'periodo' | 'servicio' | 'curso' | 'seccion';
interface AddState { nivel: AddNivel; parentId: number; nombre: string; tanda: string }

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (url: string, body: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function Fila({ sangria, children }: { sangria: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-1.5 last:border-0 hover:bg-gray-50/60"
      style={{ paddingLeft: 8 + sangria * 22 }}>
      {children}
    </div>
  );
}

/**
 * Formulario inline de alta (una fila). Definido a nivel de módulo (identidad
 * estable): si viviera dentro de EstructuraTree, cada tecla lo remontaría y el
 * autoFocus del primer campo robaría el foco (al escribir la tanda saltaba al
 * nombre).
 */
function FilaAdd({
  sangria, add, setAdd, onGuardar, ocupado,
}: {
  sangria: number;
  add: AddState;
  setAdd: React.Dispatch<React.SetStateAction<AddState | null>>;
  onGuardar: () => void;
  ocupado: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: 8 + sangria * 22 }}>
      <Input autoFocus className="h-8 max-w-52"
        placeholder={add.nivel === 'periodo' ? 'Año escolar (ej. 2026-2027)' : add.nivel === 'servicio' ? 'Servicio (ej. Secundario)' : add.nivel === 'curso' ? 'Grado (ej. Primero)' : 'Sección (ej. A)'}
        value={add.nombre} onChange={(e) => setAdd((a) => a && ({ ...a, nombre: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      {add.nivel === 'servicio' && (
        <Input className="h-8 max-w-40" placeholder="Tanda (ej. Matutina)" value={add.tanda}
          onChange={(e) => setAdd((a) => a && ({ ...a, tanda: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      )}
      <Button size="sm" className="h-8 bg-zero-600 hover:bg-zero-700" onClick={onGuardar} disabled={ocupado || !add.nombre.trim()}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={() => setAdd(null)}>Cancelar</Button>
    </div>
  );
}

/**
 * La estructura académica como UN árbol:
 *   Período → Servicio (tanda) → Grado → Sección.
 * Todo inline y de un clic para agregar/quitar. Altas optimistas (sin recargar).
 */
export function EstructuraTree() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);       // grados
  const [secciones, setSecciones] = useState<Seccion[]>([]); // admin_escolar_cursos
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState<AddState | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [editSec, setEditSec] = useState<{ id: number; nombre: string } | null>(null);

  // `spinner` solo en la primera carga: al agregar/eliminar revalidamos en
  // silencio para que el árbol no parpadee (nada de "recargar" en cada acción).
  const cargar = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const [p, sv, g, sec] = await Promise.all([
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
        fetch('/api/administracion-escolar/servicios').then((r) => r.json()),
        fetch('/api/administracion-escolar/grados').then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
      ]);
      setPeriodos(p.periodos ?? []);
      setServicios(sv.servicios ?? []);
      setCursos(g.grados ?? []);
      setSecciones(sec.cursos ?? []);
    } finally { if (spinner) setLoading(false); }
  }, []);
  useEffect(() => { void cargar(true); }, [cargar]);

  const abrir = (nivel: AddNivel, parentId = 0) => setAdd({ nivel, parentId, nombre: '', tanda: '' });

  // Alta optimista: insertamos la fila que devuelve el POST en el estado local,
  // sin volver a bajar todo. Instantáneo y sin parpadeo.
  async function guardarAdd() {
    if (!add || !add.nombre.trim()) return;
    const nombre = add.nombre.trim();
    setOcupado(true);
    try {
      if (add.nivel === 'periodo') {
        const r = await post('/api/administracion-escolar/periodos', { nombre });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setPeriodos((xs) => [...xs, j.periodo as Periodo]);
      } else if (add.nivel === 'servicio') {
        const r = await post('/api/administracion-escolar/servicios', { periodoId: add.parentId, nombre, tanda: add.tanda.trim() || null, orden: servicios.filter((s) => s.periodoId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setServicios((xs) => [...xs, j.servicio as Servicio]);
      } else if (add.nivel === 'curso') {
        const r = await post('/api/administracion-escolar/grados', { servicioId: add.parentId, nombre, orden: cursos.filter((c) => c.servicioId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
        setCursos((xs) => [...xs, j.grado as Curso]);
      } else {
        const r = await post('/api/administracion-escolar/cursos', { gradoId: add.parentId, nombre, orden: secciones.filter((s) => s.gradoId === add.parentId).length });
        const j = await r.json();
        if (!r.ok) { alert(j.error ?? 'No se pudo agregar la sección.'); return; }
        setSecciones((xs) => [...xs, j.curso as Seccion]);
      }
      setAdd(null);
    } finally { setOcupado(false); }
  }

  // Abre el alta de sección con la SIGUIENTE letra libre como sugerencia
  // (editable). No crea nada hasta que el usuario confirma.
  function abrirSeccion(gradoId: number) {
    const usadas = secciones.filter((s) => s.gradoId === gradoId).map((s) => s.nombre.toUpperCase());
    let letra = 'A';
    for (let i = 0; i < 26; i++) { const L = String.fromCharCode(65 + i); if (!usadas.includes(L)) { letra = L; break; } }
    setAdd({ nivel: 'seccion', parentId: gradoId, nombre: letra, tanda: '' });
  }

  async function guardarEdicionSeccion() {
    if (!editSec || !editSec.nombre.trim()) return;
    const { id, nombre } = editSec;
    const r = await patch(`/api/administracion-escolar/cursos/${id}`, { nombre: nombre.trim() });
    const j = await r.json();
    if (!r.ok) { alert(j.error ?? 'No se pudo guardar.'); return; }
    setSecciones((xs) => xs.map((x) => (x.id === id ? { ...x, nombre: (j.curso?.nombre ?? nombre).trim() } : x)));
    setEditSec(null);
  }

  async function activarPeriodo(id: number) {
    // Optimista: marca uno activo y apaga los demás sin recargar.
    setPeriodos((xs) => xs.map((p) => ({ ...p, activo: p.id === id })));
    await patch(`/api/administracion-escolar/periodos/${id}`, { activo: true });
    await Promise.all(periodos.filter((p) => p.id !== id && p.activo).map((p) => patch(`/api/administracion-escolar/periodos/${p.id}`, { activo: false })));
  }

  async function borrar(url: string, msg: string) {
    if (!confirm(msg)) return;
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? 'No se pudo eliminar.'); return; }
    await cargar();
  }

  const btnAdd = 'inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-zero-400 hover:text-zero-600';
  const btnDel = 'text-gray-300 hover:text-red-500';

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Layers className="h-4 w-4 text-zero-600" /> Estructura escolar
        </h2>
        <span className="text-xs text-gray-400">Período → Servicio → Grado → Sección</span>
      </div>

      <div className="px-2 py-1.5">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : (
          <>
            {periodos.length === 0 && add?.nivel !== 'periodo' && (
              <p className="px-2 py-3 text-center text-sm text-gray-400">Sin períodos. Crea el primero abajo.</p>
            )}

            {periodos.map((p) => (
              <div key={p.id}>
                <Fila sangria={0}>
                  <CalendarDays className="h-4 w-4 shrink-0 text-zero-600" />
                  <span className="font-semibold text-gray-900">{p.nombre}</span>
                  {p.activo
                    ? <Badge className="border-zero-200 bg-zero-50 text-zero-700">Activo</Badge>
                    : <button onClick={() => activarPeriodo(p.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-zero-600"><CheckCircle2 className="h-3.5 w-3.5" />Activar</button>}
                  <div className="flex-1" />
                  <button className={btnAdd} onClick={() => abrir('servicio', p.id)}><Plus className="h-3 w-3" /> Servicio</button>
                  <button className={btnDel} title="Eliminar período" onClick={() => borrar(`/api/administracion-escolar/periodos/${p.id}`, `¿Eliminar el período "${p.nombre}"?`)}><Trash2 className="h-4 w-4" /></button>
                </Fila>

                {servicios.filter((s) => s.periodoId === p.id).map((sv) => (
                  <div key={sv.id}>
                    <Fila sangria={1}>
                      <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">{sv.nombre}</span>
                      {sv.tanda && <span className="rounded-full bg-zero-100 px-2 py-0.5 text-xs font-medium text-zero-700">{sv.tanda}</span>}
                      <div className="flex-1" />
                      <button className={btnAdd} onClick={() => abrir('curso', sv.id)}><Plus className="h-3 w-3" /> Grado</button>
                      <button className={btnDel} title="Eliminar servicio" onClick={() => borrar(`/api/administracion-escolar/servicios/${sv.id}`, `¿Eliminar el servicio "${sv.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                    </Fila>

                    {cursos.filter((c) => c.servicioId === sv.id).map((c) => (
                      <div key={c.id}>
                        <Fila sangria={2}>
                          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="text-sm text-gray-800">{c.nombre}</span>
                          <div className="flex-1" />
                          <button className={btnAdd} onClick={() => abrirSeccion(c.id)}><Plus className="h-3 w-3" /> Sección</button>
                          <button className={btnDel} title="Eliminar grado" onClick={() => borrar(`/api/administracion-escolar/grados/${c.id}`, `¿Eliminar el grado "${c.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                        </Fila>
                        {secciones.filter((s) => s.gradoId === c.id).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((s) => (
                          <Fila key={s.id} sangria={3}>
                            <DoorOpen className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                            {editSec?.id === s.id ? (
                              <>
                                <span className="text-sm text-gray-500">Sección</span>
                                <Input autoFocus className="h-7 max-w-28" value={editSec.nombre}
                                  onChange={(e) => setEditSec({ id: s.id, nombre: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardarEdicionSeccion(); } if (e.key === 'Escape') setEditSec(null); }} />
                                <button className="text-zero-600 hover:text-zero-700" title="Guardar" onClick={guardarEdicionSeccion}><Check className="h-4 w-4" /></button>
                                <button className="text-gray-400 hover:text-gray-600" title="Cancelar" onClick={() => setEditSec(null)}><X className="h-3.5 w-3.5" /></button>
                              </>
                            ) : (
                              <>
                                <span className="text-sm text-gray-700">Sección {s.nombre}</span>
                                <div className="flex-1" />
                                <button className={btnDel} title="Editar sección" onClick={() => setEditSec({ id: s.id, nombre: s.nombre })}><Pencil className="h-3.5 w-3.5" /></button>
                                <button className={btnDel} title="Eliminar sección" onClick={() => borrar(`/api/administracion-escolar/cursos/${s.id}`, `¿Eliminar la sección "${s.nombre}"?`)}><X className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                          </Fila>
                        ))}
                        {add?.nivel === 'seccion' && add.parentId === c.id && <FilaAdd sangria={3} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
                      </div>
                    ))}
                    {add?.nivel === 'curso' && add.parentId === sv.id && <FilaAdd sangria={2} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
                  </div>
                ))}
                {add?.nivel === 'servicio' && add.parentId === p.id && <FilaAdd sangria={1} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />}
              </div>
            ))}

            {add?.nivel === 'periodo'
              ? <FilaAdd sangria={0} add={add} setAdd={setAdd} onGuardar={guardarAdd} ocupado={ocupado} />
              : <button onClick={() => abrir('periodo')} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-zero-400 hover:text-zero-600"><Plus className="h-4 w-4" /> Nuevo período (año escolar)</button>}
          </>
        )}
      </div>
    </div>
  );
}
