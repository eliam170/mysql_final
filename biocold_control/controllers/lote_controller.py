from models.lote import LoteModel

class LoteController:
    """Controlador con la lógica de negocio para la gestión de lotes."""

    def __init__(self):
        self.model = LoteModel()

    def crear_nuevo_lote(self, codigo_lote, id_vacuna, cantidad_dosis, fecha_fab, fecha_venc):
        """Valida y delega el registro de un nuevo lote (CU03)."""
        if not codigo_lote or cantidad_dosis <= 0:
            return {"exito": False, "mensaje": "Datos inválidos. Verifique el código y la cantidad."}

        exito = self.model.registrar_lote(codigo_lote, id_vacuna, cantidad_dosis, fecha_fab, fecha_venc)
        if exito:
            return {"exito": True, "mensaje": f"Lote {codigo_lote} registrado correctamente."}
        else:
            return {"exito": False, "mensaje": "Error al registrar el lote en la base de datos."}

    def evaluar_telemetria_sensor(self, codigo_lote, temperatura, min_temp, max_temp):
        """Evalúa si la lectura de temperatura está dentro del rango seguro (CU07)."""
        if min_temp <= temperatura <= max_temp:
            return {"exito": True, "mensaje": f"✅ Temperatura {temperatura}°C DENTRO del rango seguro [{min_temp}°C a {max_temp}°C]."}
        else:
            return {"exito": False, "mensaje": f"❌ ALERTA: Temperatura {temperatura}°C FUERA del rango seguro [{min_temp}°C a {max_temp}°C]."}