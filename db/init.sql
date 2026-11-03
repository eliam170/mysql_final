-- ============================================================================
-- TODO REPUESTOS Y FRENOS LA 61
-- Base de datos de repuestos para vehiculos livianos
-- Esquema normalizado + datos semilla (marcas, modelos, cilindrajes y repuestos)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS repuestos_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE repuestos_db;

-- ----------------------------------------------------------------------------
-- 1. marcas_vehiculo (marca del vehiculo)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS asesores;
DROP TABLE IF EXISTS repuesto_compatibilidad;
DROP TABLE IF EXISTS repuestos;
DROP TABLE IF EXISTS categorias_repuesto;
DROP TABLE IF EXISTS marcas_repuesto;
DROP TABLE IF EXISTS modelos_vehiculo;
DROP TABLE IF EXISTS marcas_vehiculo;

CREATE TABLE marcas_vehiculo (
    id_marca_vehiculo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    pais_origen VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. modelos_vehiculo (modelo + cilindraje del vehiculo)
-- ----------------------------------------------------------------------------
CREATE TABLE modelos_vehiculo (
    id_modelo INT AUTO_INCREMENT PRIMARY KEY,
    id_marca_vehiculo INT NOT NULL,
    nombre VARCHAR(60) NOT NULL,
    cilindraje DECIMAL(2,1) NOT NULL,
    anio_inicio INT,
    anio_fin INT,
    CONSTRAINT fk_modelo_marca FOREIGN KEY (id_marca_vehiculo)
        REFERENCES marcas_vehiculo(id_marca_vehiculo) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. marcas_repuesto (marca o fabricante del repuesto)
-- ----------------------------------------------------------------------------
CREATE TABLE marcas_repuesto (
    id_marca_repuesto INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE,
    pais_origen VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. categorias_repuesto
-- ----------------------------------------------------------------------------
CREATE TABLE categorias_repuesto (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE,
    descripcion VARCHAR(150)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. repuestos (productos en venta)
-- ----------------------------------------------------------------------------
CREATE TABLE repuestos (
    id_repuesto INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    id_categoria INT NOT NULL,
    id_marca_repuesto INT NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    descripcion VARCHAR(255),
    imagen VARCHAR(255),
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rep_stock (stock),
    INDEX idx_rep_categoria (id_categoria, id_repuesto),
    INDEX idx_rep_marca_rep (id_marca_repuesto, id_repuesto),
    FULLTEXT KEY ft_repuestos (nombre, descripcion),
    CONSTRAINT fk_repuesto_categoria FOREIGN KEY (id_categoria)
        REFERENCES categorias_repuesto(id_categoria),
    CONSTRAINT fk_repuesto_marca FOREIGN KEY (id_marca_repuesto)
        REFERENCES marcas_repuesto(id_marca_repuesto)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. repuesto_compatibilidad (que repuesto sirve para que modelo)
-- ----------------------------------------------------------------------------
CREATE TABLE repuesto_compatibilidad (
    id_repuesto INT NOT NULL,
    id_modelo INT NOT NULL,
    PRIMARY KEY (id_repuesto, id_modelo),
    INDEX idx_compat_modelo_rep (id_modelo, id_repuesto),
    CONSTRAINT fk_compat_repuesto FOREIGN KEY (id_repuesto)
        REFERENCES repuestos(id_repuesto) ON DELETE CASCADE,
    CONSTRAINT fk_compat_modelo FOREIGN KEY (id_modelo)
        REFERENCES modelos_vehiculo(id_modelo) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. asesores (asesores comerciales para contacto por WhatsApp)
-- ----------------------------------------------------------------------------
CREATE TABLE asesores (
    id_asesor INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    cargo VARCHAR(60),
    telefono VARCHAR(20) NOT NULL,
    correo VARCHAR(100),
    activo TINYINT(1) NOT NULL DEFAULT 1,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================================
-- DATOS SEMILLA
-- ============================================================================

-- ASESORES COMERCIALES (8)
INSERT INTO asesores (nombre, cargo, telefono, correo, activo) VALUES
('Carlos Ramírez',  'Asesor de repuestos',   '573001112233', 'carlos@repuestosla61.com', 1),
('Laura Gómez',     'Asesora de frenos',     '573002223344', 'laura@repuestosla61.com',  1),
('Andrés Torres',   'Asesor comercial',      '573003334455', 'andres@repuestosla61.com', 1),
('Diana Herrera',   'Asesora de motores',    '573004445566', 'diana@repuestosla61.com',  1),
('Jorge Peña',      'Asesor de suspensión',  '573005556677', 'jorge@repuestosla61.com',  1),
('Marcela Ruiz',    'Asesora de filtros',    '573006667788', 'marcela@repuestosla61.com',1),
('Felipe Castro',   'Asesor eléctrico',      '573007778899', 'felipe@repuestosla61.com', 1),
('Sofía Mendoza',   'Servicio al cliente',   '573008889900', 'sofia@repuestosla61.com',  1);

-- MARCAS DE VEHICULO (12)
INSERT INTO marcas_vehiculo (nombre, pais_origen) VALUES
('Chevrolet',   'Estados Unidos'),
('Renault',     'Francia'),
('Kia',         'Corea del Sur'),
('Hyundai',     'Corea del Sur'),
('Mazda',       'Japon'),
('Nissan',      'Japon'),
('Suzuki',      'Japon'),
('Volkswagen',  'Alemania'),
('Ford',        'Estados Unidos'),
('Toyota',      'Japon'),
('Fiat',        'Italia'),
('Mitsubishi',  'Japon');

-- MODELOS DE VEHICULO (65) con cilindraje
INSERT INTO modelos_vehiculo (id_marca_vehiculo, nombre, cilindraje, anio_inicio, anio_fin) VALUES
(1,  'Spark',        1.0, 2010, 2024),
(1,  'Spark',        1.2, 2010, 2024),
(1,  'Spark GT',     1.2, 2013, 2022),
(1,  'Aveo',         1.4, 2008, 2018),
(1,  'Aveo',         1.6, 2008, 2018),
(1,  'Sail',         1.4, 2012, 2020),
(1,  'Corsa',        1.4, 2002, 2012),
(1,  'Corsa',        1.6, 2002, 2012),
(1,  'Optra',        1.6, 2005, 2012),
(1,  'Optra',        1.8, 2005, 2012),
(2,  'Logan',        1.4, 2010, 2024),
(2,  'Logan',        1.6, 2010, 2024),
(2,  'Sandero',      1.4, 2010, 2024),
(2,  'Sandero',      1.6, 2010, 2024),
(2,  'Stepway',      1.6, 2012, 2024),
(2,  'Clio',         1.2, 2005, 2014),
(2,  'Clio',         1.4, 2005, 2014),
(2,  'Twingo',       1.2, 2005, 2016),
(2,  'Duster',       1.6, 2012, 2024),
(3,  'Picanto',      1.0, 2008, 2024),
(3,  'Picanto',      1.2, 2008, 2024),
(3,  'Rio',          1.4, 2010, 2023),
(3,  'Rio',          1.6, 2010, 2023),
(3,  'Cerato',       1.6, 2010, 2022),
(3,  'Cerato',       2.0, 2010, 2022),
(4,  'i10',          1.0, 2012, 2019),
(4,  'i10',          1.2, 2012, 2019),
(4,  'Grand i10',    1.2, 2015, 2024),
(4,  'Accent',       1.4, 2012, 2022),
(4,  'Accent',       1.6, 2012, 2022),
(4,  'Getz',         1.4, 2006, 2011),
(4,  'Getz',         1.6, 2006, 2011),
(5,  'Mazda 2',      1.3, 2010, 2020),
(5,  'Mazda 2',      1.5, 2010, 2020),
(5,  'Mazda 3',      1.6, 2010, 2020),
(5,  'Mazda 3',      2.0, 2010, 2020),
(6,  'March',        1.6, 2012, 2022),
(6,  'Versa',        1.6, 2012, 2023),
(6,  'Sentra',       1.8, 2012, 2022),
(6,  'Sentra',       2.0, 2012, 2022),
(6,  'X-Trail',      2.0, 2012, 2022),
(7,  'Alto',         0.8, 2008, 2015),
(7,  'Swift',        1.2, 2012, 2023),
(7,  'Swift',        1.4, 2012, 2023),
(7,  'SX4',          1.6, 2008, 2016),
(7,  'Grand Vitara', 2.0, 2008, 2018),
(8,  'Gol',          1.6, 2012, 2022),
(8,  'Voyage',       1.6, 2012, 2022),
(8,  'Fox',          1.6, 2010, 2019),
(8,  'Jetta',        2.0, 2012, 2023),
(9,  'Fiesta',       1.6, 2011, 2019),
(9,  'Focus',        1.6, 2012, 2018),
(9,  'Focus',        2.0, 2012, 2018),
(9,  'Escape',       2.0, 2013, 2020),
(10, 'Yaris',        1.3, 2012, 2022),
(10, 'Yaris',        1.5, 2012, 2022),
(10, 'Corolla',      1.8, 2012, 2023),
(10, 'RAV4',         2.0, 2012, 2023),
(11, 'Uno',          1.0, 2005, 2014),
(11, 'Uno',          1.4, 2005, 2014),
(11, 'Palio',        1.4, 2005, 2016),
(11, 'Palio',        1.6, 2005, 2016),
(12, 'Lancer',       1.6, 2010, 2018),
(12, 'Lancer',       2.0, 2010, 2018),
(12, 'Montero',      2.4, 2008, 2018);

-- MARCAS DE REPUESTO (17)
INSERT INTO marcas_repuesto (nombre, pais_origen) VALUES
('Bosch',          'Alemania'),
('Brembo',         'Italia'),
('Ferodo',         'Reino Unido'),
('TRW',            'Alemania'),
('Monroe',         'Estados Unidos'),
('KYB',            'Japon'),
('Sachs',          'Alemania'),
('NGK',            'Japon'),
('Denso',          'Japon'),
('Mann Filter',    'Alemania'),
('Wix',            'Estados Unidos'),
('Gates',          'Estados Unidos'),
('Valeo',          'Francia'),
('Genuine OEM',    'Original'),
('Aisin',          'Japon'),
('SKF',            'Suecia'),
('Mobil',          'Estados Unidos');

-- CATEGORIAS DE REPUESTO (8)
INSERT INTO categorias_repuesto (nombre, descripcion) VALUES
('Frenos',      'Pastillas, discos, campanas y liquido de frenos'),
('Filtros',     'Filtros de aceite, aire, combustible y cabina'),
('Suspension',  'Amortiguadores, rotulas, bujes y resortes'),
('Motor',       'Correas, bombas, empaques y lubricantes'),
('Encendido',   'Bujias, bobinas, cables y sensores'),
('Transmision', 'Embrague, discos y sincronizacion de caja'),
('Electrico',   'Baterias, alternadores y arranques'),
('Direccion',   'Terminales, cremalleras y sistema de direccion');

-- REPUESTOS (48)  -- la columna imagen se rellena por categoria al final del archivo
INSERT INTO repuestos (codigo, nombre, id_categoria, id_marca_repuesto, precio, stock, descripcion) VALUES
('FR-1001', 'Pastillas de freno delanteras',        1, 1,  120000, 40,  'Juego de 4 pastillas semimetalicas para eje delantero'),
('FR-1002', 'Pastillas de freno traseras',          1, 3,  95000,  35,  'Juego de 4 pastillas para eje trasero'),
('FR-1003', 'Discos de freno delanteros',           1, 2,  210000, 20,  'Par de discos ventilados de alta durabilidad'),
('FR-1004', 'Discos de freno ventilados premium',   1, 2,  265000, 15,  'Par de discos perforados para alto rendimiento'),
('FR-1005', 'Campanas de freno traseras',           1, 4,  145000, 18,  'Campana de freno trasero en hierro fundido'),
('FR-1006', 'Bandas de freno traseras',             1, 3,  88000,  30,  'Juego de bandas para sistema de tambor'),
('FR-1007', 'Liquido de frenos DOT 4',              1, 1,  32000,  100, 'Liquido de frenos sintetico presentacion 500 ml'),
('FR-1008', 'Cilindro maestro de frenos',           1, 4,  185000, 12,  'Cilindro maestro con deposito incluido'),
('FR-1009', 'Kit de pastillas ceramicas premium',   1, 2,  175000, 25,  'Pastillas ceramicas de baja pulverulencia'),
('FR-1010', 'Sensor ABS delantero',                 1, 1,  145000, 16,  'Sensor de velocidad de rueda para sistema ABS'),
('FI-2001', 'Filtro de aceite',                     2, 10, 28000,  120, 'Filtro de aceite de alto flujo'),
('FI-2002', 'Filtro de aire',                       2, 11, 42000,  90,  'Filtro de aire para motor'),
('FI-2003', 'Filtro de combustible',                2, 1,  55000,  70,  'Filtro de combustible en linea'),
('FI-2004', 'Filtro de cabina antipolen',           2, 10, 48000,  60,  'Filtro de aire acondicionado con carbon activo'),
('FI-2005', 'Filtro de aire deportivo alto flujo',  2, 11, 89000,  30,  'Filtro lavable de alto rendimiento'),
('FI-2006', 'Filtro de aceite premium',             2, 1,  45000,  80,  'Filtro de aceite sintetico premium'),
('SU-3001', 'Amortiguador delantero',               3, 5,  235000, 16,  'Amortiguador hidraulico delantero por unidad'),
('SU-3002', 'Amortiguador trasero',                 3, 5,  195000, 18,  'Amortiguador hidraulico trasero por unidad'),
('SU-3003', 'Amortiguador delantero a gas',         3, 6,  280000, 14,  'Amortiguador presurizado con nitrogeno'),
('SU-3004', 'Rotula inferior de suspension',        3, 4,  75000,  40,  'Rotula inferior reforzada'),
('SU-3005', 'Terminal de direccion',                8, 4,  68000,  45,  'Terminal exterior de direccion'),
('SU-3006', 'Bujes de barra estabilizadora',        3, 16, 35000,  55,  'Kit de bujes de caucho para barra estabilizadora'),
('SU-3007', 'Resortes helicoidales delanteros',     3, 7,  320000, 10,  'Par de resortes helicoidales delanteros'),
('SU-3008', 'Bujes de suspension (kit)',            3, 16, 78000,  35,  'Kit de bujes de suspension delantera'),
('MO-4001', 'Bujias estandar (juego x4)',           5, 8,  18000,  200, 'Juego de 4 bujias de niquel'),
('MO-4002', 'Bujias de iridio (juego x4)',          5, 8,  42000,  120, 'Juego de 4 bujias de iridio de larga duracion'),
('MO-4003', 'Bujias de platino (juego x4)',         5, 9,  38000,  90,  'Juego de 4 bujias de platino'),
('MO-4004', 'Cables de bujias',                     5, 1,  65000,  40,  'Juego de cables de encendido de silicona'),
('MO-4005', 'Bobina de encendido',                  5, 9,  155000, 22,  'Bobina de encendido electronica'),
('MO-4006', 'Correa de distribucion',               4, 12, 125000, 30,  'Correa de distribucion de alta resistencia'),
('MO-4007', 'Kit de correa de distribucion',        4, 12, 340000, 12,  'Kit completo con tensor y rodillo'),
('MO-4008', 'Bomba de agua',                        4, 15, 210000, 16,  'Bomba de agua con empaque'),
('MO-4009', 'Bomba de aceite',                      4, 15, 240000, 10,  'Bomba de aceite de motor'),
('MO-4010', 'Empaque de culata',                    4, 14, 95000,  25,  'Empaque metalico de culata'),
('MO-4011', 'Bomba de combustible',                 4, 1,  265000, 14,  'Bomba electrica de combustible'),
('MO-4012', 'Aceite de motor 20W-50 (galon)',       4, 17, 85000,  100, 'Aceite mineral para motor 20W-50'),
('TR-5001', 'Kit de embrague completo',             6, 7,  420000, 10,  'Kit con disco, plato y collarin'),
('TR-5002', 'Disco de embrague',                    6, 7,  185000, 15,  'Disco de embrague reforzado'),
('TR-5003', 'Collarin de embrague',                 6, 16, 120000, 18,  'Rodamiento de empuje de embrague'),
('TR-5004', 'Kit de sincronizacion de caja',        6, 15, 380000, 8,   'Kit de sincronizacion de transmision'),
('EL-6001', 'Bateria 12V 550A',                     7, 1,  380000, 20,  'Bateria libre de mantenimiento 550 amperios'),
('EL-6002', 'Bateria 12V 650A',                     7, 1,  450000, 15,  'Bateria libre de mantenimiento 650 amperios'),
('EL-6003', 'Alternador',                           7, 13, 520000, 8,   'Alternador 12V remanufacturado'),
('EL-6004', 'Motor de arranque',                    7, 9,  480000, 9,   'Motor de arranque 12V'),
('EL-6005', 'Faro delantero',                       7, 13, 290000, 12,  'Faro delantero con lente halogeno'),
('EL-6006', 'Sensor de oxigeno',                    5, 1,  175000, 18,  'Sonda lambda de 4 cables'),
('EL-6007', 'Bomba de limpiaparabrisas',            7, 13, 85000,  20,  'Bomba de agua limpiaparabrisas'),
('DI-7001', 'Cremallera de direccion',              8, 4,  620000, 5,   'Cremallera de direccion hidraulica');

-- IMAGEN POR DEFECTO SEGUN LA CATEGORIA (rutas servidas desde /public/img)
UPDATE repuestos SET imagen = '/img/frenos.jpg'     WHERE id_categoria = 1;
UPDATE repuestos SET imagen = '/img/filtros.jpg'    WHERE id_categoria = 2;
UPDATE repuestos SET imagen = '/img/suspension.jpg' WHERE id_categoria = 3;
UPDATE repuestos SET imagen = '/img/motor.jpg'      WHERE id_categoria = 4;
UPDATE repuestos SET imagen = '/img/encendido.jpg'  WHERE id_categoria = 5;
UPDATE repuestos SET imagen = '/img/transmision.jpg' WHERE id_categoria = 6;
UPDATE repuestos SET imagen = '/img/electrico.jpg'  WHERE id_categoria = 7;
UPDATE repuestos SET imagen = '/img/direccion.jpg'  WHERE id_categoria = 8;

-- COMPATIBILIDAD REPUESTO <-> MODELO DE VEHICULO
INSERT INTO repuesto_compatibilidad (id_repuesto, id_modelo) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
(1, 11), (1, 12), (1, 13), (1, 14), (1, 16), (1, 17), (1, 20), (1, 21),
(1, 22), (1, 23), (1, 26), (1, 27), (1, 28), (2, 1), (2, 2), (2, 3),
(2, 4), (2, 5), (2, 6), (2, 11), (2, 12), (2, 13), (2, 14), (2, 20),
(2, 21), (2, 26), (2, 27), (2, 28), (2, 37), (2, 43), (2, 44), (2, 45),
(3, 5), (3, 9), (3, 12), (3, 14), (3, 23), (3, 30), (3, 35), (3, 36),
(3, 57), (4, 9), (4, 10), (4, 24), (4, 25), (4, 36), (4, 40), (4, 41),
(4, 52), (4, 53), (5, 1), (5, 2), (5, 3), (5, 4), (5, 5), (5, 6),
(5, 11), (5, 12), (5, 13), (5, 14), (5, 20), (5, 21), (6, 1), (6, 2),
(6, 20), (6, 21), (6, 42), (6, 59), (6, 60), (7, 1), (7, 2), (7, 3),
(7, 4), (7, 5), (7, 6), (7, 7), (7, 8), (7, 9), (7, 10), (7, 11),
(7, 12), (7, 13), (7, 14), (7, 15), (7, 16), (7, 17), (7, 18), (7, 19),
(7, 20), (7, 21), (7, 22), (7, 23), (7, 24), (7, 25), (7, 26), (7, 27),
(7, 28), (7, 29), (7, 30), (7, 31), (7, 32), (7, 33), (7, 34), (7, 35),
(7, 36), (7, 37), (7, 38), (7, 39), (7, 40), (7, 41), (7, 42), (7, 43),
(7, 44), (7, 45), (7, 46), (7, 47), (7, 48), (7, 49), (7, 50), (7, 51),
(7, 52), (7, 53), (7, 54), (7, 55), (7, 56), (7, 57), (7, 58), (7, 59),
(7, 60), (7, 61), (7, 62), (7, 63), (7, 64), (7, 65), (8, 4), (8, 5),
(8, 7), (8, 8), (8, 11), (8, 12), (8, 13), (8, 14), (8, 29), (8, 30),
(9, 33), (9, 34), (9, 35), (9, 36), (9, 50), (9, 52), (9, 53), (9, 57),
(10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (10, 6), (10, 7), (10, 8),
(10, 9), (10, 10), (10, 11), (10, 12), (10, 13), (10, 14), (10, 15), (10, 16),
(10, 17), (10, 18), (10, 19), (10, 20), (10, 21), (10, 22), (10, 23), (10, 24),
(10, 25), (10, 26), (10, 27), (10, 28), (10, 29), (10, 30), (10, 31), (10, 32),
(10, 33), (10, 34), (10, 35), (10, 36), (10, 37), (10, 38), (10, 39), (10, 40),
(10, 41), (10, 42), (10, 43), (10, 44), (10, 45), (10, 46), (10, 47), (10, 48),
(10, 49), (10, 50), (10, 51), (10, 52), (10, 53), (10, 54), (10, 55), (10, 56),
(10, 57), (10, 58), (10, 59), (10, 60), (10, 61), (10, 62), (10, 63), (10, 64),
(10, 65), (11, 1), (11, 2), (11, 3), (11, 4), (11, 5), (11, 6), (11, 7),
(11, 8), (11, 9), (11, 10), (11, 11), (11, 12), (11, 13), (11, 14), (11, 15),
(11, 16), (11, 17), (11, 18), (11, 19), (11, 20), (11, 21), (11, 22), (11, 23),
(11, 24), (11, 25), (11, 26), (11, 27), (11, 28), (11, 29), (11, 30), (11, 31),
(11, 32), (11, 33), (11, 34), (11, 35), (11, 36), (11, 37), (11, 38), (11, 39),
(11, 40), (11, 41), (11, 42), (11, 43), (11, 44), (11, 45), (11, 46), (11, 47),
(11, 48), (11, 49), (11, 50), (11, 51), (11, 52), (11, 53), (11, 54), (11, 55),
(11, 56), (11, 57), (11, 58), (11, 59), (11, 60), (11, 61), (11, 62), (11, 63),
(11, 64), (11, 65), (12, 1), (12, 2), (12, 3), (12, 4), (12, 5), (12, 6),
(12, 7), (12, 8), (12, 11), (12, 12), (12, 13), (12, 14), (12, 20), (12, 21),
(12, 22), (12, 23), (12, 26), (12, 27), (12, 28), (12, 29), (12, 30), (12, 47),
(12, 48), (12, 49), (12, 51), (12, 52), (12, 55), (12, 56), (12, 57), (12, 59),
(12, 60), (12, 61), (13, 1), (13, 2), (13, 3), (13, 4), (13, 5), (13, 6),
(13, 7), (13, 8), (13, 9), (13, 10), (13, 11), (13, 12), (13, 13), (13, 14),
(13, 15), (13, 16), (13, 17), (13, 18), (13, 19), (13, 20), (13, 21), (13, 22),
(13, 23), (13, 24), (13, 25), (13, 26), (13, 27), (13, 28), (13, 29), (13, 30),
(13, 31), (13, 32), (13, 33), (13, 34), (13, 35), (13, 36), (13, 37), (13, 38),
(13, 39), (13, 40), (13, 41), (13, 42), (13, 43), (13, 44), (13, 45), (13, 46),
(13, 47), (13, 48), (13, 49), (13, 50), (13, 51), (13, 52), (13, 53), (13, 54),
(13, 55), (13, 56), (13, 57), (13, 58), (13, 59), (13, 60), (13, 61), (13, 62),
(13, 63), (13, 64), (13, 65), (14, 4), (14, 5), (14, 6), (14, 11), (14, 12),
(14, 13), (14, 14), (14, 22), (14, 23), (14, 29), (14, 30), (14, 33), (14, 34),
(14, 35), (14, 43), (14, 44), (14, 47), (14, 48), (14, 55), (14, 56), (15, 1),
(15, 2), (15, 3), (15, 4), (15, 5), (15, 6), (15, 7), (15, 8), (15, 11),
(15, 12), (15, 13), (15, 14), (15, 16), (15, 17), (15, 18), (15, 20), (15, 21),
(15, 22), (15, 23), (15, 26), (15, 27), (15, 28), (15, 29), (15, 30), (15, 33),
(15, 34), (15, 37), (15, 38), (15, 43), (15, 44), (15, 47), (15, 48), (15, 55),
(15, 56), (16, 1), (16, 2), (16, 3), (16, 4), (16, 5), (16, 6), (16, 7),
(16, 8), (16, 11), (16, 12), (16, 13), (16, 14), (16, 16), (16, 17), (16, 18),
(16, 20), (16, 21), (16, 26), (16, 27), (16, 28), (16, 33), (16, 34), (16, 37),
(16, 38), (16, 43), (16, 44), (16, 47), (16, 48), (17, 5), (17, 9), (17, 10),
(17, 15), (17, 19), (17, 24), (17, 25), (17, 36), (17, 40), (17, 41), (17, 53),
(17, 54), (17, 58), (18, 1), (18, 2), (18, 3), (18, 4), (18, 5), (18, 6),
(18, 9), (18, 11), (18, 12), (18, 13), (18, 14), (18, 16), (18, 17), (18, 20),
(18, 21), (18, 22), (18, 23), (18, 26), (18, 27), (18, 28), (18, 29), (18, 30),
(18, 33), (18, 34), (18, 37), (18, 38), (18, 43), (18, 44), (19, 1), (19, 2),
(19, 3), (19, 4), (19, 5), (19, 6), (19, 11), (19, 12), (19, 13), (19, 14),
(19, 20), (19, 21), (19, 22), (19, 23), (19, 26), (19, 27), (19, 28), (19, 29),
(19, 30), (19, 33), (19, 34), (19, 37), (19, 38), (19, 43), (19, 44), (19, 47),
(19, 48), (19, 55), (19, 56), (19, 59), (19, 60), (20, 1), (20, 2), (20, 3),
(20, 4), (20, 5), (20, 6), (20, 11), (20, 12), (20, 13), (20, 14), (20, 20),
(20, 21), (20, 22), (20, 23), (20, 26), (20, 27), (20, 28), (20, 33), (20, 34),
(20, 37), (20, 38), (20, 43), (20, 44), (20, 47), (20, 48), (20, 55), (20, 56),
(20, 59), (20, 60), (20, 61), (21, 5), (21, 9), (21, 15), (21, 19), (21, 24),
(21, 36), (21, 41), (21, 53), (21, 58), (22, 1), (22, 2), (22, 3), (22, 4),
(22, 5), (22, 6), (22, 7), (22, 8), (22, 9), (22, 10), (22, 11), (22, 12),
(22, 13), (22, 14), (22, 15), (22, 16), (22, 17), (22, 18), (22, 19), (22, 20),
(22, 21), (22, 22), (22, 23), (22, 24), (22, 25), (22, 26), (22, 27), (22, 28),
(22, 29), (22, 30), (22, 31), (22, 32), (22, 33), (22, 34), (22, 35), (22, 36),
(22, 37), (22, 38), (22, 39), (22, 40), (22, 41), (22, 42), (22, 43), (22, 44),
(22, 45), (22, 46), (22, 47), (22, 48), (22, 49), (22, 50), (22, 51), (22, 52),
(22, 53), (22, 54), (22, 55), (22, 56), (22, 57), (22, 58), (22, 59), (22, 60),
(22, 61), (22, 62), (22, 63), (22, 64), (22, 65), (23, 1), (23, 2), (23, 3),
(23, 4), (23, 5), (23, 6), (23, 7), (23, 8), (23, 9), (23, 10), (23, 11),
(23, 12), (23, 13), (23, 14), (23, 15), (23, 16), (23, 17), (23, 18), (23, 19),
(23, 20), (23, 21), (23, 22), (23, 23), (23, 24), (23, 25), (23, 26), (23, 27),
(23, 28), (23, 29), (23, 30), (23, 31), (23, 32), (23, 33), (23, 34), (23, 35),
(23, 36), (23, 37), (23, 38), (23, 39), (23, 40), (23, 41), (23, 42), (23, 43),
(23, 44), (23, 45), (23, 46), (23, 47), (23, 48), (23, 49), (23, 50), (23, 51),
(23, 52), (23, 53), (23, 54), (23, 55), (23, 56), (23, 57), (23, 58), (23, 59),
(23, 60), (23, 61), (23, 62), (23, 63), (23, 64), (23, 65), (24, 5), (24, 9),
(24, 10), (24, 15), (24, 19), (24, 23), (24, 24), (24, 30), (24, 31), (24, 32),
(24, 35), (24, 36), (24, 39), (24, 40), (24, 49), (24, 50), (24, 52), (24, 53),
(24, 57), (24, 58), (24, 63), (24, 64), (25, 1), (25, 2), (25, 3), (25, 4),
(25, 5), (25, 6), (25, 7), (25, 8), (25, 11), (25, 12), (25, 13), (25, 14),
(25, 16), (25, 17), (25, 20), (25, 21), (25, 22), (25, 23), (25, 26), (25, 27),
(25, 28), (25, 29), (25, 30), (25, 31), (25, 32), (25, 33), (25, 34), (25, 35),
(25, 43), (25, 44), (25, 47), (25, 48), (25, 49), (25, 55), (25, 56), (25, 57),
(25, 59), (25, 60), (25, 61), (25, 62), (26, 1), (26, 2), (26, 3), (26, 4),
(26, 5), (26, 6), (26, 11), (26, 12), (26, 13), (26, 14), (26, 16), (26, 17),
(26, 20), (26, 21), (26, 22), (26, 23), (26, 26), (26, 27), (26, 28), (26, 29),
(26, 30), (26, 31), (26, 32), (26, 33), (26, 34), (26, 35), (26, 43), (26, 44),
(26, 47), (26, 48), (26, 51), (26, 52), (26, 55), (26, 56), (26, 57), (26, 59),
(26, 60), (26, 61), (26, 62), (27, 4), (27, 5), (27, 6), (27, 11), (27, 12),
(27, 13), (27, 14), (27, 22), (27, 23), (27, 29), (27, 30), (27, 31), (27, 32),
(27, 35), (27, 47), (27, 48), (27, 49), (27, 51), (27, 52), (27, 55), (27, 56),
(27, 57), (27, 61), (27, 62), (27, 63), (27, 64), (28, 5), (28, 9), (28, 10),
(28, 15), (28, 19), (28, 24), (28, 25), (28, 30), (28, 36), (28, 40), (28, 41),
(28, 50), (28, 53), (28, 54), (28, 58), (28, 64), (29, 1), (29, 2), (29, 3),
(29, 4), (29, 5), (29, 6), (29, 11), (29, 12), (29, 13), (29, 14), (29, 16),
(29, 17), (29, 20), (29, 21), (29, 22), (29, 23), (29, 26), (29, 27), (29, 28),
(29, 29), (29, 30), (29, 31), (29, 32), (29, 33), (29, 34), (29, 37), (29, 38),
(29, 43), (29, 44), (29, 47), (29, 48), (29, 55), (29, 56), (29, 57), (29, 59),
(29, 60), (29, 61), (29, 62), (30, 4), (30, 5), (30, 6), (30, 7), (30, 8),
(30, 11), (30, 12), (30, 13), (30, 14), (30, 22), (30, 23), (30, 29), (30, 30),
(30, 31), (30, 32), (30, 35), (30, 47), (30, 48), (30, 49), (30, 55), (30, 56),
(30, 57), (30, 61), (30, 62), (31, 5), (31, 9), (31, 10), (31, 15), (31, 19),
(31, 24), (31, 25), (31, 30), (31, 36), (31, 40), (31, 41), (31, 50), (31, 53),
(31, 54), (31, 58), (31, 63), (31, 64), (31, 65), (32, 1), (32, 2), (32, 3),
(32, 4), (32, 5), (32, 6), (32, 7), (32, 8), (32, 11), (32, 12), (32, 13),
(32, 14), (32, 16), (32, 17), (32, 20), (32, 21), (32, 22), (32, 23), (32, 26),
(32, 27), (32, 28), (32, 29), (32, 30), (32, 31), (32, 32), (32, 33), (32, 34),
(32, 35), (32, 43), (32, 44), (32, 45), (32, 47), (32, 48), (32, 49), (32, 51),
(32, 52), (32, 55), (32, 56), (32, 57), (32, 59), (32, 60), (32, 61), (32, 62),
(33, 4), (33, 5), (33, 6), (33, 11), (33, 12), (33, 13), (33, 14), (33, 22),
(33, 23), (33, 29), (33, 30), (33, 35), (33, 43), (33, 44), (33, 47), (33, 48),
(33, 51), (33, 52), (33, 55), (33, 56), (33, 57), (33, 61), (34, 4), (34, 5),
(34, 6), (34, 11), (34, 12), (34, 13), (34, 14), (34, 22), (34, 23), (34, 29),
(34, 30), (34, 35), (34, 43), (34, 44), (34, 47), (34, 48), (34, 51), (34, 52),
(34, 55), (34, 56), (34, 57), (34, 61), (35, 4), (35, 5), (35, 6), (35, 11),
(35, 12), (35, 13), (35, 14), (35, 29), (35, 30), (35, 31), (35, 32), (35, 35),
(35, 36), (35, 47), (35, 48), (35, 49), (35, 51), (35, 52), (35, 55), (35, 56),
(35, 57), (35, 61), (35, 62), (36, 9), (36, 10), (36, 24), (36, 25), (36, 36),
(36, 40), (36, 41), (36, 50), (36, 53), (36, 54), (36, 58), (36, 64), (36, 65),
(37, 1), (37, 2), (37, 3), (37, 4), (37, 5), (37, 6), (37, 7), (37, 8),
(37, 9), (37, 10), (37, 11), (37, 12), (37, 13), (37, 14), (37, 15), (37, 16),
(37, 17), (37, 18), (37, 19), (37, 20), (37, 21), (37, 22), (37, 23), (37, 24),
(37, 25), (37, 26), (37, 27), (37, 28), (37, 29), (37, 30), (37, 31), (37, 32),
(37, 33), (37, 34), (37, 35), (37, 36), (37, 37), (37, 38), (37, 39), (37, 40),
(37, 41), (37, 42), (37, 43), (37, 44), (37, 45), (37, 46), (37, 47), (37, 48),
(37, 49), (37, 50), (37, 51), (37, 52), (37, 53), (37, 54), (37, 55), (37, 56),
(37, 57), (37, 58), (37, 59), (37, 60), (37, 61), (37, 62), (37, 63), (37, 64),
(37, 65), (38, 1), (38, 2), (38, 3), (38, 4), (38, 5), (38, 6), (38, 11),
(38, 12), (38, 13), (38, 14), (38, 16), (38, 17), (38, 20), (38, 21), (38, 22),
(38, 23), (38, 26), (38, 27), (38, 28), (38, 29), (38, 30), (38, 33), (38, 34),
(38, 35), (38, 43), (38, 44), (38, 47), (38, 48), (38, 49), (38, 55), (38, 56),
(38, 57), (38, 59), (38, 60), (38, 61), (38, 62), (39, 5), (39, 9), (39, 10),
(39, 15), (39, 19), (39, 24), (39, 25), (39, 30), (39, 36), (39, 40), (39, 41),
(39, 50), (39, 53), (39, 54), (39, 58), (40, 1), (40, 2), (40, 3), (40, 4),
(40, 5), (40, 6), (40, 11), (40, 12), (40, 13), (40, 14), (40, 16), (40, 17),
(40, 20), (40, 21), (40, 26), (40, 27), (40, 28), (40, 29), (40, 30), (40, 33),
(40, 34), (40, 37), (40, 38), (40, 43), (40, 44), (40, 47), (40, 48), (40, 51),
(40, 52), (40, 55), (40, 56), (40, 57), (40, 59), (40, 60), (40, 61), (41, 1),
(41, 2), (41, 3), (41, 4), (41, 5), (41, 6), (41, 7), (41, 8), (41, 9),
(41, 10), (41, 11), (41, 12), (41, 13), (41, 14), (41, 15), (41, 16), (41, 17),
(41, 18), (41, 19), (41, 20), (41, 21), (41, 22), (41, 23), (41, 24), (41, 25),
(41, 26), (41, 27), (41, 28), (41, 29), (41, 30), (41, 31), (41, 32), (41, 33),
(41, 34), (41, 35), (41, 36), (41, 37), (41, 38), (41, 39), (41, 40), (41, 41),
(41, 42), (41, 43), (41, 44), (41, 45), (41, 46), (41, 47), (41, 48), (41, 49),
(41, 50), (41, 51), (41, 52), (41, 53), (41, 54), (41, 55), (41, 56), (41, 57),
(41, 58), (41, 59), (41, 60), (41, 61), (41, 62), (41, 63), (41, 64), (41, 65),
(42, 5), (42, 9), (42, 10), (42, 15), (42, 19), (42, 23), (42, 24), (42, 25),
(42, 30), (42, 31), (42, 32), (42, 35), (42, 36), (42, 39), (42, 40), (42, 41),
(42, 49), (42, 50), (42, 52), (42, 53), (42, 54), (42, 57), (42, 58), (42, 63),
(42, 64), (42, 65), (43, 1), (43, 2), (43, 3), (43, 4), (43, 5), (43, 6),
(43, 20), (43, 21), (43, 22), (43, 23), (43, 26), (43, 27), (43, 28), (43, 42),
(43, 43), (43, 44), (43, 59), (43, 60), (44, 1), (44, 2), (44, 3), (44, 4),
(44, 5), (44, 6), (44, 11), (44, 12), (44, 13), (44, 14), (44, 20), (44, 21),
(44, 22), (44, 23), (44, 26), (44, 27), (44, 28), (44, 29), (44, 30), (44, 33),
(44, 34), (44, 37), (44, 38), (44, 43), (44, 44), (44, 45), (44, 47), (44, 48),
(44, 55), (44, 56), (45, 1), (45, 2), (45, 3), (45, 4), (45, 5), (45, 6),
(45, 7), (45, 8), (45, 9), (45, 10), (45, 11), (45, 12), (45, 13), (45, 14),
(45, 15), (45, 16), (45, 17), (45, 18), (45, 19), (45, 20), (45, 21), (45, 22),
(45, 23), (45, 24), (45, 25), (45, 26), (45, 27), (45, 28), (45, 29), (45, 30),
(45, 31), (45, 32), (45, 33), (45, 34), (45, 35), (45, 36), (45, 37), (45, 38),
(45, 39), (45, 40), (45, 41), (45, 42), (45, 43), (45, 44), (45, 45), (45, 46),
(45, 47), (45, 48), (45, 49), (45, 50), (45, 51), (45, 52), (45, 53), (45, 54),
(45, 55), (45, 56), (45, 57), (45, 58), (45, 59), (45, 60), (45, 61), (45, 62),
(45, 63), (45, 64), (45, 65), (46, 1), (46, 2), (46, 3), (46, 4), (46, 5),
(46, 6), (46, 7), (46, 8), (46, 9), (46, 10), (46, 11), (46, 12), (46, 13),
(46, 14), (46, 15), (46, 16), (46, 17), (46, 18), (46, 19), (46, 20), (46, 21),
(46, 22), (46, 23), (46, 24), (46, 25), (46, 26), (46, 27), (46, 28), (46, 29),
(46, 30), (46, 31), (46, 32), (46, 33), (46, 34), (46, 35), (46, 36), (46, 37),
(46, 38), (46, 39), (46, 40), (46, 41), (46, 42), (46, 43), (46, 44), (46, 45),
(46, 46), (46, 47), (46, 48), (46, 49), (46, 50), (46, 51), (46, 52), (46, 53),
(46, 54), (46, 55), (46, 56), (46, 57), (46, 58), (46, 59), (46, 60), (46, 61),
(46, 62), (46, 63), (46, 64), (46, 65), (47, 4), (47, 5), (47, 6), (47, 11),
(47, 12), (47, 13), (47, 14), (47, 22), (47, 23), (47, 29), (47, 30), (47, 35),
(47, 43), (47, 44), (47, 47), (47, 48), (47, 51), (47, 52), (47, 55), (47, 56),
(47, 57), (47, 61), (48, 1), (48, 2), (48, 3), (48, 4), (48, 5), (48, 6),
(48, 7), (48, 8), (48, 11), (48, 12), (48, 13), (48, 14), (48, 16), (48, 17),
(48, 20), (48, 21), (48, 22), (48, 23), (48, 26), (48, 27), (48, 28), (48, 29),
(48, 30), (48, 33), (48, 34), (48, 37), (48, 38), (48, 43), (48, 44), (48, 47),
(48, 48), (48, 55), (48, 56), (48, 57), (48, 59), (48, 60), (48, 61), (48, 62);
