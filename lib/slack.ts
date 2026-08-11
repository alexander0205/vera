/**
 * Alertas simples a Slack via Incoming Webhook. Fire-and-forget: nunca lanza,
 * si SLACK_WEBHOOK_URL no está configurado queda en no-op (solo log).
 */
export async function enviarAlertaSlack(mensaje: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
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
