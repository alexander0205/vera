'use client';

/**
 * CompanySwitcher — cambia la empresa activa de la sesión.
 *
 * Vivía dentro del layout de Facturación, donde era el único módulo que podía
 * cambiar de empresa; POS y Escolar no tenían forma de hacerlo. Se sacó acá
 * para que el header único lo ofrezca en todos los módulos.
 *
 * El cambio recarga la sesión y todos los datos de la pantalla: son varios
 * segundos en los que la vista vieja sigue ahí y parece que el clic no hizo
 * nada, así que se tapa con el ZeroLoader.
 */

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mutate as mutarSwr } from 'swr';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import Divider from '@mui/material/Divider';
import { Building2, Check, ChevronDown, Plus, Search } from 'lucide-react';
import { planColorMui, getPlan } from '@/lib/config/plans';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { ZeroLoader } from '@/components/zero-loader';
import type { Team } from '@/lib/db/schema';

function teamHasPlan(t: Team) {
  // Producto en desarrollo: sin billing no existe el concepto de "empresa sin
  // plan", así que nada bloquea la navegación. Ver lib/config/billing.
  if (!BILLING_ENABLED) return true;
  if (t.subscriptionStatus === 'admin') return true;
  const name = t.planName?.toLowerCase();
  if (!name || name === 'gratis') return false;
  const s = t.subscriptionStatus?.toLowerCase();
  if (s === 'canceled' || s === 'unpaid') return false;
  return true;
}

// El tono sale del catálogo (lib/config/plans), no de una lista de nombres:
// la versión anterior comparaba contra 'starter'/'business' y dejó de pintar
// nada el día que esos planes dejaron de existir.
const planColor = planColorMui;

/** Lo que el loader se queda puesto DESPUÉS de que la navegación termine. */
const ESPERA_TRAS_CARGAR_MS = 1000;

export function CompanySwitcher({
  teams,
  activeTeamId,
  onSwitch,
}: {
  teams: Team[];
  activeTeamId: number | null;
  /**
   * Aviso opcional de que se cambió de empresa. Facturación lo usa para su
   * estado optimista del sidebar; POS y Escolar no necesitan enterarse.
   */
  onSwitch?: (teamId: number) => void;
}) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch]     = useState('');
  const open = Boolean(anchorEl);

  // Cambiar de empresa recarga la sesión y todos los datos del dashboard: son
  // varios segundos en los que la pantalla vieja sigue ahí y parece que el
  // clic no hizo nada. El loader tapa ese hueco.
  const [cambiandoA, setCambiandoA] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Solo se cierra cuando una transición que SÍ empezó terminó; sin esto el
  // efecto correría antes de que isPending llegue a true y lo cerraría al
  // instante.
  const transicionArranco = useRef(false);

  const active   = teams.find(t => t.id === activeTeamId) ?? teams[0];
  const filtered = teams.filter(t =>
    !search ||
    t.razonSocial?.toLowerCase().includes(search.toLowerCase()) ||
    t.rnc?.includes(search)
  );

  /**
   * Al terminar la transición se espera un segundo antes de destapar.
   *
   * Que los Server Components hayan vuelto no quiere decir que la pantalla
   * esté lista: los listados, los totales y las tarjetas los pide el cliente
   * después, por SWR. Quitar el loader justo ahí dejaba ver la pantalla
   * montándose a pedazos, que se lee como un fallo. Un segundo cubre ese
   * hueco.
   */
  useEffect(() => {
    if (isPending) { transicionArranco.current = true; return; }
    if (!transicionArranco.current) return;
    transicionArranco.current = false;
    const t = setTimeout(() => setCambiandoA(null), ESPERA_TRAS_CARGAR_MS);
    return () => clearTimeout(t);
  }, [isPending]);

  // Red de seguridad: si algo se cuelga, el loader no se queda pegado para
  // siempre tapando la app.
  useEffect(() => {
    if (!cambiandoA) return;
    const t = setTimeout(() => setCambiandoA(null), 15000);
    return () => clearTimeout(t);
  }, [cambiandoA]);

  async function switchTeam(teamId: number) {
    if (teamId === activeTeamId) { setAnchorEl(null); setSearch(''); return; }
    setAnchorEl(null);
    setSearch('');

    const target = teams.find(t => t.id === teamId);
    setCambiandoA(target?.razonSocial ?? target?.rnc ?? null);

    try {
      await fetch('/api/empresa/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
    } catch {
      setCambiandoA(null);   // no dejar el loader tapando la app si falla
      return;
    }

    /**
     * Se tira TODO el caché de SWR, no solo la lista de empresas.
     *
     * Lo que hay guardado —permisos, módulos, productos, clientes, listados—
     * es de la empresa anterior. El síntoma era que los módulos del nav
     * seguían siendo los de antes y había que recargar a mano; y "a veces"
     * funcionaba porque el `dedupingInterval` global es de 30 s, así que
     * pasado ese rato revalidaba solo.
     *
     * Se revalida, no solo se vacía: el cambio de empresa ya está hecho en la
     * sesión —el `await` de arriba terminó—, así que lo que se vuelva a pedir
     * llega con la empresa nueva. Vaciar sin revalidar dejaba el nav sin
     * módulos de forma permanente: quien los lee no se remonta al navegar a la
     * misma ruta, así que nadie los volvía a pedir.
     */
    void mutarSwr(() => true);

    onSwitch?.(teamId);
    startTransition(() => {
      if (BILLING_ENABLED && (!target || !teamHasPlan(target))) {
        router.push('/pricing?reason=no-plan');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    });
  }

  const label = active?.razonSocial ?? active?.rnc ?? 'Mi empresa';

  return (
    <>
      <ZeroLoader open={!!cambiandoA} subtitulo={cambiandoA ? `Abriendo ${cambiandoA}` : undefined} />
      <Box
        component="button"
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        sx={{
          display:       'flex',
          alignItems:    'center',
          gap:           1,
          px:            1.5,
          py:            0.75,
          borderRadius:  '8px',
          border:        '1px solid',
          borderColor:   'divider',
          bgcolor:       'background.paper',
          cursor:        'pointer',
          transition:    'all 0.15s',
          maxWidth:      240,
          '&:hover':     { bgcolor: 'grey.50', borderColor: 'grey.400' },
        }}
      >
        {active?.logo ? (
          <img src={active.logo} alt={label} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
        ) : (
          <Avatar sx={{ width: 24, height: 24, fontSize: '0.6875rem', fontWeight: 700, bgcolor: 'primary.main', borderRadius: '6px' }}>
            {(label[0] ?? 'E').toUpperCase()}
          </Avatar>
        )}
        <Typography
          variant="body2"
          noWrap
          sx={{ maxWidth: 140, flex: 1, textAlign: 'left', fontWeight: 600, color: 'text.primary' }}
        >
          {label}
        </Typography>
        {BILLING_ENABLED && active && teamHasPlan(active) && active.planName && (
          <Chip
            // El NOMBRE del plan, no lo que hay en la columna: `plan_name`
            // guarda la clave interna ('colegio-avanzado') y pintarla cruda
            // le enseña al cliente un identificador nuestro en vez de
            // «Avanzado».
            label={getPlan(active.planName).name}
            size="small"
            color={planColor(active.planName)}
            sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700, display: { xs: 'none', sm: 'flex' } }}
          />
        )}
        <ChevronDown
          style={{
            width:      14,
            height:     14,
            color:      '#9ca3af',
            transform:  open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => { setAnchorEl(null); setSearch(''); }}
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              borderRadius: '12px',
              border:       '1px solid #e5e7eb',
              boxShadow:    '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              minWidth:     280,
              mt:           0.5,
            },
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {teams.length > 3 && (
          <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              bgcolor: 'grey.50', borderRadius: '8px', px: 1.5, py: 0.75,
            }}>
              <Search style={{ width: 14, height: 14, color: '#9ca3af', flexShrink: 0 }} />
              <InputBase
                autoFocus
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Buscar empresa..."
                sx={{ flex: 1, fontSize: '0.875rem' }}
              />
            </Box>
          </Box>
        )}

        <Box sx={{ py: 0.5, maxHeight: 240, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5, textAlign: 'center' }}>
              Sin resultados
            </Typography>
          ) : filtered.map(t => (
            <MenuItem
              key={t.id}
              onClick={() => switchTeam(t.id)}
              sx={{
                borderRadius: '6px',
                mx: 0.5,
                gap: 1.5,
                py: 1,
                '&:hover': { bgcolor: 'grey.50' },
              }}
            >
              {t.logo ? (
                <img src={t.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
              ) : (
                <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', fontWeight: 700, bgcolor: 'primary.main', borderRadius: '6px', flexShrink: 0 }}>
                  {((t.razonSocial ?? t.rnc ?? 'E')[0] ?? 'E').toUpperCase()}
                </Avatar>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {t.razonSocial ?? t.rnc ?? 'Sin nombre'}
                </Typography>
                {t.rnc && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    RNC {t.rnc}
                  </Typography>
                )}
              </Box>
              {t.id === activeTeamId && (
                <Check style={{ width: 16, height: 16, color: '#3658e1', flexShrink: 0 }} />
              )}
            </MenuItem>
          ))}
        </Box>
      </Menu>
    </>
  );
}
