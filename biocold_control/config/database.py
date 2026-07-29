import os
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv

load_dotenv()

class DatabaseConnection:
    """Clase singleton para gestionar la conexión a la base de datos MySQL."""
    
    def __init__(self):
        self.host = os.getenv("DB_HOST", "localhost")
        self.user = os.getenv("DB_USER", "root")
        self.password = os.getenv("DB_PASSWORD", "tu_contraseña")
        self.database = os.getenv("DB_NAME", "vacunas_db")
        self.connection = None

    def get_connection(self):
        try:
            if self.connection is None or not self.connection.is_connected():
                self.connection = mysql.connector.connect(
                    host=self.host,
                    user=self.user,
                    password=self.password,
                    database=self.database
                )
            return self.connection
        except Error as e:
            print(f"[ERROR DB] No se pudo conectar a MySQL: {e}")
            return None

    def close_connection(self):
        if self.connection and self.connection.is_connected():
            self.connection.close()
            print("[INFO DB] Conexión a MySQL cerrada correctamente.")