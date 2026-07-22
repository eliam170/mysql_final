from config.database import DatabaseConnection
from mysql.connector import Error

class LoteModel:
    """Gestiona las consultas y escrituras directas sobre la tabla 'lotes'."""

    def __init__(self):
        self.db = DatabaseConnection()

    def registrar_lote(self, codigo_lote, id_vacuna, cantidad_dosis, fecha_fab, fecha_venc):
        """Inserta un nuevo lote con estado inicial 'Pendiente' (CU03)."""
        conn = self.db.get_connection()
        if not conn:
            return False

        query = """
            INSERT INTO lotes (codigo_lote, id_vacuna, cantidad_dosis, fecha_fabricacion, fecha_vencimiento, estado)
            VALUES (%s, %s, %s, %s, %s, 'Pendiente')
        """
        try:
            cursor = conn.cursor()
            cursor.execute(query, (codigo_lote, id_vacuna, cantidad_dosis, fecha_fab, fecha_venc))
            conn.commit()
            cursor.close()
            return True
        except Error as e:
            print(f"[ERROR MODEL] Fallo al insertar lote: {e}")
            return False

    def obtener_todos(self):
        """Recupera la lista completa de lotes registrados."""
        conn = self.db.get_connection()
        if not conn:
            return []

        query = """
            SELECT l.id_lote, l.codigo_lote, v.nombre_comercial, l.cantidad_dosis, l.estado
            FROM lotes l
            INNER JOIN vacunas v ON l.id_vacuna = v.id_vacuna
        """
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            resultados = cursor.fetchall()
            cursor.close()
            return resultados
        except Error as e:
            print(f"[ERROR MODEL] Fallo al consultar lotes: {e}")
            return []