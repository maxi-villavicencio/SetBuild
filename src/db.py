"""Conexion a SQL Server via pyodbc.

Configura por variables de entorno (ver .env.example):
  DB_SERVER, DB_NAME, DB_DRIVER, DB_USER, DB_PASSWORD
Si no pasas usuario/password, usa Trusted_Connection (login de Windows).
"""
import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()  # carga las variables del archivo .env


def get_conn():
    server = os.environ.get("DB_SERVER", "localhost")
    database = os.environ.get("DB_NAME", "dj")
    driver = os.environ.get("DB_DRIVER", "ODBC Driver 18 for SQL Server")
    user = os.environ.get("DB_USER")
    password = os.environ.get("DB_PASSWORD")
    trust = os.environ.get("DB_TRUST_CERT", "yes")

    if user and password:
        conn_str = (
            f"DRIVER={{{driver}}};SERVER={server};DATABASE={database};"
            f"UID={user};PWD={password};TrustServerCertificate={trust};"
        )
    else:
        conn_str = (
            f"DRIVER={{{driver}}};SERVER={server};DATABASE={database};"
            f"Trusted_Connection=yes;TrustServerCertificate={trust};"
        )
    return pyodbc.connect(conn_str)


def run_sql_file(path):
    """Ejecuta un archivo .sql completo (usado para crear el esquema)."""
    with open(path, encoding="utf-8") as f:
        sql = f.read()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    conn.close()
