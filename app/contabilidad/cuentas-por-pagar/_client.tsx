'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Menu from '@mui/material/Menu';
import { toast } from '@/lib/toast';
import { Wallet, History, Paperclip, Plus } from 'lucide-react';
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
import { fmtDOP, hoyRD, fmtFechaCorta } from '@/lib/utils/format';
import { limpiarMonto, mascaraMonto } from '@/lib/utils/monto-mascara';
import { METODOS_PAGO } from '@/lib/pagos/metodos';
import { avisosLecturaPago, type LecturaPagoIa, type PropuestaPago } from '@/lib/contabilidad/comprobante-pago-lectura';
import { SolicitudesPago, type CompraParaSolicitar } from './_solicitudes';
import { RangoFechas } from '@/components/reportes/rango-fechas';
import { ExportarListado } from '@/components/reportes/exportar-listado';
import { armarEnvioTabla, type ExportTabla } from '@/lib/export/tabla';

type Cuenta = { id:number; proveedorNombre:string|null; referenciaEncf:string|null; fechaVencimiento:string|null; montoTotal:number; pagado:number; saldo:number; vencida:boolean; diasVencido:number };
type Totales = { pendiente:number; vencido:number; count:number; countVencidas:number };
type Pago = {id:number;montoCents:number;metodo:string;fechaPago:string;referencia:string|null;notas:string|null;comprobante?:{nombre:string|null;mime:string;lectura:LecturaPagoIa|null}|null};

type CuentaCatalogo = { id:number; codigo:string; nombre:string };

const fechaCorta = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const ORIGEN_CXP = 'Aquí aparece lo que le debes a tus proveedores. Nace cuando registras un gasto o una compra con forma de pago «A crédito» (Compras › Gastos o Compras › Facturas recibidas).';
const MOTIVO_SIN_ASIENTO: Record<string, string> = {
  'contabilidad-apagada': 'la contabilidad automática está apagada',
  'sin-cuenta-por-pagar': 'falta la cuenta por pagar en la configuración',
  'sin-cuenta-cobro': 'falta la cuenta de caja o banco de la que sale el dinero',
  'sin-monto': 'el pago no tiene monto',
  'ya-tiene-asiento': 'ya tenía asiento',
};
const vencidaHace = (d: number) => `vencida hace ${d} ${d === 1 ? 'día' : 'días'}`;
const CUBETA_LABEL: Record<string, string> = { porVencer: 'Por vencer', d1a30: '1–30 días', d31a60: '31–60 días', d61a90: '61–90 días', d90mas: '90+ días' };

/** Imprimir / PDF / Excel de las cuentas filtradas. */
const EXPORTAR: ExportTabla<Cuenta> = {
  titulo: 'Cuentas por pagar',
  archivo: 'cuentas-por-pagar',
  columnas: [
    { titulo: 'Proveedor', valor: c => c.proveedorNombre ?? 'Proveedor sin nombre', ancho: 2 },
    { titulo: 'NCF', valor: c => c.referenciaEncf ?? `#${c.id}`, ancho: 1.2 },
    { titulo: 'Vence', valor: c => (c.fechaVencimiento ? fechaCorta(c.fechaVencimiento) : null), ancho: 0.8 },
    { titulo: 'Atraso', valor: c => (c.vencida ? `${c.diasVencido} d` : 'Al día'), ancho: 0.7 },
    { titulo: 'A pagar', valor: c => c.montoTotal, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Pagado', valor: c => c.pagado, tipo: 'moneda', total: true, ancho: 1 },
    { titulo: 'Saldo', valor: c => c.saldo, tipo: 'moneda', total: true, ancho: 1 },
  ],
};

export function CuentasPorPagarClient({ cuentas, totales, puedeGestionar, puedeAprobar = false, puedeRegistrar = false, cuentasSalida = [], cuentaSalidaPorMetodo = {} }: { cuentas:Cuenta[]; totales:Totales; puedeGestionar:boolean; puedeAprobar?:boolean; puedeRegistrar?:boolean; cuentasSalida?:CuentaCatalogo[]; cuentaSalidaPorMetodo?:Record<string,number> }) {
  const router = useRouter(); const [pago, setPago] = useState<Cuenta|null>(null); const [solicitar, setSolicitar] = useState<CompraParaSolicitar|null>(null);
  const [monto, setMonto] = useState(''); const [metodo, setMetodo] = useState('transferencia'); const [menuReg, setMenuReg] = useState<HTMLElement|null>(null);
  // Comprobante de la transferencia: se lee con IA al elegirlo y se adjunta cuando el pago ya existe.
  const [referencia, setReferencia] = useState(''); const [archivo, setArchivo] = useState<File|null>(null);
  const [lectura, setLectura] = useState<LecturaPagoIa|null>(null); const [leyendo, setLeyendo] = useState(false); const [avisoLectura, setAvisoLectura] = useState<string|null>(null);
  // 'auto' = la cuenta del método de pago, como antes de poder elegirla. MUI
  // pinta el select vacío si el valor es '', así que el centinela lleva texto.
  const [cuentaSalida, setCuentaSalida] = useState('auto');
  const automatica = cuentasSalida.find(c => c.id === cuentaSalidaPorMetodo[metodo]) ?? null;
  const [fecha, setFecha] = useState(hoyRD()); const [error, setError] = useState<string|null>(null); const [guardando, setGuardando] = useState(false); const enVuelo = useRef(false); const [historial,setHistorial]=useState<{cuenta:Cuenta;pagos:Pago[]}|null>(null); const [lista,setLista]=useState(cuentas); const [resumen,setResumen]=useState(totales); const [busqueda,setBusqueda]=useState(''); const [estado,setEstado]=useState(''); const [cubeta,setCubeta]=useState('');
  // Rango por fecha de vencimiento (la lista no trae la de la compra).
  const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
  const hayFiltro = !!(busqueda||estado||cubeta||desde||hasta);
  const visibles = useMemo(() => lista.filter(c => {
    const v = c.fechaVencimiento?.slice(0, 10);
    if (desde && (!v || v < desde)) return false;
    if (hasta && (!v || v > hasta)) return false;
    return true;
  }), [lista, desde, hasta]);
  const filtroTexto = [
    desde && hasta ? `Vence del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : desde ? `Vence desde el ${fechaCorta(desde)}` : hasta ? `Vence hasta el ${fechaCorta(hasta)}` : 'Todas las fechas',
    busqueda ? `Búsqueda: «${busqueda}»` : null,
    estado ? (estado === 'vencidas' ? 'Solo vencidas' : 'Solo al día') : null,
    cubeta ? `Antigüedad: ${CUBETA_LABEL[cubeta] ?? cubeta}` : null,
  ].filter(Boolean).join(' · ');
  const stats: Array<[string, number]> = [['Pendiente',resumen.pendiente],['Vencido',resumen.vencido],['Cuentas',resumen.count],['Vencidas',resumen.countVencidas]];
  // Tras pagar se vuelve a pedir la lista: vive en estado local y router.refresh()
  // no la toca, así que la cuenta pagada seguía en pantalla.
  async function guardar() {
    if (!pago || enVuelo.current) return; enVuelo.current = true; setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/contabilidad/cuentas-por-pagar/${pago.id}/pagos`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ montoDOP:Number(monto), metodo, fechaPago:fecha, referencia:referencia.trim()||undefined, cuentaSalidaId:cuentaSalida==='auto'?null:Number(cuentaSalida) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'No se pudo registrar el pago.'); return; }
      // El pago ya quedó. Si adjuntar el comprobante falla no se deshace: se avisa y se puede adjuntar luego desde el historial.
      if (archivo && typeof data.id === 'number') {
        const f = new FormData(); f.set('archivo', archivo); if (lectura) f.set('lectura', JSON.stringify(lectura));
        const r = await fetch(`/api/contabilidad/cuentas-por-pagar/pagos/${data.id}/comprobante`, { method:'POST', body:f }).catch(()=>null);
        if (!r || !r.ok) toast.warning('El pago se registró, pero no se pudo adjuntar el comprobante. Adjúntalo desde el historial de pagos.');
      }
      const nombrePago = pago.proveedorNombre;
      setPago(null); await filtrar(); router.refresh();
      const a = data.asiento as { creado?: boolean; asientoId?: number; motivo?: string } | null | undefined;
      const monto$ = fmtDOP(Math.round(Number(monto)*100)); const quien = nombrePago ?? 'el proveedor';
      if (a?.creado) toast.success(`Pago de ${monto$} a ${quien} registrado · asiento #${a.asientoId}`);
      else toast.warning(`Pago de ${monto$} a ${quien} registrado, pero sin asiento: ${a?.motivo && MOTIVO_SIN_ASIENTO[a.motivo] ? MOTIVO_SIN_ASIENTO[a.motivo] : 'no se pudo crear'}. Revísalo en el libro diario.`);
    } catch { setError('No se pudo registrar el pago. Revisa tu conexión y mira el historial antes de intentarlo de nuevo.'); }
    finally { enVuelo.current = false; setGuardando(false); }
  }
  async function elegirArchivo(f: File|null) {
    setArchivo(f); setLectura(null); setAvisoLectura(null);
    if (!f) return; setLeyendo(true);
    try {
      const fd = new FormData(); fd.set('archivo', f);
      const r = await fetch('/api/contabilidad/cuentas-por-pagar/comprobante-lectura', { method:'POST', body:fd }); const d = await r.json();
      if (!r.ok) { setAvisoLectura(d.error ?? 'No se pudo leer el comprobante.'); return; }
      const p = d.propuesta as PropuestaPago; setLectura(d.lectura ?? null);
      // Solo se propone: lo que la persona ya escribió distinto se corrige a la vista, no a escondidas.
      if (p.montoDOP) setMonto(p.montoDOP); if (p.fecha) setFecha(p.fecha); if (p.referencia) setReferencia(p.referencia);
      setAvisoLectura(d.aviso ?? (d.lectura ? null : 'No hay lectura automática disponible: escribe los datos a mano.'));
    } catch { setAvisoLectura('No se pudo leer el comprobante. Escribe los datos a mano.'); } finally { setLeyendo(false); }
  }
  async function adjuntarAPago(pagoId:number, f:File) {
    const fd = new FormData(); fd.set('archivo', f);
    const r = await fetch(`/api/contabilidad/cuentas-por-pagar/pagos/${pagoId}/comprobante`, { method:'POST', body:fd });
    if (!r.ok) { const d = await r.json().catch(()=>({})); toast.error(d.error ?? 'No se pudo adjuntar.'); return; }
    if (historial) await verHistorial(historial.cuenta);
  }
  async function verHistorial(cuenta:Cuenta) { const r=await fetch(`/api/contabilidad/cuentas-por-pagar/${cuenta.id}`); const d=await r.json(); if(r.ok)setHistorial({cuenta,pagos:d.pagos??[]}); }
  async function filtrar(nuevaCubeta=cubeta) { const q=new URLSearchParams(); if(busqueda)q.set('search',busqueda); if(estado)q.set('estado',estado); if(nuevaCubeta)q.set('cubeta',nuevaCubeta); q.set('limit','200'); const r=await fetch(`/api/contabilidad/cuentas-por-pagar?${q}`); const d=await r.json();if(r.ok){setLista(d.cuentas);setResumen(d.totales);setCubeta(nuevaCubeta);} }
  return <Box component="section" sx={{ p:{xs:2,sm:3}, maxWidth:1280, mx:'auto', display:'flex', flexDirection:'column', gap:2 }}>
    <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:1.5,flexWrap:'wrap'}}><Box><Typography component="h1" variant="h5" sx={{fontWeight:700}}>Cuentas por pagar</Typography><Typography sx={{color:'#6b7280',mt:.5}}>Facturas de proveedores a crédito: lo que debes, cuándo vence y lo que ya pagaste.</Typography><Typography data-testid="origen-cxp" sx={{color:'#6b7280',mt:.5,fontSize:13}}>{ORIGEN_CXP}</Typography></Box>
      <Box sx={{display:'flex',gap:1,alignItems:'center',flexWrap:'wrap'}}>{puedeRegistrar&&<><Button variant="contained" size="small" startIcon={<Plus size={14}/>} onClick={e=>setMenuReg(e.currentTarget)}>Registrar factura de proveedor</Button><Menu anchorEl={menuReg} open={!!menuReg} onClose={()=>setMenuReg(null)}><MenuItem component={Link} href="/dashboard/gastos/registrar" onClick={()=>setMenuReg(null)}>Gasto (luz, limpieza, papelería…)</MenuItem><MenuItem component={Link} href="/dashboard/compras/registrar" onClick={()=>setMenuReg(null)}>Compra de mercancía o activo</MenuItem></Menu></>}<ExportarListado armar={() => armarEnvioTabla(EXPORTAR, visibles, filtroTexto)} deshabilitado={visibles.length === 0} testId="exportar-cxp" /></Box></Box>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(4,1fr)'},gap:1.5}}>{stats.map(([label,valor]) => <Box key={label} sx={{p:2,border:'1px solid #e5e7eb',borderRadius:2,bgcolor:'#fff'}}><Typography sx={{fontSize:12,color:'#6b7280'}}>{label}</Typography><Typography sx={{fontWeight:700,color:label==='Vencido'&&valor>0?'#dc2626':'#111827'}}>{label==='Cuentas'||label==='Vencidas'?valor:fmtDOP(valor)}</Typography></Box>)}</Box>
    <Box sx={{display:'flex',gap:1,flexWrap:'wrap',alignItems:'center'}}><TextField size="small" label="Buscar proveedor" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/><TextField select size="small" label="Estado" value={estado} onChange={e=>setEstado(e.target.value)} sx={{minWidth:145}}><MenuItem value="">Todos</MenuItem><MenuItem value="vencidas">Vencidas</MenuItem><MenuItem value="al-dia">Al día</MenuItem></TextField><Button variant="outlined" onClick={()=>filtrar()}>Filtrar</Button><Typography component="span" sx={{fontSize:12,color:'#6b7280',ml:1}}>Antigüedad:</Typography>{['porVencer','d1a30','d31a60','d61a90','d90mas'].map(c=><Button key={c} size="small" variant={cubeta===c?'contained':'text'} onClick={()=>filtrar(c)}>{c==='porVencer'?'Por vencer':c==='d90mas'?'90+ días':c.replace('d','').replace('a','–')+' días'}</Button>)}{cubeta&&<Button size="small" onClick={()=>filtrar('')}>Quitar filtro</Button>}</Box>
    {resumen.count>lista.length&&<Alert severity="info" data-testid="aviso-tope">Mostrando {lista.length} de {resumen.count} cuentas. Filtra por proveedor, estado o antigüedad para ver el resto.</Alert>}
    <RangoFechas label="Vence" desde={desde} hasta={hasta} onCambiar={(d,h)=>{setDesde(d);setHasta(h);}} />
    <Box sx={{border:'1px solid #e5e7eb',borderRadius:2,bgcolor:'#fff',overflowX:'auto'}}><Box component="table" sx={{width:'100%',minWidth:760,borderCollapse:'collapse'}}>
      <Box component="thead" sx={{bgcolor:'#f9fafb'}}><Box component="tr">{['Proveedor','NCF','Vence','A pagar','Pagado','Saldo',''].map(h=><Box component="th" key={h} sx={{p:1.25,textAlign:['A pagar','Pagado','Saldo',''].includes(h)?'right':'left',fontSize:12,color:'#6b7280'}}>{h}</Box>)}</Box></Box>
      <Box component="tbody">{visibles.map(c=><Box component="tr" key={c.id} sx={{borderTop:'1px solid #f3f4f6'}}><Box component="td" sx={{p:1.25,fontSize:14}}>{c.proveedorNombre??'Proveedor sin nombre'}</Box><Box component="td" sx={{p:1.25,fontSize:13,whiteSpace:'nowrap'}}>{c.referenciaEncf??`#${c.id}`}</Box><Box component="td" sx={{p:1.25,fontSize:12,color:c.vencida?'#dc2626':'#374151'}}>{c.fechaVencimiento?fmtFechaCorta(c.fechaVencimiento):'—'}{c.vencida?` · ${vencidaHace(c.diasVencido)}`:''}</Box><Box component="td" sx={{p:1.25,textAlign:'right'}}>{fmtDOP(c.montoTotal)}</Box><Box component="td" sx={{p:1.25,textAlign:'right'}}>{fmtDOP(c.pagado)}</Box><Box component="td" sx={{p:1.25,textAlign:'right',fontWeight:700}}>{fmtDOP(c.saldo)}</Box><Box component="td" sx={{p:1.25,textAlign:'right',whiteSpace:'nowrap'}}><Button size="small" title="Historial de pagos" onClick={()=>verHistorial(c)}><History size={14}/></Button>{puedeGestionar&&!puedeAprobar&&<Button size="small" title="Pedirle al dueño que apruebe este pago" onClick={()=>setSolicitar({id:c.id,proveedorNombre:c.proveedorNombre,referencia:c.referenciaEncf,saldo:c.saldo})}>Pedir aprobación</Button>}{puedeGestionar&&<Button size="small" variant="contained" sx={{ml:.5}} startIcon={<Wallet size={14}/>} onClick={()=>{setPago(c);setMonto((c.saldo/100).toFixed(2));setMetodo('transferencia');setCuentaSalida('auto');setError(null);setReferencia('');setArchivo(null);setLectura(null);setAvisoLectura(null)}}>Pagar</Button>}</Box></Box>)}{!visibles.length&&<Box component="tr"><Box component="td" colSpan={7} sx={{p:4,textAlign:'center',color:'#6b7280'}}><Box>{hayFiltro?'Ningún proveedor coincide con el filtro.':'No hay compras a crédito pendientes.'}</Box>{!hayFiltro&&<Box sx={{mt:.5,fontSize:13}}>{ORIGEN_CXP}</Box>}{puedeRegistrar&&!hayFiltro&&<Box sx={{mt:1.5,display:'flex',gap:1,justifyContent:'center',flexWrap:'wrap'}}><Button component={Link} href="/dashboard/gastos/registrar" variant="outlined" size="small">Registrar un gasto a crédito</Button><Button component={Link} href="/dashboard/compras/registrar" variant="outlined" size="small">Registrar una compra a crédito</Button></Box>}</Box></Box>}</Box>
    </Box></Box>
    <SolicitudesPago cuentaSalidaPorMetodo={cuentaSalidaPorMetodo} puedeGestionar={puedeGestionar} puedeAprobar={puedeAprobar} cuentasSalida={cuentasSalida} compra={solicitar} onCerrarSolicitud={()=>setSolicitar(null)} onPagada={()=>{void filtrar();router.refresh();}}/>
    <Dialog open={!!pago} fullWidth maxWidth="xs" onClose={()=>!guardando&&setPago(null)}><DialogTitle>Registrar pago a proveedor</DialogTitle><DialogContent sx={{display:'flex',flexDirection:'column',gap:2,'&&':{pt:2}}}>{pago&&<Typography sx={{fontSize:13,color:'#6b7280'}} data-testid="contexto-pago">{pago.proveedorNombre??'Proveedor sin nombre'} · {pago.referenciaEncf??`#${pago.id}`} · saldo {fmtDOP(pago.saldo)}</Typography>}<TextField label="Monto (RD$)" value={mascaraMonto(monto)} onChange={e=>setMonto(limpiarMonto(e.target.value))} slotProps={{htmlInput:{inputMode:'decimal'}}}/><TextField select label="Método" value={metodo} onChange={e=>setMetodo(e.target.value)}>{METODOS_PAGO.map(m=><MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}</TextField>{cuentasSalida.length>0&&<TextField select label="Sale de" value={cuentaSalida} onChange={e=>setCuentaSalida(e.target.value)} helperText="La cuenta de caja o banco de la que salió el dinero.">
      <MenuItem value="auto">{automatica?`Automática · ${automatica.codigo} ${automatica.nombre}`:'Automática (la del método)'}</MenuItem>
      {cuentasSalida.map(c=><MenuItem key={c.id} value={String(c.id)}>{c.codigo} · {c.nombre}</MenuItem>)}
    </TextField>}<TextField label="Fecha" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} slotProps={{inputLabel:{shrink:true}}}/><TextField label="Referencia" value={referencia} onChange={e=>setReferencia(e.target.value)} slotProps={{htmlInput:{maxLength:100}}} helperText="Número de confirmación de la transferencia o del cheque."/>
      <Box>{metodo!=='efectivo'&&<Button component="label" size="small" variant="outlined" startIcon={<Paperclip size={14}/>} disabled={leyendo||guardando}>{archivo?'Cambiar comprobante':'Adjuntar comprobante de la transferencia'}<input hidden type="file" accept="application/pdf,image/*" onChange={e=>{void elegirArchivo(e.target.files?.[0]??null);e.target.value='';}}/></Button>}{archivo&&<Typography sx={{fontSize:12,color:'#6b7280',mt:.5}}>{archivo.name}{leyendo?' · leyendo…':''}</Typography>}{avisoLectura&&<Typography sx={{fontSize:12,color:'#b45309',mt:.5}}>{avisoLectura}</Typography>}
        {lectura&&<Typography sx={{fontSize:12,color:'#047857',mt:.5}}>Leído del comprobante: se rellenaron fecha, monto y referencia. Confírmalos con el papel.</Typography>}
        {avisosLecturaPago(lectura,{montoCents:Math.round(Number(monto)*100),fecha}).map(a=><Typography key={a} sx={{fontSize:12,color:'#b45309',mt:.5}}>{a}</Typography>)}</Box>{error&&<Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button onClick={()=>setPago(null)}>Cancelar</Button><Button variant="contained" disabled={guardando||Number(monto)<=0} onClick={guardar}>{guardando?'Guardando…':'Registrar pago'}</Button></DialogActions></Dialog>
    <Dialog open={!!historial} fullWidth maxWidth="xs" onClose={()=>setHistorial(null)}><DialogTitle>Pagos registrados</DialogTitle><DialogContent>{historial?.pagos.length?historial.pagos.map(p=><Box key={p.id} sx={{py:1,borderBottom:'1px solid #eee'}}><Typography>{fmtDOP(p.montoCents)}</Typography><Typography sx={{fontSize:12,color:'#6b7280'}}>{METODOS_PAGO.find(m=>m.value===p.metodo)?.label??p.metodo} · {fmtFechaCorta(p.fechaPago)}{p.referencia?` · ${p.referencia}`:''}</Typography>{p.comprobante?<Typography component="a" href={`/api/contabilidad/cuentas-por-pagar/pagos/${p.id}/comprobante`} target="_blank" rel="noopener noreferrer" sx={{fontSize:12,color:'#3658e1'}}>Ver comprobante{p.comprobante.nombre?` (${p.comprobante.nombre})`:''}</Typography>:puedeGestionar&&<Button component="label" size="small" startIcon={<Paperclip size={12}/>} sx={{px:0,fontSize:12}}>Adjuntar comprobante<input hidden type="file" accept="application/pdf,image/*" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void adjuntarAPago(p.id,f);}}/></Button>}</Box>):<Typography sx={{color:'#6b7280'}}>Aún no hay pagos registrados.</Typography>}</DialogContent><DialogActions><Button onClick={()=>setHistorial(null)}>Cerrar</Button></DialogActions></Dialog>
  </Box>;
}
