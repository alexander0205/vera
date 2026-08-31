/**
 * Alertas simples a Slack via Incoming Webhook. Fire-and-forget: nunca lanza,
 * si SLACK_WEBHOOK_URL no está configurado queda en no-op (solo log).
 */
export async function enviarAlertaSlack(mensaje: string, webhookUrl?: string): Promise<void> {
  const url = webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn('[slack] SLACK_WEBHOOK_URL no configurado, alerta no enviada:', mensaje);
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: mensaje }),
    });
  } catch (err) {
    console.error('[slack] error enviando alerta', err);
  }
}

/**
 * Igual que enviarAlertaSlack, pero con Block Kit — para alertas que necesitan
 * estructura real (título, campos, botón) en vez de una sola línea de texto.
 * `fallbackText` es lo que Slack muestra en notificaciones push/preview.
 */
export async function enviarAlertaSlackBlocks(
  blocks: object[],
  fallbackText: string,
  webhookUrl?: string,
): Promise<void> {
  const url = webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn('[slack] webhook no configurado, alerta no enviada:', fallbackText);
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallbackText, blocks }),
    });
  } catch (err) {
    console.error('[slack] error enviando alerta', err);
  }
}
