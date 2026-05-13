// Monto en letras (español dominicano)

export function numeroALetras(n: number): string {
  const UNI = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve',
    'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve'];
  const DEC = ['', '', 'Veinte', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa'];
  const CEN = ['', 'Cien', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos',
    'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos'];

  function cientos(x: number): string {
    if (x === 0) return '';
    if (x < 20) return UNI[x];
    if (x < 30) return x === 20 ? 'Veinte' : 'Veinti' + UNI[x % 10].toLowerCase();
    if (x < 100) return DEC[Math.floor(x / 10)] + (x % 10 ? ' y ' + UNI[x % 10].toLowerCase() : '');
    if (x === 100) return 'Cien';
    return CEN[Math.floor(x / 100)] + (x % 100 ? ' ' + cientos(x % 100) : '');
  }

  const entero   = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let texto = '';
  const mill = Math.floor(entero / 1_000_000);
  const mil  = Math.floor((entero % 1_000_000) / 1_000);
  const res  = entero % 1_000;
  if (mill) texto += (mill === 1 ? 'Un millón' : cientos(mill) + ' millones') + ' ';
  if (mil)  texto += (mil  === 1 ? 'Mil'       : cientos(mil)  + ' mil')      + ' ';
  if (res)  texto += cientos(res);
  if (!texto) texto = 'Cero';
  return texto.trim() + (centavos ? ` con ${centavos}/100` : '') + ' pesos dominicanos';
}
