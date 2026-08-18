'use client';

/**
 * Pestaña «Plantillas»: escribirlas, ver en qué estado las tiene Meta, y
 * publicarlas.
 *
 * El flujo es a dos tiempos —borrador aquí, publicar allá— porque en Meta una
 * plantilla nace en revisión y mientras está en revisión NO se puede editar. Un
 * texto mandado a medio pensar quema el nombre para siempre.
 */

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { Plus, Search, Send, Trash2, Pencil, X, AlertTriangle, Eye } from 'lucide-react';
import { CARD, INPUT, Chip, ChipCategoria, CATEGORIAS, Boton, ESTADOS, type PlantillaVista, type VariableVista } from './_comunes';
import { VistaPrevia } from './_vista-previa';

const FILTROS = [
  { clave: 'todas',      texto: 'Todas' },
  { clave: 'APPROVED',   texto: 'Aprobadas' },
  { clave: 'PENDING',    texto: 'En revisión' },
  { clave: 'REJECTED',   texto: 'Rechazadas' },
  { clave: 'BORRADOR',   texto: 'Borradores' },
] as const;

const TIPOS = ['texto', 'monto', 'fecha'] as const;

/** El destino del botón. La variable va SIEMPRE al final: Meta no la admite en medio. */
const URL_FACTURA = 'https://facturacion.zero.com.do/factura/{{1}}';

const VACIA = {
  id: null as number | null,
  nombre: '', categoria: 'utility', idioma: 'es',
  cuerpo: '', encabezado: '', pie: '',
  variables: [] as VariableVista[],
  boton: null as { texto: string; url: string; ejemplo: string } | null,
};

/** Deduce las variables del cuerpo conservando lo que ya se sabía de cada una. */
function deducir(cuerpo: string, previas: VariableVista[]): VariableVista[] {
  const pos = [...new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  return pos.map((p) => previas.find((v) => v.pos === p)
    ?? { pos: p, nombre: `variable ${p}`, tipo: 'texto', ejemplo: '' });
}

export function TabPlantillas({ plantillas, cargando, onRecargar, onAviso, onError }: {
  plantillas: PlantillaVista[];
  cargando: boolean;
  onRecargar: () => Promise<void>;
  onAviso: (m: string) => void;
  onError: (m: string | null) => void;
}) {
  const [filtro, setFiltro] = useState<string>('todas');
  const [busca, setBusca]   = useState('');
  const [editor, setEditor] = useState<typeof VACIA | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [viendo, setViendo] = useState<PlantillaVista | null>(null);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return plantillas.filter((p) => {
      const porEstado = filtro === 'todas'
        ? true
        : filtro === 'PENDING'
          ? p.estado === 'PENDING' || p.estado === 'PENDING_REVIEW'
          : p.estado === filtro;
      const porTexto = !q || p.nombre.toLowerCase().includes(q) || p.cuerpo.toLowerCase().includes(q);
      return porEstado && porTexto;
    });
  }, [plantillas, filtro, busca]);

  function abrirNueva() { onError(null); setEditor({ ...VACIA }); }

  function abrirEdicion(p: PlantillaVista) {
    onError(null);
    setEditor({
      id: p.id, nombre: p.nombre, categoria: p.categoria, idioma: p.idioma,
      cuerpo: p.cuerpo, encabezado: p.encabezado ?? '', pie: p.pie ?? '',
      variables: p.variables,
      boton: p.boton ?? null,
    });
  }

  async function llamar(url: string, method: string, body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? 'Error');
    return d;
  }

  async function guardar() {
    if (!editor) return;
    setOcupado(true); onError(null);
    try {
      if (editor.id == null) {
        await llamar('/api/admin/whatsapp/plantillas', 'POST', editor);
        onAviso(`Borrador "${editor.nombre}" guardado. Revísalo y publícalo cuando esté listo.`);
      } else {
        const d = await llamar('/api/admin/whatsapp/plantillas', 'PUT', editor);
        onAviso(d.estado === 'BORRADOR' ? 'Borrador actualizado.' : 'Cambios enviados a Meta: vuelve a revisión.');
      }
      setEditor(null);
      await onRecargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'Error'); }
    finally { setOcupado(false); }
  }

  async function publicar(p: PlantillaVista) {
    if (!confirm(`Publicar "${p.nombre}" en Meta?\n\nA partir de aquí el nombre queda ocupado y, mientras esté en revisión, el texto no se puede cambiar.`)) return;
    setOcupado(true); onError(null);
    try {
      const d = await llamar('/api/admin/whatsapp/plantillas/publicar', 'POST', { id: p.id });
      onAviso(`"${p.nombre}" enviada a Meta (${d.estado}). La aprobación tarda de minutos a horas.`);
      await onRecargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'Error'); }
    finally { setOcupado(false); }
  }

  async function borrar(p: PlantillaVista) {
    const enMeta = !p.esBorrador;
    const texto = enMeta
      ? `Borrar "${p.nombre}" de Meta?\n\nSi algún aviso la usa, dejará de poder enviarse.`
      : `Descartar el borrador "${p.nombre}"?`;
    if (!confirm(texto)) return;
    setOcupado(true); onError(null);
    try {
      await llamar(enMeta
        ? `/api/admin/whatsapp/plantillas?name=${encodeURIComponent(p.nombre)}`
        : `/api/admin/whatsapp/plantillas?id=${p.id}`, 'DELETE');
      await onRecargar();
    } catch (e) { onError(e instanceof Error ? e.message : 'Error'); }
    finally { setOcupado(false); }
  }

  const variables = editor ? deducir(editor.cuerpo, editor.variables) : [];
  const sinEjemplo = variables.filter((v) => !v.ejemplo.trim()).length;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: editor ? '1fr 420px' : '1fr' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {/* Filtros + buscador */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {FILTROS.map((f) => {
            const n = f.clave === 'todas' ? plantillas.length
              : plantillas.filter((p) => f.clave === 'PENDING'
                  ? p.estado === 'PENDING' || p.estado === 'PENDING_REVIEW'
                  : p.estado === f.clave).length;
            const activo = filtro === f.clave;
            return (
              <Box key={f.clave} component="button" onClick={() => setFiltro(f.clave)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                  border: '1px solid', borderColor: activo ? '#3658e1' : '#e5e7eb',
                  bgcolor: activo ? '#eef2fe' : '#fff', color: activo ? '#24377d' : '#4b5563',
                  borderRadius: '999px', px: 1.5, py: 0.625, fontSize: '0.8125rem', fontWeight: 500,
                }}>
                {f.clave !== 'todas' && (
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: ESTADOS[f.clave]?.color ?? '#9ca3af' }} />
                )}
                {f.texto} <Box component="span" sx={{ color: '#9ca3af' }}>{n}</Box>
              </Box>
            );
          })}

          <Box sx={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9ca3af' }} />
            <TextField size="small" fullWidth placeholder="Buscar por nombre o contenido…"
              value={busca} onChange={(e) => setBusca(e.target.value)}
              sx={{ ...INPUT, '& .MuiOutlinedInput-input': { pl: 3.5 } }} />
          </Box>

          <Boton onClick={abrirNueva}><Plus size={14} /> Nueva plantilla</Boton>
        </Box>

        {/* Lista */}
        {cargando ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={26} /></Box>
        ) : visibles.length === 0 ? (
          <Box sx={{ ...CARD, p: 5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {plantillas.length === 0
                ? 'Todavía no hay plantillas. Sin una aprobada, los avisos solo llegan a quien nos haya escrito en las últimas 24 horas.'
                : 'Ninguna coincide con ese filtro.'}
            </Typography>
          </Box>
        ) : visibles.map((p) => (
          <Box key={`${p.nombre}-${p.idioma}`} sx={{ ...CARD, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                {p.nombre}
              </Typography>
              <Chip estado={p.estado} />
              <ChipCategoria categoria={p.categoria} />
              {p.soloEnMeta && (
                <Typography sx={{ fontSize: '0.6875rem', color: '#92400e', bgcolor: '#fef3c7', px: 0.75, borderRadius: '4px', fontWeight: 600 }}>
                  creada fuera de Zero
                </Typography>
              )}
            </Box>

            <Box sx={{ bgcolor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', p: 1.5 }}>
              <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {p.cuerpo || <Box component="span" sx={{ color: '#9ca3af' }}>(sin contenido)</Box>}
              </Typography>
              {p.variables.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
                  {p.variables.map((v) => (
                    <Box key={v.pos} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', px: 0.75, py: 0.25 }}>
                      <Typography sx={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: '#3658e1' }}>{`{{${v.pos}}}`}</Typography>
                      <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280' }}>{v.nombre}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {p.motivoRechazo && (
              <Box sx={{ display: 'flex', gap: 0.75, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1 }}>
                <AlertTriangle size={13} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#991b1b' }}>Meta la rechazó: {p.motivoRechazo}</Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', pt: 0.5, borderTop: '1px solid #f3f4f6' }}>
              <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
                Usada en {p.usoAvisos} {p.usoAvisos === 1 ? 'aviso' : 'avisos'}
                {p.usoAvisos > 0 && ` · ${p.usoNegocios} ${p.usoNegocios === 1 ? 'negocio' : 'negocios'}`}
              </Typography>
              <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75 }}>
                <Boton variante="suave" onClick={() => setViendo(p)}><Eye size={13} /> Ver</Boton>
                {p.esBorrador && (
                  <Boton onClick={() => publicar(p)} disabled={ocupado}><Send size={13} /> Publicar</Boton>
                )}
                {p.id != null && (
                  <Boton variante="suave" onClick={() => abrirEdicion(p)} disabled={ocupado || p.estado === 'PENDING' || p.estado === 'PENDING_REVIEW'}
                    title={p.estado.startsWith('PENDING') ? 'Meta no deja editar mientras está en revisión' : undefined}>
                    <Pencil size={13} /> Editar
                  </Boton>
                )}
                <Boton variante="peligro" onClick={() => borrar(p)} disabled={ocupado}><Trash2 size={13} /></Boton>
              </Box>
            </Box>
          </Box>
        ))}

        {visibles.length > 0 && (
          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Mostrando {visibles.length} de {plantillas.length} plantillas
          </Typography>
        )}
      </Box>

      {/* Ver — la plantilla como la recibe el padre, sin poder tocarla.
          Existe aparte del editor porque el 90% de las veces uno entra a
          MIRAR, y abrir el editor para eso es invitar a un cambio accidental
          en algo que, si ya está en Meta, vuelve a revisión. */}
      <Dialog open={!!viendo} onClose={() => setViendo(null)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        {viendo && (
          <DialogContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                {viendo.nombre}
              </Typography>
              <Chip estado={viendo.estado} />
              <ChipCategoria categoria={viendo.categoria} />
              <Box component="button" onClick={() => setViendo(null)}
                sx={{ ml: 'auto', border: 'none', bgcolor: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', p: 0.5 }}>
                <X size={17} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {[
                ['Idioma', viendo.idioma],
                ['Usada en', `${viendo.usoAvisos} ${viendo.usoAvisos === 1 ? 'aviso' : 'avisos'}`],
                ['Negocios', String(viendo.usoNegocios)],
              ].map(([k, v]) => (
                <Box key={k}>
                  <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontWeight: 500 }}>{v}</Typography>
                </Box>
              ))}
            </Box>

            <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', lineHeight: 1.55, bgcolor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', p: 1.25 }}>
              <b>{CATEGORIAS[viendo.categoria]?.etiqueta ?? viendo.categoria}</b>{' — '}
              {CATEGORIAS[viendo.categoria]?.resumen}
            </Typography>

            <VistaPrevia cuerpo={viendo.cuerpo} encabezado={viendo.encabezado}
              pie={viendo.pie} variables={viendo.variables} boton={viendo.boton} />

            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                Texto con las variables
              </Typography>
              <Box sx={{ bgcolor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', p: 1.5 }}>
                <Typography sx={{ fontSize: '0.8125rem', color: '#374151', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {viendo.cuerpo}
                </Typography>
              </Box>
            </Box>

            {viendo.variables.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                  Qué es cada variable
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', '& > li + li': { borderTop: '1px solid #f3f4f6' } }}>
                  {viendo.variables.map((v) => (
                    <Box component="li" key={v.pos}
                      sx={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 1, alignItems: 'center', px: 1.5, py: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#3658e1' }}>{`{{${v.pos}}}`}</Typography>
                      <Typography sx={{ fontSize: '0.8125rem', color: '#1f2937', fontWeight: 500 }}>
                        {v.nombre}
                        <Box component="span" sx={{ color: '#9ca3af', fontWeight: 400 }}> · {v.tipo}</Box>
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: v.ejemplo.trim() ? '#6b7280' : '#b45309' }}>
                        {v.ejemplo.trim() || 'sin ejemplo'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {viendo.motivoRechazo && (
              <Box sx={{ display: 'flex', gap: 0.75, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.25 }}>
                <AlertTriangle size={13} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#991b1b' }}>
                  Meta la rechazó: {viendo.motivoRechazo}. El texto de una rechazada sí se puede editar
                  las veces que haga falta.
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
              <Boton variante="suave" onClick={() => setViendo(null)}>Cerrar</Boton>
              {viendo.id != null && !viendo.estado.startsWith('PENDING') && (
                <Boton onClick={() => { abrirEdicion(viendo); setViendo(null); }}>
                  <Pencil size={13} /> Editar
                </Boton>
              )}
            </Box>
          </DialogContent>
        )}
      </Dialog>

      {/* Editor */}
      {editor && (
        <Box sx={{ ...CARD, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.75, position: { lg: 'sticky' }, top: 16 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>
              {editor.id == null ? 'Nueva plantilla' : `Editar ${editor.nombre}`}
            </Typography>
            <Box component="button" onClick={() => setEditor(null)}
              sx={{ ml: 'auto', border: 'none', bgcolor: 'transparent', cursor: 'pointer', color: '#9ca3af', display: 'flex', p: 0.5 }}>
              <X size={16} />
            </Box>
          </Box>

          <TextField label="Nombre" size="small" fullWidth sx={INPUT}
            disabled={editor.id != null}
            helperText={editor.id != null
              ? 'Meta no deja cambiar el nombre ni el idioma'
              : 'Solo minúsculas, números y guiones bajos'}
            value={editor.nombre}
            onChange={(e) => setEditor({ ...editor, nombre: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField select label="Categoría" size="small" sx={INPUT} value={editor.categoria}
              onChange={(e) => setEditor({ ...editor, categoria: e.target.value })}>
              {Object.entries(CATEGORIAS).map(([clave, c]) => (
                <MenuItem key={clave} value={clave}>{c.etiqueta}</MenuItem>
              ))}
            </TextField>
            <TextField label="Idioma" size="small" sx={INPUT} value={editor.idioma} disabled={editor.id != null}
              helperText="es, nunca es_DO"
              onChange={(e) => setEditor({ ...editor, idioma: e.target.value })} />
          </Box>

          {/* Qué implica la categoría elegida. Va a la vista y no en un tooltip
              porque marketing por descuido cuesta dinero y bajas: exige que el
              padre haya aceptado, tiene tope diario, y se corta de un toque. */}
          <Box sx={{
            bgcolor: editor.categoria === 'utility' ? '#f9fafb' : '#fffbeb',
            border: '1px solid', borderColor: editor.categoria === 'utility' ? '#f3f4f6' : '#fde68a',
            borderRadius: '8px', p: 1.25, display: 'flex', gap: 1,
          }}>
            {editor.categoria !== 'utility' && (
              <AlertTriangle size={13} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
            )}
            <Typography sx={{ fontSize: '0.6875rem', color: editor.categoria === 'utility' ? '#6b7280' : '#92400e', lineHeight: 1.55 }}>
              {CATEGORIAS[editor.categoria]?.resumen}
              {editor.categoria !== 'utility' && ' Para un aviso de cobro la que corresponde es Utility.'}
            </Typography>
          </Box>

          {/* Encabezado, mensaje y pie van en el mismo orden en que WhatsApp los
              pinta. Estaban al revés —el encabezado debajo de las variables— y
              con la lista de variables larga no se veía: se publicaron cinco
              plantillas creyendo que Meta no aceptaba título. */}
          <TextField label="Encabezado" size="small" fullWidth sx={INPUT}
            placeholder="Cobro pendiente"
            helperText={`${editor.encabezado.length} / 60 · es el título en negrita, la primera línea del mensaje. Opcional, pero sin él el aviso abre en seco.`}
            error={editor.encabezado.length > 60}
            value={editor.encabezado}
            onChange={(e) => setEditor({ ...editor, encabezado: e.target.value })} />

          <TextField label="Mensaje" size="small" fullWidth multiline minRows={4} sx={INPUT}
            placeholder="Ya está listo el cobro de {{1}} para {{2}}: {{3}}. Puedes pagarlo hasta el {{4}}."
            helperText={`${editor.cuerpo.length} / 1024 · una variable no puede abrir ni cerrar el mensaje, ni ir pegada a otra`}
            value={editor.cuerpo}
            onChange={(e) => setEditor({ ...editor, cuerpo: e.target.value, variables: deducir(e.target.value, editor.variables) })} />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Boton variante="suave" onClick={() => {
              const n = variables.length + 1;
              setEditor({ ...editor, cuerpo: `${editor.cuerpo}{{${n}}}` });
            }}>
              <Plus size={13} /> Insertar variable
            </Boton>
          </Box>

          {variables.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
                Variables detectadas
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {variables.map((v) => (
                  <Box key={v.pos} sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 92px', gap: 0.75, alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#3658e1' }}>{`{{${v.pos}}}`}</Typography>
                    <TextField size="small" placeholder="nombre" sx={INPUT} value={v.nombre}
                      onChange={(e) => setEditor({ ...editor, variables: variables.map((x) => x.pos === v.pos ? { ...x, nombre: e.target.value } : x) })} />
                    <TextField select size="small" sx={INPUT} value={v.tipo}
                      onChange={(e) => setEditor({ ...editor, variables: variables.map((x) => x.pos === v.pos ? { ...x, tipo: e.target.value } : x) })}>
                      {TIPOS.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                    <Box />
                    <TextField size="small" placeholder="valor de ejemplo" sx={{ ...INPUT, gridColumn: '2 / -1' }}
                      error={!v.ejemplo.trim()} value={v.ejemplo}
                      onChange={(e) => setEditor({ ...editor, variables: variables.map((x) => x.pos === v.pos ? { ...x, ejemplo: e.target.value } : x) })} />
                  </Box>
                ))}
              </Box>
              {sinEjemplo > 0 && (
                <Typography sx={{ fontSize: '0.6875rem', color: '#b45309', mt: 0.75 }}>
                  Faltan {sinEjemplo} ejemplo(s). Meta rechaza las plantillas sin un ejemplo por variable, y tienen que parecerse al dato real.
                </Typography>
              )}
            </Box>
          )}

          <TextField label="Pie" size="small" fullWidth sx={INPUT}
            placeholder="Mensaje automático. Llama al colegio para dudas."
            helperText={`${editor.pie.length} / 60 · texto gris al final. No admite variables.`}
            error={editor.pie.length > 60}
            value={editor.pie}
            onChange={(e) => setEditor({ ...editor, pie: e.target.value })} />

          {/* Botón. Se decide ANTES de publicar porque añadírselo a una
              plantilla ya aprobada la manda otra vez a revisión, y allí Meta
              solo deja editar 1 vez cada 24 h. */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Botón</Typography>
              <Boton variante="suave"
                onClick={() => setEditor({
                  ...editor,
                  boton: editor.boton ? null : {
                    texto: 'Ver factura', url: URL_FACTURA,
                    ejemplo: URL_FACTURA.replace('{{1}}', 'abc123'),
                  },
                })}>
                {editor.boton ? <><X size={12} /> Quitar</> : <><Plus size={12} /> Agregar</>}
              </Boton>
            </Box>

            {editor.boton ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <TextField label="Texto del botón" size="small" sx={INPUT}
                  value={editor.boton.texto}
                  helperText={`${editor.boton.texto.length} / 25`}
                  error={editor.boton.texto.length > 25}
                  onChange={(e) => setEditor({ ...editor, boton: { ...editor.boton!, texto: e.target.value } })} />
                <TextField label="Enlace" size="small" sx={INPUT} value={editor.boton.url}
                  helperText="La variable va al final: Meta no la admite en medio de la dirección."
                  onChange={(e) => setEditor({
                    ...editor,
                    boton: { ...editor.boton!, url: e.target.value, ejemplo: e.target.value.replace('{{1}}', 'abc123') },
                  })} />
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', lineHeight: 1.55 }}>
                Sin botón: el mensaje llega solo con texto. Añadirlo después obliga a pasar
                otra vez por la revisión de Meta.
              </Typography>
            )}
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
              Vista previa en WhatsApp
            </Typography>
            <VistaPrevia cuerpo={editor.cuerpo} encabezado={editor.encabezado} pie={editor.pie}
              variables={variables} boton={editor.boton} />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Boton variante="suave" onClick={() => setEditor(null)} disabled={ocupado}>Cancelar</Boton>
            <Boton onClick={guardar} disabled={ocupado || !editor.nombre.trim() || !editor.cuerpo.trim()}>
              {ocupado ? <CircularProgress size={13} sx={{ color: '#fff' }} /> : null}
              {editor.id == null ? 'Guardar borrador' : 'Guardar cambios'}
            </Boton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
