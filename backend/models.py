from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, String, Float, Text, Boolean, text
from sqlalchemy.orm import relationship, backref
from sqlalchemy.ext.hybrid import hybrid_property
from decimal import Decimal

db = SQLAlchemy()

class Rol(db.Model):
    __tablename__ = 'rol'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

    permisos_asignados = db.relationship(
        "RolPermiso",
        back_populates="rol",
        lazy="joined"
    )

    consultores = db.relationship("Consultor", back_populates="rol_obj")

    def __repr__(self):
        return f"<Rol id={self.id} nombre={self.nombre!r}>"

class Equipo(db.Model):
    __tablename__ = 'equipo'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False)

    permisos_asignados = db.relationship(
        "EquipoPermiso",
        back_populates="equipo",
        lazy="joined"
    )

    consultores = db.relationship("Consultor", back_populates="equipo_obj")

    def __repr__(self):
        return f"<Equipo id={self.id} nombre={self.nombre!r}>"

class Horario(db.Model):
    __tablename__ = 'horario'
    id = db.Column(db.Integer, primary_key=True)
    rango = db.Column(db.String(20), unique=True, nullable=False)

consultor_modulo = db.Table(
    'consultor_modulo',
    db.Column('consultor_id', db.Integer, db.ForeignKey('consultor.id'), primary_key=True),
    db.Column('modulo_id', db.Integer, db.ForeignKey('modulo.id'), primary_key=True),
    mysql_charset='utf8mb4',
    mysql_collate='utf8mb4_unicode_ci'
)

class Modulo(db.Model):
    __tablename__ = 'modulo'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False, unique=True)

    consultores = relationship(
        'Consultor',
        secondary=consultor_modulo,
        back_populates='modulos',
        lazy='subquery'
    )

class Consultor(db.Model):
    __tablename__ = 'consultor'

    id = db.Column(db.Integer, primary_key=True)

    usuario = db.Column(db.String(50), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    password = db.Column(db.Text, nullable=False)

    rol_id = db.Column(db.Integer, db.ForeignKey('rol.id', ondelete='SET NULL'))
    equipo_id = db.Column(db.Integer, db.ForeignKey('equipo.id', ondelete='SET NULL'))
    horario_id = db.Column(db.Integer, db.ForeignKey('horario.id', ondelete='SET NULL'))
    modulo_id = db.Column(db.Integer, db.ForeignKey('modulo.id', ondelete='SET NULL'))

    rol_obj = relationship('Rol', back_populates='consultores')
    equipo_obj = relationship('Equipo', back_populates='consultores')
    horario_obj = relationship('Horario', backref=backref('consultores', lazy='joined'))
    activo = db.Column(db.Boolean, nullable=False, server_default=text("1"))

    modulos = relationship(
        'Modulo',
        secondary=consultor_modulo,
        back_populates='consultores'
    )

    registros = relationship(
        'Registro',
        back_populates='consultor',
        lazy=True
    )

    permisos_especiales = relationship(
        "ConsultorPermiso",
        back_populates="consultor",
        lazy="joined"
    )

    @hybrid_property
    def permisos(self):
        permisos_finales = set()

        if self.rol_obj:
            for rp in self.rol_obj.permisos_asignados:
                if rp.permiso and rp.permiso.codigo:
                    permisos_finales.add(rp.permiso.codigo)

        if self.equipo_obj:
            for ep in self.equipo_obj.permisos_asignados:
                if ep.permiso and ep.permiso.codigo:
                    permisos_finales.add(ep.permiso.codigo)

        for cp in self.permisos_especiales:
            if cp.permiso and cp.permiso.codigo:
                permisos_finales.add(cp.permiso.codigo)

        return list(permisos_finales)

class Registro(db.Model):
    __tablename__ = 'registro'

    id = db.Column(db.Integer, primary_key=True)

    fecha = db.Column(db.String(20), nullable=False)
    cliente = db.Column(db.String(100), nullable=False)

    nro_caso_cliente = db.Column(db.String(50))
    nro_caso_interno = db.Column(db.String(50))
    nro_caso_escalado = db.Column(db.String(50))

    tarea_id = db.Column(db.Integer, db.ForeignKey('tareas.id'))
    tarea = relationship('Tarea', backref='registros')

    ocupacion_id = db.Column(db.Integer, db.ForeignKey('ocupaciones.id'))
    ocupacion = relationship('Ocupacion', backref='registros')

    tipo_tarea = db.Column(db.String(200))

    hora_inicio = db.Column(db.String(10))
    hora_fin = db.Column(db.String(10))
    tiempo_invertido = db.Column(db.Float)

    actividad_malla = db.Column(db.String(50))
    oncall = db.Column(db.String(100))
    desborde = db.Column(db.String(100))

    tiempo_facturable = db.Column(db.Float)
    horas_adicionales = db.Column(db.String(10))
    descripcion = db.Column(db.Text)

    total_horas = db.Column(db.Float)

    equipo = db.Column(db.String(50))
    modulo = db.Column(db.String(100))
    horario_trabajo = db.Column(db.String(20))
    bloqueado = db.Column(db.Boolean, default=False)

    usuario_consultor = db.Column(db.String(50), db.ForeignKey('consultor.usuario'))

    consultor = relationship(
        'Consultor',
        back_populates='registros',
        primaryjoin="Registro.usuario_consultor == Consultor.usuario"
    )

class BaseRegistro(db.Model):
    __tablename__ = 'base_registro'
    id = Column(Integer, primary_key=True)

    fecha = Column(String(50))
    modulo = Column(String(120))
    cliente = Column(String(200))
    nro_caso_cliente = Column(String(120))
    nro_caso_interno = Column(String(120))
    tipo_tarea = Column(String(200))
    consultor = Column(String(200))
    hora_inicio = Column(String(20))
    hora_fin = Column(String(20))
    tiempo_invertido = Column(String(20))
    tiempo_facturable = Column(Float)
    horas_adicionales = Column(Float)
    descripcion = Column(Text)
    consolidado_cliente = Column(String(200))
    dia = Column(Integer)
    mes = Column(Integer)
    anio = Column(Integer)
    ocupacion_azure = Column(String(600))
    tarea_azure = Column(String(600))
    horas_convertidas = Column(Float)
    promedio = Column(Float)
    extemporaneo = Column(String(50))
    equipo = Column(String(120))

class Login(db.Model):
    __tablename__ = 'login_sessions'

    id = db.Column(db.Integer, primary_key=True)
    consultor_id = db.Column(db.Integer, db.ForeignKey('consultor.id'), nullable=False)
    usuario = db.Column(db.String(100), nullable=False)
    horario_asignado = db.Column(db.String(20))
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    fecha_login = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    fecha_logout = db.Column(db.DateTime)
    token = db.Column(db.String(255))
    activo = db.Column(db.Boolean, default=True)

    consultor = relationship('Consultor', backref=backref('logins', lazy=True))

class Oportunidad(db.Model):
    __tablename__ = 'oportunidades'

    id = db.Column(db.Integer, primary_key=True)
    nombre_cliente = db.Column(db.String(255))
    servicio = db.Column(db.String(255))
    fecha_creacion = db.Column(db.Date)
    semestre = db.Column(db.String(32))
    tipo_cliente = db.Column(db.String(100))
    tipo_solicitud = db.Column(db.String(100))
    caso_sm = db.Column(db.String(100))
    fecha_cierre_sm = db.Column(db.Date)
    salesforce = db.Column(db.String(100))
    ultimos_6_meses = db.Column(db.String(20))
    ultimo_mes = db.Column(db.String(20))
    retraso = db.Column(db.String(50))
    estado_oferta = db.Column(db.String(100))
    resultado_oferta = db.Column(db.String(100))
    calificacion_oportunidad = db.Column(db.String(100))
    origen_oportunidad = db.Column(db.String(100))
    direccion_comercial = db.Column(db.String(255))
    gerencia_comercial = db.Column(db.String(255))
    comercial_asignado = db.Column(db.String(255))
    consultor_comercial = db.Column(db.String(255))
    comercial_asignado_hitss = db.Column(db.String(255))
    observaciones = db.Column(db.Text)
    categoria_perdida = db.Column(db.String(255))
    subcategoria_perdida = db.Column(db.String(255))
    fecha_entrega_oferta_final = db.Column(db.Date)
    vigencia_propuesta = db.Column(db.Date)
    fecha_aceptacion_oferta = db.Column(db.Date)
    tipo_moneda = db.Column(db.String(10))
    otc = db.Column(db.BigInteger)
    mrc = db.Column(db.BigInteger)
    mrc_normalizado = db.Column(db.BigInteger)
    valor_oferta_claro = db.Column(db.BigInteger)
    duracion = db.Column(db.String(50))
    pais = db.Column(db.String(100))
    fecha_cierre_oportunidad = db.Column(db.Date)
    codigo_prc = db.Column(db.String(100))
    fecha_firma_aos = db.Column(db.Date)
    pm_asignado_claro = db.Column(db.String(255))
    pm_asignado_hitss = db.Column(db.String(255))
    descripcion_ot = db.Column(db.Text)
    num_enlace = db.Column(db.String(100))
    num_incidente = db.Column(db.String(100))
    num_ot = db.Column(db.String(100))
    estado_ot = db.Column(db.String(100))
    proyeccion_ingreso = db.Column(db.Date)
    fecha_compromiso = db.Column(db.Date)
    fecha_cierre = db.Column(db.Date)
    estado_proyecto = db.Column(db.String(100))
    anio_creacion_ot = db.Column(db.String(10))
    fecha_acta_cierre_ot = db.Column(db.Date)
    seguimiento_ot = db.Column(db.Text)
    tipo_servicio = db.Column(db.String(255))
    semestre_ejecucion = db.Column(db.String(32))
    publicacion_sharepoint = db.Column(db.String(255))

    def to_dict(self):
        def serializar_fecha(f):
            return f.isoformat() if f else None

        def serializar_numero(n):
            return int(n) if n is not None else None

        return {
            "id": self.id,
            "nombre_cliente": self.nombre_cliente,
            "servicio": self.servicio,
            "fecha_creacion": serializar_fecha(self.fecha_creacion),
            "semestre": self.semestre,
            "tipo_cliente": self.tipo_cliente,
            "tipo_solicitud": self.tipo_solicitud,
            "caso_sm": self.caso_sm,
            "fecha_cierre_sm": serializar_fecha(self.fecha_cierre_sm),
            "salesforce": self.salesforce,
            "ultimos_6_meses": self.ultimos_6_meses,
            "ultimo_mes": self.ultimo_mes,
            "retraso": self.retraso,
            "estado_oferta": self.estado_oferta,
            "resultado_oferta": self.resultado_oferta,
            "calificacion_oportunidad": self.calificacion_oportunidad,
            "origen_oportunidad": self.origen_oportunidad,
            "direccion_comercial": self.direccion_comercial,
            "gerencia_comercial": self.gerencia_comercial,
            "comercial_asignado": self.comercial_asignado,
            "consultor_comercial": self.consultor_comercial,
            "comercial_asignado_hitss": self.comercial_asignado_hitss,
            "observaciones": self.observaciones,
            "categoria_perdida": self.categoria_perdida,
            "subcategoria_perdida": self.subcategoria_perdida,
            "fecha_entrega_oferta_final": serializar_fecha(self.fecha_entrega_oferta_final),
            "vigencia_propuesta": serializar_fecha(self.vigencia_propuesta),
            "fecha_aceptacion_oferta": serializar_fecha(self.fecha_aceptacion_oferta),
            "tipo_moneda": self.tipo_moneda,
            "otc": serializar_numero(self.otc),
            "mrc": serializar_numero(self.mrc),
            "mrc_normalizado": serializar_numero(self.mrc_normalizado),
            "valor_oferta_claro": serializar_numero(self.valor_oferta_claro),
            "duracion": self.duracion,
            "pais": self.pais,
            "fecha_cierre_oportunidad": serializar_fecha(self.fecha_cierre_oportunidad),
            "codigo_prc": self.codigo_prc,
            "fecha_firma_aos": serializar_fecha(self.fecha_firma_aos),
            "pm_asignado_claro": self.pm_asignado_claro,
            "pm_asignado_hitss": self.pm_asignado_hitss,
            "descripcion_ot": self.descripcion_ot,
            "num_enlace": self.num_enlace,
            "num_incidente": self.num_incidente,
            "num_ot": self.num_ot,
            "estado_ot": self.estado_ot,
            "proyeccion_ingreso": serializar_fecha(self.proyeccion_ingreso),
            "fecha_compromiso": serializar_fecha(self.fecha_compromiso),
            "fecha_cierre": serializar_fecha(self.fecha_cierre),
            "estado_proyecto": self.estado_proyecto,
            "anio_creacion_ot": self.anio_creacion_ot,
            "fecha_acta_cierre_ot": serializar_fecha(self.fecha_acta_cierre_ot),
            "seguimiento_ot": self.seguimiento_ot,
            "tipo_servicio": self.tipo_servicio,
            "semestre_ejecucion": self.semestre_ejecucion,
            "publicacion_sharepoint": self.publicacion_sharepoint,
        }

class Cliente(db.Model):
    __tablename__ = 'clientes'

    id = db.Column(db.Integer, primary_key=True)
    nombre_cliente = db.Column(db.String(255), nullable=False, unique=True)

    def to_dict(self):
        return {"id": self.id, "nombre_cliente": self.nombre_cliente}

class Permiso(db.Model):
    __tablename__ = "permiso"

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(200), unique=True, nullable=False)
    descripcion = db.Column(db.String(300))

    def to_dict(self):
        return {"id": self.id, "codigo": self.codigo, "descripcion": self.descripcion}

class RolPermiso(db.Model):
    __tablename__ = "rol_permiso"

    id = db.Column(db.Integer, primary_key=True)
    rol_id = db.Column(db.Integer, db.ForeignKey("rol.id"), nullable=False)
    permiso_id = db.Column(db.Integer, db.ForeignKey("permiso.id"), nullable=False)

    rol = db.relationship("Rol", back_populates="permisos_asignados")
    permiso = db.relationship("Permiso")

class EquipoPermiso(db.Model):
    __tablename__ = "equipo_permiso"

    id = db.Column(db.Integer, primary_key=True)
    equipo_id = db.Column(db.Integer, db.ForeignKey("equipo.id"), nullable=False)
    permiso_id = db.Column(db.Integer, db.ForeignKey("permiso.id"), nullable=False)

    equipo = db.relationship("Equipo", back_populates="permisos_asignados")
    permiso = db.relationship("Permiso")

class ConsultorPermiso(db.Model):
    __tablename__ = "consultor_permiso"

    id = db.Column(db.Integer, primary_key=True)
    consultor_id = db.Column(db.Integer, db.ForeignKey("consultor.id"), nullable=False)
    permiso_id = db.Column(db.Integer, db.ForeignKey("permiso.id"), nullable=False)

    consultor = db.relationship("Consultor", back_populates="permisos_especiales")
    permiso = db.relationship("Permiso")

ocupacion_tareas = db.Table(
    "ocupacion_tareas",
    db.Column("ocupacion_id", db.Integer, db.ForeignKey("ocupaciones.id", ondelete="CASCADE"), primary_key=True),
    db.Column("tarea_id", db.Integer, db.ForeignKey("tareas.id", ondelete="CASCADE"), primary_key=True),
    mysql_charset='utf8mb4',
    mysql_collate='utf8mb4_unicode_ci'
)

class Ocupacion(db.Model):
    __tablename__ = "ocupaciones"

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(20), unique=True, nullable=False)
    nombre = db.Column(db.String(150), nullable=False)
    descripcion = db.Column(db.Text)

    tareas = relationship(
        "Tarea",
        secondary=ocupacion_tareas,
        back_populates="ocupaciones",
        lazy="subquery"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "codigo": self.codigo,
            "nombre": self.nombre,
            "descripcion": self.descripcion,
            "tareas": [t.to_dict_simple() for t in self.tareas]
        }

class Tarea(db.Model):
    __tablename__ = "tareas"

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(20), unique=True, nullable=False)
    nombre = db.Column(db.String(255), nullable=False)
    descripcion = db.Column(db.Text)

    ocupaciones = relationship(
        "Ocupacion",
        secondary=ocupacion_tareas,
        back_populates="tareas",
        lazy="subquery"
    )

    aliases = relationship("TareaAlias", back_populates="tarea", cascade="all, delete")

    def to_dict(self):
        return {
            "id": self.id,
            "codigo": self.codigo,
            "nombre": self.nombre,
            "descripcion": self.descripcion,
            "ocupaciones": [o.id for o in self.ocupaciones],
            "aliases": [a.to_dict() for a in self.aliases]
        }

    def to_dict_simple(self):
        return {"id": self.id, "codigo": self.codigo, "nombre": self.nombre}

class TareaAlias(db.Model):
    __tablename__ = "tareas_alias"

    id = db.Column(db.Integer, primary_key=True)
    alias = db.Column(db.String(255), nullable=False)

    tarea_id = db.Column(db.Integer, db.ForeignKey("tareas.id"))
    tarea = relationship("Tarea", back_populates="aliases")

    def to_dict(self):
        return {"id": self.id, "alias": self.alias, "tarea_id": self.tarea_id}

class RegistroExcel(db.Model):
    __tablename__ = 'registro_excel'

    id = db.Column(db.Integer, primary_key=True)

    fecha = db.Column(db.Date)
    modulo_nombre = db.Column(db.String(100))
    equipo = db.Column(db.String(20))
    cliente = db.Column(db.String(150))

    nro_caso_cliente = db.Column(db.String(100))
    nro_caso_interno = db.Column(db.String(100))
    nro_caso_escalado_sap = db.Column(db.String(100))

    ocupacion_raw = db.Column(db.String(200))
    ocupacion_id = db.Column(db.Integer, db.ForeignKey('ocupaciones.id'), nullable=True)
    tarea_id = db.Column(db.Integer, db.ForeignKey('tareas.id'), nullable=True)

    tipo_tarea_azure = db.Column(db.String(10))
    tipo_tarea_nombre = db.Column(db.String(150))

    consultor = db.Column(db.String(100))

    hora_inicio = db.Column(db.Time)
    hora_fin = db.Column(db.Time)

    tiempo_invertido = db.Column(db.Float)
    tiempo_facturable = db.Column(db.Float)

    oncall = db.Column(db.String(10))
    desborde = db.Column(db.String(10))
    horas_adicionales = db.Column(db.String(10))

    descripcion = db.Column(db.Text)

class PresupuestoProyecto(db.Model):
    __tablename__ = "presupuesto_proyecto"

    id = db.Column(db.Integer, primary_key=True)
    consultor_id = db.Column(db.Integer, db.ForeignKey("consultor.id"), nullable=False)

    anio = db.Column(db.Integer, nullable=False)
    mes  = db.Column(db.Integer, nullable=False)

    presupuesto_horas = db.Column(db.Float, default=0)

    consultor = relationship("Consultor", backref="presupuesto_proyectos")

class ConsultorPresupuesto(db.Model):
    __tablename__ = "consultor_presupuesto"  

    id = db.Column(db.Integer, primary_key=True)
    consultor_id = db.Column(db.Integer, db.ForeignKey("consultor.id"), nullable=False)

    anio = db.Column(db.Integer, nullable=False)
    mes = db.Column(db.Integer, nullable=False)

    vr_perfil = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    horas_base_mes = db.Column(db.Numeric(10, 2), nullable=False, default=160)
    vigente = db.Column(db.Boolean, default=True)
