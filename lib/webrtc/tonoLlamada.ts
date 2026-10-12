'use client';

/**
 * Aviso sonoro de llamada entrante — dos notas cortas, volumen bajo, ataque y
 * decay lentos. A propósito nada de timbre insistente ni loop: un chime
 * suave una sola vez, el aviso visual (badge pulsando en el widget) se
 * encarga del resto.
 *
 * Sintetizado con WebAudio en vez de un archivo de audio — sin asset que
 * cargar ni licencia que pedir para dos tonos.
 */
export function reproducirTonoLlamada(): void {
  try {
    const AudioCtxCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;
    const ctx = new AudioCtxCtor();
    const notas = [660, 880]; // mi5 → la5, intervalo suave, no un timbre urgente
    notas.forEach((freq, i) => {
      const inicio = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, inicio);
      gain.gain.linearRampToValueAtTime(0.12, inicio + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // Autoplay bloqueado (sin gesto previo del usuario) u otro motivo — nada
    // que reintentar; el aviso visual sigue funcionando igual.
  }
}
