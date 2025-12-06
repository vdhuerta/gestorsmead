
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Activity, Enrollment, SystemConfig, ActivityState } from '../types';
import { MOCK_USERS, MOCK_ACTIVITIES, MOCK_ENROLLMENTS, MOCK_CONFIG } from '../constants';

interface DataContextType {
  users: User[];
  activities: Activity[];
  enrollments: Enrollment[];
  config: SystemConfig;
  addActivity: (activity: Activity) => void;
  getUser: (rut: string) => User | undefined; // Nueva función de búsqueda
  deleteUser: (rut: string) => void; // Nueva función de eliminación
  upsertUsers: (newUsers: User[]) => { added: number; updated: number; processedUsers: User[] };
  enrollUser: (rut: string, activityId: string) => void;
  bulkEnroll: (ruts: string[], activityId: string) => { success: number; skipped: number };
  updateEnrollment: (id: string, updates: Partial<Enrollment>) => void;
  updateConfig: (newConfig: SystemConfig) => void;
  resetData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicializar estado desde LocalStorage o usar Mocks por defecto
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('app_users');
    return saved ? JSON.parse(saved) : MOCK_USERS;
  });

  const [activities, setActivities] = useState<Activity[]>(() => {
    const saved = localStorage.getItem('app_activities');
    return saved ? JSON.parse(saved) : MOCK_ACTIVITIES;
  });

  const [enrollments, setEnrollments] = useState<Enrollment[]>(() => {
    const saved = localStorage.getItem('app_enrollments');
    return saved ? JSON.parse(saved) : MOCK_ENROLLMENTS;
  });

  const [config, setConfig] = useState<SystemConfig>(() => {
    const saved = localStorage.getItem('app_config');
    return saved ? JSON.parse(saved) : MOCK_CONFIG;
  });

  // Efectos para guardar en LocalStorage cada vez que cambian los datos
  useEffect(() => localStorage.setItem('app_users', JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem('app_activities', JSON.stringify(activities)), [activities]);
  useEffect(() => localStorage.setItem('app_enrollments', JSON.stringify(enrollments)), [enrollments]);
  useEffect(() => localStorage.setItem('app_config', JSON.stringify(config)), [config]);

  // FIX: Logic changed to Update or Insert (Upsert) based on ID to prevent duplicates on edit
  const addActivity = (activity: Activity) => {
    setActivities(prev => {
      const existingIndex = prev.findIndex(a => a.id === activity.id);
      if (existingIndex >= 0) {
        // Update existing
        const updatedList = [...prev];
        updatedList[existingIndex] = activity;
        return updatedList;
      } else {
        // Insert new
        return [...prev, activity];
      }
    });
  };

  const updateConfig = (newConfig: SystemConfig) => {
    setConfig(newConfig);
  };

  const getUser = (rut: string) => {
    return users.find(u => u.rut.toLowerCase() === rut.toLowerCase());
  };

  const deleteUser = (rut: string) => {
    setUsers(prev => prev.filter(u => u.rut !== rut));
    // Opcional: Eliminar inscripciones asociadas si fuera necesario, 
    // pero por historia académica a veces se prefiere mantener.
  };

  // Lógica de Base Maestra (Upsert)
  const upsertUsers = (incomingUsers: User[]) => {
    let added = 0;
    let updated = 0;
    const processedList: User[] = [];

    setUsers(currentUsers => {
      const userMap = new Map<string, User>(currentUsers.map(u => [u.rut, u]));
      
      incomingUsers.forEach(incUser => {
        if (userMap.has(incUser.rut)) {
          // Update: Merge data
          const existing = userMap.get(incUser.rut)!;
          const merged: User = { ...existing }; // Clonar para no mutar ref directa
          
          let hasChanges = false;
          (Object.keys(incUser) as Array<keyof User>).forEach(key => {
            // Solo actualizamos si el dato entrante tiene valor y es diferente
            if (incUser[key] !== undefined && incUser[key] !== "" && incUser[key] !== existing[key]) {
               // @ts-ignore
               merged[key] = incUser[key];
               hasChanges = true;
            }
          });

          userMap.set(incUser.rut, merged);
          processedList.push(merged);
          if (hasChanges) updated++;
          else processedList.push(existing); // No changes but processed

        } else {
          // Insert
          userMap.set(incUser.rut, incUser);
          processedList.push(incUser);
          added++;
        }
      });

      return Array.from(userMap.values());
    });

    return { added, updated, processedUsers: processedList };
  };

  // Matricular usuario individual
  const enrollUser = (rut: string, activityId: string) => {
    setEnrollments(prev => {
      // Check if already enrolled
      if (prev.some(e => e.rut === rut && e.activityId === activityId)) {
        return prev;
      }
      const newEnrollment: Enrollment = {
        id: `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        rut,
        activityId,
        state: ActivityState.INSCRITO,
        grades: [],
        attendancePercentage: 0
      };
      return [...prev, newEnrollment];
    });
  };

  // Matrícula Masiva (FIX: Cálculo Síncrono)
  const bulkEnroll = (ruts: string[], activityId: string) => {
    let success = 0;
    let skipped = 0;
    const newEnrollments: Enrollment[] = [];
    
    // Usamos el estado actual 'enrollments' disponible en el closure para calcular
    const existingKeys = new Set(enrollments.map(e => `${e.rut}_${e.activityId}`));

    ruts.forEach(rut => {
       const key = `${rut}_${activityId}`;
       
       if (!existingKeys.has(key)) {
           // Evitar duplicados dentro del mismo lote CSV
           existingKeys.add(key);
           
           newEnrollments.push({
               id: `ENR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
               rut,
               activityId,
               state: ActivityState.INSCRITO,
               grades: [],
               attendancePercentage: 0
           });
           success++;
       } else {
           skipped++;
       }
    });

    if (newEnrollments.length > 0) {
        setEnrollments(prev => [...prev, ...newEnrollments]);
    }

    return { success, skipped };
  };

  const updateEnrollment = (id: string, updates: Partial<Enrollment>) => {
      setEnrollments(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const resetData = () => {
    if(confirm("¿Estás seguro de reiniciar la Base de Datos a los valores de prueba?")) {
        setUsers(MOCK_USERS);
        setActivities(MOCK_ACTIVITIES);
        setEnrollments(MOCK_ENROLLMENTS);
        setConfig(MOCK_CONFIG);
        localStorage.clear();
        window.location.reload();
    }
  };

  return (
    <DataContext.Provider value={{ 
        users, activities, enrollments, config, 
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
