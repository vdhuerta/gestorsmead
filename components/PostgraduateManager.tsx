import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole, ProgramModule, ProgramConfig } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
import { useReloadDirective } from '../hooks/useReloadDirective';

// --- Utility Functions ---

const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
    if (clean.length < 2) return rut; 
    if (clean.length === 8) {
        clean = '0' + clean;
    }
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
type DetailTab = 'enrollment' | 'tracking' | 'config' | 'acta';

interface PostgraduateManagerProps {
    currentUser?: User;
}

export const PostgraduateManager: React.FC<PostgraduateManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective();
  
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // FILTRO POR AÑO SELECCIONADO
  const postgraduateActivities = activities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear);

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), semester: 'ANUAL', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: ''
  });

  const [programConfig, setProgramConfig] = useState<ProgramConfig & { isClosed?: boolean }>({
      programType: 'Diplomado', modules: [], globalAttendanceRequired: 75, isClosed: false
  });

  const [pendingGrades, setPendingGrades] = useState<Record<string, number[]>>({});
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // --- LÓGICA DE CONFIRMACIÓN DE SALIDA (DETECCIÓN DE CAMBIOS) ---
  const [showExitModal, setShowExitModal] = useState(false);
  const [targetNav, setTargetNav] = useState<any>(null); // Puede ser string (tab) o function (setSelectedCourseId(null))

  const hasUnsavedChanges = useMemo(() => Object.keys(pendingGrades).length > 0, [pendingGrades]);

  // Sincronizar flag global con App.tsx
  useEffect(() => {
      (window as any).isPostgraduateDirty = hasUnsavedChanges;
      return () => { (window as any).isPostgraduateDirty = false; };
  }, [hasUnsavedChanges]);

  // Escuchar intentos de navegación desde el menú principal
  useEffect(() => {
    const handleNavAttempt = (e: any) => {
        setTargetNav(e.detail); // e.detail contiene el tab destino
        setShowExitModal(true);
    };
    window.addEventListener('app-nav-attempt', handleNavAttempt);
    return () => window.removeEventListener('app-nav-attempt', handleNavAttempt);
  }, []);

  const handleAttemptExit = (action: () => void) => {
      if (hasUnsavedChanges) {
          setTargetNav(() => action);
          setShowExitModal(true);
      } else {
          action();
      }
  };
  // -------------------------------------------------------------

  const selectedCourse = useMemo(() => postgraduateActivities.find(a => a.id === selectedCourseId), [postgraduateActivities, selectedCourseId]);

  const isCourseClosed = useMemo(() => !!selectedCourse?.programConfig?.isClosed, [selectedCourse]);

  useEffect(() => {
      if (selectedCourse && selectedCourse.programConfig) {
          setProgramConfig(selectedCourse.programConfig);
      } else if (selectedCourse) {
          setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75, isClosed: false });
      }
      setPendingGrades({});
  }, [selectedCourse]);

  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'rut' | 'paternalSurname' | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);

  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error'|'duplicate', text: string, existingId?: string} | null>(null);
  
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          const surnameA = userA?.paternalSurname || '';
          const surnameB = userB?.paternalSurname || '';
          const compareSurname = surnameA.localeCompare(surnameB, 'es', { sensitivity: 'base' });
          if (compareSurname !== 0) return compareSurname;
          return (userA?.names || '').localeCompare(userB?.names || '', 'es', { sensitivity: 'base' });
      });
  }, [courseEnrollments, users]);

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

  const handleAddModule = () => {
      const newModule: ProgramModule = { id: `MOD-${Date.now()}`, name: `Nuevo Módulo ${programConfig.modules.length + 1}`, evaluationCount: 1, evaluationWeights: [100], weight: 0, classDates: [] };
      setProgramConfig(prev => ({ ...prev, modules: [...prev.modules, newModule] }));
  };

  const handleUpdateModule = (id: string, field: keyof ProgramModule, value: any) => {
      setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => m.id === id ? { ...m, [field]: value } : m) }));
  };

  const handleRemoveModule = (id: string) => {
      if(confirm("¿Eliminar este módulo?")) { setProgramConfig(prev => ({ ...prev, modules: prev.modules.filter(m => m.id !== id) })); }
  };

  const handleAddClassDate = (moduleId: string, date: string) => {
      if (!date) return;
      setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => { if (m.id === moduleId) { const currentDates = m.classDates || []; if (!currentDates.includes(date)) { return { ...m, classDates: [...currentDates, date].sort() }; } } return m; }) }));
  };

  const handleRemoveClassDate = (moduleId: string, date: string) => {
      setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => m.id === moduleId ? { ...m, classDates: (m.classDates || []).filter(d => d !== date) } : m) }));
  };

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
    await executeReload();
    if (view === 'edit') { setView('details'); } else {
        setFormData({ internalCode: '', year: new Date().getFullYear(), semester: 'ANUAL', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: '' });
        setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75, isClosed: false });
        setView('list');
    }
  };

  const handleSaveConfig = async () => {
      if (!selectedCourseId || !selectedCourse) return;

      const oldConfig = selectedCourse.programConfig;
      const newConfig = programConfig;

      try {
          // 1. Guardar la nueva estructura de la actividad
          const updatedActivity: Activity = { ...selectedCourse, programConfig: newConfig };
          await addActivity(updatedActivity);

          // 2. Realizar migración física de las notas para evitar el error de desplazamiento
          // Si existía una configuración previa con módulos, re-mapeamos los arreglos de notas
          if (oldConfig && oldConfig.modules && oldConfig.modules.length > 0) {
              for (const enr of courseEnrollments) {
                  const oldGrades = enr.grades || [];
                  const mappedByModuleId: Record<string, number[]> = {};
                  
                  // Mapear notas actuales a sus IDs de módulo originales
                  let currentOffset = 0;
                  oldConfig.modules.forEach(m => {
                      mappedByModuleId[m.id] = oldGrades.slice(currentOffset, currentOffset + (m.evaluationCount || 0));
                      currentOffset += (m.evaluationCount || 0);
                  });

                  // Reconstruir el arreglo plano basándonos en la nueva estructura
                  const nextGrades: number[] = [];
                  newConfig.modules.forEach(m => {
                      const prevModuleGrades = mappedByModuleId[m.id] || [];
                      for (let i = 0; i < (m.evaluationCount || 0); i++) {
                          // Si el módulo existía, mantenemos la nota; si es nuevo o creció, ponemos 0
                          nextGrades.push(prevModuleGrades[i] || 0);
                      }
                  });
                  
                  // Solo actualizar si hubo un cambio real en el arreglo plano para optimizar tráfico
                  if (JSON.stringify(nextGrades) !== JSON.stringify(oldGrades)) {
                      await updateEnrollment(enr.id, { grades: nextGrades });
                  }
              }
          }

          await executeReload();
          alert("Estructura académica y calificaciones sincronizadas exitosamente.");
      } catch (err) {
          console.error("Error en sincronización académica:", err);
          alert("Error al guardar configuración. Revise su conexión.");
      }
  };

  const handleToggleCloseCourse = async () => {
      if (!selectedCourse) return;
      
      if (!isCourseClosed) {
          if (confirm("¿Está seguro de CERRAR este postítulo? Se inhabilitará la edición de notas y asistencia.")) {
              const newConfig = { ...programConfig, isClosed: true };
              const updatedActivity: Activity = { ...selectedCourse, programConfig: newConfig };
              await addActivity(updatedActivity);
              await executeReload();
              setProgramConfig(newConfig);
              alert("Postítulo cerrado correctamente.");
          }
      } else {
          const pass = prompt("Para REABRIR el curso ingrese la clave de ADMINISTRADOR:");
          if (pass === '112358') {
              const newConfig = { ...programConfig, isClosed: false };
              const updatedActivity: Activity = { ...selectedCourse, programConfig: newConfig };
              await addActivity(updatedActivity);
              await executeReload();
              setProgramConfig(newConfig);
              alert("Postítulo reabierto correctamente.");
          } else if (pass !== null) {
              alert("Clave incorrecta.");
          }
      }
  };

  const handleEditCourse = () => {
    if (!selectedCourse) return;
    const sem = selectedCourse.academicPeriod ? selectedCourse.academicPeriod.split('-')[1] || 'ANUAL' : 'ANUAL';
    setFormData({ internalCode: selectedCourse.internalCode || '', year: selectedCourse.year || new Date().getFullYear(), semester: sem, nombre: selectedCourse.name, version: selectedCourse.version || 'V1', modality: selectedCourse.modality, horas: selectedCourse.hours, relator: selectedCourse.relator || '', fechaInicio: selectedCourse.startDate || '', fechaTermino: selectedCourse.endDate || '', linkRecursos: selectedCourse.linkResources || '', linkClase: selectedCourse.classLink || '', linkEvaluacion: selectedCourse.evaluationLink || '' });
    if (selectedCourse.programConfig) { setProgramConfig(selectedCourse.programConfig); } 
    else { setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75, isClosed: false }); }
    setView('edit');
  };

  const handleDeleteActivity = async () => {
      if (!selectedCourseId || !selectedCourse) return;
      const passwordInput = prompt(`ADVERTENCIA: ¿Eliminar programa "${selectedCourse.name}"?\nPara confirmar, ingrese su contraseña de ADMINISTRADOR:`);
      const isMasterAdminPassword = passwordInput === '112358';
      const isCurrentUserPassword = currentUser?.password && passwordInput === currentUser.password;
      if (isMasterAdminPassword || isCurrentUserPassword) { 
          await deleteActivity(selectedCourseId); 
          await executeReload();
          alert("Programa eliminado exitosamente."); 
          setView('list'); 
          setSelectedCourseId(null); 
      } else if (passwordInput !== null) { 
          alert("Contraseña incorrecta. Acción de cancelada."); 
      }
  };

  const handleRefresh = async () => { await executeReload(); };

  const handleManualFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setManualForm(prev => ({ ...prev, [name]: value }));
      if (name === 'rut' || name === 'paternalSurname') {
          setIsFoundInMaster(false); setIsAlreadyEnrolled(false); setEnrollMsg(null);
          let matches: User[] = [];
          if (name === 'rut') {
              const rawInput = normalizeRut(value);
              if (rawInput.length >= 2) { setActiveSearchField('rut'); matches = users.filter(u => normalizeRut(u.rut).includes(rawInput)); } 
              else { setActiveSearchField(null); }
          } else if (name === 'paternalSurname') {
              const rawInput = value.toLowerCase();
              if (rawInput.length >= 2) { setActiveSearchField('paternalSurname'); matches = users.filter(u => u.paternalSurname.toLowerCase().includes(rawInput)); } 
              else { setActiveSearchField(null); }
          }
          if (matches.length > 0) { setSuggestions(matches.slice(0, 5)); setShowSuggestions(true); } 
          else { setSuggestions([]); setShowSuggestions(false); }
      }
  };

  const handleSelectSuggestion = (user: User) => {
      suggestionClickedRef.current = true;
      setManualForm({ rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole });
      setIsFoundInMaster(true); setShowSuggestions(false); setSuggestions([]); setActiveSearchField(null);
      const exists = courseEnrollments.some(e => normalizeRut(e.rut) === normalizeRut(user.rut));
      setIsAlreadyEnrolled(exists);
      if(!exists) setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
      else setEnrollMsg({ type: 'error', text: 'Usuario ya inscrito en este programa.' });
      setTimeout(() => { suggestionClickedRef.current = false; }, 300);
  };

  const handleRutBlur = () => {
      setTimeout(() => {
          if (suggestionClickedRef.current) return;
          if (showSuggestions && activeSearchField === 'rut') setShowSuggestions(false);
          if(!manualForm.rut) return;
          const formatted = cleanRutFormat(manualForm.rut);
          const rawSearch = normalizeRut(formatted);
          const exists = courseEnrollments.some(e => normalizeRut(e.rut) === rawSearch);
          setIsAlreadyEnrolled(exists);
          if (!isFoundInMaster) {
            const user = users.find(u => normalizeRut(u.rut) === rawSearch);
            if(user) {
                setManualForm(prev => ({ ...prev, rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole }));
                setIsFoundInMaster(true);
            } else { 
                setManualForm(prev => ({ ...prev, rut: formatted })); 
            }
          }
      }, 200);
  };

  const handleUpdateMasterData = async () => {
      if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) { alert("Datos incompletos para actualizar."); return; }
      const userToUpsert: User = { rut: manualForm.rut, names: manualForm.names, paternalSurname: manualForm.paternalSurname, maternalSurname: manualForm.maternalSurname, email: manualForm.email, phone: manualForm.phone, academicRole: manualForm.academicRole, faculty: manualForm.faculty, department: manualForm.department, career: manualForm.career, contractType: manualForm.contractType, teachingSemester: manualForm.teachingSemester, campus: manualForm.campus, systemRole: manualForm.systemRole as UserRole };
      try {
          await upsertUsers([userToUpsert]);
          await executeReload();
          setEnrollMsg({ type: 'success', text: 'Datos de Estudiante actualizados en Base Maestra.' });
      } catch (e: any) { setEnrollMsg({ type: 'error', text: 'Error al actualizar usuario.' }); }
  };

  const handleUnenroll = async () => {
      if (!selectedCourseId || !manualForm.rut) return;
      if (confirm(`¿Confirma eliminar la matrícula del estudiante ${manualForm.rut} de este curso?\n\nEl estudiante permanecerá en la Base Maestra.`)) {
          const rawSearch = normalizeRut(manualForm.rut);
          const enrollment = courseEnrollments.find(e => normalizeRut(e.rut) === rawSearch);
          if (enrollment) {
              await deleteEnrollment(enrollment.id);
              await executeReload();
              setEnrollMsg({ type: 'success', text: 'Matrícula eliminada correctamente.' });
              setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
              setIsAlreadyEnrolled(false); setIsFoundInMaster(false);
          } else { setEnrollMsg({ type: 'error', text: 'No se encontró la matrícula para eliminar.' }); }
      }
  };

  const handleUnenrollFromList = async (enrollmentId: string, studentName: string) => {
    if (confirm(`¿Confirma que desea desmatricular a ${studentName} de este programa?\n\nEl registro del estudiante permanecerá en la Base Maestra.`)) {
        try { await deleteEnrollment(enrollmentId); await executeReload(); setEnrollMsg({ type: 'success', text: 'Estudiante desmatriculado correctamente.' }); setTimeout(() => setEnrollMsg(null), 3000); } 
        catch (err) { alert("Error al desmatricular."); }
    }
  };

  const handleManualEnroll = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId || isAlreadyEnrolled) return;
      if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) return;
      const formattedRut = cleanRutFormat(manualForm.rut);
      const userToUpsert: User = { rut: formattedRut, names: manualForm.names, paternalSurname: manualForm.paternalSurname, maternalSurname: manualForm.maternalSurname, email: manualForm.email, phone: manualForm.phone, academicRole: manualForm.academicRole, faculty: manualForm.faculty, department: manualForm.department, career: manualForm.career, contractType: manualForm.contractType, teachingSemester: manualForm.teachingSemester, campus: manualForm.campus, systemRole: manualForm.systemRole as UserRole };
      try {
          await upsertUsers([userToUpsert]);
          await enrollUser(formattedRut, selectedCourseId);
          await executeReload();
          setEnrollMsg({ type: 'success', text: 'Matriculado correctamente.' });
          setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
          setIsFoundInMaster(false); setIsAlreadyEnrolled(false);
      } catch (error: any) { setEnrollMsg({ type: 'error', text: `Error al matricular: ${error.message || 'Verifique conexión'}` }); }
  };

  const handleBulkUpload = () => {
      if (!uploadFile || !selectedCourseId) return;
      const reader = new FileReader(); 
      const isExcel = uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls');
      
      reader.onload = async (e) => {
          let rows: any[][] = [];
          if (isExcel) { 
              const data = e.target?.result; 
              const workbook = read(data, { type: 'array' }); 
              rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }); 
          } else { 
              const text = e.target?.result as string; 
              const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== ''); 
              if (lines.length > 0) { 
                  const delimiter = lines[0].includes(';') ? ';' : ','; 
                  rows = lines.map(line => line.split(delimiter)); 
              } 
          }
          
          if (rows.length < 1) return;
          
          const usersToUpsert: User[] = []; 
          const rutsToEnroll: string[] = []; 
          let startRow = hasHeaders ? 1 : 0;
          
          for (let i = startRow; i < rows.length; i++) {
              const row = rows[i]; 
              const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
              if (rowStrings.length < 1 || !rowStrings[0]) continue;
              
              const cleanRut = cleanRutFormat(rowStrings[0]); 
              const normRut = normalizeRut(cleanRut);
              rutsToEnroll.push(cleanRut);
              
              const masterUser = users.find(u => normalizeRut(u.rut) === normRut);
              const hasNameInFile = rowStrings[1] && rowStrings[1].length > 1;

              if (hasNameInFile || !masterUser) {
                  usersToUpsert.push({ 
                      rut: cleanRut, 
                      names: rowStrings[1] || masterUser?.names || 'Pendiente', 
                      paternalSurname: rowStrings[2] || masterUser?.paternalSurname || 'Pendiente', 
                      maternalSurname: rowStrings[3] || masterUser?.maternalSurname || '', 
                      email: rowStrings[4] || masterUser?.email || `upla.${cleanRut.replace(/[^0-9kK]/g, '')}@upla.cl`, 
                      phone: rowStrings[5] || masterUser?.phone || '', 
                      academicRole: normalizeValue(rowStrings[6] || masterUser?.academicRole || '', listRoles), 
                      faculty: normalizeValue(rowStrings[7] || masterUser?.faculty || '', listFaculties), 
                      department: normalizeValue(rowStrings[8] || masterUser?.department || '', listDepts), 
                      career: normalizeValue(rowStrings[9] || masterUser?.career || '', listCareers), 
                      contractType: normalizeValue(rowStrings[10] || masterUser?.contractType || '', listContracts), 
                      teachingSemester: normalizeValue(rowStrings[11] || masterUser?.teachingSemester || '', listSemesters), 
                      campus: rowStrings[12] || masterUser?.campus || '', 
                      systemRole: masterUser?.systemRole || UserRole.ESTUDIANTE 
                  });
              }
          }
          
          if (usersToUpsert.length > 0) { await upsertUsers(usersToUpsert); }
          const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
          await executeReload();
          setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos, ${result.skipped} ya existentes.` }); 
          setUploadFile(null);
      };
      isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  const getGlobalGradeIndex = (moduleIndex: number, noteIndex: number): number => {
      let globalIndex = 0;
      for (let i = 0; i < moduleIndex; i++) { globalIndex += programConfig.modules[i].evaluationCount || 0; }
      return globalIndex + noteIndex;
  };

  const calculateModuleAverage = (grades: number[], moduleIndex: number): string => {
      const module = programConfig.modules[moduleIndex];
      const count = module.evaluationCount;
      const startIdx = getGlobalGradeIndex(moduleIndex, 0);
      const moduleGrades = grades.slice(startIdx, startIdx + count);
      const validGrades = moduleGrades.filter(g => g > 0);
      if (validGrades.length === 0) return "-";
      
      if (module.evaluationWeights && module.evaluationWeights.length === count) {
          let weightedSum = 0;
          let weightTotal = 0;
          moduleGrades.forEach((g, i) => { 
              if (g > 0) { 
                  const w = module.evaluationWeights![i] || 0; 
                  weightedSum += g * (w / 100); 
                  weightTotal += (w / 100); 
              } 
          });
          if (weightTotal === 0) return "-";
          
          const rawAvg = weightedSum / weightTotal;
          return (Math.floor(rawAvg * 10) / 10).toFixed(1); 
      }
      const sum = validGrades.reduce((a, b) => a + b, 0);
      const rawAvgSimple = sum / validGrades.length;
      return (Math.floor(rawAvgSimple * 10) / 10).toFixed(1);
  };

  const calculateFinalProgramGrade = (grades: number[]): string => {
      let totalWeightedScore = 0;
      let totalWeightUsed = 0;
      programConfig.modules.forEach((mod, idx) => {
          const avgStr = calculateModuleAverage(grades, idx);
          if (avgStr !== "-") { 
              const avg = parseFloat(avgStr); 
              const weight = mod.weight || 0; 
              totalWeightedScore += avg * (weight / 100); 
              totalWeightUsed += (weight / 100); 
          }
      });
      if (totalWeightUsed === 0) return "-";
      
      const rawFinal = totalWeightedScore / totalWeightUsed;
      return (Math.floor(rawFinal * 10) / 10).toFixed(1);
  };

  const handleUpdateGradeLocal = (enrollmentId: string, moduleIndex: number, noteIndex: number, value: string) => {
      if (isCourseClosed) return;
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment || enrollment.situation === 'INACTIVO') return;
      const globalIndex = getGlobalGradeIndex(moduleIndex, noteIndex);
      const totalSlots = programConfig.modules.reduce((acc, m) => acc + (m.evaluationCount || 0), 0);
      
      const currentGrades = pendingGrades[enrollmentId] ? [...pendingGrades[enrollmentId]] : [...(enrollment.grades || [])];
      while(currentGrades.length < totalSlots) currentGrades.push(0);
      
      let grade = parseFloat(value.replace(',', '.'));
      if (value.trim() === '' || isNaN(grade)) grade = 0;
      if (grade > 7.0) grade = 7.0;
      if (grade < 0) grade = 0;
      
      currentGrades[globalIndex] = parseFloat(grade.toFixed(1));
      
      setPendingGrades(prev => ({
          ...prev,
          [enrollmentId]: currentGrades
      }));
  };

  const hasChangesInModule = (moduleIndex: number) => {
      if (isCourseClosed) return false;
      const start = getGlobalGradeIndex(moduleIndex, 0);
      const count = programConfig.modules[moduleIndex].evaluationCount || 0;
      
      return Object.keys(pendingGrades).some(eid => {
          const enr = courseEnrollments.find(e => e.id === eid);
          if (!enr) return false;
          const currentGrades = pendingGrades[eid];
          const currentSlice = currentGrades.slice(start, start + count);
          const originalSlice = (enr.grades || []).slice(start, start + count);
          while(originalSlice.length < count) originalSlice.push(0);
          return JSON.stringify(currentSlice) !== JSON.stringify(originalSlice);
      });
  };

  const handleBatchCommitModule = async (moduleIndex: number) => {
      const start = getGlobalGradeIndex(moduleIndex, 0);
      const count = programConfig.modules[moduleIndex].evaluationCount || 0;
      
      const toUpdate = Object.keys(pendingGrades).filter(eid => {
          const enr = courseEnrollments.find(e => e.id === eid);
          if (!enr || enr.situation === 'INACTIVO') return false;
          const currentGrades = pendingGrades[eid];
          const currentSlice = currentGrades.slice(start, start + count);
          const originalSlice = (enr.grades || []).slice(start, start + count);
          while(originalSlice.length < count) originalSlice.push(0);
          return JSON.stringify(currentSlice) !== JSON.stringify(originalSlice);
      });

      if (toUpdate.length === 0) return;

      setIsProcessingBatch(true);
      try {
          for (const eid of toUpdate) {
              const newGrades = pendingGrades[eid];
              const finalGradeStr = calculateFinalProgramGrade(newGrades);
              const finalGrade = finalGradeStr !== "-" ? parseFloat(finalGradeStr) : 0;
              
              await updateEnrollment(eid, { 
                  grades: newGrades, 
                  finalGrade: finalGrade, 
                  state: finalGrade >= (config.minPassingGrade || 4.0) ? ActivityState.APROBADO : ActivityState.EN_PROCESO 
              });
          }
          await executeReload();
          setPendingGrades(prev => {
              const next = { ...prev };
              toUpdate.forEach(id => delete next[id]);
              return next;
          });
          alert(`Éxito: Se han guardado las notas de ${toUpdate.length} estudiantes en el módulo.`);
      } catch (err) {
          alert("Error al intentar guardar el lote de notas. Verifique su conexión.");
      } finally {
          setIsProcessingBatch(false);
      }
  };

  const handleToggleAttendance = async (enrollmentId: string, sessionIndex: number) => {
      if (isCourseClosed) return;
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment || enrollment.situation === 'INACTIVO') return;
      const sessionKey = `attendanceSession${sessionIndex + 1}`;
      // @ts-ignore
      const newVal = !enrollment[sessionKey];
      const updates: any = { [sessionKey]: newVal };
      const allDates = programConfig.modules.flatMap(m => m.classDates || []);
      const totalSessions = allDates.length > 0 ? allDates.length : 1;
      let presentCount = 0;
      for(let i=0; i<allDates.length; i++) {
          const k = `attendanceSession${i+1}`;
          // @ts-ignore
          const val = (i === sessionIndex) ? newVal : enrollment[k];
          if(val) presentCount++;
      }
      const percentage = Math.round((presentCount / totalSessions) * 100);
      updates.attendancePercentage = percentage;
      await updateEnrollment(enrollmentId, updates);
      await executeReload();
  };

  const handleToggleSituation = async (enrollmentId: string, currentSituation: string | undefined) => {
      if (isCourseClosed) return;
      const newSituation = (currentSituation === 'INACTIVO') ? 'ACTIVO' : 'INACTIVO';
      await updateEnrollment(enrollmentId, { situation: newSituation });
      await executeReload();
  };

  const pendingStats = useMemo(() => {
    if (!selectedCourse || !programConfig.modules.length) return { total: 0, byModule: [] };
    
    const activeEnrolled = sortedEnrollments.filter(e => e.situation !== 'INACTIVO');
    const enrolledCount = activeEnrolled.length;
    
    let totalPending = 0;
    const byModule = programConfig.modules.map((mod, modIdx) => {
        const startIdx = getGlobalGradeIndex(modIdx, 0);
        const count = mod.evaluationCount;
        
        let modFilled = 0;
        activeEnrolled.forEach(enr => {
            const grades = pendingGrades[enr.id] || enr.grades || [];
            const modGrades = grades.slice(startIdx, startIdx + count);
            modFilled += modGrades.filter(g => g !== undefined && g !== null && g > 0).length;
        });
        
        const modTotal = enrolledCount * count;
        const modPending = Math.max(0, modTotal - modFilled);
        totalPending += modPending;
        
        return { name: mod.name, pending: modPending };
    });
    
    return { total: totalPending, byModule };
  }, [selectedCourse, programConfig.modules, sortedEnrollments, pendingGrades]);

  const handleDownloadActa = () => {
    if (!selectedCourse) return;
    
    const verificationCode = `SMEAD-${selectedCourse.internalCode}-${Date.now().toString().slice(-4)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_acta&code=${verificationCode}`)}`;
    
    const coordinadores = users.filter(u => u.academicRole?.toLowerCase().includes("coordinación") || u.academicRole?.toLowerCase().includes("coordinador"));
    const encargadoPrincipal = selectedCourse.relator || (coordinadores.length > 0 ? `${coordinadores[0].names} ${coordinadores[0].paternalSurname}` : "COORDINADOR UNIDAD");
    
    const rowsHTML = sortedEnrollments.map(enr => {
        const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
        const activeGrades = enr.grades || [];
        const moduleAverages = programConfig.modules.map((_, idx) => calculateModuleAverage(activeGrades, idx));
        const finalGrade = calculateFinalProgramGrade(activeGrades);
        
        return `
            <tr>
                <td style="font-weight: bold; border: 1px solid #ddd; padding: 8px;">${enr.rut}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${student ? `${student.paternalSurname} ${student.names}` : 'S/I'}</td>
                ${moduleAverages.map(avg => `<td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${avg}</td>`).join('')}
                <td style="text-align: center; border: 1px solid #ddd; padding: 8px; font-weight: bold; background: #f9f9f9;">${finalGrade}</td>
                <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${enr.attendancePercentage || 0}%</td>
                <td style="text-align: center; border: 1px solid #ddd; padding: 8px; font-weight: bold;">${enr.state.toUpperCase()}</td>
            </tr>
        `;
    }).join('');

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>ACTA FINAL - ${selectedCourse.name}</title>
            <style>
                @page { size: landscape; margin: 1cm; }
                body { font-family: 'Helvetica', sans-serif; color: #333; }
                .acta-header { text-align: center; border-bottom: 2px solid #6b21a8; padding-bottom: 10px; margin-bottom: 20px; }
                .acta-title { font-size: 20px; font-weight: bold; color: #6b21a8; text-transform: uppercase; }
                .course-info { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 13px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th { background: #f1f5f9; color: #475569; padding: 10px; text-transform: uppercase; font-size: 10px; border: 1px solid #ddd; }
                .signatures { display: flex; justify-content: center; margin-top: 60px; text-align: center; }
                .sig-box { width: 350px; border-top: 1px solid #333; padding-top: 10px; font-size: 12px; }
                .footer { margin-top: 40px; font-size: 10px; color: #888; text-align: right; }
                .verification-container { display: flex; justify-content: space-between; align-items: flex-end; border: 1px dashed #ccc; padding: 15px; margin-top: 20px; background: #fffbeb; }
                .verification-text { font-family: monospace; font-size: 11px; }
                .qr-box { text-align: center; }
                .qr-box img { width: 80px; height: 80px; display: block; margin-bottom: 5px; }
            </style>
        </head>
        <body>
            <div class="acta-header">
                <div class="acta-title">Acta Final de Calificaciones - Postítulos SMEAD</div>
                <div style="font-size: 14px; font-weight: bold; margin-top: 5px;">${selectedCourse.name}</div>
            </div>
            
            <div class="course-info">
                <div>
                    <strong>CÓDIGO:</strong> ${selectedCourse.internalCode} <br>
                    <strong>VERSIÓN:</strong> ${selectedCourse.version} <br>
                    <strong>AÑO / SEMESTRE:</strong> ${selectedCourse.academicPeriod}
                </div>
                <div style="text-align: right;">
                    <strong>MODALIDAD:</strong> ${selectedCourse.modality} <br>
                    <strong>DURACIÓN:</strong> ${selectedCourse.hours} Horas <br>
                    <strong>FECHA CIERRE:</strong> ${new Date().toLocaleDateString()}
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>RUT</th>
                        <th>NOMBRE DEL DOCENTE / ESTUDIANTE</th>
                        ${programConfig.modules.map(m => `<th>${m.name}<br>(${m.weight}%)</th>`).join('')}
                        <th>PROMEDIO FINAL</th>
                        <th>% ASISTENCIA</th>
                        <th>SITUACIÓN</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>

            <div class="signatures">
                <div class="sig-box">
                    <strong>${encargadoPrincipal.toUpperCase()}</strong><br>
                    Director / Coordinador de Programa / UAD
                </div>
            </div>

            <div class="verification-container">
                <div class="verification-text">
                    <strong>CÓDIGO DE VERIFICACIÓN:</strong> ${verificationCode}<br>
                    Validado digitalmente por GestorSMEAD en conformidad con el registro institucional.<br>
                    Este documento constituye un registro oficial inalterable.
                </div>
                <div class="qr-box">
                    <img src="${qrUrl}" alt="QR Verificación">
                    <span style="font-size: 8px; font-weight: bold; color: #6b21a8;">ESCANEAR PARA VALIDAR</span>
                </div>
            </div>

            <div class="footer">
                Documento generado el ${new Date().toLocaleString()} - Sistema de Gestión de Actividades Formativas UAD
            </div>
        </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ACTA_FINAL_${selectedCourse.internalCode}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (view === 'list') {
      return (
          <div className="animate-fadeIn space-y-6">
              <div className="flex justify-between items-center">
                  <div><h2 className="text-2xl font-bold text-slate-800">Gestión de Postítulos y Diplomados</h2><p className="text-sm text-slate-500">Administración avanzada de programas académicos modulares.</p></div>
                  <div className="flex gap-4 items-center">
                      {/* SELECTOR DE PERIODO */}
                      <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-200 shadow-inner group">
                          <label className="text-[10px] font-black text-slate-400 uppercase mr-3">Periodo:</label>
                          <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(Number(e.target.value))} 
                            className="text-sm font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase"
                          >
                              <option value={currentYear}>{currentYear}</option>
                              <option value={currentYear - 1}>{currentYear - 1}</option>
                              <option value={currentYear - 2}>{currentYear - 2}</option>
                          </select>
                      </div>

                      <button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), semester: 'ANUAL', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', linkRecursos: '', linkClase: '', linkEvaluacion: '' }); setProgramConfig({ programType: 'Diplomado', modules: [], globalAttendanceRequired: 75, isClosed: false }); setView('create'); }} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 flex items-center gap-2 shadow-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Nuevo Programa</button>
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {postgraduateActivities.map(act => (
                      <div key={act.id} className={`bg-white rounded-xl shadow-sm border p-6 hover:border-purple-300 transition-colors relative overflow-hidden ${act.programConfig?.isClosed ? 'border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
                          {act.programConfig?.isClosed && (
                              <div className="absolute top-0 right-0 bg-slate-800 text-white text-[9px] font-black px-2 py-1 rounded-bl-lg uppercase tracking-widest z-10">CERRADO</div>
                          )}
                          <div className="flex justify-between items-start mb-4"><span className="px-2 py-1 rounded text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">{act.programConfig?.programType || 'Postítulo'}</span><span className="text-xs text-slate-400 font-mono" title="ID">{act.id}</span></div>
                          <h3 className={`font-bold text-lg mb-2 truncate ${act.programConfig?.isClosed ? 'text-slate-500' : 'text-slate-800'}`} title={act.name}>{act.name}</h3>
                          <div className="text-sm text-slate-500 space-y-1 mb-4"><p className="flex items-center gap-2"><span className="font-bold text-xs text-purple-600">DIR:</span> {act.relator || 'Sin Director'}</p><p className="flex items-center gap-2">Modules: {act.programConfig?.modules?.length || 0}</p><p className="flex items-center gap-2">Inicio: {formatDateCL(act.startDate)}</p></div>
                          <button onClick={() => { setSelectedCourseId(act.id); setView('details'); }} className="w-full bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-purple-500 hover:text-purple-600 transition-colors text-sm">Gestionar Programa</button>
                      </div>
                  ))}
                  {postgraduateActivities.length === 0 && (<div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">No hay programas de postítulo registrados para este periodo ({selectedYear}).</div>)}
              </div>
          </div>
      );
  }

  if (view === 'create' || view === 'edit') {
      const isEditMode = view === 'edit';
      return (
          <div className="max-w-5xl mx-auto animate-fadeIn">
              <button onClick={() => isEditMode ? setView('details') : setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← {isEditMode ? 'Volver al detalle' : 'Volver al listado'}</button>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6"><h2 className="text-xl font-bold text-slate-800">{isEditMode ? 'Editar Programa' : 'Nuevo Programa de Postítulo'}</h2><span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-200">{programConfig.programType}</span></div>
                  <form onSubmit={handleCreateSubmit} className="space-y-8">
                      <div className="space-y-4">
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información General</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">Nombre del Programa</label><input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Programa</label><select value={programConfig.programType} onChange={e => setProgramConfig({...programConfig, programType: e.target.value as any})} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-purple-50 focus:ring-purple-500"><option value="Diplomado">Diplomado</option><option value="Postítulo">Postítulo</option><option value="Magíster">Magíster</option><option value="Curso Especialización">Curso Especialización</option></select></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label><input required type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono"/></div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="grid grid-cols-2 gap-2">
                                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Año</label><input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Versión</label><input type="text" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label><select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg">{listModalities.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Horas Cron.</label><input type="number" min="0" value={formData.horas} onChange={e => setFormData({...formData, horas: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                                  </div>
                              </div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Director del Programa</label><input type="text" placeholder="Nombre completo" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio</label><input type="date" value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Término</label><input type="date" value={formData.fechaTermino} onChange={e => setFormData({...formData, fechaTermino: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                              </div>
                          </div>
                      </div>
                      <div className="flex justify-between pt-6 border-t border-slate-100">
                          {isEditMode ? (
                              <>
                                <button type="button" onClick={handleDeleteActivity} className="text-red-600 font-bold text-sm">Eliminar Programa</button>
                                <button type="submit" disabled={isSyncing} className={`bg-purple-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-colors ml-auto ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>
                                    Guardar Cambios
                                </button>
                              </>
                          ) : (
                                <button type="submit" disabled={isSyncing} className={`bg-purple-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-colors ml-auto ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>
                                    Crear Programa
                                </button>
                          )}
                      </div>
                  </form>
              </div>
          </div>
      );
  }

  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
            <button onClick={() => handleAttemptExit(() => { setSelectedCourseId(null); setView('list'); })} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
            <div className={`bg-white border-l-4 rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isCourseClosed ? 'border-slate-500' : 'border-purple-600'}`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${isCourseClosed ? 'bg-slate-200 text-slate-700' : 'bg-purple-100 text-purple-700'}`}>{selectedCourse.programConfig?.programType}</span>
                  <span className="text-slate-400 text-xs">|</span>
                  <span className="text-slate-500 text-xs font-bold uppercase">{selectedCourse.version}</span>
                  {isCourseClosed && <span className="ml-2 bg-slate-800 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">ACTA CERRADA</span>}
                </div>
                <h2 className={`text-2xl font-bold ${isCourseClosed ? 'text-slate-500' : 'text-slate-800'}`}>{selectedCourse.name}</h2>
                <p className="text-slate-500 text-sm mt-1 flex items-center gap-4">
                  <span>Director: {selectedCourse.relator}</span>
                  <span>•</span>
                  <span>{selectedCourse.hours} Horas</span>
                  <span>•</span>
                  <span>{selectedCourse.programConfig?.modules?.length || 0} Módulos</span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                    <span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Sincronizando...' : 'En Línea'}</span>
                  </div>
                  <div className="h-4 w-px bg-slate-300 mx-2"></div>
                  <button onClick={handleRefresh} className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1"><svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Actualizar</button>
                </div>
                {!isCourseClosed && <button onClick={handleEditCourse} className="text-xs bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold">Modificar Datos Base</button>}
              </div>
            </div>
            
            <div className="mt-8">
              <div className="flex items-end gap-2 border-b border-purple-200 pl-4 mb-0">
                <button onClick={() => handleAttemptExit(() => setActiveDetailTab('enrollment'))} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-purple-700 border-t-purple-600 border-x border-purple-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Matrícula</button>
                <button onClick={() => handleAttemptExit(() => setActiveDetailTab('config'))} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'config' ? 'bg-white text-purple-700 border-t-purple-600 border-x border-purple-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Configuración Académica</button>
                <button onClick={() => handleAttemptExit(() => setActiveDetailTab('tracking'))} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'tracking' ? 'bg-white text-purple-700 border-t-purple-600 border-x border-purple-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Seguimiento</button>
                {isCourseClosed && <button onClick={() => handleAttemptExit(() => setActiveDetailTab('acta'))} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'acta' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-indigo-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Acta Final</button>}
              </div>
              
              <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-purple-200 border-t-0 p-8">
                {activeDetailTab === 'enrollment' && (
                  <div className="space-y-8">
                    {!isCourseClosed && (
                        <div className={`bg-white rounded-xl shadow-sm border p-6 transition-colors ${isAlreadyEnrolled ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className={`font-bold text-lg flex items-center gap-2 ${isAlreadyEnrolled ? 'text-red-700' : 'text-slate-800'}`}>{isAlreadyEnrolled ? (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Gestión de Matrícula Existente</>) : ("Matrícula Individual")}</h3>
                            {isFoundInMaster && !isAlreadyEnrolled && (<span className="text-xs px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">Datos de Base Maestra</span>)}
                        </div>
                        <form onSubmit={handleManualEnroll} className="space-y-8">
                            <div className="space-y-4">
                            <h3 className={`text-sm font-bold uppercase tracking-wide border-b pb-2 ${isAlreadyEnrolled ? 'text-red-400 border-red-100' : 'text-slate-500 border-slate-100'}`}>Identificación Personal</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-1 relative">
                                <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                <div className="relative">
                                    <input type="text" name="rut" placeholder="12345678-9" autoComplete="off" value={manualForm.rut} onChange={handleManualFormChange} onBlur={handleRutBlur} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 font-bold ${isFoundInMaster ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-slate-300'} ${isAlreadyEnrolled ? 'border-red-500 bg-white text-red-800' : ''}`}/>
                                    {showSuggestions && activeSearchField === 'rut' && suggestions.length > 0 && (
                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">
                                        <div className="px-2 py-1 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase">Sugerencias por RUT</div>
                                        {suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span></div>))}
                                    </div>
                                    )}
                                </div>
                                </div>
                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                                <div className="md:col-span-1 relative">
                                <label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label>
                                <input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualFormChange} autoComplete="off" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/>
                                {showSuggestions && activeSearchField === 'paternalSurname' && suggestions.length > 0 && (
                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">
                                    <div className="px-2 py-1 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase">Sugerencias por Apellido</div>
                                    {suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.paternalSurname} {s.maternalSurname}</span><span className="text-xs text-slate-500">{s.names} ({s.rut})</span></div>))}
                                    </div>
                                )}
                                </div>
                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"/></div>
                            </div>
                            </div>
                            <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información de Contacto</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional</label><input type="email" name="email" value={manualForm.email} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                            </div>
                            </div>
                            <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información Académica</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">Sede / Campus</label><input type="text" name="campus" value={manualForm.campus} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"/></div>
                                <SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleManualFormChange} />
                                <SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleManualFormChange} />
                                <SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleManualFormChange} />
                                <SmartSelect label="Tipo Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleManualFormChange} />
                                <SmartSelect label="Semestre Docencia" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleManualFormChange} />
                            </div>
                            </div>
                            <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Roles</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><SmartSelect label="Rol / Cargo Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualFormChange} /></div>
                            </div>
                            </div>
                            {isFoundInMaster && (
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Acciones de Base Maestra (Usuario Existente)</h4>
                                <div className="flex gap-2">
                                <button type="button" onClick={handleUpdateMasterData} disabled={isSyncing} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-3 rounded shadow-sm flex items-center justify-center gap-1 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Guardar Cambios (Datos Personales)</button>
                                </div>
                            </div>
                            )}
                            {isAlreadyEnrolled ? (
                            <button type="button" onClick={handleUnenroll} disabled={isSyncing} className={`w-full py-2.5 rounded-lg font-bold shadow-md transition-all bg-red-600 hover:bg-red-700 text-white ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>Eliminar Matrícula del Curso</button>
                            ) : (
                            <button type="submit" disabled={isSyncing} className={`w-full py-2.5 rounded-lg font-bold shadow-md transition-all bg-purple-600 text-white hover:bg-purple-700 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>Matricular Usuario</button>
                            )}
                            {enrollMsg && (<div className={`text-xs p-3 rounded-lg text-center font-medium ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{enrollMsg.text}</div>)}
                        </form>
                        </div>
                    )}
                    
                    {!isCourseClosed && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
                        <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2"><svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>Carga Masiva (CSV / Excel)</h3>
                        <div className="flex-1 space-y-6 flex flex-col justify-center">
                            <p className="text-sm text-slate-600">Suba un archivo con las 13 columnas requeridas para la matrícula.<br/><span className="text-xs text-slate-400">.csv, .xls, .xlsx</span></p>
                            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-purple-200 bg-purple-50 hover:bg-purple-100'}`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {uploadFile ? (<><svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p className="mb-1 text-sm font-bold text-emerald-700">{uploadFile.name}</p></>) : (<><svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="mb-1 text-sm text-purple-600 font-semibold">Seleccionar archivo</p></>)}
                            </div>
                            <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} />
                            </label>
                            <div className="flex items-center justify-center gap-2 mt-2">
                            <input type="checkbox" id="hasHeadersEnrollment" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer" /><label htmlFor="hasHeadersEnrollment" className="text-sm text-slate-700 cursor-pointer select-none">Ignorar primera fila (encabezados)</label>
                            </div>
                            <button onClick={handleBulkUpload} disabled={!uploadFile} className="mt-auto w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 disabled:opacity-50 shadow-md transition-all">Procesar Archivo</button>
                        </div>
                        </div>
                    )}
                    
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className={`w-full text-sm text-left ${isCourseClosed ? 'opacity-50' : ''}`}>
                        <thead className="bg-slate-50 text-slate-700">
                          <tr><th className="px-6 py-3">RUT</th><th className="px-6 py-3">Nombre</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-center">Acción</th></tr>
                        </thead>
                        <tbody>
                          {sortedEnrollments.map(enr => { const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut)); return (<tr key={enr.id} className="border-t border-slate-100"><td className="px-6 py-3 font-mono">{enr.rut}</td><td className="px-6 py-3">{u?.names} {u?.paternalSurname}</td><td className="px-6 py-3">{enr.state}</td><td className="px-6 py-3 text-center">{!isCourseClosed && <button onClick={() => handleUnenrollFromList(enr.id, u ? `${u.names} ${u.paternalSurname}` : enr.rut)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all shadow-sm whitespace-nowrap">DESMATRICULAR</button>}</td></tr>);})}
                          {sortedEnrollments.length === 0 && (<tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No hay estudiantes matriculados en este programa.</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )} 
                {activeDetailTab === 'config' && (
                  <div className={`space-y-8 animate-fadeIn ${isCourseClosed ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center"><h3 className="font-bold text-slate-800 text-lg">Estructura Curricular del Programa</h3>{!isCourseClosed && <button onClick={handleAddModule} className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-200 flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Agregar Módulo</button>}</div>
                    <div className="space-y-6">{programConfig.modules.map((module, idx) => (<div key={module.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:border-purple-300 transition-colors"><div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4"><div className="flex-1"><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre del Módulo {idx + 1}</label><input type="text" disabled={isCourseClosed} value={module.name} onChange={(e) => handleUpdateModule(module.id, 'name', e.target.value)} className="w-full font-bold text-slate-800 text-lg border-none focus:ring-0 p-0 placeholder-slate-300 disabled:bg-transparent" placeholder="Nombre del Módulo..."/></div>{!isCourseClosed && <button onClick={() => handleRemoveModule(module.id)} className="text-red-400 hover:text-red-600 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}</div><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-4"><div><label className="block text-xs font-bold text-slate-600 mb-1">Académico a Cargo</label><select disabled={isCourseClosed} value={module.relatorRut || ''} onChange={(e) => handleUpdateModule(module.id, 'relatorRut', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"><option value="">Seleccione Académico...</option>{users.filter(u => u.systemRole === UserRole.ASESOR).map(u => (<option key={u.rut} value={u.rut}>{u.names} {u.paternalSurname}</option>))}</select></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-600 mb-1">Cant. Notas (0-6)</label><select disabled={isCourseClosed} value={module.evaluationCount} onChange={(e) => { const count = Number(e.target.value); setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => { if (m.id === module.id) { const current = m.evaluationWeights || []; const nextWeights = Array.from({length: count}, (_, i) => current[i] || 0); return { ...m, evaluationCount: count, evaluationWeights: nextWeights }; } return m; }) })); }} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50">{[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></div><div><label className="block text-xs font-bold text-slate-600 mb-1">Ponderación Módulo %</label><input type="number" disabled={isCourseClosed} min="0" max="100" value={module.weight} onChange={(e) => handleUpdateModule(module.id, 'weight', Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"/></div></div>{module.evaluationCount > 0 && (<div className="col-span-full mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100"><label className="block text-[10px] font-bold text-purple-700 uppercase mb-2">Ponderación de cada Nota (Total 100%)</label><div className="flex flex-wrap gap-2">{Array.from({length: module.evaluationCount}).map((_, i) => (<div key={i} className="flex flex-col w-20"><span className="text-[10px] text-purple-500 mb-0.5 font-bold">Nota {i+1}</span><div className="relative"><input disabled={isCourseClosed} type="number" min="0" max="100" placeholder="%" value={module.evaluationWeights?.[i] || 0} onChange={(e) => { const val = Number(e.target.value); setProgramConfig(prev => ({ ...prev, modules: prev.modules.map(m => { if(m.id === module.id) { const w = [...(m.evaluationWeights || [])]; w[i] = val; return { ...m, evaluationWeights: w }; } return m; }) })); }} className="w-full px-2 py-1 text-sm border border-purple-200 rounded text-center font-bold text-purple-800 focus:ring-purple-500 focus:border-purple-500"/><span className="absolute right-1 top-1 text-[10px] text-purple-300">%</span></div></div>))}</div></div>)}</div><div className="space-y-4"><div><label className="block text-xs font-bold text-slate-600 mb-1">Fecha Inicio Módulo</label><input disabled={isCourseClosed} type="date" value={module.startDate || ''} onChange={(e) => handleUpdateModule(module.id, 'startDate', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"/></div><div><label className="block text-xs font-bold text-slate-600 mb-1">Fecha Término Módulo</label><input disabled={isCourseClosed} type="date" value={module.endDate || ''} onChange={(e) => handleUpdateModule(module.id, 'endDate', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"/></div></div><div className="bg-purple-50 p-4 rounded-lg border border-purple-100"><label className="block text-xs font-bold text-purple-800 mb-2">Calendario de Clases (Días Específicos)</label><div className="flex gap-2 mb-2"><input disabled={isCourseClosed} type="date" id={`date-${module.id}`} className="flex-1 px-2 py-1 text-xs border border-purple-200 rounded"/><button disabled={isCourseClosed} type="button" onClick={() => { const input = document.getElementById(`date-${module.id}`) as HTMLInputElement; if(input) handleAddClassDate(module.id, input.value); }} className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-purple-700">+</button></div><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">{module.classDates?.map(date => (<span key={date} className="bg-white border border-purple-200 text-purple-700 px-2 py-1 rounded text-[10px] flex items-center gap-1 shadow-sm">{formatDateCL(date)}<button disabled={isCourseClosed} onClick={() => handleRemoveClassDate(module.id, date)} className="text-red-400 hover:text-red-600 font-bold">×</button></span>))}{(!module.classDates || module.classDates.length === 0) && <span className="text-[10px] text-purple-400 italic">Sin fechas asignadas</span>}</div></div></div></div>))} {programConfig.modules.length === 0 && (<div className="text-center py-12 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-400">Agregue módulos para configurar la estructura académica.</div>)}</div>
                    {!isCourseClosed && <div className="flex justify-end pt-4 border-t border-slate-200"><button onClick={handleSaveConfig} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-green-700 transition-colors">Guardar Configuración Académica</button></div>}
                  </div>
                )} 
                {activeDetailTab === 'tracking' && (
                  <div className="animate-fadeIn space-y-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                      <div><h3 className="font-bold text-purple-800 text-lg">Seguimiento Académico Modular</h3><p className="text-xs text-purple-600">Gestión de calificaciones por módulo y cálculo de promedio final.</p></div>
                      
                      <button 
                          onClick={handleToggleCloseCourse}
                          className={`px-4 py-2 rounded-lg font-black uppercase text-xs shadow-md transition-all active:scale-95 flex items-center gap-2 ${isCourseClosed ? 'bg-rose-600 text-white hover:bg-rose-700 animate-pulse' : 'bg-slate-800 text-white hover:bg-black'}`}
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCourseClosed ? "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" : "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"} /></svg>
                          {isCourseClosed ? 'REABRIR CURSO' : 'CERRAR POSTÍTULO'}
                      </button>

                      <div className="flex gap-4 text-center">
                        <div className="bg-white px-4 py-2 rounded-lg border border-purple-100 shadow-sm"><span className="block text-xl font-bold text-slate-700">{sortedEnrollments.length}</span><span className="text-[10px] font-bold text-slate-400 uppercase">Matriculados</span></div>
                        <div className="bg-white px-4 py-2 rounded-lg border border-purple-100 shadow-sm"><span className="block text-xl font-bold text-slate-700">{programConfig.modules.length}</span><span className="text-[10px] font-bold text-slate-400 uppercase">Módulos</span></div>
                        
                        <div className="bg-white px-4 py-2 rounded-lg border border-rose-100 shadow-sm relative group cursor-help">
                            <span className="block text-xl font-bold text-rose-600">{pendingStats.total}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Notas Pendientes</span>
                            
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-rose-200 shadow-2xl rounded-xl z-50 p-4 hidden group-hover:block animate-fadeIn">
                                <div className="text-[10px] font-black text-rose-700 uppercase border-b border-rose-50 pb-2 mb-2 flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Notas Faltantes por Módulo
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                    {pendingStats.byModule.map((m, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-[11px] border-b border-slate-50 pb-1 last:border-0">
                                            <span className="truncate text-slate-600 font-medium pr-2">{m.name}</span>
                                            <span className={`font-black ${m.pending > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {m.pending > 0 ? `${m.pending} pend.` : 'Al día'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                      </div>
                    </div> 
                    {programConfig.modules.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-slate-500">Debe configurar los Módulos en la pestaña "Configuración Académica" antes de ingresar notas.</div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                              {(() => { 
                                const allProgramDates = programConfig.modules.flatMap(mod => (mod.classDates || []).map(date => ({ date, moduleId: mod.id, moduleName: mod.name, relatorRut: mod.relatorRut })) ).sort((a, b) => a.date.localeCompare(b.date)); 
                                return (
                                  <>
                                    <tr>
                                      <th className="px-2 py-3 bg-white sticky left-0 z-20 border-r border-slate-200 w-[200px] min-w-[200px] truncate">Estudiante</th>
                                      <th className="px-4 py-3 text-center border-r border-slate-200 w-[100px] bg-slate-50">Situación</th>
                                      {programConfig.modules.map((mod, idx) => (
                                        <th key={mod.id} colSpan={(mod.evaluationCount || 0) + 1} className={`px-2 py-2 text-center border-r border-slate-200 ${idx % 2 === 0 ? 'bg-purple-50/50' : 'bg-white'}`}>
                                          <div className="flex flex-col">
                                            <span className="text-xs uppercase text-purple-700 mb-1 truncate max-w-[150px]" title={mod.name}>{mod.name}</span>
                                            <span className="text-[10px] bg-white border border-purple-100 rounded px-1 w-fit mx-auto text-purple-900 font-black">{mod.weight}%</span>
                                          </div>
                                        </th>
                                      ))}
                                      <th className="px-4 py-3 text-center min-w-[80px] bg-slate-100">Final</th>
                                      <th className="px-4 py-3 text-center min-w-[100px]">Estado</th>
                                      {allProgramDates.map((d, i) => { 
                                        const academic = users.find(u => u.rut === d.relatorRut); 
                                        const surname = academic?.paternalSurname || 'S/D'; 
                                        const dateDisplay = formatDateCL(d.date).split('-').slice(0,2).join('-'); 
                                        return (
                                          <th key={`${d.moduleId}-${d.date}`} className="px-1 py-2 text-center border-r border-slate-200 w-[60px] min-w-[60px]">
                                            <div className="flex flex-col items-center justify-center">
                                              <span className="text-[9px] font-bold text-slate-600 uppercase truncate max-w-[55px]" title={surname}>{surname}</span>
                                              <span className="text-[9px] text-slate-400">{dateDisplay}</span>
                                            </div>
                                          </th>
                                        ); 
                                      })} 
                                      <th className="px-2 py-3 text-center min-w-[80px] bg-slate-100 border-l border-slate-200">% Asist.</th>
                                    </tr>
                                    <tr className="bg-slate-100 text-xs text-slate-500 border-b border-slate-200">
                                      <th className="bg-slate-50 sticky left-0 z-20 border-r border-slate-200"></th>
                                      <th className="bg-slate-50 border-r border-slate-200"></th>
                                      {programConfig.modules.map((mod, modIdx) => (
                                        <React.Fragment key={`sub-${mod.id}`}>
                                          {Array.from({ length: mod.evaluationCount }).map((_, noteIdx) => (<th key={`${mod.id}-n${noteIdx}`} className="px-1 py-1 text-center w-[50px] min-w-[50px] font-normal border-r border-slate-100">N{noteIdx + 1} <span className="text-[8px] text-purple-600 block font-bold">{mod.evaluationWeights?.[noteIdx] || '-'}%</span></th>))}
                                          <th className="px-2 py-1 text-center w-[50px] min-w-[50px] font-bold text-purple-700 bg-purple-50/30 border-r border-slate-200">Prom</th>
                                        </React.Fragment>
                                      ))}
                                      <th className="bg-slate-100"></th>
                                      <th></th>
                                      {allProgramDates.map((d) => <th key={`sub-${d.date}`} className="bg-slate-50"></th>)}
                                      <th className="bg-slate-100 border-l border-slate-200"></th>
                                    </tr>
                                  </>
                                ); 
                              })()}
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sortedEnrollments.map((enr) => { 
                                const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut)); 
                                const isInactive = enr.situation === 'INACTIVO';
                                const activeGrades = pendingGrades[enr.id] || enr.grades || [];
                                const finalGrade = calculateFinalProgramGrade(activeGrades); 
                                const allProgramDates = programConfig.modules.flatMap(mod => (mod.classDates || []).map(date => ({ date, moduleId: mod.id })) ).sort((a, b) => a.date.localeCompare(b.date)); 
                                const totalDatesCount = allProgramDates.length; 
                                let presentCount = 0; 
                                allProgramDates.forEach((_, idx) => { if (enr[`attendanceSession${idx + 1}` as keyof Enrollment]) presentCount++; }); 
                                const dynamicPercentage = totalDatesCount > 0 ? Math.round((presentCount / totalDatesCount) * 100) : 0; 
                                return (
                                  <tr key={enr.id} className={`hover:bg-purple-50/20 transition-colors ${isInactive || isCourseClosed ? 'grayscale opacity-60 bg-slate-50' : ''}`}>
                                    <td className="px-2 py-2 font-medium sticky left-0 bg-white border-r border-slate-200 z-10 w-[200px] min-w-[200px] truncate">
                                      <div className="flex flex-col truncate">
                                        <span className={`truncate ${isCourseClosed ? 'text-slate-400 font-bold' : 'text-slate-700'}`} title={`${student?.names} ${student?.paternalSurname}`}>{student ? `${student.paternalSurname} ${student.maternalSurname || ''}, ${student.names}` : enr.rut}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">{enr.rut}</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 text-center border-r border-slate-200">
                                      <button 
                                        disabled={isSyncing || isCourseClosed}
                                        onClick={() => handleToggleSituation(enr.id, enr.situation)}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                          isInactive 
                                          ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm' 
                                          : 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm'
                                        } ${isSyncing || isCourseClosed ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {isInactive ? 'INACTIVO' : 'ACTIVO'}
                                      </button>
                                    </td>
                                    {programConfig.modules.map((mod, modIdx) => (
                                      <React.Fragment key={`row-${enr.id}-${mod.id}`}>
                                        {Array.from({ length: mod.evaluationCount }).map((_, noteIdx) => { 
                                          const globalIdx = getGlobalGradeIndex(modIdx, noteIdx); 
                                          const gradeVal = activeGrades[globalIdx]; 
                                          return (
                                            <td key={`${enr.id}-${mod.id}-${noteIdx}`} className="px-1 py-2 text-center border-r border-slate-50">
                                              <input type="number" step="0.1" min="1" max="7" disabled={isInactive || isSyncing || isCourseClosed} className={`w-full min-w-[40px] text-center border border-slate-200 rounded py-1 text-sm font-bold px-0 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${gradeVal && gradeVal < 4.0 ? 'text-red-500' : 'text-slate-700'} ${isInactive || isCourseClosed ? 'cursor-not-allowed bg-slate-100 opacity-50' : ''}`} value={gradeVal || ''} onChange={(e) => handleUpdateGradeLocal(enr.id, modIdx, noteIdx, e.target.value)} />
                                            </td>
                                          ); 
                                        })}
                                        <td className="px-2 py-2 text-center border-r border-slate-200 bg-purple-50/10">
                                          <span className={`text-xs font-bold ${parseFloat(calculateModuleAverage(activeGrades, modIdx)) < 4.0 ? 'text-red-500' : 'text-purple-700'}`}>{calculateModuleAverage(activeGrades, modIdx)}</span>
                                        </td>
                                      </React.Fragment>
                                    ))}
                                    <td className="px-4 py-3 text-center font-bold text-slate-800 bg-slate-50 border-l border-slate-200">
                                      <span className={parseFloat(finalGrade) < 4.0 && finalGrade !== '-' ? 'text-red-600' : ''}>{finalGrade}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{enr.state}</span>
                                    </td>
                                    {allProgramDates.map((d, i) => { 
                                      const sessionKey = `attendanceSession${i + 1}` as keyof Enrollment; 
                                      const isChecked = enr[sessionKey]; 
                                      return (
                                        <td key={`att-${enr.id}-${i}`} className="px-1 py-2 text-center border-r border-slate-100">
                                          <input type="checkbox" checked={!!isChecked} disabled={isInactive || isSyncing || isCourseClosed} onChange={() => handleToggleAttendance(enr.id, i)} className={`rounded text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4 ${isInactive || isCourseClosed ? 'cursor-not-allowed opacity-30' : ''}`}/>
                                        </td>
                                      ); 
                                    })} 
                                    <td className="px-2 py-2 text-center font-bold text-slate-700 bg-slate-50 border-l border-slate-200">
                                      <span className={dynamicPercentage < 75 ? 'text-red-500' : 'text-green-600'}>{dynamicPercentage}%</span>
                                    </td>
                                  </tr>
                                ); 
                              })}

                              <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 sticky bottom-0 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                                  <td className="px-2 py-4 bg-slate-100 sticky left-0 border-r border-slate-200 z-40 text-right text-[10px] text-slate-500 uppercase tracking-widest flex items-center justify-end gap-2 h-full">
                                      <span>Acciones Módulo</span>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                  </td>
                                  <td className="bg-slate-100 border-r border-slate-200"></td>
                                  {programConfig.modules.map((mod, modIdx) => {
                                      const hasChanges = hasChangesInModule(modIdx);
                                      return (
                                          <td key={`batch-save-${modIdx}`} colSpan={(mod.evaluationCount || 0) + 1} className="px-2 py-3 text-center border-r border-slate-200">
                                              <button 
                                                  type="button"
                                                  disabled={!hasChanges || isProcessingBatch || isCourseClosed}
                                                  onClick={() => handleBatchCommitModule(modIdx)}
                                                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md transition-all transform active:scale-95 border-2 ${
                                                      hasChanges 
                                                      ? 'bg-purple-600 text-white hover:bg-purple-700 animate-pulse border-white' 
                                                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border-transparent'
                                                  }`}
                                              >
                                                  {isProcessingBatch ? 'Procesando...' : 'Ingresar/Grabar'}
                                              </button>
                                          </td>
                                      );
                                  })}
                                  <td colSpan={2 + (programConfig.modules.flatMap(m => m.classDates || []).length) + 2} className="bg-slate-50"></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeDetailTab === 'acta' && isCourseClosed && (
                    <div className="animate-fadeIn space-y-8 max-w-4xl mx-auto py-10">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-3xl p-10 flex flex-col items-center text-center shadow-sm">
                            <div className="w-20 h-20 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h3 className="text-2xl font-black text-indigo-900 mb-2">Acta Final de Calificaciones</h3>
                            <p className="text-slate-600 max-w-lg mb-8 leading-relaxed">Este documento constituye el registro oficial de calificaciones y promedios finales del programa, inhabilitado para futuras modificaciones debido al cierre del curso.</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md mb-10">
                                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-inner">
                                    <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Inscritos</span>
                                    <span className="text-2xl font-black text-indigo-700">{courseEnrollments.length}</span>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-inner">
                                    <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">Aprobados</span>
                                    <span className="text-2xl font-black text-emerald-600">{courseEnrollments.filter(e => e.state === ActivityState.APROBADO).length}</span>
                                </div>
                            </div>

                            <button 
                                onClick={handleDownloadActa}
                                className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl hover:bg-indigo-700 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-3"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Descargar Acta Oficial (.html)
                            </button>
                        </div>
                    </div>
                )}
              </div>
            </div>

            {/* MODAL DE CONFIRMACIÓN DE SALIDA (CAMBIOS SIN GUARDAR) */}
            {showExitModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-slate-200">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Cambios sin guardar</h3>
                        <p className="text-slate-600 mb-8">Has comenzado a introducir notas. Si sales ahora, perderás los cambios no guardados.</p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => { setShowExitModal(false); setTargetNav(null); }}
                                className="w-full py-3 bg-[#647FBC] text-white rounded-xl font-bold hover:bg-blue-800 transition-colors"
                            >
                                Continuar editando
                            </button>
                            <button 
                                onClick={() => {
                                    (window as any).isPostgraduateDirty = false;
                                    setShowExitModal(false);
                                    if (typeof targetNav === 'function') {
                                        targetNav();
                                    } else if (typeof targetNav === 'string') {
                                        window.dispatchEvent(new CustomEvent('force-nav', { detail: targetNav }));
                                    }
                                    setTargetNav(null);
                                }}
                                className="w-full py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                            >
                                Salir
                            </button>
                        </div>
                    </div>
                </div>
            )}
          </div>
      );
  }

  return <div>Estado desconocido</div>;
};
