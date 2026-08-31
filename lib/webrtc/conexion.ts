'use client';

/**
 * Envoltorio sobre RTCPeerConnection. No sabe nada de React ni de HTTP —
 * solo maneja la conexión, los tracks y el ICE gathering no-trickle. Ver
 * docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// El handshake no-trickle paga esta espera DOS veces (una por lado, en serie:
// el que responde no puede empezar hasta recibir la oferta completa). Con 8s
// acá, más ~1s por request de señalización contra la DB y hasta 1.5s de espera
// del poll, el answer se posteaba recién a los ~20s — justo cuando
// TIMEOUT_CONEXION_MS colgaba la llamada, así que nunca llegaba a mandarse.
// 5s alcanza de sobra para juntar host/srflx y los relay de Cloudflare, que es
// lo que decide si la conexión se establece.
const TIMEOUT_ICE_GATHERING_MS = 5000;
// Presupuesto total del handshake. Tiene que cubrir las DOS esperas de ICE en
// serie más los round-trips de señalización, que acá viajan por un REST
// polleado y no por WebSocket. 20s no alcanzaba ni en el mejor caso.
export const TIMEOUT_CONEXION_MS = 45000;

export class ConexionLlamada {
  private readonly pc: RTCPeerConnection;
  private micStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  // Un solo MediaStream para toda la llamada, mutado con addTrack() en vez
  // de reconstruido en cada track nuevo. Confirmado con logs reales: el
  // audio SÍ llegaba (unmuted) desde el arranque, pero crear un
  // `new MediaStream(...)` distinto cada vez que aparecía un track nuevo
  // (p.ej. el video al compartir pantalla) hacía que <video>.srcObject se
  // REASIGNARA a un objeto distinto — eso resetea la reproducción del
  // elemento entero, cortando el audio que ya venía sonando bien. Con un
  // único stream que solo gana tracks, srcObject se asigna una vez y el
  // browser refleja los tracks nuevos solo, sin ningún reset.
  private readonly streamRemoto = new MediaStream();

  // Mismo patrón que streamRemoto pero del lado que ESTE cliente manda — lo
  // consume GrabacionLlamada para saber qué grabar sin tener que replicar
  // acá el manejo de mic/pantalla compartida.
  private readonly streamLocal = new MediaStream();

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onEstadoCambiado: ((estado: RTCPeerConnectionState) => void) | null = null;
  // `track.muted` para el receiver de video demostró NO ser confiable acá:
  // confirmado dos veces con pruebas reales que, al dejar de compartir
  // pantalla (`replaceTrack(null)` del otro lado), el navegador nunca
  // volvía a marcar el track como `muted` — el <video> se quedaba con el
  // último frame decodificado adentro para siempre, sin ninguna señal de
  // que en verdad ya no llega nada. En vez de confiar en ese evento, se
  // mide directo si están entrando frames NUEVOS de verdad, vía
  // `framesDecoded` de `getStats()` — el contador estándar de WebRTC para
  // esto, no depende de que el browser dispare `mute`/`unmute` para nada.
  onVideoActivoCambiado: ((activo: boolean) => void) | null = null;
  private monitorVideoInterval: ReturnType<typeof setInterval> | null = null;
  private ultimosFramesDecoded = -1;
  private videoActivoActual = false;

  constructor(iceServers: IceServerConfig[]) {
    this.pc = new RTCPeerConnection({ iceServers });

    // Transceivers reservados de entrada: compartir pantalla después es un
    // replaceTrack, sin renegociar — un solo intercambio SDP por llamada,
    // sin importar quién comparte qué ni cuándo.
    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.pc.addTransceiver('video', { direction: 'sendrecv' });

    this.pc.ontrack = (e) => {
      if (!this.streamRemoto.getTracks().includes(e.track)) this.streamRemoto.addTrack(e.track);
      this.onRemoteStream?.(this.streamRemoto);
    };
    this.pc.onconnectionstatechange = () => {
      this.onEstadoCambiado?.(this.pc.connectionState);
    };

    // Chequea cada 1s si el receiver de video decodificó frames NUEVOS
    // desde la última vuelta. Arranca junto con la conexión, no con
    // compartirPantalla — así detecta tanto el inicio como el corte, y
    // sigue viva durante toda la llamada sin importar quién comparte qué.
    this.monitorVideoInterval = setInterval(() => this.chequearVideoActivo(), 1000);
  }

  private async chequearVideoActivo(): Promise<void> {
    // `getReceivers()` a secas puede devolver el receiver de un transceiver
    // HUÉRFANO (mismo bug que `senderNegociado`: el que responde a veces
    // arma transceivers nuevos para la oferta y deja los del constructor
    // sin `mid`, nunca negociados). Ese receiver nunca recibe nada — medir
    // SU `framesDecoded` da cero para siempre aunque el video real esté
    // llegando por el transceiver correcto. `mid !== null` es la misma
    // señal inequívoca de "este sí quedó en la negociación" que ya se usa
    // ahí.
    const transceiver = this.pc
      .getTransceivers()
      .find((t) => t.mid !== null && t.receiver.track.kind === 'video');
    if (!transceiver) return;

    const stats = await this.pc.getStats(transceiver.receiver.track).catch(() => null);
    if (!stats) return;

    let framesDecoded: number | undefined;
    stats.forEach((reporte) => {
      if (reporte.type === 'inbound-rtp' && reporte.kind === 'video') {
        framesDecoded = reporte.framesDecoded;
      }
    });
    if (framesDecoded === undefined) return;

    // -1 = primera lectura, todavía no hay base de comparación.
    const activo = this.ultimosFramesDecoded >= 0 && framesDecoded > this.ultimosFramesDecoded;
    this.ultimosFramesDecoded = framesDecoded;
    if (activo !== this.videoActivoActual) {
      this.videoActivoActual = activo;
      this.onVideoActivoCambiado?.(activo);
    }
  }

  /**
   * El sender REALMENTE negociado para ese tipo de media — nunca una
   * referencia guardada desde la construcción.
   *
   * En el lado que responde (answerer), `setRemoteDescription(oferta)` no
   * siempre reusa los transceivers ya creados en el constructor: a veces el
   * navegador arma transceivers NUEVOS para matchear los m-lines de la
   * oferta y deja los originales huérfanos (con `mid: null`, nunca forman
   * parte del SDP negociado). Confirmado con logs reales: el answerer
   * terminaba con 4 transceivers en vez de 2, y el audio de ESE lado nunca
   * le llegaba al otro — el mic estaba enchufado al sender huérfano.
   * `mid !== null` es la señal inequívoca de "este SÍ quedó en la
   * negociación", así que buscarlo ahí en vez de confiar en una referencia
   * vieja es lo que garantiza usar el sender que de verdad transmite.
   */
  private senderNegociado(kind: 'audio' | 'video'): RTCRtpSender {
    const transceiver = this.pc.getTransceivers().find((t) => t.mid !== null && t.receiver.track.kind === kind);
    if (!transceiver) throw new Error(`No hay transceiver de ${kind} negociado todavía`);
    return transceiver.sender;
  }

  async activarMicrofono(): Promise<void> {
    // Las tres restricciones van EXPLÍCITAS. `audio: true` a secas deja el
    // procesamiento a criterio del navegador y no todos cancelan el eco por
    // su cuenta — sin esto, el sonido que sale por el parlante vuelve a
    // entrar por el micrófono, se reenvía, el otro lado lo reproduce, su
    // micrófono lo vuelve a tomar… y el lazo se realimenta hasta el
    // chillido. Es la causa de los silbidos en una llamada de soporte, donde
    // casi nadie usa audífonos.
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const track = this.micStream.getAudioTracks()[0];
    await this.senderNegociado('audio').replaceTrack(track);
    this.streamLocal.getAudioTracks().forEach((t) => this.streamLocal.removeTrack(t));
    this.streamLocal.addTrack(track);
  }

  async compartirPantalla(onCortadoPorNavegador: () => void): Promise<void> {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      // Por default el navegador EXCLUYE la pestaña propia del selector (para
      // no ofrecer un mirror accidental de sí misma) — de ahí que salieran
      // "todas las pestañas y ventanas menos esa". `include` la vuelve a
      // sumar; `displaySurface: 'browser'` hace que el selector abra ya
      // parado en la vista de pestañas (no en "Ventana" ni "Pantalla
      // completa"), así la pestaña actual del cliente queda como primera
      // opción visible en vez de haber que buscarla.
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
    const track = this.screenStream.getVideoTracks()[0];
    await this.senderNegociado('video').replaceTrack(track);
    // Si corta desde el control nativo del navegador ("Dejar de compartir"),
    // hay que enterarse para actualizar el estado en la UI.
    track.onended = onCortadoPorNavegador;
    this.streamLocal.getVideoTracks().forEach((t) => this.streamLocal.removeTrack(t));
    this.streamLocal.addTrack(track);
  }

  dejarDeCompartirPantalla(): void {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    // `senderNegociado()` TIRA de forma síncrona si el transceiver todavía no
    // tiene mid — y ese throw no lo agarraba el `.catch()` de la promesa, que
    // solo cubre el `replaceTrack`. Se escapaba de acá, cortaba
    // `alternarPantalla` antes del `setCompartiendoPantalla(false)` y el botón
    // se quedaba diciendo "compartiendo" con la pantalla ya apagada.
    try {
      this.senderNegociado('video').replaceTrack(null).catch(() => {});
    } catch {
      // Sin transceiver negociado no hay nada que soltar.
    }
    this.streamLocal.getVideoTracks().forEach((t) => this.streamLocal.removeTrack(t));
  }

  silenciarMicrofono(silenciado: boolean): void {
    const track = this.micStream?.getAudioTracks()[0];
    if (track) track.enabled = !silenciado;
  }

  compartiendoPantalla(): boolean {
    return this.screenStream !== null;
  }

  obtenerStreamLocal(): MediaStream {
    return this.streamLocal;
  }

  /**
   * Arma la oferta y espera a que termine de juntar candidatos ICE antes de
   * devolverla — ICE no-trickle: un solo SDP con todo adentro, en vez de
   * ~40 señales sueltas que el poll de este proyecto no puede sostener a
   * tiempo.
   */
  async crearOferta(): Promise<RTCSessionDescriptionInit> {
    const oferta = await this.pc.createOffer();
    await this.pc.setLocalDescription(oferta);
    await this.esperarIceCompleto();
    if (!this.pc.localDescription) throw new Error('Sin localDescription tras negociar la oferta');
    return this.pc.localDescription.toJSON();
  }

  async crearRespuesta(ofertaRemota: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(ofertaRemota);

    // ESTO es lo que hacía que este lado nunca mandara nada.
    //
    // `setRemoteDescription(oferta)` no reusa los transceivers que creó el
    // constructor: arma unos NUEVOS para matchear los m-lines de la oferta y,
    // por spec, los crea con dirección 'recvonly' (los originales quedan
    // huérfanos con mid: null — de ahí los 4 transceivers de este lado contra
    // los 2 del ofertante). Con el answer declarando 'recvonly', este lado
    // queda como mero receptor a nivel SDP: ni el micrófono ni la pantalla
    // compartida salen nunca, por más que `replaceTrack()` diga que sí,
    // porque cambiar eso después exigiría renegociar.
    //
    // Hay que corregirlo ANTES de createAnswer(), que es lo que congela las
    // direcciones en el SDP que se manda de vuelta.
    for (const t of this.pc.getTransceivers()) {
      if (t.mid !== null) t.direction = 'sendrecv';
    }

    const respuesta = await this.pc.createAnswer();
    await this.pc.setLocalDescription(respuesta);
    await this.esperarIceCompleto();
    if (!this.pc.localDescription) throw new Error('Sin localDescription tras negociar la respuesta');
    return this.pc.localDescription.toJSON();
  }

  async aplicarRespuesta(respuestaRemota: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(respuestaRemota);
  }

  private esperarIceCompleto(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, TIMEOUT_ICE_GATHERING_MS);
      const onChange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          this.pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  cerrar(): void {
    if (this.monitorVideoInterval) clearInterval(this.monitorVideoInterval);
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
  }
}
