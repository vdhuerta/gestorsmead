
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
    tableName: 'Usuarios (Participantes)',
    description: 'Tabla Maestra de Personas. Almacena a todos los actores del sistema (Estudiantes, Asesores, Admin) con su perfil académico completo.',
    fields: [
      { name: 'rut', type: 'VARCHAR(12)', isPk: true, description: 'ID Nacional (PK Clustered). Único e irrepetible.' },
      { name: 'nombres', type: 'VARCHAR(100)', description: 'Nombres de pila' },
      { name: 'apellido_paterno', type: 'VARCHAR(50)', description: 'Primer apellido' },
      { name: 'apellido_materno', type: 'VARCHAR(50)', description: 'Segundo apellido' },
      { name: 'email', type: 'VARCHAR(100)', description: 'Correo único (Unique Index)' },
      { name: 'telefono', type: 'VARCHAR(20)', description: 'Contacto telefónico' },
      { name: 'rol_sistema', type: 'ENUM', description: 'Permisos APP: ADMIN, ASESOR, VISITA' },
      { name: 'rol_academico', type: 'VARCHAR(50)', description: 'Cargo Institucional (Decano, Docente...)' },
      { name: 'facultad', type: 'VARCHAR(100)', description: 'Unidad Mayor' },
      { name: 'departamento', type: 'VARCHAR(100)', description: 'Unidad Menor' },
      { name: 'carrera', type: 'VARCHAR(100)', description: 'Programa de Origen' },
      { name: 'contrato', type: 'VARCHAR(50)', description: 'Relación Contractual (Planta/Contrata)' },
      { name: 'semestre_docencia', type: 'VARCHAR(20)', description: 'Periodo lectivo activo' },
      { name: 'sede', type: 'VARCHAR(50)', description: 'Ubicación física (Valpo/San Felipe)' },
      { name: 'titulo_profesional', type: 'VARCHAR(100)', description: 'Título (Solo Asesores)' },
      { name: 'foto_url', type: 'TEXT', description: 'Avatar de perfil' },
    ]
  },
  {
    tableName: 'Actividades_Formativas',
    description: 'Catálogo unificado de Cursos Académicos y Actividades de Extensión.',
    fields: [
      { name: 'id_actividad', type: 'VARCHAR(50)', isPk: true, description: 'ID Compuesto: COD-AÑO-SEM-VER' },
      { name: 'categoria', type: 'ENUM', description: "'ACADEMIC' (Evaluable) o 'GENERAL' (Asistencia)" },
      { name: 'tipo_actividad', type: 'VARCHAR(50)', description: 'Subtipo: Curso, Charla, Taller, Webinar...' },
      { name: 'nombre', type: 'VARCHAR(200)', description: 'Título oficial' },
      { name: 'codigo_interno', type: 'VARCHAR(20)', description: 'Código corto administrativo' },
      { name: 'año', type: 'INT', description: 'Año Fiscal (Indexado)' },
      { name: 'semestre', type: 'VARCHAR(20)', description: '1, 2, Invierno, Verano' },
      { name: 'version', type: 'VARCHAR(20)', description: 'V1, V2... (Cohorte)' },
      { name: 'modalidad', type: 'VARCHAR(50)', description: 'Presencial, Híbrido, E-Learning' },
      { name: 'horas', type: 'INT', description: 'Carga horaria total' },
      { name: 'cantidad_modulos', type: 'INT', description: 'Para cálculo de duración (Sem = Mod + 2)' },
      { name: 'cantidad_evaluaciones', type: 'INT', description: 'N° de notas pactadas' },
      { name: 'fecha_inicio', type: 'DATE', description: 'Inicio real' },
      { name: 'fecha_termino', type: 'DATE', description: 'Término estimado/real' },
      { name: 'relator', type: 'VARCHAR(100)', description: 'Instructor a cargo' },
      { name: 'links_recursos', type: 'JSON', description: 'Objeto con URLs (Clase, Drive, Eval)' },
    ]
  },
  {
    tableName: 'Inscripciones (Matrícula)',
    description: 'Tabla transaccional que vincula Usuarios con Actividades (N:M).',
    fields: [
      { name: 'id_inscripcion', type: 'UUID', isPk: true, description: 'Identificador único del registro' },
      { name: 'rut_usuario', type: 'VARCHAR(12)', isFk: true, fkTarget: 'Usuarios.rut', description: 'FK -> Usuario' },
      { name: 'id_actividad', type: 'VARCHAR(50)', isFk: true, fkTarget: 'Actividades.id', description: 'FK -> Actividad' },
      { name: 'estado_academico', type: 'ENUM', description: 'Inscrito, Aprobado, Reprobado, No Cursado' },
      { name: 'notas_array', type: 'DECIMAL[]', description: 'Arreglo de Calificaciones [N1, N2...]' },
      { name: 'nota_final', type: 'DECIMAL(2,1)', description: 'Promedio calculado' },
      { name: 'asistencia_json', type: 'JSONB', description: 'Registro booleano por sesión {s1: true...}' },
      { name: 'porcentaje_asistencia', type: 'INT', description: '% calculado' },
      { name: 'observacion', type: 'TEXT', description: 'Comentarios del Asesor' },
    ]
  },
  {
    tableName: 'Configuracion_Global',
    description: 'Singleton. Almacena parámetros del sistema y listas maestras.',
    fields: [
      { name: 'id', type: 'INT', isPk: true, description: 'Single Row ID' },
      { name: 'anio_vigente', type: 'INT', description: 'Contexto por defecto' },
      { name: 'escalas_notas', type: 'JSON', description: '{min: 1.0, max: 7.0, pass: 4.0}' },
      { name: 'listas_maestras', type: 'JSONB', description: 'Arrays de Facultades, Carreras, Roles...' },
    ]
  }
];

// --- Database Strategy for Architecture View ---
export const DATABASE_STRATEGY = {
    indexes: [
        { table: "Usuarios", fields: ["rut"], type: "PRIMARY KEY (Clustered)", reason: "Búsquedas O(1) y Autocompletado rápido." },
        { table: "Usuarios", fields: ["email"], type: "UNIQUE INDEX", reason: "Validación de unicidad y Login." },
        { table: "Inscripciones", fields: ["rut_usuario", "id_actividad"], type: "UNIQUE COMPOSITE", reason: "CRÍTICO: Impide a nivel de motor que un alumno se matricule 2 veces en el mismo curso." },
        { table: "Inscripciones", fields: ["id_actividad"], type: "INDEX", reason: "Optimiza 'Ver Alumnos' (JOINs rápidos)." },
        { table: "Actividades", fields: ["año", "categoria"], type: "INDEX", reason: "Acelera filtros del Dashboard Administrativo." }
    ],
    integrity: [
        "FK_Inscripcion_Usuario: ON DELETE RESTRICT (No se puede borrar un usuario si tiene historial académico).",
        "FK_Inscripcion_Actividad: ON DELETE RESTRICT (No se pueden borrar cursos con alumnos inscritos, solo archivar)."
    ],
    partitioning: "Estrategia Futura: Particionamiento horizontal de tabla 'Inscripciones' por columna 'año' para mantener performance histórica."
};

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
    photoUrl: "https://randomuser.me/api/portraits/men/32.jpg" // Demo Photo
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
    systemRole: UserRole.VISITA
  },
  {
    rut: "1-9",
    names: "Admin",
    paternalSurname: "Sistema",
    maternalSurname: "Demo",
    email: "admin@upla.cl",
    academicRole: "Coordinación de Direcciones",
    contractType: "Planta Jornada Completa",
    systemRole: UserRole.ADMIN,
    campus: "Central"
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
    id: "AULA-2024-V2",
    category: 'ACADEMIC',
    internalCode: "AULA",
    year: 2024,
    academicPeriod: "2024-2",
    name: "Docencia en el Aula Virtual",
    version: "V2 - Segundo Semestre",
    modality: "E-Learning",
    hours: 3,
    relator: "Alexander Castillo",
    linkResources: "https://moodle.upla.cl/course/123",
    moduleCount: 2,
    evaluationCount: 3
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
    version: "2.0.0",
    description: "Modelo extendido con soporte para Cursos Académicos y Actividades Generales (Charlas, etc)."
  },
  configuration: MOCK_CONFIG,
  users: MOCK_USERS,
  activities: MOCK_ACTIVITIES,
  enrollments: MOCK_ENROLLMENTS
};

export const ARCHITECTURE_DATA = {
    stack: [
      { name: "Frontend", details: "React v19 + Tailwind CSS + Vite" },
      { name: "Backend API", details: "Node.js (Express) o NestJS" },
      { name: "Base de Datos", details: "PostgreSQL 15+" },
      { name: "Autenticación", details: "JWT (Access + Refresh Tokens) + Middleware RBAC" },
      { name: "Carga Archivos", details: "Multer + xlsx/csv-parser (Streaming)" },
      { name: "Exportación", details: "JSON2CSV (Streaming) para grandes volúmenes" }
    ],
    folderStructure: `
  /project-root
    ├── /backend
    │   ├── /src
    │   │   ├── /config         # Variables de entorno y DB config
    │   │   ├── /controllers    # Lógica de endpoints (Auth, Course, User)
    │   │   ├── /middlewares    # Auth, Validación de Roles, UploadCSV
    │   │   ├── /models         # Definición de Esquemas (TypeORM / Prisma)
    │   │   ├── /routes         # Definición de rutas API (v1/api/...)
    │   │   ├── /services       # Lógica de negocio y procesamiento CSV
    │   │   ├── /utils          # Helpers (Logger, Validadores)
    │   │   └── /tests          # PRUEBAS UNITARIAS E INTEGRACIÓN
    │   ├── package.json
    │   └── server.ts
    │
    ├── /frontend
    │   ├── /src
    │   │   ├── /components     # UI Reutilizable
    │   │   ├── /pages          # Vistas (Dashboard, Cursos, Config)
    │   │   ├── /hooks          # Custom Hooks (useAuth, useFetch)
    │   │   ├── /services       # Cliente API (Axios/Fetch)
    │   │   ├── /context        # Estado Global (AuthContext)
    │   └── index.html
    └── README.md
  `,
    endpoints: [
      { method: "POST", path: "/api/v1/auth/login", description: "Autenticación y retorno de JWT", role: "Público" },
      { method: "POST", path: "/api/v1/cursos", description: "Crear nuevo curso/actividad formativa", role: "Admin/Asesor" },
      { method: "POST", path: "/api/v1/usuarios/carga-masiva", description: "Upload CSV con validación de RUT", role: "Admin" },
      { method: "POST", path: "/api/v1/usuarios", description: "Creación manual de usuario", role: "Admin" },
      { method: "GET", path: "/api/v1/reportes/consolidado", description: "Exportar CSV completo para Dashboard Externo", role: "Admin" },
      { method: "PUT", path: "/api/v1/config", description: "Actualizar parámetros globales del sistema", role: "Administrador" }
    ]
  };

// --- Code Snippets for Architecture View ---

export const AUTH_SNIPPETS = {
  middleware: `
// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
  `,
  controller: `
// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  }
}
  `,
  routes: `
// src/routes/auth.routes.ts
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);

export default router;
  `
};

export const CONFIG_SNIPPETS = {
  controller: `
// src/controllers/config.controller.ts
import { Request, Response } from 'express';
import { ConfigService } from '../services/config.service';

export class ConfigController {
  static async getConfig(req: Request, res: Response) {
    const config = await ConfigService.getSystemConfig();
    res.json(config);
  }

  static async updateConfig(req: Request, res: Response) {
    const updated = await ConfigService.update(req.body);
    res.json(updated);
  }
}
  `,
  routes: `
// src/routes/config.routes.ts
import { Router } from 'express';
import { ConfigController } from '../controllers/config.controller';
import { isAdmin } from '../middlewares/roles.middleware';

const router = Router();

router.get('/', ConfigController.getConfig);
router.put('/', isAdmin, ConfigController.updateConfig);

export default router;
  `
};

export const COURSE_SNIPPETS = {
  validator: `
// src/validators/course.validator.ts
import { z } from 'zod';

export const CourseSchema = z.object({
  name: z.string().min(5),
  internalCode: z.string().regex(/^[A-Z]{3}-\d{2}$/),
  year: z.number().int().min(2023),
  modality: z.enum(['Presencial', 'Online', 'Híbrido']),
  hours: z.number().positive()
});
  `,
  controller: `
// src/controllers/course.controller.ts
import { Request, Response } from 'express';
import { CourseService } from '../services/course.service';

export class CourseController {
  static async create(req: Request, res: Response) {
    const data = req.body;
    // Zod validation happens in middleware or here
    const course = await CourseService.create(data);
    res.status(201).json(course);
  }

  static async getAll(req: Request, res: Response) {
    const courses = await CourseService.findAll(req.query);
    res.json(courses);
  }
}
  `,
  routes: `
// src/routes/course.routes.ts
import { Router } from 'express';
import { CourseController } from '../controllers/course.controller';
import { validate } from '../middlewares/validation.middleware';
import { CourseSchema } from '../validators/course.validator';

const router = Router();

router.post('/', validate(CourseSchema), CourseController.create);
router.get('/', CourseController.getAll);

export default router;
  `
};

export const USER_SNIPPETS = {
  middleware: `
// src/middlewares/upload.middleware.ts
import multer from 'multer';

const storage = multer.memoryStorage();
export const uploadCSV = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('csv') || file.mimetype.includes('sheet')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});
  `,
  controller: `
// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { Readable } from 'stream';

export class UserController {
  static async bulkUpload(req: Request, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    
    const stream = Readable.from(req.file.buffer);
    const result = await UserService.processStream(stream);
    
    res.json({ success: true, stats: result });
  }
}
  `,
  routes: `
// src/routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { uploadCSV } from '../middlewares/upload.middleware';

const router = Router();

router.post('/upload', uploadCSV.single('file'), UserController.bulkUpload);
router.get('/', UserController.getAll);

export default router;
  `
};

export const EXPORT_SNIPPETS = {
  controller: `
// src/controllers/report.controller.ts
import { Request, Response } from 'express';
import { ReportService } from '../services/report.service';
import { pipeline } from 'stream';

export class ReportController {
  static async downloadConsolidated(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');

    const csvStream = await ReportService.getConsolidatedStream();
    pipeline(csvStream, res, (err) => {
      if (err) console.error('Stream failed', err);
    });
  }
}
  `,
  routes: `
// src/routes/report.routes.ts
import { Router } from 'express';
import { ReportController } from '../controllers/report.controller';
import { isAdvisor } from '../middlewares/roles.middleware';

const router = Router();

router.get('/consolidated', isAdvisor, ReportController.downloadConsolidated);

export default router;
  `
};

export const TESTING_SNIPPETS = {
  unit: `
// tests/unit/course.service.test.ts
import { CourseService } from '../../src/services/course.service';

describe('CourseService', () => {
  it('should calculate end date correctly', () => {
    const startDate = '2025-03-01';
    const modules = 4; // 6 weeks total
    const endDate = CourseService.calculateEndDate(startDate, modules);
    expect(endDate).toBe('2025-04-12');
  });
});
  `,
  integration: `
// tests/integration/upload.test.ts
import request from 'supertest';
import app from '../../src/app';

describe('POST /api/v1/users/upload', () => {
  it('should accept valid CSV file', async () => {
    const res = await request(app)
      .post('/api/v1/users/upload')
      .attach('file', 'tests/fixtures/users_valid.csv')
      .set('Authorization', \`Bearer \${adminToken}\`);

    expect(res.status).toBe(200);
    expect(res.body.stats.processed).toBe(50);
  });
});
  `,
  security: `
// tests/security/rbac.test.ts
import request from 'supertest';
import app from '../../src/app';

describe('RBAC Protection', () => {
  it('should deny student access to admin routes', async () => {
    const res = await request(app)
      .delete('/api/v1/users/123')
      .set('Authorization', \`Bearer \${studentToken}\`);

    expect(res.status).toBe(403);
  });
});
  `
};
