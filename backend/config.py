
import os

class Config:
   
    SECRET_KEY = os.environ.get("SECRET_KEY", "cambia-esto-en-produccion")

   
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "mysql+pymysql://andres:andres1234@127.0.0.1:3306/auto_sap?charset=utf8mb4",
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

