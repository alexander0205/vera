/**
 * Admin → WhatsApp. Si la conexión está viva y quién sale por cada número.
 *
 * Hasta ahora eso solo se sabía entrando a la base y al panel del CRM, y la
 * pregunta «¿por qué no le llegó el aviso a ese padre?» empezaba siempre con
 * media hora de arqueología.
 */

import { exigirAdmin } from '@/lib/auth/admin-guard';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MessageSquare, Wifi, WifiOff, AlertTriangle, Building2 } from 'lucide-react';
import { getEstadoZero, getUsoPorEmpresa } from '@/lib/whatsapp/estado';
import { BotonConectar } from './_boton-conectar';
import { BotonDesvincular } from './_boton-desvincular';

export const dynamic = 'force-dynamic';   // el estado se pregunta al CRM en vivo

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5 } as const;

function Etiqueta({ texto, color, fondo }: { texto: string; color: string; fondo: string }) {
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, bgcolor: fondo, color, borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {texto}
    </Box>
  );
}

export default async function AdminWhatsAppPage() {
  await exigirAdmin();   // antes de tocar la base: ver lib/auth/admin-guard.ts
  const [zero, empresas] = await Promise.all([getEstadoZero(), getUsoPorEmpresa()]);

  const porZero  = empresas.filter((e) => !e.numeroPropio);
  const propios  = empresas.filter((e) => e.numeroPropio);
  const aMedias  = empresas.filter((e) => e.aMedias);

  // Lo que decide el semáforo es si PUEDE ENVIAR, no si está vinculado. Un
  // número vinculado sin registrar rechaza todo con 133010, y pintarlo verde
  // es exactamente lo que nos costó una tarde.
  const puedeEnviar = zero.configurado && zero.puedeEnviar === true;
  const soloVinculado = zero.configurado && zero.vinculado === true && zero.puedeEnviar !== true;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <MessageSquare size={20} color="#111827" />
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>WhatsApp</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
          <Box component="a" href="/admin/whatsapp/plantillas"
            sx={{ fontSize: '0.8125rem', color: '#3658e1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Plantillas
          </Box>
          <Box component="a" href="/admin/whatsapp/chats"
            sx={{ fontSize: '0.8125rem', color: '#3658e1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            Conversaciones →
          </Box>
        </Box>
      </Box>

      {/* ── El número de Zero ───────────────────────────────────────────────── */}
      <Box sx={CARD}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
          {puedeEnviar ? <Wifi size={16} color="#059669" /> : <WifiOff size={16} color={soloVinculado ? '#b45309' : '#dc2626'} />}
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
            Número de Zero
          </Typography>
          {puedeEnviar
            ? <Etiqueta texto="PUEDE ENVIAR" color="#065f46" fondo="#a7f3d0" />
            : soloVinculado
              ? <Etiqueta texto="VINCULADO, NO ENVÍA" color="#92400e" fondo="#fef3c7" />
              : <Etiqueta texto={zero.configurado ? 'SIN CONECTAR' : 'SIN CONFIGURAR'} color="#991b1b" fondo="#fecaca" />}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, columnGap: 2, rowGap: 0.75, fontSize: '0.8125rem' }}>
          <Typography sx={{ fontSize: 'inherit', color: '#6b7280' }}>Variables</Typography>
          <Typography sx={{ fontSize: 'inherit', color: zero.configurado ? '#111827' : '#b91c1c' }}>
            {zero.configurado ? 'CRM_ZERO_API_KEY y CRM_ZERO_API_URL puestas' : zero.error}
          </Typography>

          <Typography sx={{ fontSize: 'inherit', color: '#6b7280' }}>Vinculado</Typography>
          <Typography sx={{ fontSize: 'inherit', color: '#111827' }}>
            {zero.vinculado == null ? '—' : zero.vinculado ? 'Sí — hay número y token' : 'No'}
          </Typography>

          <Typography sx={{ fontSize: 'inherit', color: '#6b7280' }}>Puede enviar</Typography>
          <Typography sx={{ fontSize: 'inherit', color: puedeEnviar ? '#065f46' : '#b45309', fontWeight: 500 }}>
            {zero.puedeEnviar == null ? 'No se sabe — el CRM aún no lo reporta' : zero.puedeEnviar ? 'Sí' : 'No'}
          </Typography>

          <Typography sx={{ fontSize: 'inherit', color: '#6b7280' }}>Número</Typography>
          <Typography sx={{ fontSize: 'inherit', color: '#111827' }}>{zero.numero ?? '—'}</Typography>

          {zero.estado && (
            <>
              <Typography sx={{ fontSize: 'inherit', color: '#6b7280' }}>Estado</Typography>
              <Typography sx={{ fontSize: 'inherit', color: '#111827' }}>
                <Box component="code" sx={{ bgcolor: '#f3f4f6', px: 0.75, borderRadius: '4px' }}>{zero.estado}</Box>
                {zero.descripcion && <Box component="span" sx={{ color: '#6b7280' }}> · {zero.descripcion}</Box>}
              </Typography>
            </>
          )}
        </Box>

        {zero.configurado && zero.error && (
          <Box sx={{ mt: 1.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, display: 'flex', gap: 1 }}>
            <AlertTriangle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#991b1b' }}>{zero.error}</Typography>
          </Box>
        )}

        {soloVinculado && (
          // El número está enganchado pero Meta no lo tiene registrado en la
          // Cloud API. Se arregla volviendo a abrir el connectUrl del CRM.
          <Box sx={{ mt: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5, display: 'flex', gap: 1 }}>
            <AlertTriangle size={14} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: '#92400e' }}>
              El número está <strong>vinculado pero no registrado</strong> en la Cloud API de Meta.
              Todo envío falla con <code>(#133010) Account not registered</code>. Se completa
              con el botón de abajo.
            </Typography>
          </Box>
        )}

        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f3f4f6' }}>
          <BotonConectar
            yaVinculado={zero.vinculado === true}
            puedeEnviar={zero.puedeEnviar}
            empresasQueDependen={porZero.length}
          />
        </Box>
      </Box>

      {/* ── Quién sale por cuál ─────────────────────────────────────────────── */}
      <Box sx={CARD}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>
          Quién sale por cuál número
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 2 }}>
          {porZero.length} {porZero.length === 1 ? 'empresa sale' : 'empresas salen'} por el número de Zero
          {propios.length > 0 && ` · ${propios.length} con el suyo propio`}
          {aMedias.length > 0 && ` · ${aMedias.length} a medio conectar`}
        </Typography>

        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', '& > li + li': { borderTop: '1px solid #f3f4f6' } }}>
          {empresas.map((e) => (
            <Box component="li" key={e.teamId}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.25, bgcolor: '#fff', '&:hover': { bgcolor: '#f9fafb' } }}>
              <Building2 size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: '#1f2937', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.nombre}
              </Typography>
              {e.numero && (
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace', display: { xs: 'none', sm: 'block' } }}>
                  {e.numero}
                </Typography>
              )}
              {e.numeroPropio
                ? <Etiqueta texto="NÚMERO PROPIO" color="#065f46" fondo="#d1fae5" />
                : e.aMedias
                  ? <Etiqueta texto="A MEDIO CONECTAR" color="#92400e" fondo="#fef3c7" />
                  : <Etiqueta texto="POR ZERO" color="#3730a3" fondo="#e0e7ff" />}
              {/* Desvincular solo tiene sentido si hay algo que soltar. Quien
                  ya sale por Zero no tiene fila que borrar. */}
              {(e.numeroPropio || e.aMedias) && (
                <BotonDesvincular teamId={e.teamId} nombre={e.nombre} />
              )}
            </Box>
          ))}
        </Box>

        {porZero.length > 0 && (
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 1.5, lineHeight: 1.6 }}>
            Con el número de Zero las respuestas de esas familias llegan a <strong>nuestro</strong> buzón,
            no al del colegio, y la calificación del número es compartida: si los padres de un colegio
            reportan, Meta frena los envíos de todos.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
