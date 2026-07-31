# Recomendaciones técnicas COE SAP Funcional

## Prioridad alta

1. Mantener la sincronización por lotes como camino principal.
2. No editar estados como texto libre; usar siempre `subestado_catalogo_id`.
3. Agregar alias/equivalencias de subestados para estados históricos como `closed`, `Cumplido`, `CERRADO SIN SOLUCION`, etc.
4. Separar COE SAP en archivos propios en una fase posterior:

```txt
backend/coe_sap/routes.py
backend/coe_sap/services/sincronizacion_service.py
backend/coe_sap/services/dashboard_service.py
backend/coe_sap/services/catalogos_service.py
backend/coe_sap/serializers/calificacion_serializer.py
```

## Prioridad media

1. Separar el dashboard frontend en componentes:

```txt
src/coeSap/components/EstadoGeneralBacklog.jsx
src/coeSap/components/ModulosConsultoresChart.jsx
src/coeSap/components/RecibidosCerradosChart.jsx
src/coeSap/components/EstadoEstimacionHorasTable.jsx
```

2. Crear auditoría de cambios manuales:

```txt
coe_sap_funcional_calificacion_auditoria
```

Campos sugeridos:

```txt
id
calificacion_id
campo
valor_anterior
valor_nuevo
usuario
fecha
origen
```

3. Crear una tabla de alias para subestados:

```txt
coe_sap_funcional_subestado_alias
```

Campos sugeridos:

```txt
id
subestado_catalogo_id
alias
alias_normalizado
activo
created_at
updated_at
```

## Prioridad rendimiento

1. Revisar índices recomendados en `sql/coe_sap_indices_recomendados.sql`.
2. Evitar consultas `.all()` sobre tablas grandes en endpoints de sincronización.
3. Mantener `db.session.no_autoflush` en recalculos dentro de ciclos.
4. Evitar que una sola llamada de dashboard calcule todos los bloques si crece demasiado; separar por endpoint en una fase posterior.
