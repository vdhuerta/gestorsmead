
export enum UserRole {
  ADMIN = 'Administrador',
  ASESOR = 'Asesor',
  VISITA = 'Visita'
}

export enum ActivityState {
  INSCRITO = 'Inscrito',
  APROBADO = 'Aprobado',
  REPROBADO = 'Reprobado',
  NO_CURSADO = 'No Cursado',
  PENDIENTE = 'Pendiente'
}

export interface SystemConfig {
  id: string;
  academicYear: number;
  minAttendancePercentage: number;
  minPassingGrade: number; // e.g., 4.0
  gradingScaleMax: number; // e.g., 7.0
  gradingScaleMin: number; // e.g., 1.0
  contactEmail: string;

  // Listas Dinámicas Administrativas
  modalities?: string[];
  academicRoles?: string[];
  faculties?: string[];
  departments?: string[];
  careers?: string[];
  contractTypes?: string[];
  semesters?: string[];
  campuses?: string[];
}

export interface User {
  rut: string; // PK
  names: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone?: string;
  photoUrl?: string; // New: Profile Picture URL (Base64 or Link)
  
  // Campos Académicos / Administrativos
  academicRole?: string; // "Rol" en planilla (ej: Decano, Docente)
  faculty?: string;
  department?: string;
  career?: string; // Carrera
  contractType?: string; // Contrato (Planta, Honorario, etc)
  teachingSemester?: string; // Semestre Docencia
  campus?: string; // Sede
  title?: string; // New: Profesión o Título para Asesores
  
  // Permisos App
  systemRole: UserRole;
}

export interface Activity {
  id: string; // PK Compuesta (CODE-YEAR-SEM-VER)
  category?: 'ACADEMIC' | 'GENERAL'; // Nuevo: Separador de Módulos
  activityType?: string; // Nuevo: Charla, Taller, etc.
  internalCode?: string; 
  year?: number; 
  academicPeriod?: string; 
  name: string;
  version?: string; 
  modality: string; 
  hours: number;
  startDate?: string;
  endDate?: string; 
  relator?: string;
  linkResources?: string; 
  classLink?: string;     
  evaluationLink?: string; 
  linkCertificate?: string;
  
  // Gestión del Curso
  moduleCount?: number; // Cantidad de módulos
  evaluationCount?: number; // Cantidad de notas pactadas
}

export interface Enrollment {
  id: string; // PK
  rut: string; // FK -> User
  activityId: string; // FK -> Activity
  state: ActivityState;
  grades: number[]; // N1, N2...
  finalGrade?: number;
  attendanceSession1?: boolean;
  attendanceSession2?: boolean;
  attendanceSession3?: boolean;
  attendanceSession4?: boolean;
  attendanceSession5?: boolean;
  attendanceSession6?: boolean;
  attendancePercentage?: number;
  situation?: string; // Additional status text
  observation?: string;
  responsible?: string; // Who enrolled them or manages this record
  diagnosticResult?: string;
}

// For Visualization
export interface SchemaField {
  name: string;
  type: string;
  isPk?: boolean;
  isFk?: boolean;
  fkTarget?: string;
  description?: string;
}

export interface SchemaTable {
  tableName: string;
  description: string;
  fields: SchemaField[];
}
