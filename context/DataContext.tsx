
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
    try {
        // 1. Fetch Users
        const usersResponse = await supabase.from('users').select('*');
        if (usersResponse.error) {
            console.error("Supabase Error (Users):", usersResponse.error.message, JSON.stringify(usersResponse.error));
            throw new Error(`Error cargando usuarios: ${usersResponse.error.message}`);
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

        // 2. Fetch Activities
        const actsResponse = await supabase.from('activities').select('*');
        if (actsResponse.error) {
            console.error("Supabase Error (Activities):", actsResponse.error.message, JSON.stringify(actsResponse.error));
            throw new Error(`Error cargando actividades: ${actsResponse.error.message}`);
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

        // 3. Fetch Enrollments
        const enrResponse = await supabase.from('enrollments').select('*');
        if (enrResponse.error) {
            console.error("Supabase Error (Enrollments):", enrResponse.error.message, JSON.stringify(enrResponse.error));
            throw new Error(`Error cargando inscripciones: ${enrResponse.error.message}`);
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
        // No bloqueamos la UI completa, pero los datos estarán vacíos.
    } finally {
        setIsLoading(false);
    }
  };

  // --- ACTIONS ---

  const addActivity = async (activity: Activity) => {
    // 1. Optimistic Update
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
    }
  };

  const getUser = (rut: string) => {
    return users.find(u => u.rut.toLowerCase() === rut.toLowerCase());
  };

  const deleteUser = async (rut: string) => {
      setUsers(prev => prev.filter(u => u.rut !== rut));
      const { error } = await supabase.from('users').delete().eq('rut', rut);
      if (error) console.error("Error deleting user:", error.message);
  };

  const upsertUsers = async (incomingUsers: User[]) => {
    let added = 0;
    let updated = 0;

    // 1. Optimistic Update Logic
    const nextUsers = [...users];
    const dbPayloads: any[] = [];

    incomingUsers.forEach(incUser => {
        const existingIdx = nextUsers.findIndex(u => u.rut === incUser.rut);
        
        // Prepare DB Payload (snake_case)
        dbPayloads.push({
            rut: incUser.rut,
            names: incUser.names,
            paternal_surname: incUser.paternalSurname,
            maternal_surname: incUser.maternalSurname,
            email: incUser.email,
            phone: incUser.phone,
            photo_url: incUser.photoUrl,
            system_role: incUser.systemRole,
            academic_role: incUser.academicRole,
            faculty: incUser.faculty,
            department: incUser.department,
            career: incUser.career,
            contract_type: incUser.contractType,
            teaching_semester: incUser.teachingSemester,
            campus: incUser.campus,
            title: incUser.title
        });

        if (existingIdx >= 0) {
            nextUsers[existingIdx] = { ...nextUsers[existingIdx], ...incUser };
            updated++;
        } else {
            nextUsers.push(incUser);
            added++;
        }
    });

    setUsers(nextUsers);

    // 2. DB Upsert (Bulk)
    if (dbPayloads.length > 0) {
        const { error } = await supabase.from('users').upsert(dbPayloads);
        if (error) {
            console.error("Error upserting users:", error.message, JSON.stringify(error));
            // Revertir optimistic update si es crítico, o notificar
        }
    }

    return { added, updated };
  };

  const enrollUser = async (rut: string, activityId: string) => {
      if (enrollments.some(e => e.rut === rut && e.activityId === activityId)) return;

      const newEnrollment: Enrollment = {
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), 
          rut,
          activityId,
          state: ActivityState.INSCRITO,
          grades: [],
          attendancePercentage: 0
      };

      setEnrollments(prev => [...prev, newEnrollment]);

      const { data, error } = await supabase.from('enrollments').insert({
          user_rut: rut,
          activity_id: activityId,
          state: 'Inscrito'
      }).select();

      if (data && data[0]) {
          setEnrollments(prev => prev.map(e => e.rut === rut && e.activityId === activityId ? { ...e, id: data[0].id } : e));
      }
      if (error) {
          console.error("Error enrolling user:", error.message, JSON.stringify(error));
      }
  };

  const bulkEnroll = async (ruts: string[], activityId: string) => {
      let success = 0;
      let skipped = 0;
      const dbPayloads: any[] = [];
      const localNewEnrollments: Enrollment[] = [];

      ruts.forEach(rut => {
          if (enrollments.some(e => e.rut === rut && e.activityId === activityId)) {
              skipped++;
          } else {
              success++;
              const tempId = crypto.randomUUID ? crypto.randomUUID() : `temp-${Math.random()}`;
              
              localNewEnrollments.push({
                  id: tempId,
                  rut,
                  activityId,
                  state: ActivityState.INSCRITO,
                  grades: [],
                  attendancePercentage: 0
              });

              dbPayloads.push({
                  user_rut: rut,
                  activity_id: activityId,
                  state: 'Inscrito'
              });
          }
      });

      if (localNewEnrollments.length > 0) {
          setEnrollments(prev => [...prev, ...localNewEnrollments]);
          const { error } = await supabase.from('enrollments').insert(dbPayloads);
          if (error) {
              console.error("Bulk enroll error:", error.message, JSON.stringify(error));
          } else {
              fetchData(); 
          }
      }

      return { success, skipped };
  };

  const updateEnrollment = async (id: string, updates: Partial<Enrollment>) => {
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
      if (error) console.error("Error updating enrollment:", error.message);
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
        users, activities, enrollments, config, isLoading,
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
