'use client';

/**
 * Qué plantilla usa cada aviso.
 *
 * Sirve para las dos pestañas —«Automatizaciones» y «Por negocio»— porque son
 * la misma tabla con distinto alcance: sin negocio se editan los valores por
 * defecto de la plataforma, con negocio se editan los suyos. Escribirlas dos
 * veces habría significado que el día que un aviso gane un campo, una de las
 * dos se quede sin él.
 *
 * Lo único que cambia de verdad es la herencia: un negocio que no ha elegido
 * usa lo global, y eso hay que decirlo en pantalla o nadie entiende por qué ve
 * una plantilla que no puso.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import { Zap, Users, RotateCcw, AlertTriangle } from 'lucide-react';
import { CARD, INPUT, Chip, Boton, Etiqueta, type PlantillaVista } from './_comunes';
import { VistaPrevia } from './_vista-previa';

export interface Hueco {
  clave: string; titulo: string; detalle: string; sugerida: string; variables: string[];
}
export interface Asignacion {
  aviso: string; nombre: string; idioma: string; propia: boolean;
  /** La que sale cuando el cargo YA tiene factura. Vacío = siempre la misma. */
  nombreConLink?: string | null;
}
export interface Empresa { id: number; nombre: string }

export function TabAvisos({
  modo, plantillas, catalogo, asignaciones, empresas, teamId, setTeamId,
  setAsignaciones, onGuardar, guardando, cargando,
}: {
  modo: 'global' | 'negocio';
  plantillas: PlantillaVista[];
  catalogo: Hueco[];
  asignaciones: Asignacion[];
  empresas: Empresa[];
  teamId: string;
  setTeamId: (v: string) => void;
  setAsignaciones: (f: (prev: Asignacion[]) => Asignacion[]) => void;
  onGuardar: () => Promise<void>;
  guardando: boolean;
  cargando: boolean;
}) {
  const [selec, setSelec] = useState<string | null>(null);

  const hueco = catalogo.find((h) => h.clave === selec) ?? catalogo[0];
  const asigSel = asignaciones.find((a) => a.aviso === hueco?.clave);
  const plantillaSel = plantillas.find((p) => p.nombre === asigSel?.nombre);

  const propias    = asignaciones.filter((a) => a.propia && a.nombre).length;
  const heredadas  = asignaciones.filter((a) => !a.propia && a.nombre).length;
  const sinAsignar = asignaciones.filter((a) => !a.nombre).length;

  function asignar(clave: string, nombre: string) {
    setAsignaciones((prev) => prev.map((a) => a.aviso === clave ? { ...a, nombre, propia: true } : a));
  }

  function asignarConLink(clave: string, nombreConLink: string) {
    setAsignaciones((prev) => prev.map((a) =>
      a.aviso === clave ? { ...a, nombreConLink: nombreConLink || null, propia: true } : a));
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {modo === 'negocio' && (
          <>
            <TextField select size="small" value={teamId} onChange={(e) => setTeamId(e.target.value)}
              sx={{ ...INPUT, maxWidth: 380 }}>
              <MenuItem value=""><em>Elige un negocio…</em></MenuItem>
              {empresas.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.nombre}</MenuItem>)}
            </TextField>

            {teamId && heredadas === asignaciones.length && (
              <Box sx={{ display: 'flex', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', p: 2 }}>
                <Users size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e3a8a' }}>
                    Este negocio hereda las plantillas globales
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#1e40af', mt: 0.25 }}>
                    Sus avisos usan lo configurado en Automatizaciones. Puedes cambiar solo los que quieras.
                  </Typography>
                </Box>
              </Box>
            )}
          </>
        )}

        {modo === 'negocio' && !teamId ? (
          <Box sx={{ ...CARD, p: 5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Elige un negocio para ver sus avisos.</Typography>
          </Box>
        ) : cargando ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={26} /></Box>
        ) : (
          <>
            <Box sx={{ ...CARD, p: 2.25 }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', mb: 0.25 }}>
                Eventos automáticos
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 2 }}>
                {modo === 'global'
                  ? 'Lo que se configure aquí lo hereda todo negocio que no tenga lo suyo.'
                  : 'Lo que cambies aquí solo afecta a este negocio.'}
                {' '}Cada aviso puede tener dos versiones: la de siempre, y la del botón
                «Ver factura» para cuando el cargo ya está facturado. Un cargo sin factura
                no se puede cobrar, así que ahí el enlace no se manda.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {catalogo.map((h) => {
                  const a = asignaciones.find((x) => x.aviso === h.clave);
                  const p = plantillas.find((x) => x.nombre === a?.nombre);
                  const activo = hueco?.clave === h.clave;
                  return (
                    <Box key={h.clave} onClick={() => setSelec(h.clave)}
                      sx={{
                        border: '1px solid', borderColor: activo ? '#3658e1' : '#e5e7eb',
                        bgcolor: activo ? '#fbfcff' : '#fff',
                        borderRadius: '10px', p: 1.75, cursor: 'pointer',
                        '&:hover': { borderColor: activo ? '#3658e1' : '#d1d5db' },
                      }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{h.titulo}</Typography>
                        {modo === 'negocio' && (a?.propia && a.nombre
                          ? <Etiqueta texto="PERSONALIZADA" color="#92400e" fondo="#fef3c7" />
                          : a?.nombre
                            ? <Etiqueta texto="USANDO LA GLOBAL" color="#065f46" fondo="#d1fae5" />
                            : null)}
                        {p && <Chip estado={p.estado} />}
                        {a?.nombre && !p && <Etiqueta texto="NO EXISTE EN META" color="#991b1b" fondo="#fee2e2" />}
                      </Box>
                      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1.25 }}>{h.detalle}</Typography>

                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
                        onClick={(e) => e.stopPropagation()}>
                        <TextField select size="small" sx={{ ...INPUT, flex: 1, minWidth: 220 }}
                          value={a?.nombre ?? ''} onChange={(e) => asignar(h.clave, e.target.value)}>
                          <MenuItem value=""><em>Sin asignar</em></MenuItem>
                          {plantillas.map((pl) => (
                            <MenuItem key={pl.nombre} value={pl.nombre} disabled={!pl.aprobado}>
                              {pl.nombre}{!pl.aprobado && ` — ${pl.estado === 'BORRADOR' ? 'borrador' : pl.estado.toLowerCase()}`}
                            </MenuItem>
                          ))}
                        </TextField>
                        {modo === 'negocio' && a?.propia && a.nombre && (
                          <Boton variante="suave" onClick={() => asignar(h.clave, '')}>
                            <RotateCcw size={13} /> Volver a la global
                          </Boton>
                        )}
                      </Box>

                      {/* La segunda versión: la que sale cuando el cargo YA está
                          facturado. Va debajo y no al lado porque no es una
                          alternativa que elija nadie — es la misma decisión con
                          otra condición, y el motor la toma solo. */}
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}
                        onClick={(e) => e.stopPropagation()}>
                        <Typography sx={{ fontSize: '0.6875rem', color: '#6b7280', minWidth: 118 }}>
                          Si ya hay factura
                        </Typography>
                        <TextField select size="small" sx={{ ...INPUT, flex: 1, minWidth: 200 }}
                          value={a?.nombreConLink ?? ''}
                          onChange={(e) => asignarConLink(h.clave, e.target.value)}>
                          <MenuItem value=""><em>La misma de arriba</em></MenuItem>
                          {plantillas.map((pl) => (
                            <MenuItem key={pl.nombre} value={pl.nombre} disabled={!pl.aprobado}>
                              {pl.nombre}{pl.boton ? '  ·  con botón' : ''}
                              {!pl.aprobado && ` — ${pl.estado === 'BORRADOR' ? 'borrador' : pl.estado.toLowerCase()}`}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>

                      {!a?.nombre && (
                        <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', mt: 0.75 }}>
                          Sugerida: <Box component="code">{h.sugerida}</Box>
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>

              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Boton onClick={onGuardar} disabled={guardando}>
                  {guardando ? <CircularProgress size={13} sx={{ color: '#fff' }} /> : null}
                  Guardar asignaciones
                </Boton>
              </Box>
            </Box>

            {modo === 'negocio' && (
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Las personalizaciones solo afectan a este negocio. Los demás siguen con las globales.
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* Panel del evento seleccionado */}
      {hueco && (modo === 'global' || teamId) && (
        <Box sx={{ ...CARD, p: 2.25, display: 'flex', flexDirection: 'column', gap: 2, position: { lg: 'sticky' }, top: 16 }}>
          {modo === 'negocio' && (
            <Box sx={{ display: 'flex', gap: 2, pb: 1.5, borderBottom: '1px solid #f3f4f6' }}>
              {[['Heredadas', heredadas, '#059669'], ['Propias', propias, '#b45309'], ['Sin asignar', sinAsignar, '#9ca3af']].map(([k, v, c]) => (
                <Box key={String(k)}>
                  <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</Typography>
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: c as string }}>{v}</Typography>
                </Box>
              ))}
            </Box>
          )}

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Zap size={15} color="#3658e1" />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{hueco.titulo}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.6 }}>{hueco.detalle}</Typography>
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
              Datos que se sustituyen, en orden
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {hueco.variables.map((v, i) => (
                <Box key={v} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#f3f4f6', borderRadius: '6px', px: 0.75, py: 0.25 }}>
                  <Typography sx={{ fontSize: '0.6875rem', fontFamily: 'monospace', color: '#3658e1' }}>{`{{${i + 1}}}`}</Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#4b5563' }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', mt: 0.75, lineHeight: 1.5 }}>
              La plantilla que asignes tiene que tener sus variables en este mismo orden: Meta las rellena por posición, no por nombre.
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', mb: 0.75 }}>
              Plantilla asignada
            </Typography>
            {plantillaSel ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>
                    {plantillaSel.nombre}
                  </Typography>
                  <Chip estado={plantillaSel.estado} />
                </Box>
                <VistaPrevia cuerpo={plantillaSel.cuerpo} encabezado={plantillaSel.encabezado}
                  pie={plantillaSel.pie} variables={plantillaSel.variables} boton={plantillaSel.boton} />
              </>
            ) : asigSel?.nombre ? (
              <Box sx={{ display: 'flex', gap: 0.75, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.25 }}>
                <AlertTriangle size={13} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#991b1b' }}>
                  <b>{asigSel.nombre}</b> no existe en Meta. Este aviso va a fallar la noche que toque enviarlo.
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                Sin plantilla. Este aviso no puede salir fuera de la ventana de 24 horas.
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
