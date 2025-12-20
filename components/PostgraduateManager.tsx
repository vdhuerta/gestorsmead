
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole, ProgramModule, ProgramConfig } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
import { useReloadDirective } from '../hooks/useReloadDirective';

// --- Utility Functions ---

// Normaliza para comparación lógica (quita puntos, guiones, espacios y CEROS a la izquierda)
const normalizeRut = (rut: string): string => {
    if (!rut) return '';
    // Elimina todo lo que no sea número o K, pasa a minúsculas, y quita ceros al inicio
    return rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '').toLowerCase();
};

// Formatea para visualización (X-DV)
const cleanRutFormat = (rut: string): string => {
    // 1. Limpieza base y quitar ceros a la izquierda para estandarizar visualmente
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
    
    if (clean.length < 2) return rut; 
    
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking' | 'config';

interface PostgraduateManagerProps {
    currentUser?: User;
}

export const PostgraduateManager: React.FC<PostgraduateManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective(); // DIRECTIVA_RECARGA
  
  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  
  // Dynamic lists from config
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // FILTER: Only Postgraduate Activities
  const postgraduateActivities = activities.filter(a => a.category === 'POSTGRADUATE');

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  // Main Form State
  const [formData, setFormData] = useState({
    internalCode: '',
    year: new Date().getFullYear(),
    semester: 'ANUAL',
    nombre: '', 
    version: 'V1', 
    modality: listModalities[0], 
    horas: 0, 
    relator: '', // Director del Programa
    fechaInicio: '',
    fechaTermino: '',
    linkRecursos: '',
    linkClase: '',
    linkEvaluacion: ''
  });

  // --- ACADEMIC CONFIGURATION STATE ---
  const [programConfig, setProgramConfig] = useState<ProgramConfig>({
      programType: 'Diplomado',
      modules: [],
      globalAttendanceRequired: 75
  });

  const selectedCourse = useMemo(() => 
    postgraduateActivities.find(a => a.id === selectedCourseId), 
  [postgraduateActivities, selectedCourseId]);

  // CRITICAL FIX: Sync programConfig state when a course is selected
  useEffect(() => {
      if (selectedCourse && selectedCourse.programConfig) {
          setProgramConfig(selectedCourse.programConfig);
      } else if (selectedCourse) {
          // Reset to default if no config exists but course exists
          setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75 });
      }
  }, [selectedCourse]);

  // Manual Enrollment State (13 Fields Base Maestra)
  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'rut' | 'paternalSurname' | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);

  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  // --- BULK UPLOAD STATES ---
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  // Sorting - Using Normalized RUT for robust comparison
  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          // Buscamos usuario normalizando RUT para evitar mismatch por ceros a la izquierda
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          
          const surnameA = userA?.paternalSurname || '';
          const surnameB = userB?.paternalSurname || '';
          
          const compareSurname = surnameA.localeCompare(surnameB, 'es', { sensitivity: 'base' });
          if (compareSurname !== 0) return compareSurname;
          
          const nameA = userA?.names || '';
          const nameB = userB?.names || '';
          return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });
  }, [courseEnrollments, users]);

  // Click outside suggestions
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
              setActiveSearchField(null);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handlers for Academic Configuration (Modules, Dates, etc)
  const handleAddModule = () => {
      const newModule: ProgramModule = {
          id: `MOD-${Date.now()}`,
          name: `Nuevo Módulo ${programConfig.modules.length + 1}`,
          evaluationCount: 1,
          evaluationWeights: [100], // Default 100% for 1 note
          weight: 0,
          classDates: []
      };
      setProgramConfig(prev => ({ ...prev, modules: [...prev.modules, newModule] }));
  };

  const handleUpdateModule = (id: string, field: keyof ProgramModule, value: any) => {
      setProgramConfig(prev => ({
          ...prev,
          modules: prev.modules.map(m => m.id === id ? { ...m, [field]: value } : m)
      }));
  };

  const handleRemoveModule = (id: string) => {
      if(confirm("¿Eliminar este módulo?")) {
          setProgramConfig(prev => ({
              ...prev,
              modules: prev.modules.filter(m => m.id !== id)
          }));
      }
  };

  const handleAddClassDate = (moduleId: string, date: string) => {
      if (!date) return;
      setProgramConfig(prev => ({
          ...prev,
          modules: prev.modules.map(m => {
              if (m.id === moduleId) {
                  const currentDates = m.classDates || [];
                  if (!currentDates.includes(date)) {
                      return { ...m, classDates: [...currentDates, date].sort() };
                  }
              }
              return m;
          })
      }));
  };

  const handleRemoveClassDate = (moduleId: string, date: string) => {
      setProgramConfig(prev => ({
          ...prev,
          modules: prev.modules.map(m => m.id === moduleId ? { ...m, classDates: (m.classDates || []).filter(d => d !== date) } : m)
      }));
  };

  // Main Submit Handler (Create/Update General)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
    const academicPeriodText = `${formData.year}-${formData.semester}`;
    const generatedId = `${cleanCode}-${academicPeriodText}-${formData.version}`;
    const finalId = (view === 'edit' && selectedCourseId) ? selectedCourseId : generatedId;
    
    const totalModules = programConfig.modules.length;
    
    const newActivity: Activity = {
        id: finalId, 
        category: 'POSTGRADUATE', 
        internalCode: formData.internalCode, 
        year: formData.year, 
        academicPeriod: academicPeriodText, 
        name: formData.nombre, 
        version: formData.version, 
        modality: formData.modality, 
        hours: formData.horas, 
        moduleCount: totalModules, 
        evaluationCount: totalModules,
        relator: formData.relator, 
        startDate: formData.fechaInicio, 
        endDate: formData.fechaTermino, 
        linkResources: formData.linkRecursos, 
        classLink: formData.linkClase, 
        evaluationLink: formData.linkEvaluacion, 
        isPublic: true,
        programConfig: programConfig 
    };
    
    await addActivity(newActivity);
    await executeReload(); // DIRECTIVA_RECARGA

    if (view === 'edit') { setView('details'); } else {
        setFormData({ internalCode: '', year: new Date().getFullYear(), semester: 'ANUAL', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: '' });
        setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75 });
        setView('list');
    }
  };

  // --- SAVE HANDLER FOR CONFIG TAB ---
  const handleSaveConfig = async () => {
      if (!selectedCourseId || !selectedCourse) return;
      
      const updatedActivity: Activity = {
          ...selectedCourse,
          programConfig: programConfig // Ensure this uses the latest state
      };

      try {
          await addActivity(updatedActivity);
          await executeReload(); // DIRECTIVA_RECARGA
          alert("Configuración Académica guardada exitosamente.");
      } catch (err) {
          alert("Error al guardar configuración. Revise su conexión.");
          console.error(err);
      }
  };

  const handleEditCourse = () => {
    if (!selectedCourse) return;
    const sem = selectedCourse.academicPeriod ? selectedCourse.academicPeriod.split('-')[1] || 'ANUAL' : 'ANUAL';
    setFormData({
        internalCode: selectedCourse.internalCode || '', 
        year: selectedCourse.year || new Date().getFullYear(), 
        semester: sem, 
        nombre: selectedCourse.name, 
        version: selectedCourse.version || 'V1', 
        modality: selectedCourse.modality, 
        hours: selectedCourse.hours, 
        relator: selectedCourse.relator || '', 
        fechaInicio: selectedCourse.startDate || '', 
        fechaTermino: selectedCourse.endDate || '', 
        linkRecursos: selectedCourse.linkResources || '', 
        linkClase: selectedCourse.classLink || '', 
        linkEvaluacion: selectedCourse.evaluationLink || ''
    });
    // Load Program Config if exists, else default
    if (selectedCourse.programConfig) {
        setProgramConfig(selectedCourse.programConfig);
    } else {
        setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75 });
    