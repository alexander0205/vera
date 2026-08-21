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

const TIMEOUT_ICE_GATHERING_MS = 8000;
export const TIMEOUT_CONEXION_MS = 20000;

export class ConexionLlamada {
  private readonly pc: RTCPeerConnection;
  private readonly audioSender: RTCRtpSender;
  private readonly videoSender: RTCRtpSender;
  private micStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onEstadoCambiado: ((estado: RTCPeerConnectionState) => void) | null = null;

  constructor(iceServers: IceServerConfig[]) {
    this.pc = new RTCPeerConnection({ iceServers });

    // Transceivers reservados de entrada: compartir pantalla después es un
    // replaceTrack, sin renegociar — un solo intercambio SDP por llamada,
    // sin importar quién comparte qué ni cuándo.
    this.audioSender = this.pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    this.videoSender = this.pc.addTransceiver('video', { direction: 'sendrecv' }).sender;

    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.onRemoteStream?.(e.streams[0]);
    };
    this.pc.onconnectionstatechange = () => {
      this.onEstadoCambiado?.(this.pc.connectionState);
    };
  }

  async activarMicrofono(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await this.audioSender.replaceTrack(this.micStream.getAudioTracks()[0]);
  }

  async compartirPantalla(onCortadoPorNavegador: () => void): Promise<void> {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = this.screenStream.getVideoTracks()[0];
    await this.videoSender.replaceTrack(track);
    // Si corta desde el control nativo del navegador ("Dejar de compartir"),
    // hay que enterarse para actualizar el estado en la UI.
    track.onended = onCortadoPorNavegador;
  }

  dejarDeCompartirPantalla(): void {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.videoSender.replaceTrack(null).catch(() => {});
  }

  silenciarMicrofono(silenciado: boolean): void {
    const track = this.micStream?.getAudioTracks()[0];
    if (track) track.enabled = !silenciado;
  }

  compartiendoPantalla(): boolean {
    return this.screenStream !== null;
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
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pc.close();
  }
}
