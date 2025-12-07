
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Activity, Enrollment, SystemConfig, ActivityState } from '../types';
import { MOCK_CONFIG } from '../constants';
import { supabase } from '../services/supabaseClient';

interface DataContextType {
  users: User[];
  activities: Activity[];
  enrollments: Enrollment[];
  config: SystemConfig;
  isLoading: boolean;
  error: string | null; // Added Error state
  addActivity: (activity: Activity) => Promise<void>;
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

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Config se mantiene local por ahora
  const [config, setConfig] = useState<SystemConfig>(() => {
    const saved = localStorage.getItem('app_config');
    return saved ? JSON.parse(saved) : MOCK_CONFIG;
  });

  // --- CARGA INICIAL DESDE SUPABASE ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null); // Reset error state on retry
    try {
        // 1. Fetch Users - FIX: Added range to bypass default 1000 limit
        const usersResponse = await supabase.from('users').select('*').range(0, 9999);
        if (usersResponse.error) {
            console.error("Supabase Error (Users):", usersResponse.error.message);
            throw usersResponse.error; // Throw to catch block to set global error
        }
        
        // Map DB snake_case to TS camelCase
        const mappedUsers: User[] = (usersResponse.data || []).map((u: any) => ({
            rut: u.rut,
            names: u.names,
            paternalSurname: u.paternal_surname,
            maternalSurname: u.maternal_surname,
            email: u.email,
            phone: u.phone,
            photoUrl: u.photo_url,
            systemRole: u.system_role,
            password: u.password, // CRITICAL FIX: Include password for auth
            academicRole: u.academic_role,
            faculty: u.faculty,
            department: u.department,
            career: u.career,
            contractType: u.contract_type,
            teachingSemester: u.teaching_semester,
            campus: u.campus,
            title: u.title
        }));
        setUsers(mappedUsers);

        // 2. Fetch Activities - FIX: Added range
        const actsResponse = await supabase.from('activities').select('*').range(0, 9999);
        if (actsResponse.error) {
             throw actsResponse.error;
        }

        const mappedActs: Activity[] = (actsResponse.data || []).map((a: any) => ({
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
        }));
        setActivities(mappedActs);

        // 3. Fetch Enrollments - FIX: Added range
        const enrResponse = await supabase.from('enrollments').select('*').range(0, 9999);
        if (enrResponse.error) {
             throw enrResponse.error;
        }

        const mappedEnr: Enrollment[] = (enrResponse.data || []).map((e: any) => ({
            id: e.id,
            rut: e.user_rut,
            activityId: e.activity_id,
            state: e.state,
            grades: e.grades || [],
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
        }));
        setEnrollments(mappedEnr);

    } catch (error: any) {
        console.error("CRITICAL ERROR FETCHING DATA:", error.message || error);
        setError(JSON.stringify(error));
    } finally {
        setIsLoading(false);
    }
  };

  // --- ACTIONS ---

  const addActivity = async (activity: Activity) => {
    // 1. Optimistic Update (UI reacts instantly)
    setActivities(prev => {
        const idx = prev.findIndex(a => a.id === activity.id);
        if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = activity;
            return copy;
        }
        return [...prev, activity];
    });

    // 2. DB Insert/Upsert
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
        console.error("Error saving activity:", error.message, JSON.stringify(error));
        alert(`Error guardando actividad: ${error.message}`);
        fetchData(); // Rollback/Refresh on error
    }
  };

  const getUser = (rut: string) => {
    return users.find(u => u.rut.toLowerCase() === rut.toLowerCase());
  };

  const deleteUser = async (rut: string) => {
      // Optimistic delete
      setUsers(prev => prev.filter(u => u.rut !== rut));
      const { error } = await supabase.from('users').delete().eq('rut', rut);
      if (error) {
          console.error("Error deleting user:", error.message);
          fetchData(); // Rollback if failed
      }
  };

  // FIX: Removed Optimistic Update for Bulk operations to prevent "Ghost Data"
  const upsertUsers = async (incomingUsers: User[]) => {
    let added = 0;
    let updated = 0;
    const dbPayloads: any[] = [];

    // Calculate stats just for reporting
    incomingUsers.forEach(incUser => {
        const exists = users.some(u => u.rut === incUser.rut);
        if (exists) updated++; else added++;

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

    if (dbPayloads.length > 0) {
        // DB Operation FIRST
        const { error } = await supabase.from('users').upsert(dbPayloads, { onConflict: 'rut' });
        
        if (error) {
            console.error("Error upserting users:", error.message, JSON.stringify(error));
            if (error.code === '23505') {
                 alert("⚠️ ERROR CRÍTICO DE BASE DE DATOS:\n\nSe detectaron correos electrónicos duplicados.\nLa operación fue rechazada por seguridad.");
            } else {
                 alert(`Error al guardar en base de datos: ${error.message}`);
            }
            return { added: 0, updated: 0 }; // Report failure
        }
        
        // Refresh local state only on success
        await fetchData();
    }

    return { added, updated };
  };

  const enrollUser = async (rut: string, activityId: string) => {
      // Check local logic first
      if (enrollments.some(e => e.rut === rut && e.activityId === activityId)) return;

      const { data, error } = await supabase.from('enrollments').insert({
          user_rut: rut,
          activity_id: activityId,
          state: 'Inscrito'
      }).select();

      if (error) {
          console.error("Error enrolling user:", error.message);
          alert("Error al matricular: " + error.message);
      } else {
          // Add to local state only if DB confirms
          const newEnrollment: Enrollment = {
              id: data[0].id,
              rut,
              activityId,
              state: ActivityState.INSCRITO,
              grades: [],
              attendancePercentage: 0
          };
          setEnrollments(prev => [...prev, newEnrollment]);
      }
  };

  // FIX: Removed Optimistic Update to prevent inconsistency
  const bulkEnroll = async (ruts: string[], activityId: string) => {
      let success = 0;
      let skipped = 0;
      const dbPayloads: any[] = [];

      ruts.forEach(rut => {
          // Check against local cache to count skipped, but DB will also enforce unique constraint
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
              console.error("Bulk enroll error:", error.message, JSON.stringify(error));
              alert("Error en carga masiva a la BD: " + error.message);
              // Do not update local state if failed
              return { success: 0, skipped: ruts.length };
          } else {
              // On success, refresh data to get IDs and ensure consistency
              await fetchData(); 
          }
      }

      return { success, skipped };
  };

  const updateEnrollment = async (id: string, updates: Partial<Enrollment>) => {
      // Optimistic update allowed for single cell edits (grades/attendance) for UI responsiveness
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
          // Ideally revert here, but for grades keeping it optimistic is usually UX preferred unless critical error
          alert("Error guardando nota/asistencia: " + error.message);
      }
  };

  const updateConfig = (newConfig: SystemConfig) => {
      setConfig(newConfig);
      localStorage.setItem('app_config', JSON.stringify(newConfig));
  };

  const resetData = async () => {
    if(confirm("¿Estás seguro de reiniciar la Base de Datos? (Esto borrará los datos en SUPABASE)")) {
        setIsLoading(true);
        // Delete in order to avoid FK constraints
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
        addActivity, upsertUsers, updateConfig, resetData,
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
