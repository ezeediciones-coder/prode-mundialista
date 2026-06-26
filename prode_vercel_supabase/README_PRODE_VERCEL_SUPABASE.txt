PRODE MUNDIALISTA - VERCEL + SUPABASE

Versión: llave estilo mundialista + admin separado + penales + reglas visibles + edición de equipos desde admin.

URLS
- Página pública: https://tu-dominio.vercel.app
- Panel admin: https://tu-dominio.vercel.app/admin

PUNTAJE FINAL
El resultado final del partido contempla 90 minutos + alargue.
Ejemplo: si en los 90 iban 1-1 pero en alargue termina 2-1, el resultado real es 2-1.
Los penales solo se cargan si el partido termina empatado después del alargue.

PARTIDO SIN PENALES
- Resultado exacto: +6.
- Resultado no exacto, pero acierta quién avanza/tendencia: +3.
- No acierta: 0.

PARTIDO CON PENALES
Acá sí se puede acumular el resultado del partido + la definición por penales.
- Empate exacto: +6.
- Empate no exacto: +3.
- Además, si acierta quién avanza por penales: +3.
- O si acierta el resultado exacto de penales: +6.

EJEMPLOS
Real: Argentina 2 - 1 Australia. Avanza Argentina.
- Prode: Argentina 2 - 1 Australia => +6.
- Prode: Argentina 3 - 1 Australia => +3 porque acertó quién avanza.
- Prode: Australia 2 - 1 Argentina => 0.

Real: Argentina 1 - 1 Australia. Argentina gana por penales 4 - 2.
- Prode: Argentina 1 - 1 Australia, penales 4 - 2 => +12.
- Prode: Argentina 1 - 1 Australia, penales 5 - 4, avanza Argentina => +9.
- Prode: Argentina 2 - 2 Australia, penales 4 - 2 => +9.
- Prode: Argentina 2 - 2 Australia, penales 5 - 4, avanza Argentina => +6.
- Prode: Argentina 2 - 1 Australia => +3 si Argentina era el clasificado pronosticado.
- Prode: avanza Australia => 0, salvo que haya acertado el empate del partido.

ADMIN
Desde /admin podés:
- Editar los nombres de los equipos de cada partido.
- Cargar el resultado real.
- Marcar si fue a penales.
- Cargar resultado exacto de penales.
- Guardar con PIN admin.

SI YA TENÍAS LA VERSIÓN ANTERIOR INSTALADA
1. Subí/reemplazá esta carpeta completa en GitHub: prode_vercel_supabase
2. En Supabase abrí SQL Editor.
3. Pegá y ejecutá: supabase/migracion_reglas_finales.sql
   Si ya ejecutaste una migración anterior de penales, no pasa nada: esta migración es segura.
4. Vercel debería redeployar solo. Si no, entrá a Deployments y abrí el último deploy.

SI LO INSTALÁS DESDE CERO
1. Crear proyecto en Supabase.
2. SQL Editor > pegar y ejecutar supabase/schema.sql
3. Subir este proyecto a GitHub.
4. Importar en Vercel.
5. Root Directory: prode_vercel_supabase
6. Variables de entorno en Vercel:
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
   ADMIN_PIN=1234
