'use client';
import Box from '@mui/material/Box';
/**
 * Gráficas reutilizables de reportes (recharts). Client-only.
 * Tema teal alineado al resto del dashboard. Montos siempre en CENTAVOS.
 */
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ComposedChart, Bar, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';

const TEAL = '#3658e1';
const PALETTE = ['#3658e1', '#0ea5e9', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#ec4899'];

function fmtDOPshort(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `RD$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `RD$${(v / 1_000).toFixed(0)}k`;
  return `RD$${v.toFixed(0)}`;
}
function fmtDOPfull(cents: number): string {
  return `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDiaCorto(iso: string): string {
  const [, m, d] = iso.split('-');
  return d ? `${d}/${m}` : iso;
}

// ─── Tendencia (área) ────────────────────────────────────────────────────────

export function TrendChart({ data }: { data: Array<{ periodo: string; ingresosCents: number }> }) {
  if (data.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="periodo" tickFormatter={fmtDiaCorto} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tickFormatter={fmtDOPshort} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          formatter={(v: unknown) => [fmtDOPfull(Number(v)), 'Ingresos']}
          labelFormatter={(l: unknown) => String(l)}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
        />
        <Area type="monotone" dataKey="ingresosCents" stroke={TEAL} strokeWidth={2} fill="url(#gTeal)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Pareto (barras ingreso + línea acumulada) ───────────────────────────────

export function ParetoChart({ data }: { data: Array<{ nombre: string; ingresosCents: number; pctAcumulado: number }> }) {
  if (data.length === 0) return <Vacio />;
  const top = data.slice(0, 12).map(d => ({ ...d, pct: Math.round(d.pctAcumulado * 100) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={top} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={50} />
        <YAxis yAxisId="l" tickFormatter={fmtDOPshort} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          formatter={(v: unknown, name: unknown) => name === 'pct' ? [`${Number(v)}%`, 'Acumulado'] : [fmtDOPfull(Number(v)), 'Ingresos']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
        />
        <Bar yAxisId="l" dataKey="ingresosCents" fill={TEAL} radius={[4, 4, 0, 0]} />
        <Line yAxisId="r" type="monotone" dataKey="pct" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Donut (método de pago / mezcla) ─────────────────────────────────────────

export function DonutChart({ data }: { data: Array<{ label: string; valueCents: number }> }) {
  if (data.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="valueCents" nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v: unknown, n: unknown) => [fmtDOPfull(Number(v)), String(n)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Aging (barras por cubeta) ───────────────────────────────────────────────

export function AgingChart({ buckets }: { buckets: Record<string, number> }) {
  const orden: Array<[string, string]> = [
    ['porVencer', 'Por vencer'], ['0-30', '0-30 días'], ['31-60', '31-60'], ['61-90', '61-90'], ['90+', '+90 días'],
  ];
  const data = orden.map(([k, label], i) => ({ label, valueCents: buckets[k] ?? 0, i }));
  const colors = ['#3658e1', '#22c55e', '#eab308', '#f97316', '#ef4444'];
  if (data.every(d => d.valueCents === 0)) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtDOPshort} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={(v: unknown) => [fmtDOPfull(Number(v)), 'Saldo']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Bar dataKey="valueCents" radius={[4, 4, 0, 0]}>
          {data.map(d => <Cell key={d.i} fill={colors[d.i]} />)}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Vacio() {
  return <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', color: '#9ca3af' }}>Sin datos en este rango.</Box>;
}
