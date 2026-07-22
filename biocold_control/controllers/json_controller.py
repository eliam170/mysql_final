import json
import os
from models.lote import LoteModel

class JSONExporterController:
    """Gestiona la serialización interoperable a archivos planos JSON."""

    def __init__(self):
        self.lote_model = LoteModel()

    def exportar_operaciones_json(self, nombre_archivo="reporte_operaciones.json"):
        """Toma los registros relacionales de MySQL y genera el archivo JSON."""
        datos = self.lote_model.obtener_todos()
        
        if not datos:
            return {"exito": False, "mensaje": "No hay registros disponibles para exportar."}

        try:
            ruta_salida = os.path.join(os.getcwd(), nombre_archivo)
            with open(ruta_salida, 'w', encoding='utf-8') as file:
                json.dump(datos, file, ensure_ascii=False, indent=4, default=str)
            
            return {
                "exito": True, 
                "mensaje": f"Reporte exportado correctamente en: {ruta_salida}."
            }
        except Exception as e:
            return {"exito": False, "mensaje": f"Error al escribir el archivo JSON: {e}"}