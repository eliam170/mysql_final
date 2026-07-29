-- ============================================================================
-- BioCold Control - PLATAFORMA CONTROL DE VACUNAS
-- 10 Tablas Normalizadas en 3FN
-- ============================================================================

CREATE DATABASE IF NOT EXISTS vacunas_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE vacunas_db;

-- ----------------------------------------------------------------------------
-- 1. laboratorios (CU01)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS cert_dictamenes;
DROP TABLE IF EXISTS lecturas_telemetria;
DROP TABLE IF EXISTS sensores_iot;
DROP TABLE IF EXISTS despachos;
DROP TABLE IF EXISTS vehiculos;
DROP TABLE IF EXISTS operadores_logisticos;
DROP TABLE IF EXISTS lotes;
DROP TABLE IF EXISTS vacunas;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS laboratorios;

CREATE TABLE laboratorios (
    id_laboratorio INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    licencia_sanitaria VARCHAR(50) NOT NULL UNIQUE,
    pais_origen VARCHAR(50) NOT NULL,
    telefono VARCHAR(20),
    email VARCHAR(100),
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. vacunas (CU02)
-- ----------------------------------------------------------------------------
CREATE TABLE vacunas (
    id_vacuna INT AUTO_INCREMENT PRIMARY KEY,
    id_laboratorio INT NOT NULL,
    nombre_comercial VARCHAR(100) NOT NULL,
    tecnologia VARCHAR(50) NOT NULL,
    temp_minima_c DECIMAL(4,1) NOT NULL,
    temp_maxima_c DECIMAL(4,1) NOT NULL,
    dosis_recomendadas INT DEFAULT 1,
    CONSTRAINT fk_vacuna_laboratorio FOREIGN KEY (id_laboratorio)
        REFERENCES laboratorios(id_laboratorio) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. usuarios (Control de Acceso y Roles)
-- ----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre_completo VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('Tecnico', 'Operador', 'Auditor', 'Admin') NOT NULL,
    estado ENUM('Activo', 'Inactivo') DEFAULT 'Activo'
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. lotes (CU03)
-- ----------------------------------------------------------------------------
CREATE TABLE lotes (
    id_lote INT AUTO_INCREMENT PRIMARY KEY,
    codigo_lote VARCHAR(30) NOT NULL UNIQUE,
    id_vacuna INT NOT NULL,
    id_usuario_creador INT NOT NULL,
    cantidad_dosis INT NOT NULL,
    fecha_fabricacion DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado ENUM('Pendiente', 'En Transito', 'Aprobado', 'Rechazado') DEFAULT 'Pendiente',
    CONSTRAINT fk_lote_vacuna FOREIGN KEY (id_vacuna)
        REFERENCES vacunas(id_vacuna),
    CONSTRAINT fk_lote_usuario FOREIGN KEY (id_usuario_creador)
        REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. operadores_logisticos (CU04)
-- ----------------------------------------------------------------------------
CREATE TABLE operadores_logisticos (
    id_operador INT AUTO_INCREMENT PRIMARY KEY,
    razon_social VARCHAR(100) NOT NULL,
    nit_taxid VARCHAR(30) NOT NULL UNIQUE,
    tipo_transporte VARCHAR(50) NOT NULL,
    telefono_soporte VARCHAR(20)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. vehiculos (CU05)
-- ----------------------------------------------------------------------------
CREATE TABLE vehiculos (
    id_vehiculo INT AUTO_INCREMENT PRIMARY KEY,
    id_operador INT NOT NULL,
    placa_identificador VARCHAR(20) NOT NULL UNIQUE,
    tipo_vehiculo VARCHAR(30) NOT NULL,
    capacidad_lotes INT NOT NULL,
    CONSTRAINT fk_vehiculo_operador FOREIGN KEY (id_operador)
        REFERENCES operadores_logisticos(id_operador) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. despachos (CU06)
-- ----------------------------------------------------------------------------
CREATE TABLE despachos (
    id_despacho INT AUTO_INCREMENT PRIMARY KEY,
    id_lote INT NOT NULL,
    id_vehiculo INT NOT NULL,
    origen VARCHAR(100) NOT NULL,
    destino VARCHAR(100) NOT NULL,
    fecha_salida DATETIME NOT NULL,
    fecha_llegada_estimada DATETIME NOT NULL,
    estado_despacho ENUM('En Ruta', 'Entregado', 'Cancelado') DEFAULT 'En Ruta',
    CONSTRAINT fk_despacho_lote FOREIGN KEY (id_lote)
        REFERENCES lotes(id_lote),
    CONSTRAINT fk_despacho_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos(id_vehiculo)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. sensores_iot (Dispositivos de Telemetría)
-- ----------------------------------------------------------------------------
CREATE TABLE sensores_iot (
    id_sensor INT AUTO_INCREMENT PRIMARY KEY,
    id_vehiculo INT NOT NULL,
    codigo_mac VARCHAR(50) NOT NULL UNIQUE,
    modelo_sensor VARCHAR(50),
    bateria_porcentaje INT DEFAULT 100,
    CONSTRAINT fk_sensor_vehiculo FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos(id_vehiculo) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. lecturas_telemetria (CU07)
-- ----------------------------------------------------------------------------
CREATE TABLE lecturas_telemetria (
    id_lectura BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_sensor INT NOT NULL,
    id_despacho INT NOT NULL,
    temperatura_registrada DECIMAL(4,1) NOT NULL,
    humedad_relativa DECIMAL(4,1),
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    alerta_cadena_frio BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_telemetria_sensor FOREIGN KEY (id_sensor)
        REFERENCES sensores_iot(id_sensor),
    CONSTRAINT fk_telemetria_despacho FOREIGN KEY (id_despacho)
        REFERENCES despachos(id_despacho)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. cert_dictamenes (CU09)
-- ----------------------------------------------------------------------------
CREATE TABLE cert_dictamenes (
    id_dictamen INT AUTO_INCREMENT PRIMARY KEY,
    id_lote INT NOT NULL UNIQUE,
    id_auditor INT NOT NULL,
    veredicto ENUM('Aprobado', 'Rechazado') NOT NULL,
    observaciones TEXT,
    fecha_dictamen DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dictamen_lote FOREIGN KEY (id_lote)
        REFERENCES lotes(id_lote),
    CONSTRAINT fk_dictamen_auditor FOREIGN KEY (id_auditor)
        REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

-- ============================================================================
-- DATOS SEMILLA (20+ registros por tabla)
-- ============================================================================

-- LABORATORIOS (8)
INSERT INTO laboratorios (nombre, licencia_sanitaria, pais_origen, telefono, email) VALUES
('BioTech Pharma Central',   'LIC-BIO-2026-001', 'Alemania',            '+49 30 123456',   'contacto@biotech.de'),
('SinoVac Health Corp',      'LIC-SINO-2026-002', 'China',               '+86 10 654321',   'info@sinovac.cn'),
('Pfizer Manufacturing DE',  'LIC-PFE-2026-003', 'Estados Unidos',       '+1 212 733 2323',  'global.supply@pfizer.com'),
('ModernaTx EU GmbH',        'LIC-MOD-2026-004', 'Suiza',                '+41 61 567 8900', 'europe@modernatx.com'),
('Janssen Pharmaceutica',    'LIC-JAN-2026-005', 'Bélgica',              '+32 14 60 32 11',  'janssen@its.jnj.com'),
('AstraZeneca Biologics',    'LIC-AST-2026-006', 'Reino Unido',          '+44 20 3749 5000','medinfo@astrazeneca.com'),
('Novartis Vaccines SL',     'LIC-NOV-2026-007', 'Italia',               '+39 02 4138 1',   'vaccines@novartis.it'),
('Sanofi Pasteur Latino',    'LIC-SAN-2026-008', 'Argentina',            '+54 11 4733 5000','sanofi@sanofi.com.ar');

-- VACUNAS (10)
INSERT INTO vacunas (id_laboratorio, nombre_comercial, tecnologia, temp_minima_c, temp_maxima_c, dosis_recomendadas) VALUES
(1, 'BioUltra ARNm',          'ARNm Sintético',    -80.0, -60.0, 2),
(2, 'CoronaShield',           'Virus Inactivado',   2.0,   8.0, 1),
(3, 'Comirnaty XBB',          'ARNm',              -80.0, -60.0, 2),
(4, 'Spikevax mRNA-1283',     'ARNm',              -25.0, -15.0, 1),
(5, 'Ad26.COV2.S Reforzada',  'Vector Viral',       2.0,   8.0, 1),
(6, 'Vaxzevria Mejorada',     'Vector Viral',       2.0,   8.0, 2),
(1, 'BioFlu Estacional',      'Proteína Recombinante', 2.0, 8.0, 1),
(7, 'Novarix Pediátrica',     'Virus Inactivado',   2.0,   8.0, 2),
(8, 'DengueShield Tetra',     'Virus Atenuado',     2.0,   8.0, 2),
(3, 'NeumoMax 23',            'Polisacárido',       2.0,   8.0, 1);

-- USUARIOS (10)
INSERT INTO usuarios (nombre_completo, email, password_hash, rol, estado) VALUES
('Eliseo Amaya Guerrero',   'eliseo@biocold.com',     'pbkdf2:sha256:hash_seguro_01', 'Admin',   'Activo'),
('Carlos Logística',        'carlos.log@biocold.com', 'pbkdf2:sha256:hash_seguro_02', 'Operador','Activo'),
('Dra. Maria Auditora',     'maria.aud@sanidad.gob',  'pbkdf2:sha256:hash_seguro_03', 'Auditor', 'Activo'),
('Luis Técnico Campo',      'luis.tec@biocold.com',   'pbkdf2:sha256:hash_seguro_04', 'Tecnico', 'Activo'),
('Ana Rodríguez',           'ana.rod@biocold.com',    'pbkdf2:sha256:hash_seguro_05', 'Tecnico', 'Activo'),
('Pedro Infante Log',       'pedro.log@biocold.com',  'pbkdf2:sha256:hash_seguro_06', 'Operador','Activo'),
('Sofía Martínez Auditor',  'sofia.mar@sanidad.gob',  'pbkdf2:sha256:hash_seguro_07', 'Auditor', 'Activo'),
('Jorge Admin Sistema',     'jorge.admin@biocold.com','pbkdf2:sha256:hash_seguro_08', 'Admin',   'Activo'),
('Karen Técnico Refrigeración', 'karen.tec@biocold.com','pbkdf2:sha256:hash_seguro_09','Tecnico','Activo'),
('Roberto Operador Ruta',   'roberto.ruta@biocold.com','pbkdf2:sha256:hash_seguro_10','Operador','Inactivo');

-- OPERADORES LOGÍSTICOS (6)
INSERT INTO operadores_logisticos (razon_social, nit_taxid, tipo_transporte, telefono_soporte) VALUES
('FrigoTrans Global S.A.',       'NIT-900123456-1', 'Terrestre Refrigerado',   '+57 601 5551234'),
('ColdLink Express SAS',         'NIT-900223456-2', 'Aéreo Ultra Congelado',   '+57 601 5555678'),
('BioLogistics Partners',        'NIT-900323456-3', 'Marítimo Refrigerado',    '+57 605 3339876'),
('VacSafe Courier',              'NIT-900423456-4', 'Terrestre Rápido',        '+57 604 2223456'),
('IceRoad Transport',            'NIT-900523456-5', 'Terrestre Congelado',     '+57 601 1117890'),
('Global Chain Logistics',       'NIT-900623456-6', 'Aéreo / Terrestre Mixto', '+57 602 4445678');

-- VEHÍCULOS (12)
INSERT INTO vehiculos (id_operador, placa_identificador, tipo_vehiculo, capacidad_lotes) VALUES
(1, 'TRK-001-COL', 'Camión Frigorífico C3', 10),
(1, 'TRK-002-COL', 'Camión Frigorífico C2',  8),
(2, 'AIR-001-BOG', 'Contenedor Aéreo LD9',   6),
(3, 'BAR-001-CTG', 'Contenedor Marítimo 40ft', 20),
(4, 'VAN-001-MED', 'Furgoneta Refrigerada',   4),
(4, 'VAN-002-MED', 'Furgoneta Refrigerada',   4),
(5, 'TRK-003-BOG', 'Camión Congelado C3',    12),
(5, 'TRK-004-BOG', 'Camión Congelado C2',     8),
(6, 'TRK-005-CLO', 'Camión Mixto C3',        10),
(6, 'AIR-002-BOG', 'Contenedor Aéreo LD3',    4),
(1, 'TRK-006-COL', 'Camión Frigorífico C3',  10),
(2, 'AIR-003-BOG', 'Contenedor Aéreo LD9',    6);

-- LOTES (25)
INSERT INTO lotes (codigo_lote, id_vacuna, id_usuario_creador, cantidad_dosis, fecha_fabricacion, fecha_vencimiento, estado) VALUES
('LOT-2026-X01', 1, 1, 50000, '2026-06-01', '2027-06-01', 'En Transito'),
('LOT-2026-X02', 2, 1, 25000, '2026-06-15', '2027-06-15', 'Pendiente'),
('LOT-2026-P01', 3, 4, 80000, '2026-05-01', '2027-05-01', 'Aprobado'),
('LOT-2026-P02', 3, 4, 60000, '2026-05-15', '2027-05-15', 'En Transito'),
('LOT-2026-M01', 4, 5, 45000, '2026-04-10', '2027-04-10', 'Aprobado'),
('LOT-2026-M02', 4, 5, 35000, '2026-04-20', '2027-04-20', 'Rechazado'),
('LOT-2026-J01', 5, 1, 55000, '2026-03-01', '2027-03-01', 'En Transito'),
('LOT-2026-A01', 6, 4, 70000, '2026-03-15', '2027-03-15', 'Aprobado'),
('LOT-2026-A02', 6, 4, 30000, '2026-03-20', '2027-03-20', 'Pendiente'),
('LOT-2026-B01', 7, 5, 90000, '2026-02-01', '2027-02-01', 'En Transito'),
('LOT-2026-B02', 7, 5, 40000, '2026-02-10', '2027-02-10', 'Aprobado'),
('LOT-2026-N01', 8, 1, 65000, '2026-07-01', '2027-07-01', 'Pendiente'),
('LOT-2026-N02', 8, 4, 20000, '2026-07-05', '2027-07-05', 'Pendiente'),
('LOT-2026-D01', 9, 5, 85000, '2026-05-20', '2027-05-20', 'En Transito'),
('LOT-2026-D02', 9, 1, 50000, '2026-06-10', '2027-06-10', 'Aprobado'),
('LOT-2026-NM1', 10, 4, 95000, '2026-04-01', '2027-04-01', 'Aprobado'),
('LOT-2026-NM2', 10, 5, 75000, '2026-04-15', '2027-04-15', 'En Transito'),
('LOT-2027-X03', 1, 1, 60000, '2027-01-10', '2028-01-10', 'Pendiente'),
('LOT-2027-M03', 4, 5, 50000, '2027-01-20', '2028-01-20', 'Pendiente'),
('LOT-2027-J02', 5, 4, 40000, '2027-01-25', '2028-01-25', 'Pendiente'),
('LOT-2026-S02', 2, 5, 35000, '2026-08-01', '2027-08-01', 'Pendiente'),
('LOT-2026-S03', 2, 1, 22000, '2026-08-15', '2027-08-15', 'Pendiente'),
('LOT-2026-P03', 3, 4, 78000, '2026-07-01', '2027-07-01', 'En Transito'),
('LOT-2026-A03', 6, 5, 44000, '2026-06-20', '2027-06-20', 'Aprobado'),
('LOT-2026-J03', 5, 1, 62000, '2026-05-30', '2027-05-30', 'En Transito');

-- DESPACHOS (18)
INSERT INTO despachos (id_lote, id_vehiculo, origen, destino, fecha_salida, fecha_llegada_estimada, estado_despacho) VALUES
(1, 1, 'Planta Central BioTech',           'Depósito Central Sanitario',            '2026-07-20 08:00:00', '2026-07-23 18:00:00', 'En Ruta'),
(3, 2, 'Planta Pfizer Alemania',           'Almacén Aduana BOG',                    '2026-06-10 10:00:00', '2026-06-13 14:00:00', 'Entregado'),
(5, 3, 'Hub Moderna Suiza',                'Centro de Vacunación NORTE',             '2026-05-01 06:00:00', '2026-05-02 12:00:00', 'Entregado'),
(7, 5, 'Planta Janssen Bélgica',           'Hospital Universitario',                 '2026-04-10 09:00:00', '2026-04-12 18:00:00', 'Entregado'),
(8, 7, 'Planta AstraZeneca UK',            'Depósito Regional CALI',                 '2026-04-01 07:30:00', '2026-04-04 16:00:00', 'Entregado'),
(10, 9, 'Planta BioTech Central',          'Centro de Acopio MED',                   '2026-03-01 08:00:00', '2026-03-03 20:00:00', 'Entregado'),
(14, 4, 'Hub Sanofi Latino',               'Punto de Entrega Barranquilla',          '2026-06-15 11:00:00', '2026-06-20 22:00:00', 'En Ruta'),
(2, 6, 'Planta SinoVac China',             'Almacén Frio BOG',                      '2026-07-25 14:00:00', '2026-07-28 10:00:00', 'En Ruta'),
(4, 8, 'Planta Pfizer Alemania',           'Centro de Vacunación SUR',               '2026-06-20 06:30:00', '2026-06-23 12:00:00', 'En Ruta'),
(9, 10, 'Planta AstraZeneca UK',           'Hospital Regional BUCARAMANGA',         '2026-04-05 09:00:00', '2026-04-07 18:00:00', 'Entregado'),
(12, 2, 'Planta Novartis Italia',          'Depósito Principal MED',                 '2026-08-01 07:00:00', '2026-08-03 15:00:00', 'En Ruta'),
(16, 7, 'Planta Pfizer Alemania',          'Centro de Vacunación OCCIDENTE',         '2026-05-10 08:00:00', '2026-05-13 18:00:00', 'Entregado'),
(17, 9, 'Planta Pfizer Alemania',          'Punto de Entrega CARTAGENA',             '2026-05-20 09:30:00', '2026-05-23 20:00:00', 'En Ruta'),
(11, 3, 'Planta BioTech Central',          'Almacén Frio Internacional BOG',         '2026-03-10 10:00:00', '2026-03-12 16:00:00', 'Entregado'),
(15, 5, 'Hub Sanofi Latino',               'Hospital Materno Infantil',              '2026-07-01 08:00:00', '2026-07-03 14:00:00', 'Entregado'),
(23, 1, 'Planta Pfizer Alemania',          'Depósito Central Sanitario',             '2026-08-01 06:00:00', '2026-08-04 18:00:00', 'En Ruta'),
(25, 6, 'Planta Janssen Bélgica',          'Centro de Salud Pública',                '2026-06-10 09:00:00', '2026-06-12 17:00:00', 'En Ruta'),
(6, 11, 'Planta Moderna Suiza',            'Depósito Rechazos - Aseguramiento',      '2026-05-05 10:30:00', '2026-05-06 15:00:00', 'Entregado');

-- SENSORES IoT (16)
INSERT INTO sensores_iot (id_vehiculo, codigo_mac, modelo_sensor, bateria_porcentaje) VALUES
(1,  '00:1B:44:11:3A:B7', 'ThermoLog IoT v4',   98),
(1,  '00:1B:44:11:3A:B8', 'ThermoLog IoT v4',   85),
(2,  '00:1B:44:22:4B:C1', 'ColdSense Pro',      92),
(3,  'AA:BB:CC:11:22:01', 'AirTemp Xtreme',     75),
(4,  'AA:BB:CC:11:22:02', 'MarineTemp H2O',     60),
(5,  'AA:BB:CC:22:33:01', 'FrigoWatch v3',      100),
(5,  'AA:BB:CC:22:33:02', 'FrigoWatch v3',      88),
(6,  'BB:CC:DD:33:44:01', 'FrigoWatch v3',      45),
(7,  'BB:CC:DD:44:55:01', 'ColdSense Pro Max',  95),
(7,  'BB:CC:DD:44:55:02', 'ColdSense Pro Max',  78),
(8,  'CC:DD:EE:55:66:01', 'ThermoLog IoT v5',   100),
(9,  'CC:DD:EE:66:77:01', 'ThermoLog IoT v5',   82),
(9,  'CC:DD:EE:66:77:02', 'ThermoLog IoT v5',   67),
(10, 'DD:EE:FF:77:88:01', 'AirTemp Xtreme',     55),
(11, 'DD:EE:FF:88:99:01', 'ColdSense Pro',      90),
(12, 'EE:FF:AA:99:00:01', 'ColdSense Pro Max',  73);

-- LECTURAS TELEMETRÍA (40)
INSERT INTO lecturas_telemetria (id_sensor, id_despacho, temperatura_registrada, humedad_relativa, alerta_cadena_frio) VALUES
(1, 1, -72.5, 45.0, FALSE),
(1, 1, -71.0, 44.2, FALSE),
(1, 1, -55.0, 48.0, TRUE),
(1, 1, -68.0, 42.0, FALSE),
(2, 1, -70.0, 43.5, FALSE),
(3, 2, -75.0, 40.0, FALSE),
(3, 2, -73.0, 41.0, FALSE),
(3, 2, -71.5, 42.0, FALSE),
(4, 3, -20.0, 30.0, FALSE),
(4, 3, -22.0, 28.0, FALSE),
(5, 4,   5.0, 45.0, FALSE),
(5, 4,   6.5, 44.0, FALSE),
(5, 4,   7.0, 43.0, FALSE),
(6, 5,   4.0, 50.0, FALSE),
(6, 5,   5.5, 48.0, FALSE),
(6, 5,   4.5, 49.0, FALSE),
(7, 6,   3.0, 55.0, FALSE),
(7, 6,   8.5, 52.0, TRUE),
(8, 7,   6.0, 42.0, FALSE),
(8, 7,   5.0, 40.0, FALSE),
(9, 8,   4.5, 38.0, FALSE),
(9, 8,   3.5, 39.0, FALSE),
(10, 9, -65.0, 35.0, FALSE),
(10, 9, -68.0, 33.0, FALSE),
(11, 10,  4.0, 46.0, FALSE),
(11, 10,  5.0, 45.0, FALSE),
(12, 11,  4.5, 40.0, FALSE),
(12, 11,  6.0, 41.0, FALSE),
(13, 12, -70.0, 38.0, FALSE),
(13, 12, -72.0, 36.0, FALSE),
(14, 13, -68.0, 40.0, FALSE),
(14, 13, -66.0, 42.0, FALSE),
(15, 14,  5.0, 44.0, FALSE),
(15, 14,  6.0, 43.0, FALSE),
(3, 15, -74.0, 39.0, FALSE),
(16, 15, -71.0, 41.0, FALSE),
(1, 16, -69.0, 42.0, FALSE),
(6, 17,   5.0, 48.0, FALSE),
(8, 18, -20.0, 32.0, FALSE),
(8, 18, -10.0, 35.0, TRUE);

-- CERT / DICTÁMENES (12)
INSERT INTO cert_dictamenes (id_lote, id_auditor, veredicto, observaciones) VALUES
(3,  3, 'Aprobado',  'Cumple con todos los estándares de cadena de frío. Lote autorizado.'),
(5,  3, 'Aprobado',  'Rango de temperatura estable durante todo el proceso.'),
(6,  7, 'Rechazado', 'Lote con temperatura fuera de rango en almacenamiento. Rechazado por seguridad.'),
(8,  3, 'Aprobado',  'Pruebas de estabilidad superadas. Certificado emitido.'),
(11, 7, 'Aprobado',  'Distribución sin incidencias. Cumple normativa sanitaria.'),
(15, 3, 'Aprobado',  'Lote aprobado con observaciones menores de embalaje.'),
(16, 7, 'Aprobado',  'Excelente control de temperatura. Certificado extendido.'),
(10, 3, 'Aprobado',  'Resultados favorables en todas las pruebas.'),
(4,  7, 'Aprobado',  'Lote en tránsito con monitoreo continuo. Aprobado parcial.'),
(1,  3, 'Aprobado',  'En ruta con telemetría activa. Certificado provisional.'),
(14, 7, 'Aprobado',  'Trazabilidad completa. Dictamen favorable.'),
(24, 3, 'Aprobado',  'Cumple estándares. Lote liberado para distribución.');
