import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Pasos, Tabla } from '../../_guia';

export const metadata: Metadata = {
  title: 'Cómo emitir un e-CF ante la DGII: requisitos y proceso paso a paso',
  description:
    'Qué necesitas para emitir comprobantes fiscales electrónicos en República Dominicana: RNC al día, certificado digital, postulación en la Oficina Virtual, set de pruebas y secuencias autorizadas. El trámite completo, explicado.',
  keywords: [
    'cómo emitir e-CF', 'facturación electrónica República Dominicana', 'habilitación DGII e-CF',
    'set de pruebas DGII', 'certificado digital para facturar', 'secuencias e-NCF',
  ],
  alternates: { canonical: '/guias/emitir-ecf-dgii' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/emitir-ecf-dgii'),
    title: 'Cómo emitir un e-CF ante la DGII',
    description: 'Requisitos, postulación, set de pruebas y secuencias. El trámite completo.',
  },
};

const PREGUNTAS = [
  {
    pregunta: '¿Puedo emitir e-CF sin certificado digital?',
    respuesta: 'No. El comprobante se firma digitalmente antes de enviarse, y esa firma sale del certificado de la empresa emitido por una entidad autorizada en República Dominicana. Sin certificado no hay firma, y sin firma la DGII no acusa el documento.',
  },
  {
    pregunta: '¿Cuánto tarda la habilitación?',
    respuesta: 'Depende de lo que tarde la DGII en revisar cada envío. La parte que controlas —cargar los datos del software, mandar la postulación y correr el set de pruebas— toma horas; las respuestas de la DGII entre cada paso son las que marcan el ritmo, y suelen ir de días a un par de semanas.',
  },
  {
    pregunta: '¿Qué pasa si se me acaban las secuencias?',
    respuesta: 'No puedes emitir más comprobantes de ese tipo hasta solicitar un rango nuevo en la Oficina Virtual y registrarlo. Por eso conviene mirar el consumo antes de fin de mes: un rango agotado un día de facturación alta para la operación.',
  },
  {
    pregunta: '¿Los comprobantes de prueba valen como factura?',
    respuesta: 'No. Lo que se emite mientras la empresa está en ambiente de pruebas no tiene valor fiscal: sirve para que la DGII valide que tu software genera bien los XML. Solo lo emitido en producción, con secuencias autorizadas, es una factura.',
  },
];

const TIPOS: readonly (readonly string[])[] = [
  ['31 · Factura de Crédito Fiscal', 'Ventas a contribuyentes que usarán el ITBIS'],
  ['32 · Factura de Consumo', 'Ventas al consumidor final'],
  ['33 · Nota de Débito', 'Aumenta el valor de un comprobante ya emitido'],
  ['34 · Nota de Crédito', 'Anula o rebaja un comprobante ya emitido'],
  ['41 · Compras', 'Compras a personas no registradas'],
  ['43 · Gastos Menores', 'Gastos pequeños sin comprobante del proveedor'],
  ['44 · Regímenes Especiales', 'Ventas a zonas francas y similares'],
  ['45 · Gubernamental', 'Ventas al Estado'],
  ['46 · Exportaciones', 'Ventas al exterior'],
  ['47 · Pagos al Exterior', 'Pagos a proveedores de fuera'],
];

export default function GuiaEcf() {
  return (
    <Guia
      slug="emitir-ecf-dgii"
      categoria="Guía · Facturación"
      titulo="Cómo emitir un e-CF ante la DGII"
      bajada="Hacen falta cuatro cosas: el RNC al día, un certificado digital de la empresa, la habilitación aprobada en la Oficina Virtual y secuencias de e-NCF autorizadas. Con eso, cada factura se firma, se envía a la DGII y queda acusada en segundos."
      actualizada="2026-09-24"
      minutos={7}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'DGII · Facturación electrónica', url: 'https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicos/Paginas/default.aspx' },
        { texto: 'DGII · Oficina Virtual', url: 'https://www.dgii.gov.do/ofv/Pages/default.aspx' },
      ]}
      cta={{
        titulo: 'Zero hace esto por dentro',
        detalle: 'La habilitación va por pasos dentro del sistema —datos del software, postulación, set de pruebas— y después cada factura sale firmada y acusada sin que nadie abra otro programa.',
        href: '/productos/erp',
        accion: 'Ver Zero ERP',
      }}
    >
      <Parrafo>
        Un e-CF es una factura que existe como archivo XML firmado, no como papel. Se manda a la
        DGII en el momento de emitirla y la DGII responde si la acepta. Ese acuse es lo que la
        convierte en comprobante válido: no es «mandar una factura por correo», es un intercambio
        entre tu sistema y el de la DGII.
      </Parrafo>

      <Apartado titulo="Lo que necesitas antes de empezar">
        <Lista
          puntos={[
            <><strong className="font-semibold">RNC activo y al día.</strong> Si hay obligaciones pendientes, la habilitación se traba ahí.</>,
            <><strong className="font-semibold">Certificado digital de la empresa</strong>, emitido por una entidad de certificación autorizada. Es lo que firma cada comprobante.</>,
            <><strong className="font-semibold">Acceso a la Oficina Virtual</strong> con el usuario que administra el RNC.</>,
            <><strong className="font-semibold">Un software que genere los XML</strong> en el formato de la DGII y sepa recibir sus respuestas.</>,
          ]}
        />
      </Apartado>

      <Apartado titulo="El proceso, paso a paso">
        <Pasos
          pasos={[
            { titulo: 'Registra los datos de tu software', detalle: 'La DGII pide saber con qué vas a emitir: nombre del software, versión y responsable. Es el primer formulario del trámite.' },
            { titulo: 'Manda la postulación', detalle: 'Se envía un XML de postulación firmado con tu certificado. Ahí la DGII comprueba que la firma es válida y que el formato está bien armado.' },
            { titulo: 'Corre el set de pruebas', detalle: 'La DGII entrega un Excel con casos —facturas, notas de crédito, anulaciones— que tu software tiene que emitir tal cual. Cada caso se envía y se espera su respuesta.' },
            { titulo: 'Corrige lo que rebote', detalle: 'Es normal que el primer intento devuelva errores de formato o de cálculo. Se corrigen y se vuelve a enviar el caso; no hay que empezar de cero.' },
            { titulo: 'Recibe la autorización a producción', detalle: 'Con el set aprobado, la DGII habilita al contribuyente para emitir con valor fiscal.' },
            { titulo: 'Solicita y registra tus secuencias', detalle: 'Los rangos de e-NCF se piden en la Oficina Virtual por tipo de comprobante y se registran en el sistema. Recién ahí sale la primera factura de verdad.' },
          ]}
        />
      </Apartado>

      <Apartado titulo="Los diez tipos de comprobante">
        <Parrafo>
          No todos hacen falta desde el primer día: la mayoría de los negocios emite el 31 y el 32, y
          usa el 34 cuando hay que anular. Los demás se piden cuando el negocio los necesita.
        </Parrafo>
        <Tabla columnas={['Tipo', 'Para qué se usa']} filas={TIPOS} />
      </Apartado>

      <Apartado titulo="Los tres errores que más tiempo cuestan">
        <Lista
          puntos={[
            <><strong className="font-semibold">Emitir en pruebas creyendo que es producción.</strong> Los comprobantes del ambiente de pruebas no valen como factura, y el cliente termina sin comprobante válido.</>,
            <><strong className="font-semibold">Quedarse sin secuencia.</strong> El rango se agota y la facturación se detiene hasta pedir uno nuevo. Conviene revisarlo con semanas de margen.</>,
            <><strong className="font-semibold">Dejar vencer el certificado.</strong> El día que vence, deja de firmarse todo. La renovación no es inmediata: se pide antes.</>,
          ]}
        />
        <Dato>
          Un comprobante emitido y acusado no se borra. Si hay que corregirlo, se emite una nota de
          crédito (tipo 34) que lo anula o lo rebaja, y esa nota también se declara.
        </Dato>
      </Apartado>

      <Apartado titulo="Después de emitir: lo que viene todos los meses">
        <Parrafo>
          Lo emitido alimenta los reportes que se envían a la DGII cada mes. Si la factura está bien
          hecha, el reporte sale solo; si no, se arregla ahí y es cuando duele.{' '}
          <Enlace href="/guias/reportes-606-607-608">Cómo funcionan el 606, el 607 y el 608</Enlace>
        </Parrafo>
      </Apartado>
    </Guia>
  );
}
