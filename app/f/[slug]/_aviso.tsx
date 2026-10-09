/**
 * La pantalla de «esto no está disponible».
 *
 * Deliberadamente sin MUI ni tema: es lo que ve alguien cuyo enlace caducó o
 * está mal copiado, y tiene que salir aunque no cargue nada más.
 */
export function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', background: '#f8fafc', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>{titulo}</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: '#6b7280', lineHeight: 1.6 }}>{texto}</p>
      </div>
    </main>
  );
}
