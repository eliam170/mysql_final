from controllers.lote_controller import LoteController
from controllers.json_controller import JSONExporterController

class ConsoleView:
    """Vista interactiva en consola para pruebas operativas."""

    def __init__(self):
        self.lote_ctrl = LoteController()
        self.json_ctrl = JSONExporterController()

    def mostrar_menu(self):
        print("\n==============================================")
        print("  BIOCOLD CONTROL - PLATAFORMA DE VACUNAS")
        print("==============================================")
        print("1. Registrar Nuevo Lote (CU03)")
        print("2. Simular Telemetría de Sensor IoT (CU07)")
        print("3. Exportar Reporte de Operaciones a JSON (CU10 / RF04)")
        print("4. Salir")
        print("==============================================")

    def iniciar(self):
        while True:
            self.mostrar_menu()
            opcion = input("Seleccione una opción (1-4): ")

            if opcion == "1":
                codigo = input("Ingrese Código del Lote (ej. LOT-2026-A1): ")
                cant = int(input("Cantidad de Dosis: "))
                res = self.lote_ctrl.crear_nuevo_lote(codigo, 1, cant, "2026-07-01", "2027-07-01")
                print(f"\n[RESULTADO] {res['mensaje']}")

            elif opcion == "2":
                temp = float(input("Ingrese lectura de temperatura (°C) enviada por el sensor: "))
                # Prueba con rango estándar para vacuna ARNm (-80°C a -60°C)
                res = self.lote_ctrl.evaluar_telemetria_sensor("LOT-2026-A1", temp, -80.0, -60.0)
                print(f"\n[EVALUACIÓN SENSOR] {res['mensaje']}")

            elif opcion == "3":
                res = self.json_ctrl.exportar_operaciones_json()
                print(f"\n[EXPORTACIÓN] {res['mensaje']}")

            elif opcion == "4":
                print("\nCerrando aplicación... ¡Hasta luego!")
                break
            else:
                print("\nOpción inválida. Intente de nuevo.")