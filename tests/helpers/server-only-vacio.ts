/**
 * Sustituto de `server-only` para vitest.
 *
 * El paquete real lanza al importarse fuera de un Server Component, así que sin
 * esto no se puede probar NADA de lo que lleve `import 'server-only'` (por
 * ejemplo el redimensionado de fotos). La marca sigue haciendo su trabajo en el
 * build de Next; aquí solo estorbaba.
 */
export {};
