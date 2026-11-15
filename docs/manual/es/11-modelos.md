---
title: Modelos disponibles
nav: Modelos disponibles
description: Estado en vivo de los modelos firmados que sirve el CDN del motor local de Alpaquitay AI, con verificación de la firma en el navegador, y la comparación medida que llevó a elegir el modelo por defecto.
---

# Modelos disponibles

Esta página consulta **ahora mismo** el CDN del motor local (`alpaquitay.specsolid.com`), descarga el manifiesto de cada modelo publicado y **comprueba su firma Ed25519 en tu navegador** con las mismas claves públicas que trae la extensión. Si un manifiesto se alterase, lo verías aquí como *firma inválida*, igual que lo rechazaría VS Code.

```models
```

> [!NOTE]
> La comprobación de firmas Ed25519 en el navegador necesita una versión reciente (Chrome o Edge 137+, Firefox 129+, Safari 17+). En navegadores más antiguos verás *«tu navegador no verifica Ed25519»*: no significa que el modelo esté mal, solo que este navegador no puede comprobarlo. La extensión siempre lo comprueba.

## Cómo se eligió el modelo por defecto

Todos los candidatos se probaron con la extensión real, en un VS Code aislado, en el mismo portátil (GPU integrada Intel UHD gen 9) y con la misma petición en español, servidos desde un CDN local con una clave de prueba.

| Modelo | Licencia | Descarga | En VS Code | Calidad de la especificación |
|---|---|---|---|---|
| **Qwen2.5-Coder 1.5B Instruct** (`q4f16`) ✅ | Apache-2.0 | 1,26 GB | **3,3–4,8 tok/s** | La mejor: tareas técnicas concretas, `SPEC-NNN`, épicas, en español |
| Gemma 3 1B (`q4`) | Gemma Terms of Use (con restricciones de uso) | 0,82 GB | 5,9 tok/s | Floja: una sola épica, sin `SPEC-NNN`, errores de contenido |
| Qwen3 1.7B | Apache-2.0 | 1,43 GB | ❌ no carga | — |
| Granite 4.0 1B | Apache-2.0 | 1,19 GB | ❌ salida corrupta o no carga | — |
| Gemma 4 E2B | Apache-2.0 | 3,2 GB | ❌ demasiado grande | — |

Conclusiones:

- **Qwen2.5-Coder 1.5B** es el único candidato especializado en código que funciona en el runtime WebGPU y el que mejores especificaciones escribió. Su licencia (Apache-2.0) no restringe el uso.
- En este tipo de equipo, el motor no carga modelos de más de unos **1,3 GB**; por eso modelos mejores sobre el papel (Qwen3, Gemma 4) quedan fuera por ahora.
- **Gemma 3 1B** sigue publicado y se puede elegir con `alpaquitay-ai.localEngine.modelId: "gemma-3-1b-it"`; es más rápido pero da peores resultados.

El método completo, los archivos y las dos modificaciones de grafo que se aplicaron al modelo están en [`docs/LOCAL-ENGINE.md`](https://github.com/sergioide007/alpaquitay-ai/blob/main/docs/LOCAL-ENGINE.md#6-choosing-the-model-measured-2026-11-15).

## Cambiar de modelo

En tus **ajustes de usuario** (no en los del proyecto):

```json
{
  "alpaquitay-ai.localEngine.modelId": "gemma-3-1b-it"
}
```

La próxima vez que ejecutes el comando verás el diálogo de confirmación con el tamaño del modelo nuevo. Para volver al de por defecto, borra el ajuste.

## Cuándo cambia un modelo

Cuando el proyecto publica una **revisión nueva** (mismos archivos corregidos o un grafo optimizado), el manifiesto lleva una revisión y una secuencia mayores. La extensión lo detecta, te pide confirmación para la nueva descarga y borra los pesos antiguos. Nunca acepta una secuencia menor que la que ya vio.

## Publicar un modelo en tu propio CDN

Si quieres servir modelos desde tu propia infraestructura (por ejemplo, en una red sin acceso a Internet), el proceso es: preparar el grafo, *stage*, firmar con tu clave, subir y verificar. Añade tu clave pública en `alpaquitay-ai.localEngine.extraTrustedKeys` y apunta `cdnBaseUrl` a tu CDN. Guía completa: [`worker/README.md`](https://github.com/sergioide007/alpaquitay-ai/blob/main/worker/README.md) y [`docs/LOCAL-ENGINE.md` §6–7](https://github.com/sergioide007/alpaquitay-ai/blob/main/docs/LOCAL-ENGINE.md#7-operations).
