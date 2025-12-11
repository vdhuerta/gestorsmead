
import { SchemaTable, SystemConfig, User, Activity, Enrollment, UserRole, ActivityState } from './types';

// --- Lists for Dropdowns ---

export const GENERAL_ACTIVITY_TYPES = [
  "Charla",
  "Taller",
  "Reunión",
  "Capacitación",
  "Seminario",
  "Foro",
  "Webinar",
  "Otro"
];

export const ACADEMIC_ROLES = [
  "Decano/(a)",
  "Secretario /(a) Académico/(a)",
  "Director/(a) de Departamento",
  "Director/(a) de Carrera",
  "Director/a de Dirección",
  "Académico/(a) Planta",
  "Académico/(a) Honorarios",
  "Académico/(a) Contrata",
  "Académico/(a) Contrata Excepcional",
  "Académico/(a) Media Jornada",
  "Académico/(a) Jornada Completa",
  "Académico/(a) CFT",
  "Coordinación de Direcciones",
  "Coordinación de Unidades",
  "Coordinación de Carrera",
  "Coordinación de Práctica",
  "Coordinación de Doctorado",
  "Mentor /(a) Académico/(a)",
  "Asesor/(a) Pedagógico",
  "Asesor/(a) Curricular",
  "Encargado/(a) de Laboratorio",
  "Bibliotecólogo/(a)",
  "Funcionario/(a)",
  "Externo"
];

export const FACULTY_LIST = [
  "Facultad de Humanidades",
  "Facultad de Ciencias Naturales y Exactas",
  "Facultad de Ciencias de la Educación",
  "Facultad de Arte",
  "Facultad de Ciencias de la Actividad Física y del Deporte",
  "Facultad de Ciencias Sociales",
  "Facultad de Ciencias de la Salud",
  "Facultad de Ingeniería",
  "Instituto Tecnológico Ignacio Domeyko (ITEC)",
  "Centro de Formación Técnica Estatal (CFT Estatal)",
  "Profesionales- Académicos UPLA",
  "Unidad de Acompañamiento Estudiantil",
  "Unidad de Acompañamiento Docente",
  "Vicerrectoría Académica",
  "Otro"
];

export const DEPARTMENT_LIST = [
  "Artes Integradas",
  "Ciencias de Datos e Informática",
  "Ciencias de la Actividad Física",
  "Ciencias de la Educación",
  "Ciencias de la Ingeniería para la Sostenibilidad",
  "Ciencias del Deporte",
  "Ciencias y Geografía",
  "Educación Artística",
  "Estrategias Innovadoras para la Formación en Ciencias de la Salud",
  "Estudios Territoriales y Diálogos Interculturales",
  "Filosofía, Historia y Turismo",
  "Género, Política y Cultura",
  "Ingeniería Industrial y Gestión Organizacional",
  "Lenguas Extranjeras",
  "Literatura y Lingüística",
  "Matemática, Física y Computación",
  "Mediaciones y Subjetividades",
  "Pedagogía",
  "Rehabilitación, Intervención y Abordajes Terapéuticos",
  "Salud, Comunidad y Gestión",
  "Sin Departamento"
];

export const CAREER_LIST = [
  "Administración Turística Multilingüe",
  "Bibliotecología",
  "Derecho Licenciatura En Ciencias Juridicas Y Sociales Bachillerato En Ciencias Sociales",
  "Dibujante Proyectista",
  "Diseño",
  "Educación Parvularia",
  "Enfermería, Licenciatura En Enfermería",
  "Fonoaudiología",
  "Geografía",
  "Ingeniería Civil Ambiental",
  "Ingeniería Civil Industrial",
  "Ingeniería Civil Informatica Licenciatura En Ciencias De La Ingeniería Bachillerato En Ingenieria",
  "Ingeniería Comercial Licenciatura En Ciencias De La Administración Bachillerato En Administracion",
  "Ingeniería En Informática",
  "Instituto Tecnológico",
  "Kinesiología",
  "Licenciatura En Arte",
  "Nutrición Dietética",
  "Pedagogía En Artes Plásticas",
  "Pedagogía En Biología Y Ciencias",
  "Pedagogía En Castellano",
  "Pedagogía En Educación Básica",
  "Pedagogía En Educación Diferencial",
  "Pedagogía En Educación Física Damas",
  "Pedagogía En Educación Física Varones",
  "Pedagogía En Educación Musical",
  "Pedagogía En Filosofía",
  "Pedagogía En Física",
  "Pedagogía En Historia Y Geografía",
  "Pedagogía En Inglés",
  "Pedagogía En Matemática",
  "Pedagogía En Química Y Ciencias",
  "Periodismo",
  "Postgrado/ Magíster En Lingüística Con Mención Dialecto Gia Hispanoam Y Chilena O Ling. Apl. E.I",
  "Postgrado/Diplomado En Gestión Cultural",
  "Postgrado/Doctorado En Literatura Hispanoamericana Contemporánea",
  "Postgrado/Doctorado Interdisciplinario En Ciencias Ambientales",
  "Postgrado/Magíster En Arte Mención Patrimonio",
  "Postgrado/Magíster En Bibliotecología E Información",
  "Postgrado/Magíster En Educación De Adultos Y Procesos Formativos",
  "Postgrado/Magíster En Enseñanza De Las Ciencias",
  "Postgrado/Magíster En Evaluación Educacional",
  "Postgrado/Magíster En Gestión Cultural",
  "Postgrado/Magíster En Liderazgo Y Gestión De Organizaciones Educativas",
  "Postgrado/Magíster En Literatura Con Mención En",
  "Postgrado/Postítulo En Orientación Educacional",
  "Psicología",
  "Sociología",
  "Teatro",
  "Técnico En Administración En Recursos Humanos",
  "Técnico En Administración Logística",
  "Técnico En Administración Logística",
  "Técnico En Construcción",
  "Técnico en Interpretación en Lengua de Señas",
  "Técnico en Electricidad",
  "Técnico En Minería",
  "Tecnología En Deporte Y Recreación",
  "Terapia Ocupacional",
  "Traducción E Interpretación Inglés-Español",
  "Vicerrectoría Académica",
  "Otro"
];

export const CONTRACT_TYPE_LIST = [
  "Planta Media Jornada",
  "Planta Jornada Completa",
  "Contrata Media Jornada",
  "Contrata Jornada Completa",
  "Contrata Excepcional",
  "Académico/(a) Contrata", 
  "Académico/(a) Honorarios",
  "Académico/(a) Planta",
  "Otro",
  "No Aplica"
];

// --- Schema Definitions for the ERD ---

export const SCHEMA_TABLES: SchemaTable[] = [
  {
    tableName: 'Usuarios (Base Maestra)',
    description: 'Tabla Unificada. Contiene a Administradores, Asesores y Estudiantes.',
    fields: [
      { name: 'rut', type: 'VARCHAR(12)', isPk: true, description: 'ID Nacional. Único e irrepetible.' },
      { name: 'nombres', type: 'VARCHAR(100)', description: 'Nombres de pila' },
      { name: 'email', type: 'VARCHAR(100)', description: 'Correo único' },
      { name: 'password', type: 'TEXT', description: 'Nueva Columna: Solo para Admin y Asesores.' },
      { name: 'rol_sistema', type: 'ENUM', description: 'ADMIN, ASESOR, ESTUDIANTE' },
      { name: 'facultad', type: 'VARCHAR(100)', description: 'Unidad Académica' },
      { name: 'carrera', type: 'VARCHAR(100)', description: 'Programa de Origen' },
      { name: 'rol_academico', type: 'VARCHAR(50)', description: 'Cargo Institucional (Decano, Docente...)' },
      { name: 'contrato', type: 'VARCHAR(50)', description: 'Relación Contractual (Planta/Contrata)' },
      { name: 'sede', type: 'VARCHAR(50)', description: 'Ubicación física' },
      { name: 'foto_url', type: 'TEXT', description: 'Avatar de perfil' },
    ]
  },
  {
    tableName: 'Actividades_Formativas',
    description: 'Catálogo unificado de Cursos, Charlas y Postítulos.',
    fields: [
      { name: 'id_actividad', type: 'VARCHAR(50)', isPk: true, description: 'ID Compuesto: COD-AÑO-SEM-VER' },
      { name: 'categoria', type: 'ENUM', description: "'ACADEMIC', 'GENERAL' o 'POSTGRADUATE'" },
      { name: 'nombre', type: 'VARCHAR(200)', description: 'Título oficial' },
      { name: 'program_config', type: 'JSONB', description: 'Configuración JSON para módulos de Postítulos' },
      { name: 'fecha_inicio', type: 'DATE', description: 'Inicio real' },
      { name: 'relator', type: 'VARCHAR(100)', description: 'Instructor a cargo' },
    ]
  },
  {
    tableName: 'Inscripciones (Matrícula)',
    description: 'Vínculo entre Estudiantes y Actividades.',
    fields: [
      { name: 'id_inscripcion', type: 'UUID', isPk: true, description: 'ID' },
      { name: 'rut_usuario', type: 'VARCHAR(12)', isFk: true, fkTarget: 'Usuarios.rut', description: 'FK -> Estudiante' },
      { name: 'id_actividad', type: 'VARCHAR(50)', isFk: true, fkTarget: 'Actividades.id', description: 'FK -> Curso' },
      { name: 'estado_academico', type: 'ENUM', description: 'Aprobado, Reprobado...' },
      { name: 'notas_array', type: 'DECIMAL[]', description: 'Calificaciones' },
      { name: 'asistencia_json', type: 'JSONB', description: 'Registro de Asistencia' },
      { name: 'session_logs', type: 'JSONB', description: 'Historial de Sesiones de Asesoría' },
    ]
  }
];

// --- Mock Data for JSON Export ---

export const MOCK_CONFIG: SystemConfig = {
  id: 'global-v1',
  academicYear: 2025,
  minAttendancePercentage: 75,
  minPassingGrade: 4.0,
  gradingScaleMax: 7.0,
  gradingScaleMin: 1.0,
  contactEmail: 'soporte.docencia@universidad.cl',
  // Initial Population of Dynamic Lists
  modalities: ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"],
  academicRoles: ACADEMIC_ROLES,
  faculties: FACULTY_LIST,
  departments: DEPARTMENT_LIST,
  careers: CAREER_LIST,
  contractTypes: CONTRACT_TYPE_LIST,
  semesters: [
    "Semestre 0",
    "Semestre 1", 
    "Semestre 2", 
    "Semestre 3", 
    "Semestre 4", 
    "Semestre 5", 
    "Semestre 6", 
    "Semestre 7", 
    "Semestre 8", 
    "Semestre 9", 
    "Semestre 10", 
    "Otro", 
    "No Aplica"
  ],
  campuses: ["Valparaíso", "San Felipe", "Virtual"]
};

export const MOCK_USERS: User[] = [
  {
    rut: "12.345.678-9",
    names: "Juan Andrés",
    paternalSurname: "Pérez",
    maternalSurname: "Gómez",
    email: "juan.perez@upla.cl",
    phone: "+56912345678",
    academicRole: "Académico/(a) Planta",
    faculty: "Facultad de Ingeniería",
    department: "Ciencias de Datos e Informática",
    career: "Ingeniería Civil Informática",
    contractType: "Planta Jornada Completa",
    teachingSemester: "Semestre 1",
    campus: "Valparaíso",
    systemRole: UserRole.ASESOR,
    password: "password123", // Mock password
    photoUrl: "https://randomuser.me/api/portraits/men/32.jpg" 
  },
  {
    rut: "9.876.543-2",
    names: "Maria Elena",
    paternalSurname: "Silva",
    maternalSurname: "Rojas",
    email: "maria.silva@upla.cl",
    phone: "+56987654321",
    academicRole: "Secretario /(a) Académico/(a)",
    faculty: "Facultad de Humanidades",
    department: "Artes Integradas",
    career: "Licenciatura En Arte",
    contractType: "Contrata Media Jornada",
    teachingSemester: "Semestre 2",
    campus: "San Felipe",
    systemRole: UserRole.ESTUDIANTE
  },
  {
    rut: "1-9",
    names: "Víctor",
    paternalSurname: "Huerta",
    maternalSurname: "",
    email: "admin@upla.cl",
    academicRole: "Coordinación de Direcciones",
    contractType: "Planta Jornada Completa",
    systemRole: UserRole.ADMIN,
    password: "112358",
    campus: "Central",
    photoUrl: "https://github.com/vdhuerta/assets-aplications/blob/main/Foto%20Vi%CC%81ctor%20Huerta.JPG?raw=true"
  }
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: "IND-2024-V1",
    category: 'ACADEMIC',
    internalCode: "IND",
    year: 2024,
    academicPeriod: "2024-1",
    name: "Plan de Inducción Comunidad Académica",
    version: "V1 - Primer Semestre",
    modality: "Presencial",
    hours: 1,
    relator: "Eugenio Contreras",
    startDate: "2024-03-15",
    moduleCount: 1,
    evaluationCount: 1
  },
  {
    id: "WEB-IA-2025",
    category: 'GENERAL',
    activityType: 'Webinar',
    internalCode: "WEB",
    year: 2025,
    academicPeriod: "2025-1",
    name: "Uso de IA en Educación Superior",
    version: "V1",
    modality: "Presencia Digital",
    hours: 2,
    relator: "Experto Invitado",
    startDate: "2025-04-10",
    moduleCount: 1,
    evaluationCount: 0
  }
];

export const MOCK_ENROLLMENTS: Enrollment[] = [
  {
    id: "ENR-1001",
    rut: "12.345.678-9",
    activityId: "IND-2024-V1",
    state: ActivityState.APROBADO,
    grades: [6.5, 7.0, 6.0],
    finalGrade: 6.5,
    attendancePercentage: 100,
    attendanceSession1: true,
    attendanceSession2: true,
    attendanceSession3: true,
    situation: "Certificado Enviado",
    observation: "Participación destacada",
    responsible: "Coordinación Docente"
  }
];

export const FULL_JSON_MODEL = {
  metadata: {
    generatedAt: new Date().toISOString(),
    version: "3.0.0",
    description: "Modelo Actualizado: Estudiantes, Asesores y Admin en tabla única Users."
  },
  configuration: MOCK_CONFIG,
  users: MOCK_USERS,
  activities: MOCK_ACTIVITIES,
  enrollments: MOCK_ENROLLMENTS
};

// --- SUPABASE MIGRATION SQL (FULL SCHEMA + REPAIR) ---

export const SUPABASE_SQL_SCRIPT = `
-- ====================================================================
-- SCRIPT DE REPARACIÓN TOTAL Y PERMISOS - SMEAD V4
-- Ejecuta este script en el SQL Editor de Supabase para corregir problemas de guardado.
-- ====================================================================

-- 1. ASEGURAR COLUMNAS PARA POSTÍTULOS Y ASESORÍAS
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS program_config jsonb;

ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS state text DEFAULT 'Inscrito';

ALTER TABLE public.enrollments 
ADD COLUMN IF NOT EXISTS session_logs jsonb DEFAULT '[]'::jsonb;

-- 2. REINICIAR POLÍTICAS DE SEGURIDAD (RLS)
-- Esto corrige el error "infinite recursion" y problemas de permisos de escritura.

-- Deshabilitar RLS temporalmente para limpiar
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments DISABLE ROW LEVEL SECURITY;

-- Borrar políticas antiguas conflictivas
DROP POLICY IF EXISTS "Permitir Todo Users" ON public.users;
DROP POLICY IF EXISTS "Permitir Todo Activities" ON public.activities;
DROP POLICY IF EXISTS "Permitir Todo Enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;

-- Habilitar RLS nuevamente
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Crear políticas PERMISIVAS (Públicas/Anon para evitar bloqueos en esta etapa)
-- NOTA: En producción real, esto debería restringirse por auth.uid()
CREATE POLICY "Permitir Todo Users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir Todo Activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir Todo Enrollments" ON public.enrollments FOR ALL USING (true) WITH CHECK (true);

-- 3. REFRESCAR CACHÉ DE API
-- Obliga a PostgREST a reconocer las nuevas columnas (program_config, session_logs)
NOTIFY pgrst, 'reload config';
`;

export const DATABASE_STRATEGY = {
    indexes: [], integrity: [], partitioning: ""
};
export const ARCHITECTURE_DATA = { stack: [], folderStructure: "", endpoints: [] };
export const AUTH_SNIPPETS = { middleware: "", controller: "", routes: "" };
export const CONFIG_SNIPPETS = { controller: "", routes: "" };
export const COURSE_SNIPPETS = { validator: "", controller: "", routes: "" };
export const USER_SNIPPETS = { middleware: "", controller: "", routes: "" };
export const EXPORT_SNIPPETS = { controller: "", routes: "" };
export const TESTING_SNIPPETS = { unit: "", integration: "", security: "" };
