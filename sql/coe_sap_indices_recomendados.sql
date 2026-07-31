/*
  Índices recomendados para COE SAP Funcional.
  Ejecutar manualmente en una ventana controlada.

  Nota: algunas versiones de MariaDB/MySQL no soportan CREATE INDEX IF NOT EXISTS.
  Si tu versión no lo soporta, valida antes con SHOW INDEX FROM <tabla>.
*/

-- Calificación: filtros y dashboard
CREATE INDEX IF NOT EXISTS idx_coe_cal_numero ON coe_sap_funcional_calificacion (numero);
CREATE INDEX IF NOT EXISTS idx_coe_cal_sociedad ON coe_sap_funcional_calificacion (sociedad);
CREATE INDEX IF NOT EXISTS idx_coe_cal_modulo ON coe_sap_funcional_calificacion (modulo);
CREATE INDEX IF NOT EXISTS idx_coe_cal_asignado_a ON coe_sap_funcional_calificacion (asignado_a);
CREATE INDEX IF NOT EXISTS idx_coe_cal_estado_original ON coe_sap_funcional_calificacion (estado);
CREATE INDEX IF NOT EXISTS idx_coe_cal_estado_catalogo_id ON coe_sap_funcional_calificacion (estado_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_coe_cal_subestado_catalogo_id ON coe_sap_funcional_calificacion (subestado_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_coe_cal_estado_principal ON coe_sap_funcional_calificacion (estado_principal);
CREATE INDEX IF NOT EXISTS idx_coe_cal_subestado ON coe_sap_funcional_calificacion (subestado);
CREATE INDEX IF NOT EXISTS idx_coe_cal_estado_estimacion ON coe_sap_funcional_calificacion (estado_estimacion);

-- Fechas usadas en gráficas
CREATE INDEX IF NOT EXISTS idx_coe_cal_fecha_asignacion ON coe_sap_funcional_calificacion (fecha_asignacion);
CREATE INDEX IF NOT EXISTS idx_coe_cal_fecha_cierre ON coe_sap_funcional_calificacion (fecha_finalizacion_cierre);
CREATE INDEX IF NOT EXISTS idx_coe_cal_fecha_cierre_sg ON coe_sap_funcional_calificacion (fecha_finalizacion_cierre_sistema_gestion);
CREATE INDEX IF NOT EXISTS idx_coe_cal_fecha_aprobacion_estimacion ON coe_sap_funcional_calificacion (fecha_aprobacion_estimacion);

-- Base principal COE SAP
CREATE INDEX IF NOT EXISTS idx_base_coe_numero ON base_registro_info_coe_sap_funcional (numero);
CREATE INDEX IF NOT EXISTS idx_base_coe_estado ON base_registro_info_coe_sap_funcional (estado);
CREATE INDEX IF NOT EXISTS idx_base_coe_compania ON base_registro_info_coe_sap_funcional (compania);

-- Consultores y módulos
CREATE INDEX IF NOT EXISTS idx_consultor_usuario ON consultor (usuario);
CREATE INDEX IF NOT EXISTS idx_consultor_nombre ON consultor (nombre);
CREATE INDEX IF NOT EXISTS idx_consultor_activo ON consultor (activo);
CREATE INDEX IF NOT EXISTS idx_modulo_nombre ON modulo (nombre);
