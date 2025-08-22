from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Column, Integer, String, Float, Text, ForeignKey
)
from sqlalchemy.orm import relationship, backref

db = SQLAlchemy()

# ==========================
# Tabla puente: Consultor <-> Modulo (muchos a muchos)
# ==========================
consultor_modulo = db.Table(
    'consultor_modulo',
    db.Column('consultor_id', db.Integer, db.ForeignKey('consultor.id'), primary_key=True),
    db.Column('modulo_id', db.Integer, db.ForeignKey('modulo.id'), primary_key=True),
    mysql_charset='utf8mb4',
    mysql_collate='utf8mb4_unicode_ci'
)

# ==========================
# MODULO
# ==========================
class Modulo(db.Model):
    __tablename__ = 'modulo'

    id = db.Column(db.Integer, primary_key=True)
    # Único recomendado para evitar duplicados de nombres
    nombre = db.Column(db.String(100), nullable=False, unique=True)

    # Relación 1-N "antigua" (modulo_id en Consultor) -> la dejamos por compatibilidad
    consultores_default = relationship('Consultor', backref='modulo', lazy=True)

    # Relación M2M "nueva": consultores con este módulo
    consultores_multi = relationship(
        'Consultor',
        secondary=consultor_modulo,
        lazy='dynamic',
        backref=backref('modulos', lazy='joined')  # <- Consultor.modulos (lista de Modulo)
    )

    def __repr__(self):
        return f"<Modulo id={self.id} nombre={self.nombre!r}>"

# ==========================
# CONSULTOR
# ==========================
class Consultor(db.Model):
    __tablename__ = 'consultor'

    id = db.Column(db.Integer, primary_key=True)
    usuario = db.Column(db.String(50), unique=True, nullable=False)
    nombre = db.Column(db.String(100), nullable=False)
    password = db.Column(db.Text, nullable=False)
    horario = db.Column(db.String(20))
    rol = db.Column(db.String(20))
    equipo = db.Column(db.String(50))

    # "Módulo por defecto" (compatibilidad con esquema anterior 1-N)
    modulo_id = db.Column(db.Integer, db.ForeignKey('modulo.id'))

    # Registros de horas (1-N)
    registros = relationship('Registro', backref='consultor', lazy=True)

    def __repr__(self):
        return f"<Consultor id={self.id} usuario={self.usuario!r} nombre={self.nombre!r}>"

# ==========================
# REGISTRO
# ==========================
class Registro(db.Model):
    __tablename__ = 'registro'

    id = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.String(20), nullable=False)
    cliente = db.Column(db.String(100), nullable=False)
    nro_caso_cliente = db.Column(db.String(50), nullable=True)
    nro_caso_interno = db.Column(db.String(50), nullable=True)
    nro_caso_escalado = db.Column(db.String(50), nullable=True)
    tipo_tarea = db.Column(db.String(100), nullable=False)
    hora_inicio = db.Column(db.String(10), nullable=False)
    hora_fin = db.Column(db.String(10), nullable=False)
    tiempo_invertido = db.Column(db.Float, nullable=False)
    actividad_malla = db.Column(db.String(50), nullable=False)
    oncall = db.Column(db.String(100), nullable=False)
    desborde = db.Column(db.String(100), nullable=False)
    tiempo_facturable = db.Column(db.Float, nullable=False)
    horas_adicionales = db.Column(db.String(10), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    total_horas = db.Column(db.Float, nullable=True)

    # Guardamos el NOMBRE del módulo elegido para el registro
    modulo = db.Column(db.String(100))

    # NUEVO: horario con el que se calculó este registro (p. ej. "08:00-18:00")
    horario_trabajo = db.Column(db.String(20))

    bloqueado = db.Column(db.Boolean, default=False)

    # FK al consultor
    consultor_id = db.Column(db.Integer, db.ForeignKey('consultor.id'))

    def __repr__(self):
        return f"<Registro id={self.id} consultor_id={self.consultor_id} fecha={self.fecha}>"

# ==========================
# BASE_REGISTRO (carga masiva)
# ==========================
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

    # (Compat) desnormalizados de fecha si vienen en Excel
    dia  = Column(Integer)
    mes  = Column(Integer)
    anio = Column(Integer)

    # Campos adicionales de reportes
    ocupacion_azure   = Column(String(600))
    tarea_azure       = Column(String(600))
    horas_convertidas = Column(Float)
    promedio          = Column(Float)
    extemporaneo      = Column(String(50))
    equipo            = Column(String(120))

    __mapper_args__ = {"eager_defaults": True}

    def __repr__(self):
        return f"<BaseRegistro id={self.id}>"

# ==========================
# LOGIN SESSIONS
# ==========================
class Login(db.Model):
    __tablename__ = 'login_sessions'

    id = db.Column(db.Integer, primary_key=True)
    consultor_id = db.Column(db.Integer, db.ForeignKey('consultor.id'), nullable=False)
    usuario = db.Column(db.String(100), nullable=False)
    horario_asignado = db.Column(db.String(20))
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    fecha_login = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    consultor = relationship('Consultor', backref=backref('logins', lazy=True))

    def __repr__(self):
        return f"<Login id={self.id} usuario={self.usuario} fecha={self.fecha_login}>"
