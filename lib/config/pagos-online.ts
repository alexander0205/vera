/**
 * Cobro por internet: pasarelas (CardNet, Azul) y links de pago.
 *
 * Apagado por defecto. No es código muerto ni un experimento a medias: el
 * circuito funciona de punta a punta y hay links generados con cobros
 * asociados, pero mientras no haya credenciales de producción de la pasarela
 * lo único que puede hacer un cliente al pulsar «Generar link de pago» es
 * chocarse con un error — o peor, mandarle a alguien un enlace que no cobra.
 *
 * Con esto apagado desaparecen de la interfaz:
 *
 *  - «Links de pago» y «Pasarelas de pago» del menú y del buscador
 *  - el botón «Generar link de pago» de la factura
 *  - la barra de acciones que lo ofrece al emitir
 *
 * Lo que NO desaparece, a propósito:
 *
 *  - los links YA generados y sus cobros: siguen en el histórico de pagos y en
 *    la cartera. Esconder un cobro que entró de verdad sería falsear la
 *    contabilidad de alguien.
 *  - las páginas públicas /pay/[token]: un enlace ya enviado tiene que seguir
 *    funcionando. Retirarlas dejaría a un cliente final mirando un 404 después
 *    de haber recibido un enlace nuestro.
 *  - las rutas de API y los callbacks de la pasarela, por lo mismo.
 *
 * Se enciende con NEXT_PUBLIC_PAGOS_ONLINE=true. No hay que revertir nada.
 *
 * Client-safe: el process.env va literal para que Next lo inlinee en el bundle.
 */
export const PAGOS_ONLINE_ENABLED = process.env.NEXT_PUBLIC_PAGOS_ONLINE === 'true';
