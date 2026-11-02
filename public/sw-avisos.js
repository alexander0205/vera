/*
 * Service worker de los avisos de Zero.
 *
 * Hace UNA cosa: mostrar el aviso push cuando cae un pago y abrir la pantalla
 * donde se encuentra al tocarlo. No guarda nada en caché ni intercepta la red,
 * así que no puede dejar a nadie con una versión vieja de la aplicación.
 *
 * Solo se registra cuando alguien pulsa «Activar avisos en este dispositivo» en
 * la campana. El servidor manda un JSON { title, body, url, tag } (ver
 * `payloadPush` en lib/notificaciones/texto.ts); `url` es una ruta relativa que
 * se abre contra el origen donde se activó el aviso.
 */

self.addEventListener('install', () => {
  // Sin caché que esperar: entra en servicio de una vez.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch (e) {
    datos = { title: 'Zero', body: evento.data ? evento.data.text() : '' };
  }

  const titulo = datos.title || 'Zero';
  const opciones = {
    body: datos.body || '',
    icon: '/icons/192',
    badge: '/icons/192',
    // El mismo `tag` reemplaza el aviso anterior en vez de apilarlo.
    tag: datos.tag || undefined,
    data: { url: datos.url || '/' },
  };
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || '/', self.location.origin).href;

  evento.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si ya hay una pestaña de Zero, se reutiliza: se lleva al pago y se enfoca.
    for (const ventana of abiertas) {
      if (new URL(ventana.url).origin === self.location.origin && 'focus' in ventana) {
        try {
          if ('navigate' in ventana) await ventana.navigate(destino);
        } catch (e) { /* navegación no permitida: se enfoca igual */ }
        return ventana.focus();
      }
    }
    return self.clients.openWindow(destino);
  })());
});
