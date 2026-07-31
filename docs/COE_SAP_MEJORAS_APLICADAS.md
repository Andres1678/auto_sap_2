# COE SAP Funcional - mejoras aplicadas

Este paquete conserva la estructura actual del proyecto y aplica mejoras enfocadas en estabilidad y mantenibilidad del módulo COE SAP Funcional.

## Cambios aplicados

### 1. Sincronización por lotes

Se agregó el endpoint:

```txt
POST /api/coe-sap-funcional/calificacion/sincronizar-lote
```

Este endpoint procesa la calificación en lotes pequeños para evitar errores de timeout como:

```txt
504 Gateway Time-out
WORKER TIMEOUT
```

El endpoint anterior se conserva:

```txt
POST /api/coe-sap-funcional/calificacion/sincronizar
```

para no romper compatibilidad con otros llamados existentes.

### 2. Vista de configuración COE SAP

En `CargarBasesAuxiliaresCoeSap.jsx` se cambió el botón **Sincronizar calificación** para usar el nuevo endpoint por lotes.

El flujo ahora es:

```txt
1. Procesa lote de base principal.
2. Actualiza avance en pantalla.
3. Repite hasta terminar.
4. Ejecuta sincronización de clasificación controlada.
5. Actualiza clientes y casos pendientes.
```

### 3. Estado controlado

Se conserva la lógica de estado principal y subestado controlado:

```txt
estado_original     -> se conserva como histórico
subestado_catalogo_id -> fuente fuerte para reportes y gráficos
estado_catalogo_id  -> se deriva del subestado
estado_principal    -> se muestra al usuario
subestado           -> se muestra al usuario
```

### 4. Dashboard COE SAP

Se conserva el dashboard con:

```txt
- Backlog completo en Estado general de requerimientos.
- Filtros mensuales independientes por sociedad.
- Casos recibidos vs cerrados por fechas correctas.
- Estado estimación y horas por fecha de aprobación de estimación.
- Distribución por módulos y consultores asignados.
```

### 5. Archivos agregados

```txt
docs/COE_SAP_MEJORAS_APLICADAS.md
docs/COE_SAP_RECOMENDACIONES_TECNICAS.md
sql/coe_sap_indices_recomendados.sql
scripts/validar_coe_sap.sh
```

## Validación realizada

Se validó sintaxis de backend con:

```bash
python3 -m py_compile backend/routes.py backend/models.py
```

El build de frontend no se pudo ejecutar en el sandbox porque no está disponible `react-scripts` dentro de `frontend/node_modules`. En el servidor/proyecto, ejecutar:

```bash
cd frontend
npm install
npm run build
```
