
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Activity, Enrollment, SystemConfig, ActivityState } from '../types';
import { MOCK_CONFIG, MOCK_USERS, MOCK_ACTIVITIES, MOCK_ENROLLMENTS } from '../constants';
import { supabase } from '../services/supabaseClient';

interface DataContextType {
  users: User[];
  activities: Activity[];
  enrollments: Enrollment[];
  config: SystemConfig;
  isLoading: boolean;
  error: string | null;
  addActivity: (activity: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>; 
  getUser: (rut: string) => User | undefined;
  deleteUser: (rut: string) => Promise<void>;
  upsertUsers: (newUsers: User[]) => Promise<{ added: number; updated: number }>;
  enrollUser: (rut: string, activityId: string) => Promise<void>;
  bulkEnroll: (ruts: string[], activityId: string) => Promise<{ success: number; skipped: number }>;
  updateEnrollment: (id: string, updates: Partial<Enrollment>) => Promise<void>;
  deleteEnrollment: (id: string) => Promise<void>; 
  updateConfig: (newConfig: SystemConfig) => void;
  resetData: () => void;
  refreshData: () => Promise<void>; // Nueva función expuesta
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// --- HELPER: Parse Postgres Arrays from Realtime Payload ---
const parsePostgresArray = (val: any): number[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[{}]/g, '');
        if (!cleaned) return [];
        return cleaned.split(',').map(n => parseFloat(n)).filter(n => !isNaN(n));
    }
    return [];
};

// --- HELPER MAPPERS (DB snake_case -> App camelCase) ---
const mapUserFromDB = (u: any): User => ({
    rut: u.rut,
    names: u.names,
    paternalSurname: u.paternal_surname,
    maternalSurname: u.maternal_surname,
    email: u.email,
    phone: u.phone,
    photoUrl: u.photo_url,
    systemRole: u.system_role,
    password: u.password,
    academicRole: u.academic_role,
    faculty: u.faculty,
    department: u.department,
    career: u.career,
    contractType: u.contract_type,
    teachingSemester: u.teaching_semester,
    campus: u.campus,
    title: u.title
});

const mapActivityFromDB = (a: any): Activity => ({
    id: a.id,
    category: a.category,
    activityType: a.activity_type,
    internalCode: a.internal_code,
    year: a.year,
    academicPeriod: a.academic_period,
    name: a.name,
    version: a.version,
    modality: a.modality,
    hours: a.hours,
    moduleCount: a.module_count,
    evaluationCount: a.evaluation_count,
    startDate: a.start_date,
    endDate: a.end_date,
    relator: a.relator,
    linkResources: a.link_resources,
    classLink: a.class_link,
    evaluationLink: a.evaluation_link, 
    isPublic: a.is_public,
    programConfig: a.program_config 
});

const mapEnrollmentFromDB = (e: any): Enrollment => ({
    id: e.id,
    rut: e.user_rut,
    activityId: e.activity_id,
    state: e.state,
    grades: parsePostgresArray(e.grades),
    finalGrade: e.final_grade,
    attendanceSession1: e.attendance_session_1,
    attendanceSession2: e.attendance_session_2,
    attendanceSession3: e.attendance_session_3,
    attendanceSession4: e.attendance_session_4,
    attendanceSession5: e.attendance_session_5,
    attendanceSession6: e.attendance_session_6,
    attendancePercentage: e.attendance_percentage,
    observation: e.observation,
    situation: e.situation,
    sessionLogs: e.session_logs,
    certificateCode: e.certificate_code 
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [config, setConfig] = useState<SystemConfig>(() => {
    const saved = localStorage.getItem('app_config');
    return saved ? JSON.parse(saved) : MOCK_CONFIG;
  });

  // --- CARGA INICIAL Y REALTIME ---
  useEffect(() => {
    fetchData();

    const channel = supabase.channel('global-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                setUsers(prev => [...prev, mapUserFromDB(payload.new)]);
            } else if (payload.eventType === 'UPDATE') {
                const updated = mapUserFromDB(payload.new);
                setUsers(prev => prev.map(u => u.rut === updated.rut ? updated : u));
            } else if (payload.eventType === 'DELETE') {
                setUsers(prev => prev.filter(u => u.rut !== payload.old.rut));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                setActivities(prev => [...prev, mapActivityFromDB(payload.new)]);
            } else if (payload.eventType === 'UPDATE') {
                const updated = mapActivityFromDB(payload.new);
                setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
            } else if (payload.eventType === 'DELETE') {
                setActivities(prev => prev.filter(a => a.id !== payload.old.id));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, (payload) => {
            // Lógica crítica para sincronización instantánea de notas
            if (payload.eventType === 'INSERT') {
                setEnrollments(prev => [...prev, mapEnrollmentFromDB(payload.new)]);
            } else if (payload.eventType === 'UPDATE') {
                const updated = mapEnrollmentFromDB(payload.new);
                setEnrollments(prev => prev.map(e => e.id === updated.id ? updated : e));
            } else if (payload.eventType === 'DELETE') {
                setEnrollments(prev => prev.filter(e => e.id !== payload.old.id));
            }
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    // No setear isLoading(true) global para evitar parpadeos masivos en actualizaciones background
    try {
        const [usersRes, actsRes, enrRes] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('activities').select('*'),
            supabase.from('enrollments').select('*')
        ]);

        if (usersRes.data) setUsers(usersRes.data.map(mapUserFromDB));
        if (actsRes.data) setActivities(actsRes.data.map(mapActivityFromDB));
        if (enrRes.data) setEnrollments(enrRes.data.map(mapEnrollmentFromDB));

    } catch (error: any) {
        console.error("Error fetching data:", error);
        setError(error.message);
    } finally {
        setIsLoading(false);
    }
  };

  const addActivity = async (activity: Activity) => {
    // 1. Optimistic Update (Visualmente rápido)
    setActivities(prev => [...prev, activity]); 
    
    // 2. Mapeo a Estructura DB
    const dbRow = {
        id: activity.id,
        name: activity.name,
        category: activity.category,
        activity_type: activity.activityType,
        // FIX: Corrected property access from activity.internal_code to activity.internalCode
        internal_code: activity.internalCode,
        year: activity.year,
        // FIX: Corrected property access from activity.academic_period to activity.academicPeriod
        academic_period: activity.academicPeriod,
        version: activity.version,
        modality: activity.modality,
        hours: activity.hours,
        // FIX: Corrected property access from activity.module_count to activity.moduleCount
        module_count: activity.moduleCount,
        // FIX: Corrected property access from activity.evaluation_count to activity.evaluationCount
        evaluation_count: activity.evaluationCount,
        // CORRECCIÓN CRÍTICA: Sanitizar fechas vacías a NULL para evitar error "invalid input syntax for type date"
        start_date: activity.startDate && activity.startDate !== '' ? activity.startDate : null,
        end_date: activity.endDate && activity.endDate !== '' ? activity.endDate : null,
        relator: activity.relator,
        link_resources: activity.linkResources,
        class_link: activity.classLink,
        evaluation_link: activity.evaluationLink, 
        is_public: activity.isPublic,
        program_config: activity.programConfig || null // Enviar null si es undefined
    };
    
    // 3. Intento de Guardado
    const { error } = await supabase.from('activities').upsert(dbRow);
    
    // 4. Manejo de Error
    if (error) {
        console.error("Error crítico al guardar actividad:", error.message, error.details, error.hint);
        // REVERTIR CAMBIO OPTIMISTA si falló la BD
        setActivities(prev => prev.filter(a => a.id !== activity.id));
        // Relanzar error para que la UI lo muestre
        throw error;
    }
    
    // 5. Sincronización Final (Si todo salió bien)
    fetchData(); 
  };

  const deleteActivity = async (id: string) => {
      setActivities(prev => prev.filter(a => a.id !== id));
      await supabase.from('activities').delete().eq('id', id);
  };

  const getUser = (rut: string) => users.find(u => u.rut.toLowerCase() === rut.toLowerCase());

  const deleteUser = async (rut: string) => {
      setUsers(prev => prev.filter(u => u.rut !== rut));
      await supabase.from('users').delete().eq('rut', rut);
  };

  const upsertUsers = async (incomingUsers: User[]) => {
      const dbPayloads = incomingUsers.map(u => ({
          rut: u.rut,
          names: u.names,
          paternal_surname: u.paternalSurname,
          maternal_surname: u.maternalSurname || null,
          email: (u.email && u.email.trim() !== '') ? u.email : null, // Fix: Use NULL if empty to avoid unique constraint issues
          phone: (u.phone && u.phone.trim() !== '') ? u.phone : null,
          photo_url: u.photoUrl || null,
          system_role: u.systemRole,
          password: u.password || null,
          // FIX: Use camelCase properties 'academicRole', 'contractType', and 'teachingSemester' for mapping to DB snake_case.
          academic_role: u.academicRole,
          faculty: u.faculty,
          department: u.department,
          career: u.career,
          contract_type: u.contractType,
          teaching_semester: u.teachingSemester,
          campus: u.campus,
          title: u.title || null
      }));
      
      const { error } = await supabase.from('users').upsert(dbPayloads, { onConflict: 'rut' });
      if(!error) fetchData();
      return { added: incomingUsers.length, updated: 0 };
  };

  const enrollUser = async (rut: string, activityId: string) => {
      // Optimistic
      setEnrollments(prev => [...prev, { id: 'temp', rut, activityId, state: ActivityState.INSCRITO, grades: [] }]);
      
      const { error } = await supabase.from('enrollments').upsert({
          user_rut: rut,
          activity_id: activityId,
          state: 'Inscrito'
      }, { onConflict: 'user_rut, activity_id' }); // Use upsert to avoid duplicate errors
      
      if(error) console.error("Enroll error:", error.message);
      fetchData();
  };

  const bulkEnroll = async (ruts: string[], activityId: string) => {
      const payloads = ruts.map(rut => ({ 
          user_rut: rut, 
          activity_id: activityId, 
          state: 'Inscrito' 
      }));
      // Use upsert on unique constraint to prevent entire batch failure if some are already enrolled
      const { error } = await supabase.from('enrollments').upsert(payloads, { onConflict: 'user_rut, activity_id' });
      
      if (error) {
          console.error("Bulk enroll error:", error);
          throw error;
      }
      
      fetchData();
      return { success: ruts.length, skipped: 0 };
  };

  const updateEnrollment = async (id: string, updates: Partial<Enrollment>) => {
      // Optimistic Update
      setEnrollments(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));

      const dbUpdates: any = {};
      if (updates.state) dbUpdates.state = updates.state;
      if (updates.grades) dbUpdates.grades = updates.grades;
      if (updates.finalGrade !== undefined) dbUpdates.final_grade = updates.finalGrade;
      if (updates.attendancePercentage !== undefined) dbUpdates.attendance_percentage = updates.attendancePercentage;
      if (updates.observation) dbUpdates.observation = updates.observation;
      if (updates.sessionLogs) dbUpdates.session_logs = updates.sessionLogs;
      if (updates.certificateCode) dbUpdates.certificate_code = updates.certificateCode;
      
      // Mapeo de asistencia
      if (updates.attendanceSession1 !== undefined) dbUpdates.attendance_session_1 = updates.attendanceSession1;
      if (updates.attendanceSession2 !== undefined) dbUpdates.attendance_session_2 = updates.attendanceSession2;
      if (updates.attendanceSession3 !== undefined) dbUpdates.attendance_session_3 = updates.attendanceSession3;
      if (updates.attendanceSession4 !== undefined) dbUpdates.attendance_session_4 = updates.attendanceSession4;
      if (updates.attendanceSession5 !== undefined) dbUpdates.attendance_session_5 = updates.attendanceSession5;
      if (updates.attendanceSession6 !== undefined) dbUpdates.attendance_session_6 = updates.attendanceSession6;

      await supabase.from('enrollments').update(dbUpdates).eq('id', id);
  };

  const deleteEnrollment = async (id: string) => {
      setEnrollments(prev => prev.filter(e => e.id !== id));
      await supabase.from('enrollments').delete().eq('id', id);
  };

  const updateConfig = (newConfig: SystemConfig) => {
      setConfig(newConfig);
      localStorage.setItem('app_config', JSON.stringify(newConfig));
  };

  const resetData = async () => {
      fetchData();
  };

  return (
    <DataContext.Provider value={{ 
        users, activities, enrollments, config, isLoading, error,
        addActivity, deleteActivity, upsertUsers, updateConfig, resetData,
        enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, deleteUser,
        refreshData: fetchData // Exported
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
