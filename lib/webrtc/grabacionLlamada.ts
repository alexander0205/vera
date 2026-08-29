'use client';

/**
 * Graba el stream LOCAL de esta punta (mic + pantalla compartida si está
 * activa) y sube cada segmento terminado a S3.
 *
 * Deliberadamente NO agrega tracks a un MediaRecorder ya en marcha — el
 * soporte de los navegadores para tracks agregados en vivo a un recorder
 * activo es inconsistente. En vez de apostar a eso, cada vez que cambia el
 * conjunto de tracks del stream local (aparece/desaparece pantalla
 * compartida) se cierra el segmento actual y arranca uno nuevo. Resultado:
 * puede haber varios archivos cortos por llamada en vez de uno solo — más
 * simple y sin la superficie de bugs de navegador que ya costó horas esta
 * sesión con la mezcla de audio+video en tiempo real (ver el spec).
 */
export class GrabacionLlamada {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private inicioSegmento = 0;
  private firmaTracksActual = '';
  private mimeTypeActual = '';

  constructor(
    private readonly callId: number,
    private readonly role: 'user' | 'agent',
  ) {}

  /** Llamar cada vez que el stream local gana o pierde un track. */
  actualizarStream(stream: MediaStream): void {
    const firma = stream.getTracks().map((t) => t.id).join(',');
    if (firma === this.firmaTracksActual) return;
    this.firmaTracksActual = firma;
    this.detenerSegmentoActual();
    if (stream.getTracks().length === 0) return;
    this.iniciarSegmento(stream);
  }

  private iniciarSegmento(stream: MediaStream): void {
    // El mimeType tiene que corresponderse con lo que el stream trae de
    // verdad. Al dejar de compartir pantalla el stream local queda con audio
    // solo, y pedirle a MediaRecorder un contenedor de video para un stream
    // sin ningún track de video lo hace tirar NotSupportedError. Como ese
    // error se traga abajo (`catch { this.recorder = null }`), la llamada
    // seguía normal pero DEJABA DE GRABARSE en silencio a partir de ahí —
    // justo la parte que después hay que poder revisar.
    const tieneVideo = stream.getVideoTracks().length > 0;
    const candidatos = tieneVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['audio/webm;codecs=opus', 'audio/webm'];
    const mimeType = candidatos.find((m) => MediaRecorder.isTypeSupported(m));
    // Sin ningún mimeType soportado no se graba — degradación silenciosa,
    // no debe romper la llamada por esto.
    if (!mimeType) return;

    this.chunks = [];
    this.mimeTypeActual = mimeType;
    this.inicioSegmento = Date.now();
    try {
      this.recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      this.recorder = null;
      return;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.subirSegmento();
    this.recorder.start();
  }

  private detenerSegmentoActual(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }

  private async subirSegmento(): Promise<void> {
    if (this.chunks.length === 0) return;
    const duracionSegundos = Math.round((Date.now() - this.inicioSegmento) / 1000);
    // Segmentos muy cortos (p.ej. un cambio de track a los pocos ms de
    // arrancar) no aportan nada revisable.
    if (duracionSegundos < 2) {
      this.chunks = [];
      return;
    }
    const blob = new Blob(this.chunks, { type: this.mimeTypeActual });
    this.chunks = [];

    const form = new FormData();
    form.append('file', blob, 'grabacion.webm');
    form.append('duracionSegundos', String(duracionSegundos));
    await fetch(`/api/zero-tickets/calls/${this.callId}/grabacion?role=${this.role}`, {
      method: 'POST',
      body: form,
    }).catch(() => {
      // Si falla la subida se pierde ese segmento — no hay reintento (no hay
      // dónde guardar el blob si la pestaña se cierra igual) ni se
      // interrumpe la llamada por esto.
    });
  }

  /** Llamar al colgar / limpiar la llamada. */
  detener(): void {
    this.detenerSegmentoActual();
  }
}
