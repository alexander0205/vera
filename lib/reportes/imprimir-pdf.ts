/** Carga un PDF temporal y pide al navegador abrir su diálogo de impresión. */
export function imprimirPdf(blob: Blob): Promise<void> {
  if (blob.type && blob.type !== 'application/pdf') {
    return Promise.reject(new Error('La respuesta no es un PDF válido'));
  }

  const url = URL.createObjectURL(blob);
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  // Un marco de 0×0 puede producir páginas en blanco en el visor de PDF.
  marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;';

  return new Promise((resolve, reject) => {
    let terminado = false;
    const limpiar = () => {
      marco.remove();
      URL.revokeObjectURL(url);
    };
    const fallo = (error: Error) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(espera);
      clearTimeout(respaldo);
      limpiar();
      reject(error);
    };
    const espera = setTimeout(() => fallo(new Error('El PDF tardó demasiado en cargar para imprimir')), 30_000);
    const intentar = () => {
      if (terminado) return;
      try {
        const vista = marco.contentWindow;
        if (!vista || typeof vista.print !== 'function') {
          throw new Error('Este navegador no permite imprimir el PDF');
        }
        vista.focus();
        vista.print();
        terminado = true;
        clearTimeout(espera);
        clearTimeout(respaldo);
        // Mantener el documento vivo mientras el usuario usa el diálogo.
        setTimeout(limpiar, 60_000);
        resolve();
      } catch (error) {
        fallo(error instanceof Error ? error : new Error('No se pudo abrir la impresión'));
      }
    };
    // Algunos visores de PDF no disparan load en el iframe.
    const respaldo = setTimeout(intentar, 3_000);

    marco.onerror = () => fallo(new Error('No se pudo cargar el PDF para imprimir'));
    marco.onload = () => {
      // El visor interno termina de preparar el PDF después del load del marco.
      setTimeout(intentar, 500);
    };

    marco.src = url;
    document.body.appendChild(marco);
  });
}
