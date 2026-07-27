'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import { fmtDOP, hoyRD } from '@/lib/utils/format';
import { METODOS_PAGO } from '@/lib/pagos/metodos';

type Cuenta = { id:number; proveedorNombre:string|null; referenciaEncf:string|null; fechaVencimiento:string|null; montoTotal:number; pagado:number; saldo:number; vencida:boolean; diasVencido:number };
type Totales = { pendiente:number; vencido:number; count:number; countVencidas:number };

export function CuentasPorPagarClient({ cuentas, totales, puedeGestionar }: { cuentas:Cuenta[]; totales:Totales; puedeGestionar:boolean }) {
  const router = useRouter(); const [pago, setPago] = useState<Cuenta|null>(null);
  const [monto, setMonto] = useState(''); const [metodo, setMetodo] = useState('efectivo');
  const [fecha, setFecha] = useState(hoyRD()); const [error, setError] = useState<string|null>(null); const [guardando, setGuardando] = useState(false);
  const stats: Array<[string, number]> = [['Pendiente',totales.pendiente],['Vencido',totales.vencido],['Cuentas',totales.count],['Vencidas',totales.countVencidas]];
  async function guardar() {
    if (!pago) return; setGuardando(true); setError(null);
    const res = await fetch(`/api/contabilidad/cuentas-por-pagar/${pago.id}/pagos`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ montoDOP:Number(monto), metodo, fechaPago:fecha }) });
    const data = await res.json(); setGuardando(false);
    if (!res.ok) { setError(data.error ?? 'No se pudo registrar.'); return; }
    setPago(null); router.refresh();
  }
  return <Box component="section" sx={{ p:{xs:2,sm:3}, maxWidth:1100, mx:'auto', display:'flex', flexDirection:'column', gap:2 }}>
    <Box><Typography component="h1" variant="h5" sx={{fontWeight:700}}>Cuentas por pagar</Typography><Typography sx={{color:'#6b7280',mt:.5}}>Compras a crédito, vencimientos y pagos a proveedores.</Typography></Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(4,1fr)'},gap:1.5}}>{stats.map(([label,valor]) => <Box key={label} sx={{p:2,border:'1px solid #e5e7eb',borderRadius:2,bgcolor:'#fff'}}><Typography sx={{fontSize:12,color:'#6b7280'}}>{label}</Typography><Typography sx={{fontWeight:700,color:label==='Vencido'&&valor>0?'#dc2626':'#111827'}}>{label==='Cuentas'||label==='Vencidas'?valor:fmtDOP(valor)}</Typography></Box>)}</Box>
    <Box sx={{border:'1px solid #e5e7eb',borderRadius:2,bgcolor:'#fff',overflowX:'auto'}}><Box component="table" sx={{width:'100%',minWidth:760,borderCollapse:'collapse'}}>
      <Box component="thead" sx={{bgcolor:'#f9fafb'}}><Box component="tr">{['Proveedor','Compra','Vence','Total','Pagado','Saldo',''].map(h=><Box component="th" key={h} sx={{p:1.25,textAlign:h?'left':'right',fontSize:12,color:'#6b7280'}}>{h}</Box>)}</Box></Box>
      <Box component="tbody">{cuentas.map(c=><Box component="tr" key={c.id} sx={{borderTop:'1px solid #f3f4f6'}}><Box component="td" sx={{p:1.25,fontSize:14}}>{c.proveedorNombre??'Proveedor sin nombre'}</Box><Box component="td" sx={{p:1.25,fontFamily:'monospace',fontSize:12}}>{c.referenciaEncf??`#${c.id}`}</Box><Box component="td" sx={{p:1.25,fontSize:12,color:c.vencida?'#dc2626':'#374151'}}>{c.fechaVencimiento??'—'}{c.vencida?` · ${c.diasVencido}d`:''}</Box><Box component="td" sx={{p:1.25,textAlign:'right'}}>{fmtDOP(c.montoTotal)}</Box><Box component="td" sx={{p:1.25,textAlign:'right'}}>{fmtDOP(c.pagado)}</Box><Box component="td" sx={{p:1.25,textAlign:'right',fontWeight:700}}>{fmtDOP(c.saldo)}</Box><Box component="td" sx={{p:1.25,textAlign:'right'}}>{puedeGestionar&&<Button size="small" startIcon={<Wallet size={14}/>} onClick={()=>{setPago(c);setMonto((c.saldo/100).toFixed(2));setError(null)}}>Pagar</Button>}</Box></Box>)}{!cuentas.length&&<Box component="tr"><Box component="td" colSpan={7} sx={{p:4,textAlign:'center',color:'#6b7280'}}>No hay compras a crédito pendientes.</Box></Box>}</Box>
    </Box></Box>
    <Dialog open={!!pago} onClose={()=>!guardando&&setPago(null)}><DialogTitle>Registrar pago a proveedor</DialogTitle><DialogContent sx={{display:'flex',flexDirection:'column',gap:2,pt:2,minWidth:360}}><TextField label="Monto (RD$)" type="number" value={monto} onChange={e=>setMonto(e.target.value)}/><TextField select label="Método" value={metodo} onChange={e=>setMetodo(e.target.value)}>{METODOS_PAGO.map(m=><MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}</TextField><TextField label="Fecha" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/>{error&&<Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button onClick={()=>setPago(null)}>Cancelar</Button><Button variant="contained" disabled={guardando||Number(monto)<=0} onClick={guardar}>{guardando?'Guardando…':'Registrar pago'}</Button></DialogActions></Dialog>
  </Box>;
}
