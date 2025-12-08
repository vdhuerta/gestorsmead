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
  deleteActivity: (id: string) => Promise<void>; // Nueva función
  getUser: (rut: string) => User | undefined;
  deleteUser: (rut: string) => Promise<void>;
  upsertUsers: (newUsers: User[]) => Promise<{ added: number; updated: number }>;
  enrollUser: (rut: string, activityId: string) => Promise<void>;
  bulkEnroll: (ruts: string[], activityId: string) => Promise<{ success: number; skipped: number }>;
  updateEnrollment: (id: string, updates: Partial<Enrollment>) => Promise<void>;
  updateConfig: (newConfig: SystemConfig) => void;
  resetData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// --- HELPER: Parse Postgres Arrays from Realtime Payload ---
// Realtime sometimes sends arrays as strings "{1,2}" if not cast properly.
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
    evaluationLink: a.evaluation_link
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
    situation: e.situation
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
    // 1. Initial Load
    fetchData();

    // 2. Setup Realtime Subscription
    const channel = supabase.channel('global-changes')
        // USUARIOS
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                const newUser = mapUserFromDB(payload.new);
                setUsers(prev => {
                    if (prev.some(u => u.rut === newUser.rut)) return prev; 
                    return [...prev, newUser];
                });
            } else if (payload.eventType === 'UPDATE') {
                const updated = mapUserFromDB(payload.new);
                setUsers(prev => prev.map(u => u.rut === updated.rut ? updated : u));
            } else if (payload.eventType === 'DELETE') {
                setUsers(prev => prev.filter(u => u.rut !== payload.old.rut));
            }
        })
        // ACTIVIDADES
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
        // INSCRIPCIONES (Critical)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                const newEnr = mapEnrollmentFromDB(payload.new);
                setEnrollments(prev => {
                    if (prev.some(e => e.id === newEnr.id)) return prev; 
                    return [...prev, newEnr];
                });
            } else if (payload.eventType === 'UPDATE') {
                const updated = mapEnrollmentFromDB(payload.new);
                // Safe merge needed? No, DB record is authority.
                setEnrollments(prev => prev.map(e => e.id === updated.id ? updated : e));
            } else if (payload.eventType === 'DELETE') {
                setEnrollments(prev => prev.filter(e => e.id !== payload.old.id));
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("🟢 Conectado a Realtime: Sincronización activa.");
                // Fetch again to ensure no gap between initial fetch and subscription
                fetchData();
            } else if (status === 'CHANNEL_ERROR') {
                console.warn("🔴 Error en Realtime. Conexión inestable o modo offline.");
            }
        });

    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    // Only set loading on FIRST load, to avoid flicker on re-fetches
    if (users.length === 0) setIsLoading(true);
    
    setError(null);
    try {
        // Parallel fetching for speed
        const [usersRes, actsRes, enrRes] = await Promise.all([
            supabase.from('users').select('*').range(0, 9999),
            supabase.from('activities').select('*').range(0, 9999),
            supabase.from('enrollments').select('*').range(0, 9999)
        ]);

        if (usersRes.error) throw usersRes.error;
        if (actsRes.error) throw actsRes.error;
        if (enrRes.error) throw enrRes.error;

        setUsers((usersRes.data || []).map(mapUserFromDB));
        setActivities((actsRes.data || []).map(mapActivityFromDB));
        setEnrollments((enrRes.data || []).map(mapEnrollmentFromDB));

    } catch (error: any) {
        console.error("CRITICAL ERROR FETCHING DATA:", error.message || error);
        
        // --- FALLBACK TO MOCK DATA ON ERROR ---
        console.warn("⚠️ Cargando datos de prueba (MOCK) debido a error de conexión.");
        setUsers(MOCK_USERS);
        setActivities(MOCK_ACTIVITIES);
        setEnrollments(MOCK_ENROLLMENTS);
        // Not setting 'error' state string to avoid triggering the "Red Screen of Death" in App.tsx, 
        // allowing the app to function in offline/demo mode.
        
    } finally {
        setIsLoading(false);
    }
  };

  // --- ACTIONS ---

  const addActivity = async (activity: Activity) => {
    // Optimistic
    setActivities(prev => [...prev, activity]);

    const dbActivity = {
        id: activity.id,
        category: activity.category,
        activity_type: activity.activityType,
        internal_code: activity.internalCode,
        year: activity.year,
        academic_period: activity.academicPeriod,
        name: activity.name,
        version: activity.version,
        modality: activity.modality,
        hours: activity.hours,
        module_count: activity.moduleCount,
        evaluation_count: activity.evaluationCount,
        start_date: activity.startDate,
        end_date: activity.endDate,
        relator: activity.relator,
        link_resources: activity.linkResources,
        class_link: activity.classLink,
        evaluation_link: activity.evaluationLink
    };

    const { error } = await supabase.from('activities').upsert(dbActivity);
    if (error) {
        console.error("Error guardando actividad:", error);
        alert(`Error guardando actividad: ${error.message}. (Verifique conexión)`);
    }
  };

  const deleteActivity = async (id: string) => {
      // Optimistic
      setActivities(prev => prev.filter(a => a.id !== id));
      // También eliminar inscripciones asociadas optimísticamente (opcional visualmente)
      setEnrollments(prev => prev.filter(e => e.activityId !== id));

      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) {
          console.error("Error deleting activity:", error.message);
          alert(`Error al eliminar actividad: ${error.message}`);
      }
  };

  const getUser = (rut: string) => {
    return users.find(u => u.rut.toLowerCase() === rut.toLowerCase());
  };

  const deleteUser = async (rut: string) => {
      // Optimistic
      setUsers(prev => prev.filter(u => u.rut !== rut));
      const { error } = await supabase.from('users').delete().eq('rut', rut);
      if (error) console.error("Error deleting user:", error.message);
  };

  const upsertUsers = async (incomingUsers: User[]) => {
    let added = 0;
    let updated = 0;
    const dbPayloads: any[] = [];

    // 1. Optimistic Update (Immediate Local Feedback)
    setUsers(prevUsers => {
        const newUsersState = [...prevUsers];
        incomingUsers.forEach(incUser => {
            const index = newUsersState.findIndex(u => u.rut === incUser.rut);
            if (index >= 0) {
                updated++;
                newUsersState[index] = { ...newUsersState[index], ...incUser };
            } else {
                added++;
                newUsersState.push(incUser);
            }
            
            dbPayloads.push({
                rut: incUser.rut,
                names: incUser.names,
                paternal_surname: incUser.paternalSurname,
                maternal_surname: incUser.maternalSurname,
                email: incUser.email,
                phone: incUser.phone,
                photo_url: incUser.photoUrl,
                system_role: incUser.systemRole,
                password: incUser.password,
                academic_role: incUser.academicRole,
                faculty: incUser.faculty,
                department: incUser.department,
                career: incUser.career,
                contract_type: incUser.contractType,
                teaching_semester: incUser.teachingSemester,
                campus: incUser.campus,
                title: incUser.title
            });
        });
        return newUsersState;
    });

    // 2. Database Sync
    if (dbPayloads.length > 0) {
        const { error } = await supabase.from('users').upsert(dbPayloads, { onConflict: 'rut' });
        
        if (error) {
            console.error("Error upserting users:", error.message);
            if (error.code === '23505') {
                 alert("⚠️ ERROR DE DUPLICADOS: Hay correos electrónicos repetidos en la carga.");
            } else {
                 alert(`Error al sincronizar con Base de Datos: ${error.message}`);
            }
            return { added: 0, updated: 0 };
        }
    }
    return { added, updated };
  };

  const enrollUser = async (rut: string, activityId: string) => {
      if (enrollments.some(e => e.rut === rut && e.activityId === activityId)) return;
      
      const { error } = await supabase.from('enrollments').insert({
          user_rut: rut,
          activity_id: activityId,
          state: 'Inscrito'
      });

      if (error) {
          alert("Error al matricular: " + error.message);
      }
  };

  const bulkEnroll = async (ruts: string[], activityId: string) => {
      let success = 0;
      let skipped = 0;
      const uniqueRuts = [...new Set(ruts)];
      const dbPayloads: any[] = [];

      uniqueRuts.forEach(rut => {
          if (enrollments.some(e => e.rut === rut && e.activityId === activityId)) {
              skipped++;
          } else {
              success++;
              dbPayloads.push({
                  user_rut: rut,
                  activity_id: activityId,
                  state: 'Inscrito'
              });
          }
      });

      if (dbPayloads.length > 0) {
          const { error } = await supabase.from('enrollments').insert(dbPayloads);
          if (error) {
              alert("Error en carga masiva a la BD: " + error.message);
              return { success: 0, skipped: uniqueRuts.length };
          }
      }
      return { success, skipped };
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
      
      if (updates.attendanceSession1 !== undefined) dbUpdates.attendance_session_1 = updates.attendanceSession1;
      if (updates.attendanceSession2 !== undefined) dbUpdates.attendance_session_2 = updates.attendanceSession2;
      if (updates.attendanceSession3 !== undefined) dbUpdates.attendance_session_3 = updates.attendanceSession3;
      if (updates.attendanceSession4 !== undefined) dbUpdates.attendance_session_4 = updates.attendanceSession4;
      if (updates.attendanceSession5 !== undefined) dbUpdates.attendance_session_5 = updates.attendanceSession5;
      if (updates.attendanceSession6 !== undefined) dbUpdates.attendance_session_6 = updates.attendanceSession6;

      const { error } = await supabase.from('enrollments').update(dbUpdates).eq('id', id);
      if (error) {
          console.error("Error updating enrollment:", error.message);
          // Optional: Revert optimistic update here if critical
      }
  };

  const updateConfig = (newConfig: SystemConfig) => {
      setConfig(newConfig);
      localStorage.setItem('app_config', JSON.stringify(newConfig));
  };

  const resetData = async () => {
    if(confirm("¿Estás seguro de reiniciar la Base de Datos? (Esto borrará los datos en SUPABASE)")) {
        setIsLoading(true);
        await supabase.from('enrollments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('activities').delete().neq('id', 'x');
        await supabase.from('users').delete().neq('rut', 'x');
        
        setUsers([]);
        setActivities([]);
        setEnrollments([]);
        setIsLoading(false);
        alert("Base de datos limpia.");
    }
  };

  return (
    <DataContext.Provider value={{ 
        users, activities, enrollments, config, isLoading, error,
        addActivity, deleteActivity, upsertUsers, updateConfig, resetData,
        enrollUser, bulkEnroll, updateEnrollment, getUser, deleteUser
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