import mysql.connector
from mysql.connector import Error

class DatabaseConnection:
    """Clase singleton para gestionar la conexión a la base de datos MySQL."""
    
    def __init__(self):
        self.host = "localhost"
        self.user = "root"
        self.password = "tu_contraseña"  # Cambiar por tus credenciales de MySQL
        self.database = "vacunas_db"
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