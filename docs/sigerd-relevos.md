# Relés de SIGERD

SIGERD no contesta el TLS a las IPs de fuera de República Dominicana: la conexión
TCP abre y ahí se queda. Como es indistinguible de «el portal está caído», la
primera prueba siempre es `scripts/probar-sigerd-rd.sh` **desde la máquina que
está en el país**.

Vercel sale por datacenters en Estados Unidos, así que producción no puede
hablarle al portal. La salida es una máquina en territorio dominicano que
reenvía: Vercel le pega a la máquina y la máquina le pega a SIGERD.

Una sola máquina es un punto único de falla, así que se configuran **varias** y
el cliente va relevando solo.

---

## Cómo se ve desde el código

| Pieza | Qué hace |
|---|---|
| `scripts/sigerd-relay.mjs` | El proceso que corre en cada máquina dominicana |
| `lib/sigerd/relevo.ts` | Elige a cuál pegarle y cuál está caída |
| `lib/sigerd/client.ts` | Prueba en orden hasta que una conteste |
| `scripts/sigerd-relevos.mjs` | Dice cuáles sirven ahora mismo |

**El relé no guarda nada.** Las cookies del portal viven en el `CookieJar` del
cliente, no en la máquina que reenvía. Por eso se puede cambiar de relé a mitad
de sesión sin perderla.

---

## Variables

En Vercel:

```
SIGERD_RELAYS    = https://rele-uno.ejemplo,https://rele-dos.ejemplo
SIGERD_RELAY_KEY = <clave larga y aleatoria>
```

Se prueban **en ese orden**: la primera es la de siempre, las demás son
respaldo. Una que falla se marca caída por 60 s (y el doble cada vez que
reincide, hasta 8×); pasado ese rato se vuelve a intentar, así que la
degradación se cura sola cuando la máquina vuelve.

`SIGERD_BASE_URL` sigue funcionando para una sola URL. Si están las dos, manda
`SIGERD_RELAYS`.

Para que la vigilancia pueda avisar:

```
ALERTAS_EMAIL     = a quién se le avisa, separados por coma
SLACK_WEBHOOK_URL = el Incoming Webhook del canal
```

Con al menos una de las dos basta. **Sin ninguna, el cron responde 503** en vez
de callarse: una caída que no avisa a nadie es peor que no vigilar, porque da la
sensación de que alguien está mirando.

En cada máquina:

```
RELAY_KEY   = <la misma clave que SIGERD_RELAY_KEY>
RELAY_PORT  = 8787          # opcional
```

Genera la clave con:

```bash
openssl rand -hex 32
```

---

## Montar una máquina

**1 · Probar que desde ahí sí se llega**

```bash
bash scripts/probar-sigerd-rd.sh
```

Si el país no dice `DO`, esa máquina no sirve y lo demás sobra.

**2 · Levantar el relé**

```bash
RELAY_KEY=<la clave> node scripts/sigerd-relay.mjs
```

Escucha solo en `127.0.0.1`. Al arrancar dice por qué IP sale y avisa si no es
dominicana.

**3 · Sacarlo a internet con un túnel**

La máquina está detrás del router de una casa: no tiene IP fija ni puertos
abiertos. Cloudflare Tunnel resuelve las dos cosas sin tocar el router.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create sigerd-rele-1
cloudflared tunnel route dns sigerd-rele-1 rele-1.tudominio.com
cloudflared tunnel run --url http://127.0.0.1:8787 sigerd-rele-1
```

Ese último comando corre **en primer plano**: si se cierra la terminal, el túnel
muere y el relé deja de existir para Vercel. Para producción hay que dejarlo
como servicio, igual que el relé:

```bash
sudo cloudflared service install
```

Sin ese paso, montar el relé con `launchd` no sirve de nada: el proceso sigue
vivo pero nadie puede llegarle.

**4 · Que sobreviva a un reinicio**

```bash
node scripts/sigerd-relay-servicio.mjs instalar
```

Deja el relé como servicio de `launchd`, con reinicio automático, y le pone
`caffeinate` para que la Mac no se duerma. Para quitarlo: `... desinstalar`.

**5 · Comprobar**

```bash
SIGERD_RELAYS=https://rele-1.tudominio.com SIGERD_RELAY_KEY=<clave> \
  node scripts/sigerd-relevos.mjs
```

---

## Lo que hay que tener claro

**No es un proxy abierto.** El relé solo reenvía a `sigerd.minerd.gob.do` y solo
si la petición trae la clave. Sin esas dos cosas sería una puerta para que
cualquiera navegue con tu IP.

**Reescribe el `Location`.** El cliente descarta cualquier redirección cuyo
origen no sea el de la base (`aRutaRelativa`, en `client.ts`). Si el relé
devolviera el `Location` absoluto del portal, el login se rompería en silencio.

**El mapa de salud es por instancia.** En Vercel cada instancia tiene el suyo,
así que una puede seguir intentando contra un relé que otra ya descartó. El
costo es un intento fallido y un relevo. Para estado compartido de verdad habría
que llevarlo a Postgres, como `rate-limit.ts`.

**El sync largo sigue colgando de una función.** Un colegio de 465 estudiantes,
con la compuerta a 3 concurrentes y 350 ms entre peticiones, se acerca a los
300 s que da Vercel. El relé no arregla eso: si empieza a dar timeout hay que
trocear el sync o moverlo a un trabajador.

**Si SIGERD atara la sesión a la IP**, saltar de relé la invalidaría. No lo hemos
visto. Si un día aparecen sesiones que mueren solas al cambiar de máquina, es lo
primero que hay que mirar.
