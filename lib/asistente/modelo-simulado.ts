import 'server-only';
import { MockLanguageModelV4 } from 'ai/test';

/**
 * Modelo simulado SOLO para desarrollo (ASISTENTE_IA_SIMULADA=1, nunca en
 * producción). Hace lo mismo que Gemini en dos pasos —pide la herramienta que
 * corresponde y luego resume lo que devolvió— para poder probar la pantalla, la
 * persistencia y los permisos sin llave del gateway. No entiende lenguaje: elige
 * la herramienta por palabras clave.
 */

type Parte = { type?: string; text?: string; toolName?: string; output?: unknown; result?: unknown };
type Mensaje = { role: string; content: string | Parte[] };

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

function ultimoTextoUsuario(prompt: Mensaje[]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    return m.content.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ');
  }
  return '';
}

function elegir(texto: string): { tool: string; input: Record<string, unknown> } {
  const t = texto.toLowerCase();
  // «¿Cómo creo…?», «¿dónde veo…?», «¿en qué módulo…?»: la guía de navegación.
  if (/(c[oó]mo|d[oó]nde|en qu[eé] m[oó]dulo|qu[eé] pantalla)/.test(t)) {
    return { tool: 'donde_encontrar', input: { consulta: texto } };
  }
  const input: Record<string, unknown> = {};
  if (/\bhoy\b/.test(t)) { input.desde = hoy(); input.hasta = hoy(); }

  if (/deb|cobrar|cartera|venc|moros/.test(t)) return { tool: 'cuentas_por_cobrar', input: { limite: 8 } };
  if (/itbis|impuesto/.test(t)) return { tool: 'resumen_itbis', input };
  if (/producto|servicio|concepto|art[ií]culo/.test(t)) return { tool: 'ventas_por_producto', input: { ...input, limite: 8 } };
  if (/cliente|familia|padre|estudiante/.test(t)) return { tool: 'ventas_por_cliente', input: { ...input, limite: 8 } };
  if (/m[eé]todo|efectivo|transferencia|tarjeta/.test(t)) return { tool: 'cobros_por_metodo', input };
  if (/tipo|comprobante|ncf/.test(t)) return { tool: 'ventas_por_tipo_comprobante', input };
  if (/cajero|usuario|vendedor/.test(t)) return { tool: 'ventas_por_usuario', input };
  if (/tendencia|d[ií]a|semana|evoluci|gr[aá]fic/.test(t)) return { tool: 'tendencia_ventas', input: { ...input, agrupar: 'dia' } };
  return { tool: 'resumen_ventas', input };
}

const rd = (n: number) => `RD$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const etiqueta = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase();

function esDinero(k: string) {
  return !/^(facturas|pagos|clientesConDeuda|totalProductos|diasVencidoMaximo|unidades)$/.test(k);
}

function resumirGuia(o: { resultados: Record<string, unknown>[]; noDisponibles?: Record<string, unknown>[] }): string {
  const l: string[] = ['**[Respuesta simulada de desarrollo]**', ''];
  if (!o.resultados.length && !(o.noDisponibles ?? []).length) {
    return l.concat('No encontré una pantalla con ese nombre. Puedes pulsar **Hablar con una persona**.').join('\n');
  }
  for (const r of o.resultados) {
    l.push(`Lo encuentras en **${r.modulo}**, menú **${r.menu}**: [${r.titulo}](${r.ruta}).`, String(r.que));
    if (Array.isArray(r.pasos)) l.push('', ...(r.pasos as string[]).map((p, i) => `${i + 1}. ${p}`));
    l.push('');
  }
  for (const n of o.noDisponibles ?? []) l.push(`_${n.titulo} (${n.modulo}): ${n.motivo}._`);
  return l.join('\n');
}

function resumir(valor: unknown): string {
  if (!valor || typeof valor !== 'object') return String(valor ?? 'Sin datos.');
  const o = valor as Record<string, unknown>;
  if (Array.isArray(o.resultados) && 'noDisponibles' in o) return resumirGuia(o as never);
  const lineas: string[] = ['**[Respuesta simulada de desarrollo]**', ''];
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) {
      if (v.length === 0) { lineas.push(`_${etiqueta(k)}: sin resultados._`); continue; }
      const cols = Object.keys(v[0] as object);
      lineas.push('', `| ${cols.map(etiqueta).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`);
      for (const fila of v as Record<string, unknown>[]) {
        lineas.push(`| ${cols.map((c) => {
          const x = fila[c];
          return typeof x === 'number' && esDinero(c) ? rd(x) : String(x ?? '');
        }).join(' | ')} |`);
      }
      lineas.push('');
    } else if (typeof v === 'number') {
      lineas.push(`- ${etiqueta(k)}: **${esDinero(k) ? rd(v) : v}**`);
    } else if (v != null) {
      lineas.push(`- ${etiqueta(k)}: ${String(v)}`);
    }
  }
  return lineas.join('\n');
}

const USO = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

export function modeloSimulado() {
  let n = 0;
  return new MockLanguageModelV4({
    doGenerate: async (opciones) => {
      const prompt = opciones.prompt as unknown as Mensaje[];
      const ultimo = prompt[prompt.length - 1];
      n += 1;

      if (ultimo?.role === 'tool' && Array.isArray(ultimo.content)) {
        const res = ultimo.content.find((p) => p.type === 'tool-result');
        const out = res?.output as { value?: unknown } | undefined;
        const valor = out && typeof out === 'object' && 'value' in out ? out.value : res?.output ?? res?.result;
        return {
          content: [{ type: 'text' as const, text: resumir(valor) }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: USO, warnings: [],
        };
      }

      const texto = ultimoTextoUsuario(prompt);
      if (/cambia|borra|elimina|anula|crea|modifica|deshabilita|configura/i.test(texto)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Por ahora puedo consultarte y explicarte la información, pero los cambios se hacen desde la pantalla correspondiente de Zero. Si prefieres, pulsa **Hablar con una persona** y te ayudan.',
          }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: USO, warnings: [],
        };
      }

      const { tool, input } = elegir(texto);
      return {
        content: [{
          type: 'tool-call' as const, toolCallId: `sim-${n}`, toolName: tool, input: JSON.stringify(input),
        }],
        finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' },
        usage: USO, warnings: [],
      };
    },
  });
}
