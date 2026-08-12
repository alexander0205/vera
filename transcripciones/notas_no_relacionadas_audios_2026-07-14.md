# Notas no relacionadas con estos tres audios

Estas notas parecen pertenecer a otras notas de voz o a otro bloque de trabajo. No las agregue dentro de los tres MD de transcripcion porque no aparecen claramente en los audios procesados.

## Tarjeta previa al seleccionar estudiante

En la seccion donde aparecen todos los estudiantes, al seleccionar un estudiante, sin abrir el perfil, aparece una tarjeta previa antes de acceder al perfil. En esa tarjeta se debe eliminar la seccion que dice `Pendientes` y lista todos esos elementos. En cambio, debe aparecer el total general de ese estudiante usando iconos separados: por ejemplo, deuda total, pago total, pendiente total, etc.

## Listado de estudiantes, filtros y optimizacion

En la misma seccion donde se muestran y generan todos los estudiantes, debe existir filtro, paginacion y limites. No debe consumir tanta memoria ni renderizar todo de golpe. Se necesita una solucion mas optimizada y ergonomica, con cache de informacion.

Segun Alex, esta parte debe ir por query y no retornar todos los estudiantes de golpe, porque serian demasiadas llamadas a la base de datos. Alex dice que se puede tomar como referencia esta rama para la parte del ahorro del sistema:

`https://github.com/alexander0205/vera/tree/perf/db-optimization`

Al parecer, en esa rama esta como se implementara el ahorro del sistema de ahora en adelante. Hay que ver como aplicarlo a este modulo, enfocandose primero en agregarlo a esta parte de estudiantes.

## Instruccion de Alex sobre la rama de optimizacion

Alex pidio leer internamente que se hizo en esa rama y por que se hizo, para entenderlo antes de aplicar lo necesario de esa rama a este modulo.
