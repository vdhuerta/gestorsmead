import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';
import { SmartSelect } from './SmartSelect'; 
import { suggestCompetencies, CompetencySuggestion } from '../services/geminiService';
// @ts-ignore
import { read, utils } from 'xlsx';
// @ts-ignore
import { jsPDF } from 'jspdf';
import { useReloadDirective } from '../hooks/useReloadDirective';

// --- Utility Functions ---
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
    if (clean.length < 2) return rut;
    if (clean.length === 8) { clean = '0' + clean; }
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

const loadImageToPdf = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking' | 'acta';

interface CourseManagerProps {
    currentUser?: User;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  
  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  const isAdvisor = currentUser?.systemRole === UserRole.ASESOR;

  const advisors = useMemo(() => users.filter(u => u.systemRole === UserRole.ASESOR), [users]);

  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "Online"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  const academicActivities = useMemo(() => {
    return activities.filter(a => (a.category === 'ACADEMIC' || !a.category) && a.year === selectedYear);
  }, [activities, selectedYear]);

  // --- LÓGICA DE ORDENACIÓN PRIORIZANDO 2DO SEMESTRE ---
  const sortedAcademicActivities = useMemo(() => {
    const getPriority = (period?: string) => {
        if (!period) return 3;
        if (period.endsWith('-2') || period.toLowerCase().includes('2do') || period.toLowerCase().includes('segundo')) return 0;
        if (period.endsWith('-1') || period.toLowerCase().includes('1er') || period.toLowerCase().includes('primero')) return 1;
        return 2;
    };
    return [...academicActivities].sort((a, b) => {
        const prioA = getPriority(a.academicPeriod);
        const prioB = getPriority(b.academicPeriod);
        if (prioA !== prioB) return prioA - prioB;
        return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [academicActivities]);

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [isAnalyzingIA, setIsAnalyzingIA] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CompetencySuggestion[]>([]);
  const [showAiReview, setShowAiReview] = useState(false);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);

  // Estados temporales para edición por lote
  const [pendingGrades, setPendingGrades] = useState<Record<string, number[]>>({});
  const [pendingAttendance, setPendingAttendance] = useState<Record<string, Record<string, boolean>>>({});
  
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isGeneratingCert, setIsGeneratingCert] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Estados para Consulta Académica (Kiosko)
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [kioskSearchRut, setKioskSearchRut] = useState('');
  const [kioskFoundUser, setKioskFoundUser] = useState<User | null>(null);

  // --- LÓGICA: AGRUPAMIENTO POR SEMESTRE PARA CONSULTA ACADÉMICA ---
  const groupedKioskEnrollments = useMemo(() => {
    if (!kioskFoundUser) return [];
    const normRut = normalizeRut(kioskFoundUser.rut);
    const userEnrollments = enrollments.filter(e => normalizeRut(e.rut) === normRut);

    const groups: Record<string, Enrollment[]> = {};
    userEnrollments.forEach(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        const sem = act?.academicPeriod || 'Periodo no definido';
        if (!groups[sem]) groups[sem] = [];
        groups[sem].push(enr);
    });

    // Ordenar los periodos: 2do Semestre primero, luego 1er Semestre, por año descendente
    const sortedPeriodKeys = Object.keys(groups).sort((a, b) => {
        const getPriority = (p: string) => {
            if (p.endsWith('-2') || p.toLowerCase().includes('2do') || p.toLowerCase().includes('segundo')) return 0;
            if (p.endsWith('-1') || p.toLowerCase().includes('1er') || p.toLowerCase().includes('primero')) return 1;
            return 2;
        };

        const yearA = parseInt(a.split('-')[0]) || 0;
        const yearB = parseInt(b.split('-')[0]) || 0;

        if (yearA !== yearB) return yearB - yearA; // Más reciente primero

        return getPriority(a) - getPriority(b); // 2do Sem antes que 1er Sem
    });

    return sortedPeriodKeys.map(key => ({
        semester: key,
        enrollments: groups[key]
    }));
  }, [kioskFoundUser, enrollments, activities]);

  // --- DIRECTIVA_ESTADO: Lógica avanzada de cálculo de estado académico ---
  const calculateState = (grades: number[], attendance: number, expectedCount: number): ActivityState => {
      const minGrade = config.minPassingGrade || 4.0;
      const minAtt = config.minAttendancePercentage || 75;
      
      const enteredGrades = grades.filter(g => g > 0);
      const totalEntered = enteredGrades.length;

      // 6. Ningún ingreso de notas = INSCRITO
      if (totalEntered === 0) return ActivityState.INSCRITO;
      
      // 5. Ingreso parcial de notas = AVANZANDO
      if (totalEntered < expectedCount) return ActivityState.AVANZANDO;
      
      // Cálculo del promedio de las notas ingresadas
      const avg = totalEntered > 0 
          ? parseFloat((enteredGrades.reduce((a, b) => a + b, 0) / totalEntered).toFixed(1)) 
          : 0;

      // Casos con todas las notas ingresadas:
      if (avg >= minGrade) {
          if (attendance >= minAtt) {
              // 2. Todas las notas + Promedio >= 4.0 + Asistencia >= 75% = APROBADO
              return ActivityState.APROBADO;
          } else {
              // 3. Todas las notas + Promedio >= 4.0 + Asistencia < 75% = REPROBADO (Inasistencia)
              return ActivityState.REPROBADO;
          }
      } else {
          // 3/4. Todas las notas + Promedio < 4.0 = REPROBADO (Independiente de asistencia)
          return ActivityState.REPROBADO;
      }
  };

  // --- Lógica de Advertencia de Salida ---
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const hasUnsavedChanges = useMemo(() => 
    Object.keys(pendingGrades).length > 0 || Object.keys(pendingAttendance).length > 0
  , [pendingGrades, pendingAttendance]);

  const handleSafeAction = (action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingAction(() => action);
      setShowExitWarning(true);
    } else {
      action();
    }
  };

  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), academicPeriod: '1er Semestre',
    nombre: '', version: 'V1', modality: 'Presencial', hours: 0,
    moduleCount: 1, evaluationCount: 3, relator: '',
    startDate: '', endDate: '',
    competencyCodes: [] as string[]
  });

  const [enrollForm, setEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const selectedCourse = useMemo(() => activities.find(a => a.id === selectedCourseId), [activities, selectedCourseId]);
  const courseEnrollments = useMemo(() => enrollments.filter(e => e.activityId === selectedCourseId), [enrollments, selectedCourseId]);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '');
      });
  }, [courseEnrollments, users]);

  // --- Auto-Code Generator Logic ---
  useEffect(() => {
    if (view === 'create') {
        const words = formData.nombre.trim().split(/\s+/);
        let acronym = words.length === 1 && words[0].length > 0 
            ? words[0].substring(0, 4).toUpperCase() 
            : words.map(w => w[0]).join('').substring(0, 4).toUpperCase();
        
        if (acronym.length === 0) acronym = 'CURS';
        
        // Lógica de fecha: Si hay fecha de inicio, usarla. Si no, usar hoy.
        let d = new Date();
        if (formData.startDate) {
            const [y, m, day] = formData.startDate.split('-').map(Number);
            if (!isNaN(day)) d = new Date(y, m - 1, day);
        }
        
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        const datePart = `${dd}${mm}${yy}`;
        
        const ver = formData.version.trim().toUpperCase() || 'V1';
        const semSuffix = formData.academicPeriod.includes('1') ? '-S1' : formData.academicPeriod.includes('2') ? '-S2' : '';
        setFormData(prev => ({ ...prev, internalCode: `${acronym}${datePart}-${ver}${semSuffix}` }));
    }
  }, [formData.nombre, formData.startDate, formData.version, formData.academicPeriod, view]);

  // --- DIRECTIVA: SUGERENCIA AUTOMÁTICA DE FECHA DE TÉRMINO ---
  useEffect(() => {
    if ((view === 'create' || view === 'edit') && formData.startDate && formData.moduleCount > 0) {
        // Parsear fecha de inicio considerando el huso horario local (noon para evitar saltos de día)
        const start = new Date(formData.startDate + 'T12:00:00');
        if (isNaN(start.getTime())) return;

        // Regla: Duración = Cantidad de Módulos + 2 semanas extras
        const totalWeeks = formData.moduleCount + 2;
        
        // 1. Encontrar el Domingo de la semana actual (final de la primera semana de referencia)
        const daysToSunday = (7 - start.getDay()) % 7;
        const endOfWeek1 = new Date(start);
        endOfWeek1.setDate(start.getDate() + daysToSunday);
        
        // 2. Sumar las semanas restantes para llegar al Domingo de la semana final del curso
        const finalSunday = new Date(endOfWeek1);
        finalSunday.setDate(endOfWeek1.getDate() + (totalWeeks - 1) * 7);
        
        // 3. Sugerir el siguiente Lunes (Día Hábil) como fecha oficial de término
        const suggestedEnd = new Date(finalSunday);
        suggestedEnd.setDate(finalSunday.getDate() + 1);
        
        const yyyy = suggestedEnd.getFullYear();
        const mm = String(suggestedEnd.getMonth() + 1).padStart(2, '0');
        const dd = String(suggestedEnd.getDate()).padStart(2, '0');
        const suggestedStr = `${yyyy}-${mm}-${dd}`;
        
        // Solo actualizamos si es diferente para permitir que el usuario sobrescriba si lo desea
        if (formData.endDate !== suggestedStr) {
            setFormData(prev => ({ ...prev, endDate: suggestedStr }));
        }
    }
  }, [formData.startDate, formData.moduleCount, view]);

  // --- Handlers ---
  const handleToggleCompetence = (code: string) => {
    setFormData(prev => ({
        ...prev,
        competencyCodes: prev.competencyCodes.includes(code) ? prev.competencyCodes.filter(c => c !== code) : [...prev.competencyCodes, code]
    }));
  };

  const handleAnalyzeSyllabus = async () => {
    if (!syllabusFile) { alert("Por favor suba primero el programa (PDF o TXT)."); return; }
    setIsAnalyzingIA(true);
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = syllabusFile.type.includes('pdf') ? `Análisis de programa: ${syllabusFile.name}.` : e.target?.result as string;
            const suggestions = await suggestCompetencies(text);
            if (suggestions.length > 0) {
                setAiSuggestions(suggestions);
                setShowAiReview(true);
            } else {
                alert("La IA no ha podido identificar tributaciones claras.");
            }
            setIsAnalyzingIA(false);
        };
        if (syllabusFile.type.includes('pdf')) reader.readAsArrayBuffer(syllabusFile);
        else reader.readAsText(syllabusFile);
    } catch (err) { alert("Error al conectar con Gemini AI."); setIsAnalyzingIA(false); }
  };

  const applyAiSuggestions = () => {
    const suggestedCodes = aiSuggestions.map(s => s.code);
    setFormData(prev => ({ ...prev, competencyCodes: Array.from(new Set([...prev.competencyCodes, ...suggestedCodes])) }));
    setShowAiReview(false); setAiSuggestions([]);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const newId = selectedCourseId || `ACAD-${Date.now()}`;
      
      const activityPayload: Activity = {
          ...formData,
          id: newId, 
          name: formData.nombre,
          category: 'ACADEMIC', 
          year: Number(formData.year),
          hours: Number(formData.hours),
          moduleCount: Number(formData.moduleCount),
          evaluationCount: Number(formData.evaluationCount),
          isPublic: true
      };
      
      try { 
          await addActivity(activityPayload); 
          await executeReload(); 
          setView('list'); 
          setSelectedCourseId(null); 
      } catch (err: any) { 
          console.error("Course Save Error:", err);
          const errorMsg = err.message || JSON.stringify(err);
          alert(`Error al guardar: ${errorMsg}`); 
      }
  };

  const handleEditCourse = (course: Activity) => {
      setSelectedCourseId(course.id);
      setFormData({
          internalCode: course.internalCode || '', 
          year: course.year || new Date().getFullYear(), 
          academicPeriod: course.academicPeriod || '', 
          nombre: course.name, 
          version: course.version || 'V1', 
          modality: course.modality, 
          hours: course.hours, 
          moduleCount: course.moduleCount || 1, 
          evaluationCount: course.evaluationCount || 3, 
          relator: course.relator || '', 
          startDate: course.startDate || '', 
          endDate: course.endDate || '', 
          competencyCodes: course.competencyCodes || [] 
      });
      setSyllabusFile(null);
      setView('edit');
  };

  const handleCloneCourse = (course: Activity) => {
    setFormData({
        internalCode: '', 
        year: course.year || new Date().getFullYear(),
        academicPeriod: course.academicPeriod || '1er Semestre',
        nombre: `${course.name} (Copia)`,
        version: 'V1',
        modality: course.modality,
        hours: course.hours,
        moduleCount: course.moduleCount || 1,
        evaluationCount: course.evaluationCount || 3,
        relator: course.relator || '',
        startDate: '', 
        endDate: '',
        competencyCodes: course.competencyCodes || []
    });
    setSelectedCourseId(null); 
    setSyllabusFile(null);
    setView('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateGradeLocal = (enrollmentId: string, idx: number, value: string) => {
    const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return;
    const currentGrades = pendingGrades[enrollmentId] ? [...pendingGrades[enrollmentId]] : [...(enrollment.grades || [])];
    
    let grade = parseFloat(value.replace(',', '.'));
    if (value.trim() === '' || isNaN(grade)) grade = 0;
    if (grade > 7.0) grade = 7.0;
    if (grade < 0) grade = 0;
    
    currentGrades[idx] = parseFloat(grade.toFixed(1));
    setPendingGrades(prev => ({ ...prev, [enrollmentId]: currentGrades }));
  };

  const handleBatchCommit = async () => {
    const affectedIds = Array.from(new Set([
        ...Object.keys(pendingGrades), 
        ...Object.keys(pendingAttendance)
    ]));
    
    if (affectedIds.length === 0) return;
    
    setIsProcessingBatch(true);
    try {
        const totalSessions = selectedCourse?.evaluationCount || 0;

        for (const id of affectedIds) {
            const enrollment = courseEnrollments.find(e => e.id === id);
            if (!enrollment) continue;

            const finalGrades = pendingGrades[id] || enrollment.grades || [];
            const validGrades = finalGrades.filter(g => g > 0);
            const avg = validGrades.length > 0 
                ? parseFloat((validGrades.reduce((a,b)=>a+b,0)/validGrades.length).toFixed(1)) 
                : 0;
            
            const attMap = pendingAttendance[id] || {};
            const finalAttUpdates: any = {};
            let presentCount = 0;
            
            for (let i = 0; i < totalSessions; i++) {
                const sessionKey = `attendanceSession${i + 1}`;
                const val = attMap[sessionKey] !== undefined ? attMap[sessionKey] : (enrollment as any)[sessionKey];
                finalAttUpdates[sessionKey] = !!val;
                if (val) presentCount++;
            }
            
            const attendancePercentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

            const finalState = calculateState(
                finalGrades, 
                attendancePercentage, 
                totalSessions
            );

            await updateEnrollment(id, { 
                grades: finalGrades, 
                finalGrade: avg, 
                ...finalAttUpdates,
                attendancePercentage,
                state: finalState 
            });
        }
        
        await executeReload(); 
        setPendingGrades({});
        setPendingAttendance({});
        setIsProcessingBatch(false);
        alert("Sincronización masiva de registros completa.");
    } catch (err) {
        console.error("Batch Sync Error:", err);
        alert("Error al sincronizar datos. Verifique su conexión.");
        setIsProcessingBatch(false);
    }
  };

  const handleToggleAttendanceLocal = (enrollmentId: string, sessionIdx: number) => {
    const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
    if (!enrollment || enrollment.situation === 'INACTIVO') return;
    
    const sessionKey = `attendanceSession${sessionIdx + 1}`;
    const currentPending = pendingAttendance[enrollmentId] || {};
    
    const currentVal = currentPending[sessionKey] !== undefined 
        ? currentPending[sessionKey] 
        : (enrollment as any)[sessionKey];
        
    const newVal = !currentVal;

    setPendingAttendance(prev => ({
        ...prev,
        [enrollmentId]: {
            ...prev[enrollmentId],
            [sessionKey]: newVal
        }
    }));
  };

  const handleToggleSituation = async (enrollmentId: string, currentSituation: string | undefined) => {
    const newSituation = (currentSituation === 'INACTIVO') ? 'ACTIVO' : 'INACTIVO';
    await updateEnrollment(enrollmentId, { situation: newSituation });
    await executeReload();
  };

  const handleBulkUpload = () => {
    if (!uploadFile || !selectedCourseId) return;
    setIsProcessingBatch(true);
    const reader = new FileReader(); 
    const isExcel = uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls');
    reader.onload = async (e) => {
        try {
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
            if (rows.length < 1) { setIsProcessingBatch(false); return; }
            
            const usersToUpsert: User[] = []; 
            const rutsToEnroll: string[] = []; 
            let startRow = hasHeaders ? 1 : 0;
            
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i]; 
                if (!row || row.length === 0) continue;
                const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
                if (!rowStrings[0]) continue;
                
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
                        email: rowStrings[4] || masterUser?.email || '', 
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
            setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos.` }); 
            setUploadFile(null);
        } catch (err: any) {
            setEnrollMsg({ type: 'error', text: `Error en carga masiva: ${err.message}` });
        } finally {
            setIsProcessingBatch(false);
        }
    };
    isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  const handleClearAllEnrollments = async () => {
      if (courseEnrollments.length === 0) return;
      setIsProcessingBatch(true);
      try {
          for (const enr of courseEnrollments) {
              await deleteEnrollment(enr.id);
          }
          await executeReload();
          setShowClearConfirm(false);
          setEnrollMsg({ type: 'success', text: 'Lista de inscritos limpiada correctamente.' });
      } catch (err: any) {
          alert("Error al limpiar la lista.");
      } finally {
          setIsProcessingBatch(false);
      }
  };

  const handleDownloadCertificate = async (enrollment: Enrollment, activity: Activity, student: User) => {
    setIsGeneratingCert(enrollment.id);
    try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth(); 
        const pageHeight = doc.internal.pageSize.getHeight(); 
        const bgUrl = "https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Formato_Constancia.png";
        const bgImg = await loadImageToPdf(bgUrl);
        doc.addImage(bgImg, 'PNG', 0, 0, pageWidth, pageHeight);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "bold"); doc.setFontSize(17); 
        const fullName = `${student.names} ${student.paternalSurname} ${student.maternalSurname || ''}`.toUpperCase();
        doc.text(fullName, 55, 103, { align: "left" });
        const date = new Date();
        const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const dateText = `Valparaíso, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
        doc.setFontSize(11); doc.setFont("helvetica", "normal");
        doc.text(dateText, 60, 113, { align: "left" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(13);
        const splitCourseName = doc.splitTextToSize(activity.name.toUpperCase(), pageWidth - 40);
        doc.text(splitCourseName, 108, 140, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(11);
        const combinedInfo = `Duración: ${activity.hours} horas cronológicas      RUT: ${student.rut}`;
        doc.text(combinedInfo, 108, 180, { align: "center" });
        const certCode = enrollment.certificateCode || `UPLA-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139); 
        doc.text(`ID VERIFICACIÓN: ${certCode}`, 125, 220);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_cert&code=${certCode}`)}`;
        const qrImg = await loadImageToPdf(qrUrl);
        doc.addImage(qrImg, 'PNG', 145, 225, 25, 25);
        if (!enrollment.certificateCode) await updateEnrollment(enrollment.id, { certificateCode: certCode });
        doc.save(`Certificado_${student.rut}_${activity.internalCode || 'UPLA'}.pdf`);
    } catch (err) { 
        alert("Error al generar el certificado."); 
    } finally { 
        setIsGeneratingCert(null); 
    }
  };

  const handleKioskSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizeRut(kioskSearchRut);
    const found = users.find(u => normalizeRut(u.rut) === norm);
    if (found) {
        setKioskFoundUser(found);
    } else {
        alert("Docente no encontrado en la Base Maestra.");
        setKioskFoundUser(null);
    }
  };

  // --- Views ---
  if (view === 'create' || view === 'edit') {
    return (
        <div className="max-w-6xl mx-auto animate-fadeIn pb-20">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-6 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-[#647FBC] p-8 text-white">
                    <h2 className="text-2xl font-black uppercase tracking-tight">{view === 'create' ? 'Crear Nuevo Curso Académico' : 'Editar Curso Curricular'}</h2>
                    <p className="text-blue-100 text-sm mt-1">Complete la ficha técnica y asocie la taxonomía de competencias UPLA.</p>
                </div>
                
                <form onSubmit={handleCreateSubmit} className="p-8 space-y-10">
                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-2">Información de Cabecera</h3>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-8">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Nombre de la Asignatura / Curso *</label>
                                <input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#647FBC] text-sm font-normal shadow-sm"/>
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Código Interno</label>
                                <input required type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value.toUpperCase()})} className="w-full px-4 py-3 border border-slate-200 rounded-xl uppercase font-mono text-sm bg-slate-50"/>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Año Académico</label>
                                <input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Semestre</label>
                                <input type="text" value={formData.academicPeriod} onChange={e => setFormData({...formData, academicPeriod: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal" placeholder="Ej: 1er Semestre"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Versión</label>
                                <input type="text" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Modalidad</label>
                                <select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal">
                                    {listModalities.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-2">Planificación y Relatoría</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Horas Cronológicas</label>
                                <input type="number" value={formData.hours} onChange={e => setFormData({...formData, hours: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Cant. Módulos</label>
                                <input type="number" value={formData.moduleCount} onChange={e => setFormData({...formData, moduleCount: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Evaluaciones Pactadas</label>
                                <input type="number" value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Relator Principal</label>
                                <select value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal">
                                    <option value="">Seleccione Asesor...</option>
                                    {advisors.map(adv => (
                                        <option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>
                                            {adv.names} {adv.paternalSurname}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Fecha de Inicio</label>
                                <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-normal"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Fecha de Término (Sugerida)</label>
                                <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold bg-indigo-50 border-indigo-200 focus:ring-indigo-500"/>
                                <p className="text-[9px] text-indigo-400 font-bold uppercase mt-1 italic">* Basada en Módulos + 2 semanas</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] border-b pb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            Análisis Curricular e IA
                        </h3>
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-center gap-6 shadow-inner">
                            <div className="flex-1 w-full">
                                <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${syllabusFile ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                                    <div className="flex flex-col items-center justify-center pt-2">
                                        {syllabusFile ? (
                                            <div className="flex items-center gap-2"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0116 0z" /></svg><p className="text-xs font-bold text-indigo-700 truncate max-w-[200px]">{syllabusFile.name}</p></div>
                                        ) : (
                                            <><svg className="w-6 h-6 text-slate-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><p className="text-[10px] text-slate-500 font-bold uppercase">Subir Documento (PDF/TXT)</p></>
                                        )}
                                    </div>
                                    <input type="file" className="hidden" accept=".pdf,.txt" onChange={(e) => setSyllabusFile(e.target.files ? e.target.files[0] : null)} />
                                </label>
                            </div>
                            <button type="button" onClick={handleAnalyzeSyllabus} disabled={isAnalyzingIA || !syllabusFile} className="h-24 px-8 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2">
                                {isAnalyzingIA ? 'Analizando...' : 'Sugerir Competencias IA'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-400"></span> Dimensiones PEI</h4>
                                <div className="flex flex-wrap gap-2">
                                    {PEI_COMPETENCIES.map(c => (
                                        <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border transition-all ${formData.competencyCodes.includes(c.code) ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'}`}>{c.code}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Ejes PMI</h4>
                                <div className="flex flex-wrap gap-2">
                                    {PMI_COMPETENCIES.map(c => (
                                        <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border transition-all ${formData.competencyCodes.includes(c.code) ? 'bg-emerald-600 border-emerald-700 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200'}`}>{c.code}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN PERFIL DEL ACADÉMICO UPLA - NUEVO */}
                        <div className="space-y-6 pt-6 border-t border-slate-100">
                             <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Perfil del Académico UPLA
                             </h4>
                             
                             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                                 {/* PEDAGÓGICA */}
                                 <div className="space-y-3">
                                     <h5 className="text-[9px] font-black text-rose-600 uppercase tracking-widest border-b border-rose-100 pb-1">Pedagógica</h5>
                                     <div className="flex flex-wrap gap-1.5">
                                         {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === 'Pedagógica').map(c => (
                                             <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all border ${formData.competencyCodes.includes(c.code) ? 'bg-rose-600 border-rose-700 text-white shadow-sm scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-rose-200'}`}>{c.code}</button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* INVESTIGACIÓN */}
                                 <div className="space-y-3">
                                     <h5 className="text-[9px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-1">Investigación</h5>
                                     <div className="flex flex-wrap gap-1.5">
                                         {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === 'Investigación y/o Creación').map(c => (
                                             <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all border ${formData.competencyCodes.includes(c.code) ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-emerald-200'}`}>{c.code}</button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* VINCULACIÓN */}
                                 <div className="space-y-3">
                                     <h5 className="text-[9px] font-black text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-1">Vinculación</h5>
                                     <div className="flex flex-wrap gap-1.5">
                                         {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === 'Vinculación').map(c => (
                                             <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all border ${formData.competencyCodes.includes(c.code) ? 'bg-purple-600 border-purple-700 text-white shadow-sm scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-purple-200'}`}>{c.code}</button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* INTERPERSONAL */}
                                 <div className="space-y-3">
                                     <h5 className="text-[9px] font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-1">Interpersonal / Ética</h5>
                                     <div className="flex flex-wrap gap-1.5">
                                         {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === 'Interpersonal y Ética').map(c => (
                                             <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all border ${formData.competencyCodes.includes(c.code) ? 'bg-blue-600 border-blue-700 text-white shadow-sm scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200'}`}>{c.code}</button>
                                         ))}
                                     </div>
                                 </div>
                                 {/* FORMACIÓN */}
                                 <div className="space-y-3">
                                     <h5 className="text-[9px] font-black text-pink-600 uppercase tracking-widest border-b border-pink-100 pb-1">Formación Continua</h5>
                                     <div className="flex flex-wrap gap-1.5">
                                         {ACADEMIC_PROFILE_COMPETENCIES.filter(c => c.dimension === 'Formación Continua').map(c => (
                                             <button key={c.code} type="button" onClick={() => handleToggleCompetence(c.code)} title={c.name} className={`px-2 py-1 rounded text-[8px] font-black uppercase transition-all border ${formData.competencyCodes.includes(c.code) ? 'bg-pink-600 border-pink-700 text-white shadow-sm scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-pink-200'}`}>{c.code}</button>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                        </div>
                    </div>

                    <div className="flex justify-between pt-10 border-t border-slate-100">
                        {view === 'edit' && <button type="button" onClick={() => { if(confirm("¿Eliminar permanentemente?")) deleteActivity(selectedCourseId!).then(() => setView('list')); }} className="text-rose-600 font-black uppercase text-[10px] tracking-widest hover:underline">Eliminar Curso Académico</button>}
                        <div className="flex gap-3 ml-auto">
                            <button type="button" onClick={() => setView('list')} className="px-8 py-3 text-slate-500 font-bold">Cancelar</button>
                            <button type="submit" disabled={isSyncing} className="bg-[#647FBC] text-white px-10 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-800 transition-all transform active:scale-95 disabled:opacity-70">
                                {isSyncing ? 'Guardando...' : 'Grabar Configuración'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* MODAL SUGERENCIAS IA */}
            {showAiReview && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-indigo-200">
                        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                <div><h3 className="text-xl font-bold">Sugerencias Taxonómicas</h3><p className="text-xs text-indigo-100 font-bold uppercase">Análisis Gemini IA</p></div>
                            </div>
                        </div>
                        <div className="p-8 space-y-4 flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar">
                            {aiSuggestions.map((s, i) => (
                                <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0 uppercase">{s.code}</div>
                                    <div className="flex-1"><h4 className="font-bold text-slate-800 text-sm uppercase">{PEI_COMPETENCIES.find(c => c.code === s.code)?.name || PMI_COMPETENCIES.find(c => c.code === s.code)?.name || ACADEMIC_PROFILE_COMPETENCIES.find(c => c.code === s.code)?.name}</h4><p className="text-xs text-slate-500 mt-1">"{s.reason}"</p></div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
                            <button onClick={() => setShowAiReview(false)} className="px-6 py-2 text-slate-500 font-bold">Cerrar</button>
                            <button onClick={applyAiSuggestions} className="px-8 py-2 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-xl shadow-lg hover:bg-indigo-700">Aplicar Selección</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  }

  // --- DETAILS VIEW (Matrícula / Notas / Acta) ---
  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
              <button onClick={() => handleSafeAction(() => { setSelectedCourseId(null); setView('list'); })} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
              <div className="bg-white border-l-4 border-indigo-600 rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{selectedCourse.academicPeriod}</span>
                        <span className="text-slate-400 text-xs">|</span>
                        <span className="text-slate-500 text-xs font-bold uppercase">{selectedCourse.internalCode}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2>
                    <p className="text-slate-500 text-sm mt-1">{selectedCourse.relator} • {selectedCourse.hours} Horas • {selectedCourse.modality}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSafeAction(() => handleEditCourse(selectedCourse))} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs transition-colors">Modificar Datos</button>
                  </div>
              </div>

              <div className="flex items-end gap-2 border-b border-slate-200 pl-4">
                  <button onClick={() => handleSafeAction(() => setActiveDetailTab('enrollment'))} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'enrollment' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Matrícula</button>
                  <button onClick={() => handleSafeAction(() => setActiveDetailTab('tracking'))} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'tracking' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Notas y Asistencia</button>
                  <button onClick={() => handleSafeAction(() => setActiveDetailTab('acta'))} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'acta' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-transparent hover:bg-slate-100'}`}>Acta Final</button>
              </div>

              <div className="bg-white rounded-b-xl shadow-sm border border-slate-200 border-t-0 p-8 min-h-[400px]">
                  {activeDetailTab === 'enrollment' && (
                      <div className="space-y-8 animate-fadeIn">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* INSCRIPCIÓN INDIVIDUAL */}
                            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-inner">
                                <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
                                  <div className="p-2 bg-indigo-600 text-white rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg></div>
                                  Inscripción Individual
                                </h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    setIsProcessingBatch(true);
                                    const formatted = cleanRutFormat(enrollForm.rut);
                                    try {
                                        await upsertUsers([{ ...enrollForm, rut: formatted, systemRole: enrollForm.systemRole as UserRole }]);
                                        await enrollUser(formatted, selectedCourseId!);
                                        await executeReload();
                                        setEnrollMsg({ type: 'success', text: 'Estudiante matriculado.' });
                                        setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
                                    } catch (err: any) { 
                                        setEnrollMsg({ type: 'error', text: `Error al matricular: ${err.message || JSON.stringify(err)}` }); 
                                    } finally { setIsProcessingBatch(false); }
                                }} className="space-y-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b pb-1">Identidad y Contacto</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="relative">
                                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">RUT *</label>
                                                <input required type="text" name="rut" value={enrollForm.rut} placeholder="12345678-9" onChange={e => { setEnrollForm({...enrollForm, rut: e.target.value}); if(e.target.value.length >= 2) { const clean = normalizeRut(e.target.value); setSuggestions(users.filter(u => normalizeRut(u.rut).includes(clean)).slice(0, 5)); setShowSuggestions(true); } else { setShowSuggestions(false); } }} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} className="w-full px-3 py-2 border rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500"/>
                                                {showSuggestions && suggestions.length > 0 && (
                                                    <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                        {suggestions.map(s => (<div key={s.rut} onMouseDown={() => { setEnrollForm({...s, maternalSurname: s.maternalSurname || '', phone: s.phone || '', academicRole: s.academicRole || '', faculty: s.faculty || '', department: s.department || '', career: s.career || '', contractType: s.contractType || '', teachingSemester: s.teachingSemester || '', campus: s.campus || '', systemRole: UserRole.ESTUDIANTE }); setShowSuggestions(false); }} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs border-b last:border-0"><span className="font-bold block">{s.rut}</span><span>{s.names} {s.paternalSurname}</span></div>))}
                                                    </div>
                                                )}
                                            </div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Email Institucional</label><input type="email" name="email" value={enrollForm.email} onChange={e => setEnrollForm({...enrollForm, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombres *</label><input required type="text" name="names" value={enrollForm.names} onChange={e => setEnrollForm({...enrollForm, names: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"/></div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Ap. Paterno *</label><input required type="text" name="paternalSurname" value={enrollForm.paternalSurname} onChange={e => setEnrollForm({...enrollForm, paternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/></div>
                                            <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={e => setEnrollForm({...enrollForm, maternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/></div>
                                        </div>
                                        <div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Teléfono</label><input type="text" name="phone" value={enrollForm.phone} onChange={e => setEnrollForm({...enrollForm, phone: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/></div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest border-b pb-1">Datos Institucionales</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <SmartSelect label="Sede" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={e => setEnrollForm({...enrollForm, campus: e.target.value})} />
                                            <SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={e => setEnrollForm({...enrollForm, faculty: e.target.value})} />
                                            <SmartSelect label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={e => setEnrollForm({...enrollForm, department: e.target.value})} />
                                            <SmartSelect label="Carrera" name="career" value={enrollForm.career} options={listCareers} onChange={e => setEnrollForm({...enrollForm, career: e.target.value})} />
                                            <SmartSelect label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={e => setEnrollForm({...enrollForm, academicRole: e.target.value})} />
                                            <SmartSelect label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={e => setEnrollForm({...enrollForm, contractType: e.target.value})} />
                                            <SmartSelect label="Semestre" name="teachingSemester" value={enrollForm.teachingSemester} options={listSemesters} onChange={e => setEnrollForm({...enrollForm, teachingSemester: e.target.value})} />
                                            <div className="flex items-end"><button type="submit" disabled={isProcessingBatch} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-indigo-700">{isProcessingBatch ? 'Procesando...' : 'Inscribir Estudiante'}</button></div>
                                        </div>
                                    </div>
                                    {enrollMsg && <p className={`text-xs text-center font-bold ${enrollMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{enrollMsg.text}</p>}
                                </form>
                            </div>

                            {/* CARGA MASIVA */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col">
                                <h3 className="font-bold text-slate-800 text-lg mb-6 pb-2 border-b border-slate-100 flex items-center gap-2">
                                    <div className="p-2 bg-emerald-600 text-white rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
                                    Carga Masiva (CSV / Excel)
                                </h3>
                                <div className="flex-1 space-y-6 flex flex-col justify-center">
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-4">
                                        <p className="text-sm text-emerald-800 font-medium">Requisito:</p>
                                        <p className="text-xs text-emerald-600">Suba un archivo con las 13 columnas requeridas para la matrícula institucional (RUT como campo clave).</p>
                                    </div>
                                    <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100'}`}>
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {uploadFile ? (
                                                <><svg className="w-10 h-10 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p className="mb-1 text-sm font-bold text-emerald-700">{uploadFile.name}</p></>
                                            ) : (
                                                <><svg className="w-10 h-10 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="mb-1 text-sm text-indigo-600 font-semibold">Haga clic para subir archivo</p><p className="text-xs text-slate-400">xlsx, xls, csv</p></>
                                            )}
                                        </div>
                                        <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} />
                                    </label>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <input type="checkbox" id="hasHeadersEnrollment" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" />
                                        <label htmlFor="hasHeadersEnrollment" className="text-sm text-slate-700 cursor-pointer select-none">Ignorar primera fila (encabezados)</label>
                                    </div>
                                    <button 
                                        onClick={handleBulkUpload} 
                                        disabled={!uploadFile || isProcessingBatch} 
                                        className="mt-auto w-full bg-slate-800 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-black transition-all transform active:scale-95 disabled:opacity-50"
                                    >
                                        {isProcessingBatch ? 'Procesando Datos...' : 'Cargar y Matricular'}
                                    </button>
                                </div>
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                              <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Nómina de Inscritos Actual</h4>
                                  {courseEnrollments.length > 0 && !isProcessingBatch && (
                                      <button 
                                          onClick={() => setShowClearConfirm(true)}
                                          className="text-[10px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-lg border border-rose-100 transition-all flex items-center gap-1"
                                      >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          LIMPIAR LISTA
                                      </button>
                                  )}
                              </div>
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-white text-slate-400 font-bold border-b text-[10px] uppercase tracking-tighter">
                                      <tr><th className="px-6 py-3">Participante</th><th className="px-6 py-3">Unidad Académica</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-center">Acciones</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {sortedEnrollments.map(enr => {
                                          const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut));
                                          return (
                                              <tr key={enr.id} className="hover:bg-slate-50 transition-colors">
                                                  <td className="px-6 py-3 font-medium"><div>{u?.names} {u?.paternalSurname}</div><div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div></td>
                                                  <td className="px-6 py-3 text-slate-500 text-xs"><div>{u?.faculty}</div><div className="italic">{u?.career}</div></td>
                                                  <td className="px-6 py-3 text-[10px] font-black uppercase"><span className={`px-2 py-1 rounded-full border ${enr.state === ActivityState.APROBADO ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{enr.state}</span></td>
                                                  <td className="px-6 py-3 text-center"><button onClick={() => { if(confirm("¿Eliminar matrícula?")) deleteEnrollment(enr.id).then(() => executeReload()); }} className="text-red-500 font-black text-[10px] uppercase hover:underline">Retirar</button></td>
                                              </tr>
                                          );
                                      })}
                                      {sortedEnrollments.length === 0 && (
                                          <tr><td colSpan={4} className="py-20 text-center text-slate-400 italic">No hay estudiantes matriculados en este programa curricular.</td></tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {activeDetailTab === 'tracking' && (
                      <div className="space-y-6 animate-fadeIn">
                          <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                              <div><h3 className="font-bold text-indigo-800">Carga de Calificaciones y Asistencia</h3><p className="text-xs text-indigo-600">Sistema centralizado de evaluación continua con DIRECTIVA_ESTADO activa.</p></div>
                              <button onClick={handleBatchCommit} disabled={!hasUnsavedChanges || isProcessingBatch} className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg ${hasUnsavedChanges ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Sincronizar Cambios</button>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                                      <tr>
                                        <th className="px-4 py-3 sticky left-0 bg-white border-r z-10">Docente</th>
                                        <th className="px-4 py-3 text-center border-r bg-slate-50 w-24 text-[10px] uppercase">Situación</th>
                                        {Array.from({length: selectedCourse.evaluationCount || 0}).map((_, i) => (<th key={`h-n-${i}`} className="px-2 py-3 text-center border-r text-[10px]">N{i+1}</th>))}
                                        <th className="px-4 py-3 text-center bg-slate-100 border-r">Prom.</th>
                                        <th className="px-4 py-3 text-center border-r bg-slate-50 text-[10px] uppercase">Estado</th>
                                        {Array.from({length: selectedCourse.evaluationCount || 0}).map((_, i) => (<th key={`h-a-${i}`} className="px-2 py-3 text-center border-r text-[10px]">S{i+1}</th>))}
                                        <th className="px-4 py-3 text-center border-r">% Asist.</th>
                                        <th className="px-4 py-3 text-center bg-slate-50 text-[10px] uppercase">Certificado</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y bg-white">
                                      {sortedEnrollments.map(enr => {
                                          const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
                                          const isInactive = enr.situation === 'INACTIVO';
                                          
                                          // Resolver valores actuales (Original + Pendiente)
                                          const currentGrades = pendingGrades[enr.id] || enr.grades || [];
                                          const validGrades = currentGrades.filter(g => g > 0);
                                          const avgValue = validGrades.length > 0 ? (validGrades.reduce((a,b)=>a+b,0)/validGrades.length).toFixed(1) : '-';
                                          const isAvgFailing = avgValue !== '-' && parseFloat(avgValue) < 4.0;

                                          // Calcular asistencia en tiempo real incluyendo pendientes locales
                                          let presentCount = 0;
                                          const totalSessions = selectedCourse.evaluationCount || 0;
                                          const pendingAttMap = pendingAttendance[enr.id] || {};
                                          
                                          for (let i = 0; i < totalSessions; i++) {
                                              const sessionKey = `attendanceSession${i + 1}`;
                                              const val = pendingAttMap[sessionKey] !== undefined ? pendingAttMap[sessionKey] : (enr as any)[sessionKey];
                                              if (val) presentCount++;
                                          }
                                          
                                          const liveAttendancePercentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

                                          // CÁLCULO DE ESTADO EN TIEMPO REAL PARA EL FEEDBACK VISUAL
                                          const liveState = calculateState(currentGrades, liveAttendancePercentage, totalSessions);

                                          return (
                                              <tr key={enr.id} className={`hover:bg-slate-50 transition-colors ${isInactive ? 'opacity-50 grayscale' : ''}`}>
                                                  <td className="px-4 py-3 sticky left-0 bg-white border-r z-10">
                                                    <div className="font-bold text-slate-700">{student?.paternalSurname}, {student?.names}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div>
                                                  </td>
                                                  <td className="px-4 py-3 text-center border-r bg-slate-50/50">
                                                    <button 
                                                        onClick={() => handleToggleSituation(enr.id, enr.situation)}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-black border transition-all ${isInactive ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
                                                    >
                                                        {enr.situation || 'ACTIVO'}
                                                    </button>
                                                  </td>
                                                  {Array.from({length: totalSessions}).map((_, i) => {
                                                      const gradeVal = currentGrades[i];
                                                      const isFailing = gradeVal > 0 && gradeVal < 4.0;
                                                      return (
                                                        <td key={`c-n-${enr.id}-${i}`} className="px-1 py-2 border-r">
                                                          <input 
                                                            type="number" 
                                                            step="0.1" 
                                                            disabled={isInactive}
                                                            value={gradeVal || ''} 
                                                            onChange={(e) => handleUpdateGradeLocal(enr.id, i, e.target.value)} 
                                                            className={`w-12 text-center border rounded py-1 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:bg-slate-100 disabled:text-slate-400 ${isFailing ? 'text-red-600 border-red-200 bg-red-50' : 'text-slate-700'}`}
                                                          />
                                                        </td>
                                                      );
                                                  })}
                                                  <td className={`px-4 py-3 text-center font-black bg-slate-50 border-r ${isAvgFailing ? 'text-red-600' : 'text-indigo-700'}`}>
                                                    {avgValue}
                                                  </td>
                                                  <td className="px-4 py-3 text-center border-r font-black uppercase text-[9px]">
                                                    <span className={`px-2 py-1 rounded-full border transition-colors ${
                                                        liveState === ActivityState.APROBADO ? 'bg-green-50 text-green-700 border-green-200' : 
                                                        liveState === ActivityState.REPROBADO ? 'bg-red-50 text-red-700 border-red-200' : 
                                                        liveState === ActivityState.AVANZANDO ? 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse' :
                                                        'bg-slate-50 text-slate-600 border-slate-200'
                                                    }`}>
                                                        {liveState}
                                                    </span>
                                                  </td>
                                                  {Array.from({length: totalSessions}).map((_, i) => {
                                                      const sessionKey = `attendanceSession${i + 1}`;
                                                      const isChecked = pendingAttMap[sessionKey] !== undefined ? pendingAttMap[sessionKey] : (enr as any)[sessionKey];
                                                      return (
                                                          <td key={`c-a-${enr.id}-${i}`} className="px-2 py-3 text-center border-r">
                                                              <input 
                                                                type="checkbox" 
                                                                disabled={isInactive}
                                                                checked={!!isChecked} 
                                                                onChange={() => handleToggleAttendanceLocal(enr.id, i)} 
                                                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                                                              />
                          </td>
                                                      );
                                                  })}
                                                  <td className={`px-4 py-3 text-center font-bold border-r ${liveAttendancePercentage < (config.minAttendancePercentage || 75) ? 'text-red-500' : 'text-green-600'}`}>{liveAttendancePercentage}%</td>
                                                  <td className="px-4 py-3 text-center">
                                                    {enr.state === ActivityState.APROBADO ? (
                                                        <button 
                                                            disabled={isGeneratingCert !== null || isInactive}
                                                            onClick={() => student && handleDownloadCertificate(enr, selectedCourse, student)}
                                                            className={`bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center gap-1 mx-auto disabled:opacity-50`}
                                                            title="Descargar Certificado"
                                                        >
                                                            {isGeneratingCert === enr.id ? (
                                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                            )}
                                                            <span className="text-[10px] font-black uppercase">PDF</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase italic">No disponible</span>
                                                    )}
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {activeDetailTab === 'acta' && (
                      <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
                          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                          <h3 className="text-2xl font-black text-slate-800">Generación de Acta Oficial</h3>
                          <p className="text-slate-500 mt-2 mb-8 max-w-lg leading-relaxed">Este reporte consolida el rendimiento final y la asistencia oficial de todos los inscritos en el programa vigente.</p>
                          <button onClick={() => {
                              const doc = new jsPDF('landscape');
                              doc.setFontSize(18); doc.text(`ACTA DE CALIFICACIONES - ${selectedCourse.name}`, 14, 20);
                              doc.setFontSize(10); doc.text(`Periodo: ${selectedCourse.academicPeriod} | Relator: ${selectedCourse.relator}`, 14, 30);
                              const body = sortedEnrollments.map(enr => {
                                  const u = users.find(x => normalizeRut(x.rut) === normalizeRut(enr.rut));
                                  return [enr.rut, `${u?.paternalSurname} ${u?.names}`, enr.finalGrade || '-', `${enr.attendancePercentage || 0}%`, enr.state.toUpperCase()];
                              });
                              // @ts-ignore
                              doc.autoTable({ head: [['RUT', 'NOMBRE', 'NOTA', '% ASIST.', 'ESTADO']], body, startY: 40 });
                              doc.save(`ACTA_${selectedCourse.internalCode}_${selectedYear}.pdf`);
                          }} className="bg-indigo-600 text-white px-12 py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-3"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Descargar Acta PDF</button>
                      </div>
                  )}
              </div>

              {/* MODAL DE ADVERTENCIA DE SALIDA */}
              {showExitWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center border border-red-100">
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">¿Desea salir sin guardar?</h3>
                        <p className="text-slate-500 text-sm mb-8">Ha realizado cambios en las calificaciones o asistencia que no han sido sincronizados. Si sale ahora, perderá estos datos.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => setShowExitWarning(false)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">Continuar Editando</button>
                            <button onClick={handleBatchCommit} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">Sincronizar y Salir</button>
                            <button onClick={() => { setPendingGrades({}); setPendingAttendance({}); setShowExitWarning(false); if(pendingAction) pendingAction(); }} className="w-full py-3 text-red-500 font-bold hover:underline">Salir de todas formas</button>
                        </div>
                    </div>
                </div>
              )}

              {/* MODAL DE CONFIRMACIÓN LIMPIAR LISTA */}
              {showClearConfirm && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-md w-full p-10 text-center border border-rose-100">
                        <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">¡ADVERTENCIA CRÍTICA!</h3>
                        <p className="text-slate-500 text-sm leading-relaxed mb-8">
                            Estás a punto de <strong>eliminar todas las matrículas</strong> de este curso. Esta acción no se puede deshacer y borrará permanentemente el progreso de todos los estudiantes inscritos.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleClearAllEnrollments}
                                disabled={isProcessingBatch}
                                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform active:scale-95 disabled:opacity-50"
                            >
                                {isProcessingBatch ? 'Procesando...' : 'SEGUIR (Borrar Todo)'}
                            </button>
                            <button 
                                onClick={() => setShowClearConfirm(false)}
                                className="w-full py-3 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:underline"
                            >
                                CANCELAR
                            </button>
                        </div>
                    </div>
                </div>
              )}
          </div>
      );
  }

  // DEFAULT LIST VIEW
  return (
      <div className="animate-fadeIn space-y-6">
        <div className="flex justify-between items-center">
            <div><h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos Curriculares</h2><p className="text-sm text-slate-500">Administración de asignaturas académicas y registro de notas.</p></div>
            <div className="flex gap-4 items-center">
                <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-200 shadow-inner group"><label className="text-[10px] font-black text-slate-400 uppercase mr-3">Periodo:</label><select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="text-sm font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase"><option value={currentYear}>{currentYear}</option><option value={currentYear - 1}>{currentYear - 1}</option><option value={currentYear - 2}>{currentYear - 2}</option></select></div>
                <button 
                    onClick={() => { setKioskFoundUser(null); setKioskSearchRut(''); setShowKioskModal(true); }}
                    className="bg-white border border-[#647FBC] text-[#647FBC] px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-blue-50 transition-colors flex items-center gap-2 h-[42px]"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    CONSULTA ACADÉMICA
                </button>
                {(isAdmin || isAdvisor) && (<button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), academicPeriod: '1er Semestre', nombre: '', version: 'V1', modality: 'Presencial', hours: 0, moduleCount: 1, evaluationCount: 3, relator: '', startDate: '', endDate: '', competencyCodes: [] }); setSyllabusFile(null); setView('create'); }} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2 h-[42px]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nuevo Curso</button>)}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedAcademicActivities.map(course => { 
            const enrolledCount = enrollments.filter(e => e.activityId === course.id).length;
            const isSecondSemester = course.academicPeriod?.endsWith('-2') || course.academicPeriod?.toLowerCase().includes('2do') || course.academicPeriod?.toLowerCase().includes('segundo');

            return (
              <div key={course.id} className={`rounded-xl shadow-sm border p-6 hover:shadow-md transition-all group relative overflow-hidden ${isSecondSemester ? 'bg-blue-100/40 border-blue-200' : 'bg-white border-slate-200'}`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${isSecondSemester ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                      {course.academicPeriod}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{course.internalCode}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight h-14 line-clamp-2" title={course.name}>{course.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-4"><span>{enrolledCount} Inscritos</span><span>{course.modality}</span><span>{course.hours}h</span></div>
                  
                  {course.competencyCodes && course.competencyCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4 h-10 overflow-hidden">
                          {course.competencyCodes.slice(0, 8).map(code => {
                              const paMeta = ACADEMIC_PROFILE_COMPETENCIES.find(c => c.code === code);
                              return (
                                <span 
                                    key={code} 
                                    className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter ${
                                        paMeta ? `${paMeta.lightColor} ${paMeta.textColor} ${paMeta.borderColor}` :
                                        code.startsWith('PEI') ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 
                                        'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}
                                >
                                    {code}
                                </span>
                              );
                          })}
                      </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedCourseId(course.id); setView('details'); setActiveDetailTab('enrollment'); }} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white transition-all shadow-sm">Gestionar Curso</button>
                    {(isAdmin || isAdvisor) && (
                        <button onClick={() => handleCloneCourse(course)} className="px-3 py-2 bg-white border border-slate-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all shadow-sm" title="Clonar Curso">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 012 2h8a2 2 0 012-2v-2" /></svg>
                        </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })} 
        </div>

        {/* MODAL CONSULTA ACADÉMICA (KIOSKO) */}
        {showKioskModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-slate-200">
                    <div className="p-6 bg-[#647FBC] text-white flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-bold uppercase tracking-tight">Módulo de Consulta Académica</h3>
                            <p className="text-blue-100 text-xs mt-1">Busque por RUT para visualizar el expediente completo del docente.</p>
                        </div>
                        <button onClick={() => setShowKioskModal(false)} className="text-white hover:text-red-200 transition-colors text-3xl font-light">&times;</button>
                    </div>
                    
                    <div className="p-8 bg-slate-50 border-b border-slate-200">
                        <form onSubmit={handleKioskSearch} className="flex gap-3 max-w-xl mx-auto">
                            <input 
                                type="text" 
                                placeholder="Ingrese RUT (ej: 12.345.678-9)" 
                                value={kioskSearchRut} 
                                onChange={(e) => setKioskSearchRut(e.target.value)}
                                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-normal shadow-inner"
                            />
                            <button type="submit" className="bg-[#647FBC] text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-800 transition-all transform active:scale-95">Consultar</button>
                        </form>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {kioskFoundUser ? (
                            <div className="space-y-12 animate-fadeIn">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6">
                                    <div className="w-16 h-16 bg-blue-50 text-[#647FBC] rounded-full flex items-center justify-center font-black text-2xl border-2 border-blue-100 shadow-inner">{kioskFoundUser.names.charAt(0)}</div>
                                    <div>
                                        <h4 className="text-xl font-black text-slate-800">{kioskFoundUser.names} {kioskFoundUser.paternalSurname} {kioskFoundUser.maternalSurname}</h4>
                                        <p className="text-xs text-slate-400 font-mono font-bold tracking-widest mt-1 uppercase">{kioskFoundUser.rut} • {kioskFoundUser.faculty || 'Sin Facultad'} • {kioskFoundUser.career || 'Sin Carrera'}</p>
                                    </div>
                                </div>

                                <div className="space-y-10">
                                    {groupedKioskEnrollments.map(group => (
                                        <div key={group.semester} className="space-y-4">
                                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] border-b pb-2 flex justify-between items-center">
                                                <span>Periodo Académico: {group.semester}</span>
                                                <span className="bg-indigo-50 px-2 py-0.5 rounded text-indigo-600 font-black">{group.enrollments.length} Registros</span>
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {group.enrollments.map(enr => {
                                                    const act = activities.find(a => a.id === enr.activityId);
                                                    if (!act) return null;
                                                    return (
                                                        <div key={enr.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-blue-300 transition-all flex flex-col justify-between group">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter ${enr.state === ActivityState.APROBADO ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'}`}>
                                                                    {enr.state}
                                                                </span>
                                                                <span className="text-[9px] text-slate-300 font-mono font-bold">{act.internalCode}</span>
                                                            </div>
                                                            <h5 className="font-bold text-slate-700 text-sm mb-4 leading-tight min-h-[40px] line-clamp-2">{act.name}</h5>
                                                            <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="text-center">
                                                                        <span className="block text-xs font-black text-slate-700 leading-none">{enr.finalGrade || '-'}</span>
                                                                        <span className="text-[8px] font-black text-slate-400 uppercase">Nota Final</span>
                                                                    </div>
                                                                    <div className="text-center">
                                                                        <span className="block text-xs font-black text-slate-700 leading-none">{enr.attendancePercentage || 0}%</span>
                                                                        <span className="text-[8px] font-black text-slate-400 uppercase">Asistencia</span>
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] font-black text-slate-400 uppercase">{act.year}-{act.academicPeriod}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {groupedKioskEnrollments.length === 0 && (
                                        <div className="py-12 text-center text-slate-400 italic bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                            No se registran actividades para este docente.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                                <svg className="w-20 h-20 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <p className="font-bold uppercase tracking-widest text-sm">Ingrese un RUT para comenzar la búsqueda</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
  );
};