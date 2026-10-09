'use client';

/**
 * Plantillas de WhatsApp, en tres pestañas.
 *
 *   Plantillas       — escribirlas y publicarlas en Meta
 *   Automatizaciones — qué plantilla usa cada aviso, para todos
 *   Por negocio      — lo mismo, pero para un colegio concreto
 *
 * Están juntas porque separadas se rompen: una plantilla aprobada que no está
 * asignada a ningún aviso no manda nada, y un aviso asignado a una plantilla
 * rechazada falla en silencio la noche del envío. Aquí se ve de un vistazo si
 * cada aviso tiene plantilla Y si esa plantilla está aprobada.
 */

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FileText, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CARD, Boton, type PlantillaVista } from './_comunes';
import { TabPlantillas } from './_tab-plantillas';
import { TabAvisos, type Hueco, type Asignacion, type Empresa } from './_tab-avisos';

const PESTANAS = [
  { clave: 'plantillas',      texto: 'Plantillas' },
  { clave: 'automatizaciones', texto: 'Automatizaciones' },
  { clave: 'negocio',          texto: 'Por negocio' },
] as const;

export default function PlantillasClient() {
  const [pestana, setPestana] = useState<string>('plantillas');

  const [plantillas, setPlantillas] = useState<PlantillaVista[]>([]);
  const [errorCrm, setErrorCrm]     = useState<string | null>(null);
  const [catalogo, setCatalogo]     = useState<Hueco[]>([]);
  const [asignaciones, setAsig]     = useState<Asignacion[]>([]);
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [teamId, setTeamId]         = useState('');

  const [cargando, setCargando]   = useState(true);
  const [cargandoAsig, setCargA]  = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [aviso, setAviso]         = useState<string | null>(null);

  const cargarPlantillas = useCallback(async () => {
    const r = await fetch('/api/admin/whatsapp/plantillas');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'No se pudieron leer las plantillas');
    setPlantillas(d.plantillas ?? []);
    setErrorCrm(d.errorCrm ?? null);
  }, []);

  const cargarAsignaciones = useCallback(async (id: string) => {
    setCargA(true);
    try {
      const r = await fetch(`/api/admin/whatsapp/asignaciones${id ? `?teamId=${id}` : ''}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudieron leer las asignaciones');
      setCatalogo(d.catalogo ?? []);
      setAsig(d.asignaciones ?? []);
      if (d.empresas) setEmpresas(d.empresas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setCargA(false); }
  }, []);

  useEffect(() => {
    (async () => {
      setCargando(true); setError(null);
      try {
        // En paralelo: una va al CRM y la otra a nuestra base. Encadenarlas solo
        // sumaría las dos esperas.
        await Promise.all([cargarPlantillas(), cargarAsignaciones('')]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      } finally { setCargando(false); }
    })();
  }, [cargarPlantillas, cargarAsignaciones]);

  // Al cambiar de negocio se recargan SUS asignaciones. La lista de empresas ya
  // vino con la primera carga, así que no se vuelve a pedir.
  useEffect(() => {
    if (pestana === 'negocio' && teamId) cargarAsignaciones(teamId);
    if (pestana === 'automatizaciones')  cargarAsignaciones('');
  }, [pestana, teamId, cargarAsignaciones]);

  async function guardarAsignaciones() {
    setGuardando(true); setError(null); setAviso(null);
    try {
      const r = await fetch('/api/admin/whatsapp/asignaciones', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: pestana === 'negocio' && teamId ? Number(teamId) : null,
          asignaciones: asignaciones.map((a) => ({ aviso: a.aviso, nombre: a.nombre, idioma: a.idioma })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar');
      setAviso('Guardado.');
      await cargarAsignaciones(pestana === 'negocio' ? teamId : '');
      await cargarPlantillas();   // cambian los contadores de uso
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setGuardando(false); }
  }

  async function recargarTodo() {
    setCargando(true);
    try { await cargarPlantillas(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setCargando(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <FileText size={20} color="#111827" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
            Plantillas de WhatsApp
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Crea plantillas aprobadas por Meta y decide cuál usa cada aviso.
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Boton variante="suave" onClick={recargarTodo} disabled={cargando}>
            <RefreshCw size={13} /> Actualizar
          </Boton>
          <Box component="a" href="/admin/whatsapp"
            sx={{ display: 'flex', alignItems: 'center', fontSize: '0.8125rem', color: '#3658e1', textDecoration: 'none' }}>
            Estado de la conexión
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5, borderBottom: '1px solid #e5e7eb' }}>
        {PESTANAS.map((p) => (
          <Box key={p.clave} component="button" onClick={() => setPestana(p.clave)}
            sx={{
              border: 'none', bgcolor: 'transparent', cursor: 'pointer', px: 1.5, py: 1,
              fontSize: '0.875rem', fontWeight: pestana === p.clave ? 700 : 500,
              color: pestana === p.clave ? '#3658e1' : '#6b7280',
              borderBottom: '2px solid', borderColor: pestana === p.clave ? '#3658e1' : 'transparent',
              mb: '-1px',
            }}>
            {p.texto}
          </Box>
        ))}
      </Box>

      {errorCrm && (
        <Box sx={{ display: 'flex', gap: 1, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5 }}>
          <AlertTriangle size={14} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#92400e' }}>
            No se pudo leer el estado en Meta: {errorCrm}. Los borradores se ven igual, pero no
            se sabe cuáles están aprobadas.
          </Typography>
        </Box>
      )}
      {error && (
        <Box sx={{ display: 'flex', gap: 1, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5 }}>
          <AlertTriangle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#991b1b' }}>{error}</Typography>
        </Box>
      )}
      {aviso && (
        <Box sx={{ display: 'flex', gap: 1, bgcolor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', p: 1.5 }}>
          <CheckCircle2 size={14} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#065f46' }}>{aviso}</Typography>
        </Box>
      )}

      {pestana === 'plantillas' && (
        <TabPlantillas plantillas={plantillas} cargando={cargando}
          onRecargar={recargarTodo} onAviso={setAviso} onError={setError} />
      )}

      {pestana !== 'plantillas' && (
        <TabAvisos
          modo={pestana === 'negocio' ? 'negocio' : 'global'}
          plantillas={plantillas} catalogo={catalogo} asignaciones={asignaciones}
          empresas={empresas} teamId={teamId} setTeamId={setTeamId}
          setAsignaciones={setAsig} onGuardar={guardarAsignaciones}
          guardando={guardando} cargando={cargandoAsig}
        />
      )}

      {plantillas.length === 0 && !cargando && (
        <Box sx={{ ...CARD, p: 2, display: 'flex', gap: 1.25, bgcolor: '#f9fafb' }}>
          <AlertTriangle size={15} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: '#4b5563', lineHeight: 1.6 }}>
            Sin ninguna plantilla aprobada, los avisos solo pueden salir a quien nos haya escrito
            en las últimas 24 horas. Un padre al que hay que recordarle una mensualidad lleva, por
            definición, semanas sin escribir.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
