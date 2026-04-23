"""
Rate limiting global — un único `Limiter` que se importa en los routers.

Los decoradores `@limiter.limit("10/minute")` viven junto al endpoint
que protegen (no en este archivo) para que sea obvio leyendo el router
qué cuotas aplican. Aquí solo creamos la instancia con el identificador
por defecto (IP remota) y la guardamos para que `main.py` la asocie al
estado de la app.

Storage en memoria: suficiente para una sola instancia en Railway. Si
en el futuro escalas horizontalmente a varios workers, hay que migrar
a `storage_uri="redis://…"` para que las cuotas sean compartidas. Con
storage en memoria, cada proceso tiene su propio contador — un atacante
podría esquivar la cuota si tu app tiene múltiples workers, pero para
uvicorn en Railway con un único worker es correcto.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# `get_remote_address` devuelve el IP del cliente. En Railway detrás de
# un proxy, FastAPI lee el IP de `X-Forwarded-For` si el middleware de
# proxy está configurado. Hoy asumimos que `request.client.host` ya es
# el IP real — si notas que todos los requests se ven como misma IP,
# hay que agregar `--proxy-headers` a uvicorn.
limiter = Limiter(key_func=get_remote_address)
