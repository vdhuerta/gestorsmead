import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
// @ts-ignore
import { jsPDF } from 'jspdf';
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

interface CourseManagerProps {
    currentUser?: User;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective();

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

  const academicActivities = activities.filter(a => !a.category || a.category === 'ACADEMIC');

  // --- LÓGICA DE ORDENACIÓN: 2DO SEMESTRE PRIMERO ---
  const sortedAcademicActivities = useMemo(() => {
    const getSemesterValue = (period?: string) => {
        if (!period) return 0;
        const p = period.toLowerCase();
        // Identificar 2do semestre por sufijo -2 o palabras clave
        if (p.endsWith('-2') || p.includes('2do') || p.includes('segundo')) return 2;
        // Identificar 1er semestre por sufijo -1 o palabras clave
        if (p.endsWith('-1') || p.includes('1er') || p.includes('primero')) return 1;
        return 0;
    };

    return [...academicActivities].sort((a, b) => {
        // Prioridad 1: Semestre (2 debe ir antes que 1)
        const semA = getSemesterValue(a.academicPeriod);
        const semB = getSemesterValue(b.academicPeriod);
        
        if (semA !== semB) {
            return semB - semA; // Descendente: 2 primero, luego 1
        }

        // Prioridad 2: Año (Más reciente primero)
        if ((b.year || 0) !== (a.year || 0)) {
            return (b.year || 0) - (a.year || 0);
        }

        // Prioridad 3: Nombre (Alfabético)
        return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [academicActivities]);

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, Enrollment>>({});

  // --- ESTADOS PARA CONSULTA ACADÉMICA ---
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [kioskSearchRut, setKioskSearchRut] = useState('');
  const [kioskSearchSurname, setKioskSearchSurname] = useState('');
  const [kioskFoundUser, setKioskFoundUser] = useState<User | null>(null);
  const [kioskRutSuggestions, setKioskRutSuggestions] = useState<User[]>([]);
  const [kioskSurnameSuggestions, setKioskSurnameSuggestions] = useState<User[]>([]);
  const [showKioskSuggestions, setShowKioskSuggestions] = useState(false);
  const kioskSuggestionsRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1',
    nombre: '', version: 'V1', modality: 'Presencial', hours: 0,
    moduleCount: 1, evaluationCount: 3, relator: '',
    startDate: '', endDate: ''
  });

  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'rut' | 'paternalSurname' | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false); 
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  // --- LÓGICA DE SELECCIÓN KIOSKO ---
  const handleSelectKioskUser = (u: User) => {
    setKioskFoundUser(u);
    setKioskSearchRut(u.rut);
    setKioskSearchSurname(u.paternalSurname);
    setKioskRutSuggestions([]);
    setKioskSurnameSuggestions([]);
    setShowKioskSuggestions(false);
  };

  const kioskResults = useMemo(() => {
      if (!kioskFoundUser) return [];
      const userRut = normalizeRut(kioskFoundUser.rut);
      return enrollments
        .filter(e => normalizeRut(e.rut) === userRut)
        .map(enr => ({
            enrollment: enr,
            activity: activities.find(a => a.id === enr.activityId)
        }))
        .filter(res => res.activity !== undefined)
        .sort((a, b) => {
            const periodA = a.activity?.academicPeriod || a.activity?.year?.toString() || '0000';
            const periodB = b.activity?.academicPeriod || b.activity?.year?.toString() || '0000';
            return periodB.localeCompare(periodA);
        });
  }, [kioskFoundUser, enrollments, activities]);

  const kioskGroupedResults = useMemo(() => {
    const groups: Record<string, any[]> = {};
    kioskResults.forEach(res => {
        const period = res.activity?.academicPeriod || res.activity?.year?.toString() || 'Otros';
        if (!groups[period]) groups[period] = [];
        groups[period].push(res);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [kioskResults]);

  // --- EFECTO: AUTOGENERACIÓN DE CÓDIGO Y FECHA DE TÉRMINO ---
  useEffect(() => {
      if (view === 'create') {
          const words = formData.nombre.trim().split(/\s+/);
          let acronym = '';
          if (words.length === 1 && words[0].length > 0) { acronym = words[0].substring(0, 4).toUpperCase(); } 
          else { acronym = words.map(w => w[0]).join('').substring(0, 4).toUpperCase(); }
          if (acronym.length === 0) acronym = 'CURS';
          
          let dateStr = '010125';
          let proposedEndDate = formData.endDate;

          if (formData.startDate) {
              const parts = formData.startDate.split('-');
              if (parts.length === 3) { 
                  const [y, m, d] = parts; 
                  dateStr = `${d}${m}${y.slice(2)}`; 
                  const start = new Date(formData.startDate + 'T12:00:00');
                  const end = new Date(start);
                  end.setDate(start.getDate() + 42); 
                  proposedEndDate = end.toISOString().split('T')[0];
              }
          } else {
              const now = new Date();
              dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(2)}`;
          }

          const ver = formData.version.trim().toUpperCase().replace(/\s/g, '') || 'V1';
          
          // --- NUEVA LÓGICA DE SEMESTRE PARA EL CÓDIGO ---
          const semSuffix = formData.academicPeriod.includes('-1') ? '-S1' : 
                           formData.academicPeriod.includes('-2') ? '-S2' : '';
                           
          const autoCode = `${acronym}${dateStr}-${ver}${semSuffix}`;
          
          setFormData(prev => ({ 
              ...prev, 
              internalCode: autoCode,
              endDate: proposedEndDate
          }));
      }
  }, [formData.nombre, formData.startDate, formData.version, formData.academicPeriod, view]);

  useEffect(() => {
      const jumpId = localStorage.getItem('jumpto_course_id');
      const jumpTab = localStorage.getItem('jumpto_tab_course');
      if (jumpId) {
          const exists = academicActivities.find(a => a.id === jumpId);
          if (exists) {
              setSelectedCourseId(jumpId);
              if (jumpTab === 'tracking') setActiveDetailTab('tracking');
              setView('details');
          }
          localStorage.removeItem('jumpto_course_id');
          localStorage.removeItem('jumpto_tab_course');
      }
  }, [academicActivities]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
              setActiveSearchField(null);
          }
          if (kioskSuggestionsRef.current && !kioskSuggestionsRef.current.contains(event.target as Node)) {
              setShowKioskSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCourse = academicActivities.find(a => a.id === selectedCourseId);
  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '');
      });
  }, [courseEnrollments, users]);

  const handleRefresh = async () => { await executeReload(); };

  const loadImageToPdf = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = (e) => reject(e);
          img.src = url;
      });
  };

  const handleGenerateCertificate = async (enrollment: Enrollment, user: User) => {
      if (!selectedCourse) return;
      setIsGeneratingPdf(true);
      
      try {
          const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth(); 
          const pageHeight = doc.internal.pageSize.getHeight(); 
          const bgUrl = "https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Formato_Constancia.png";
          
          const bgImg = await loadImageToPdf(bgUrl);
          doc.addImage(bgImg, 'PNG', 0, 0, pageWidth, pageHeight);
          doc.setTextColor(30, 41, 59);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(17); 
          const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
          doc.text(fullName, 55, 103, { align: "left" });

          const date = new Date();
          const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
          const dateText = `Valparaíso, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
          doc.text(dateText, 60, 113, { align: "left" });

          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          const splitCourseName = doc.splitTextToSize(selectedCourse.name.toUpperCase(), pageWidth - 40);
          doc.text(splitCourseName, 108, 140, { align: "center" });

          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const combinedInfo = `Duración: ${selectedCourse.hours} horas cronológicas      RUT: ${user.rut}`;
          doc.text(combinedInfo, 108, 180, { align: "center" });

          const certCode = enrollment.certificateCode || `UPLA-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          doc.setFont("courier", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139); 
          doc.text(`ID VERIFICACIÓN: ${certCode}`, 125, 220);

          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_cert&code=${certCode}`)}`;
          const qrImg = await loadImageToPdf(qrUrl);
          doc.addImage(qrImg, 'PNG', 145, 225, 25, 25);
          
          if (!enrollment.certificateCode) {
              updateEnrollment(enrollment.id, { certificateCode: certCode });
          }

          doc.save(`Certificado_${user.rut}_${selectedCourse.internalCode || 'UPLA'}.pdf`);
      } catch (err) {
          alert("Error al generar el certificado.");
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  const determineState = (grades: number[], attendancePct: number, evalCount: number): ActivityState => {
      const minGrade = config.minPassingGrade || 4.0;
      const minAtt = config.minAttendancePercentage || 75;
      const validGrades = grades.filter(g => g !== undefined && g !== null && g > 0);
      const enteredCount = validGrades.length;
      let currentAvg = 0;
      if (enteredCount > 0) {
          const sum = validGrades.reduce((a, b) => a + b, 0);
          currentAvg = parseFloat((sum / enteredCount).toFixed(1));
      }
      const hasAllGrades = enteredCount >= evalCount;
      const hasPassingAttendance = attendancePct >= minAtt;
      const hasPassingAverage = currentAvg >= minGrade;
      if (enteredCount === 0 && attendancePct === 0) return ActivityState.INSCRITO;
      if (!hasAllGrades) return ActivityState.AVANZANDO;
      if (!hasPassingAttendance) return ActivityState.REPROBADO;
      if (!hasPassingAverage) return ActivityState.REPROBADO;
      return ActivityState.APROBADO;
  };

  const handleLocalUpdateGrade = (enrollment: Enrollment, gradeIndex: number, value: string) => {
    const enrollmentId = enrollment.id;
    let numValue = parseFloat(value.replace(',', '.'));
    if (value === '') numValue = 0;
    if (isNaN(numValue)) return;
    if (numValue > 7.0) numValue = 7.0;
    if (numValue < 0) numValue = 0;

    const base = pendingChanges[enrollmentId] || { ...enrollment };
    const currentGrades = base.grades ? [...base.grades] : [];
    
    while (currentGrades.length <= gradeIndex) currentGrades.push(0);
    currentGrades[gradeIndex] = parseFloat(numValue.toFixed(1));

    const validGrades = currentGrades.filter(g => g > 0);
    let finalGrade = 0;
    if (validGrades.length > 0) {
        const sum = validGrades.reduce((a, b) => a + b, 0);
        finalGrade = parseFloat((sum / validGrades.length).toFixed(1));
    }

    const totalExpected = selectedCourse?.evaluationCount || 3;
    const currentAtt = base.attendancePercentage || 0;
    const newState = determineState(currentGrades, currentAtt, totalExpected);

    setPendingChanges(prev => ({
        ...prev,
        [enrollmentId]: { 
            ...base, 
            grades: currentGrades, 
            finalGrade: finalGrade, 
            state: newState 
        }
    }));
  };

  const handleLocalToggleAttendance = (enrollment: Enrollment, sessionIndex: number) => {
    const enrollmentId = enrollment.id;
    if (!selectedCourse) return;
    
    const base = pendingChanges[enrollmentId] || { ...enrollment };
    const fieldName = `attendanceSession${sessionIndex + 1}` as keyof Enrollment;
    
    // @ts-ignore
    const newVal = !base[fieldName];
    const totalSessions = selectedCourse.evaluationCount || 1;
    
    let presentCount = 0;
    for (let i = 1; i <= totalSessions; i++) {
        const key = `attendanceSession${i}` as keyof Enrollment;
        // @ts-ignore
        if ((i === sessionIndex + 1) ? newVal : base[key]) presentCount++;
    }

    const percentage = Math.round((presentCount / totalSessions) * 100);
    const totalExpected = selectedCourse.evaluationCount || 3;
    const currentGrades = base.grades || [];
    const newState = determineState(currentGrades, percentage, totalExpected);

    setPendingChanges(prev => ({
        ...prev,
        [enrollmentId]: { 
            ...base, 
            [fieldName]: newVal, 
            attendancePercentage: percentage, 
            state: newState 
        }
    }));
  };

  const handleCommitRowChanges = async (enrollmentId: string) => {
    const change = pendingChanges[enrollmentId];
    if (!change) return;

    try {
        await updateEnrollment(enrollmentId, {
            grades: change.grades,
            finalGrade: change.finalGrade,
            state: change.state,
            attendancePercentage: change.attendancePercentage,
            attendanceSession1: change.attendanceSession1,
            attendanceSession2: change.attendanceSession2,
            attendanceSession3: change.attendanceSession3,
            attendanceSession4: change.attendanceSession4,
            attendanceSession5: change.attendanceSession5,
            attendanceSession6: change.attendanceSession6,
        });

        setPendingChanges(prev => {
            const next = { ...prev };
            delete next[enrollmentId];
            return next;
        });

        await executeReload();
    } catch (err) {
        alert("Error al sincronizar datos.");
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const newId = selectedCourseId || `ACAD-${Date.now()}`;
      const safeDate = formData.startDate || new Date().toISOString().split('T')[0];
      const safeRelator = formData.relator || (isAdvisor ? '' : 'Por Asignar');
      if (isAdvisor && !safeRelator) { alert("Error: Debe seleccionar un Director/Relator para crear el curso."); return; }
      const activityPayload: Activity = {
          id: newId, category: 'ACADEMIC', name: formData.nombre || 'Nuevo Curso', internalCode: formData.internalCode || `UAD-${Date.now()}`, year: Number(formData.year) || new Date().getFullYear(), academicPeriod: formData.academicPeriod || '2025-1', version: formData.version || 'V1', modality: formData.modality || 'Presencial', hours: Number(formData.hours) || 0, relator: safeRelator, startDate: safeDate, endDate: formData.endDate, evaluationCount: Number(formData.evaluationCount) || 3, moduleCount: Number(formData.moduleCount) || 1, isPublic: true
      };
      try {
          await addActivity(activityPayload);
          await executeReload();
          setView('list');
          setSelectedCourseId(null);
      } catch (err: any) {
          alert(`ERROR CRÍTICO: No se pudo crear el curso.`);
      }
  };

  const handleEditCourse = (course: Activity) => {
      setSelectedCourseId(course.id);
      setFormData({
          internalCode: course.internalCode || '', year: course.year || new Date().getFullYear(), academicPeriod: course.academicPeriod || '', nombre: course.name, version: course.version || 'V1', modality: course.modality, hours: course.hours, moduleCount: course.moduleCount || 1, evaluationCount: course.evaluationCount || 3, relator: course.relator || '', startDate: course.startDate || '', endDate: course.endDate || ''
      });
      setView('edit');
  };

  const handleCloneCourse = async (course: Activity) => {
      if (confirm(`¿Desea clonar el curso "${course.name}"?`)) {
          const newId = `ACAD-${Date.now()}`;
          const clonedActivity: Activity = { ...course, id: newId, name: `${course.name} (Copia)`, internalCode: course.internalCode ? `${course.internalCode}-CPY` : '' };
          await addActivity(clonedActivity);
          await executeReload();
          alert("Curso clonado.");
          handleEditCourse(clonedActivity); 
      }
  };

  const handleDeleteCourse = async () => {
      if (!selectedCourseId) return;
      if (confirm("¿Está seguro de eliminar este curso?")) {
          await deleteActivity(selectedCourseId);
          await executeReload();
          setView('list');
          setSelectedCourseId(null);
      }
  };

  const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      setManualForm({
          rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole
      });
      const enrolled = courseEnrollments.some(e => normalizeRut(e.rut) === normalizeRut(user.rut));
      setIsAlreadyEnrolled(enrolled); setIsFoundInMaster(true); setShowSuggestions(false); setSuggestions([]); setActiveSearchField(null);
      if(enrolled) { setEnrollMsg({ type: 'error', text: 'El estudiante ya está matriculado.' }); } 
      else { setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' }); }
  };

  const handleRutBlur = () => {
      setTimeout(() => {
          if (showSuggestions && activeSearchField === 'rut') setShowSuggestions(false);
          if (!manualForm.rut) return;
          const formatted = cleanRutFormat(manualForm.rut);
          const rawSearch = normalizeRut(formatted);
          setManualForm(prev => ({ ...prev, rut: formatted }));
          const user = users.find(u => normalizeRut(u.rut) === rawSearch);
          if (user) { handleSelectSuggestion(user); } 
          else { const isEnrolled = courseEnrollments.some(e => normalizeRut(e.rut) === rawSearch); setIsAlreadyEnrolled(isEnrolled); setIsFoundInMaster(false); }
      }, 200);
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId || !manualForm.rut || !manualForm.names) return;
      const formattedRut = cleanRutFormat(manualForm.rut);
      const userToUpsert: User = { ...manualForm, rut: formattedRut, systemRole: manualForm.systemRole as UserRole };
      await upsertUsers([userToUpsert]);
      await enrollUser(formattedRut, selectedCourseId);
      await executeReload();
      setEnrollMsg({ type: 'success', text: 'Matriculado correctamente.' });
      setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
      setIsFoundInMaster(false); setIsAlreadyEnrolled(false);
  };

  const handleUpdateMasterData = async () => {
      if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) { alert("Datos incompletos."); return; }
      const formattedRut = cleanRutFormat(manualForm.rut);
      const userToUpsert: User = { ...manualForm, rut: formattedRut, systemRole: manualForm.systemRole as UserRole };
      try { await upsertUsers([userToUpsert]); await executeReload(); setEnrollMsg({ type: 'success', text: 'Actualizado en Base Maestra.' }); } 
      catch (e) { setEnrollMsg({ type: 'error', text: 'Error al actualizar.' }); }
  };

  const handleUnenroll = async () => {
      if (!selectedCourseId || !manualForm.rut) return;
      if (confirm(`¿Confirma eliminar la matrícula de ${manualForm.rut}?`)) {
          const rawSearch = normalizeRut(manualForm.rut);
          const enrollment = courseEnrollments.find(e => normalizeRut(e.rut) === rawSearch);
          if (enrollment) {
              await deleteEnrollment(enrollment.id); await executeReload();
              setEnrollMsg({ type: 'success', text: 'Matrícula eliminada.' });
              setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
              setIsAlreadyEnrolled(false); setIsFoundInMaster(false);
          }
      }
  };

  const handleUnenrollFromList = async (enrollmentId: string, studentName: string) => {
    if (confirm(`¿Confirma que desea desmatricular a ${studentName} de este curso?\n\nEl registro del estudiante permanecerá en la Base Maestra.`)) {
        try { await deleteEnrollment(enrollmentId); await executeReload(); setEnrollMsg({ type: 'success', text: 'Estudiante desmatriculado correctamente.' }); setTimeout(() => setEnrollMsg(null), 3000); } 
        catch (err) { alert("Error al desmatricular."); }
    }
  };

  const handleClearEnrollments = async () => {
      if (!selectedCourseId || sortedEnrollments.length === 0) return;
      
      const warningMsg = `ADVERTENCIA CRÍTICA: ¿Está totalmente seguro que desea desmatricular a TODOS los estudiantes (${sortedEnrollments.length}) de este curso?\n\nEsta acción es irreversible dentro de este curso, aunque los registros en la Base Maestra permanecerán intactos.\n\nPara continuar, ingrese la CLAVE DE ADMINISTRADOR:`;
      
      const passwordInput = prompt(warningMsg);
      
      const isMasterAdminPassword = passwordInput === '112358';
      const isCurrentUserPassword = currentUser?.password && passwordInput === currentUser.password;

      if (isMasterAdminPassword || isCurrentUserPassword) {
          try {
              await Promise.all(sortedEnrollments.map(enr => deleteEnrollment(enr.id)));
              await executeReload();
              setEnrollMsg({ type: 'success', text: 'Lista de matriculados vaciada correctamente.' });
              setTimeout(() => setEnrollMsg(null), 3000);
          } catch (err) {
              alert("Ocurrió un error al intentar vaciar la lista.");
          }
      } else if (passwordInput !== null) {
          alert("Contraseña incorrecta. Acción de limpieza cancelada.");
      }
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
              if (lines.length > 0) { rows = lines.map(line => line.split(lines[0].includes(';') ? ';' : ',')); }
          }
          if (rows.length < 1) return;
          const processedRuts = new Set<string>();
          const currentEnrolledRuts = new Set(courseEnrollments.map(e => normalizeRut(e.rut)));
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
              if (processedRuts.has(normRut)) continue;
              processedRuts.add(normRut);
              if (!currentEnrolledRuts.has(normRut)) { rutsToEnroll.push(cleanRut); }
              const masterUser = users.find(u => normalizeRut(u.rut) === normRut);
              const hasNameInRow = rowStrings[1] && rowStrings[1].length > 1;
              if (hasNameInRow || !masterUser) {
                  usersToUpsert.push({
                      rut: cleanRut, names: (rowStrings[1] || masterUser?.names || 'Pendiente').trim(), paternalSurname: (rowStrings[2] || masterUser?.paternalSurname || 'Pendiente').trim(), maternalSurname: (rowStrings[3] || masterUser?.maternalSurname || '').trim(), email: (rowStrings[4] || masterUser?.email || '').trim(), phone: (rowStrings[5] || masterUser?.phone || '').trim(), academicRole: normalizeValue(rowStrings[6] || masterUser?.academicRole || '', listRoles), faculty: normalizeValue(rowStrings[7] || masterUser?.faculty || '', listFaculties), department: normalizeValue(rowStrings[8] || masterUser?.department || '', listDepts), career: normalizeValue(rowStrings[9] || masterUser?.career || '', listCareers), contractType: normalizeValue(rowStrings[10] || masterUser?.contractType || '', listContracts), teachingSemester: normalizeValue(rowStrings[11] || masterUser?.teachingSemester || '', listSemesters), campus: (rowStrings[12] || masterUser?.campus || '').trim(), systemRole: masterUser?.systemRole || UserRole.ESTUDIANTE
                  });
              }
          }
          if (usersToUpsert.length > 0) { await upsertUsers(usersToUpsert); }
          if (rutsToEnroll.length > 0) {
              try {
                  const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
                  await executeReload();
                  setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos.` });
              } catch (enrollErr: any) {
                  setEnrollMsg({ type: 'error', text: `Error al matricular: ${enrollErr.message}` });
              }
          }
          setUploadFile(null);
      };
      isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  if (view === 'create' || view === 'edit') {
      return (
          <div className="animate-fadeIn max-w-4xl mx-auto">
              <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-6 flex items-center gap-1 text-sm font-bold">← Cancelar y Volver</button>
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6"><h2 className="text-2xl font-bold text-slate-800">{view === 'create' ? 'Crear Nuevo Curso' : 'Editar Curso'}</h2>{view === 'edit' && (<button onClick={handleDeleteCourse} className="text-red-500 hover:text-red-700 text-sm font-bold flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Eliminar</button>)}</div>
                  <form onSubmit={handleCreateSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">Nombre del Curso / Asignatura</label><input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                          <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio</label><input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Término</label><input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-indigo-50 border-indigo-200"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Versión</label><input type="text" value={formData.version} placeholder="V1" onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label><input type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label><select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">{listModalities.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Año</label><input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Semestre</label><input type="text" value={formData.academicPeriod} onChange={e => setFormData({...formData, academicPeriod: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Horas</label><input type="number" value={formData.hours} onChange={e => setFormData({...formData, hours: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Director / Relator</label>{isAdvisor ? (<select value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white" required><option value="">Seleccionar Asesor...</option>{advisors.map(adv => (<option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>{adv.names} {adv.paternalSurname}</option>))}</select>) : (<input type="text" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>)}</div>
                          </div>
                          <div><label className="block text-sm font-medium text-slate-700 mb-1">Cant. Evaluaciones</label><select value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                      </div>
                      <div className="pt-6 border-t border-slate-100 flex justify-end">
                          <button type="submit" disabled={isSyncing} className={`bg-[#647FBC] hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2 ${isSyncing ? 'opacity-70 cursor-wait' : 'active:scale-95'}`}>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              {view === 'create' ? 'Crear Curso' : 'Guardar Cambios'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>);
  }

  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6"><button onClick={() => { setSelectedCourseId(null); setView('list'); }} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button><div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><div><h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2><p className="text-slate-500 text-sm mt-1">{selectedCourse.modality} • {selectedCourse.year}</p></div><div className="flex items-center gap-4"><div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100"><div className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div><span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Sincronizando...' : 'En Línea'}</span></div><div className="h-4 w-px bg-slate-300 mx-2"></div><button onClick={handleRefresh} className="text-xs font-bold text-[#647FBC] hover:text-blue-800 flex items-center gap-1"><svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Actualizar</button></div>{(isAdmin || isAdvisor) && (<button onClick={() => handleEditCourse(selectedCourse)} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50">Editar Curso</button>)}</div></div><div className="mt-8"><div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 mb-0"><button onClick={() => setActiveDetailTab('enrollment')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Matrícula</button><button onClick={() => setActiveDetailTab('tracking')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'tracking' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Seguimiento Académico</button></div><div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-[#647FBC]/30 border-t-0 p-8">{activeDetailTab === 'enrollment' && (<div className="space-y-12 animate-fadeIn w-full"><div className={`bg-slate-50 border rounded-xl p-6 transition-colors ${isAlreadyEnrolled ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}><div className="flex justify-between items-center mb-6"><h3 className={`font-bold text-lg flex items-center gap-2 ${isAlreadyEnrolled ? 'text-red-700' : 'text-slate-800'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>{isAlreadyEnrolled ? 'Gestión de Matrícula Existente' : 'Inscripción Manual (Registro Completo)'}</h3>{isFoundInMaster && !isAlreadyEnrolled && (<span className="text-xs px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">Datos de Base Maestra</span>)}</div><form onSubmit={handleEnrollSubmit} className="space-y-6"><div className="space-y-2"><h4 className="text-xs font-bold text-slate-400 uppercase">Identificación</h4><div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="relative md:col-span-1"><label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label><input type="text" name="rut" value={manualForm.rut} onChange={handleEnrollChange} onBlur={handleRutBlur} className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#647FBC] ${isAlreadyEnrolled ? 'border-red-300 bg-white text-red-700 font-bold' : ''}`} placeholder="12345678-9" autoComplete="off"/>{showSuggestions && activeSearchField === 'rut' && suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">{suggestions.map(s => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-slate-500">{s.names} {s.paternalSurname}</span></div>))}</div>)}</div><div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-sm"/></div><div className="md:col-span-1 relative"><label className="block text-xs font-bold mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#647FBC]" autoComplete="off" />{showSuggestions && activeSearchField === 'paternalSurname' && suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">{suggestions.map(s => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.paternalSurname} {s.maternalSurname}</span><span className="text-slate-500">{s.names} ({s.rut})</span></div>))}</div>)}</div><div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-sm"/></div></div></div><div className="space-y-2"><h4 className="text-xs font-bold text-slate-400 uppercase">Contacto</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-xs font-bold mb-1">Email</label><input type="email" name="email" value={manualForm.email} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-sm"/></div><div><label className="block text-xs font-bold mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded text-sm"/></div></div></div><div className="space-y-2"><h4 className="text-xs font-bold text-slate-400 uppercase">Ficha Académica</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><SmartSelect label="Sede" name="campus" value={manualForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollChange} /></div><div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleEnrollChange} /></div><div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleEnrollChange} /></div><div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleEnrollChange} /></div><div><SmartSelect label="Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleEnrollChange} /></div><div><SmartSelect label="Semestre" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleEnrollChange} /></div><div><SmartSelect label="Rol Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleEnrollChange} /></div></div></div>{isFoundInMaster && (<div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2"><h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Acciones de Base Maestra (Usuario Existente)</h4><button type="button" onClick={handleUpdateMasterData} disabled={isSyncing} className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-3 rounded shadow-sm flex items-center justify-center gap-1 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Guardar Cambios (Datos Personales)</button></div>)}{isAlreadyEnrolled ? (<button type="button" onClick={handleUnenroll} disabled={isSyncing} className={`w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold shadow transition-colors flex items-center justify-center gap-2 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Eliminar Matrícula del Curso</button>) : (<button type="submit" disabled={isSyncing} className={`w-full bg-[#647FBC] hover:bg-blue-800 text-white px-4 py-3 rounded-lg text-sm font-bold shadow transition-colors mt-4 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>Matricular Estudiante</button>)}{enrollMsg && <p className={`text-xs text-center font-bold p-2 rounded ${enrollMsg.type === 'success' ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'}`}>{enrollMsg.text}</p>}</form></div><div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col"><h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2"><svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Carga Masiva (CSV / Excel)</h3><div className="flex-1 flex flex-col justify-center space-y-4"><label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}><div className="flex flex-col items-center justify-center pt-5 pb-6">{uploadFile ? (<><svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><p className="mb-1 text-xs font-bold text-emerald-700">{uploadFile.name}</p></>) : (<><svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="mb-1 text-xs text-slate-500">Click para subir CSV/Excel</p></>)}</div><input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} /></label><div className="flex items-center gap-2 justify-center"><input type="checkbox" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-[#647FBC] focus:ring-[#647FBC]"/><span className="text-xs text-slate-500">Ignorar encabezados (fila 1)</span></div><button onClick={handleBulkUpload} disabled={!uploadFile} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors">Procesar Archivo Masivo</button></div></div><div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
    <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h4 className="font-bold text-slate-700 text-sm">Estudiantes Matriculados</h4>
        <button 
            onClick={handleClearEnrollments}
            disabled={sortedEnrollments.length === 0 || isSyncing}
            className="text-red-600 hover:text-white hover:bg-red-600 border border-red-200 bg-red-50 font-bold px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Limpiar Lista
        </button>
    </div>
    <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200"><tr><th className="px-6 py-3">RUT</th><th className="px-6 py-3">Estudiante</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-center">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedEnrollments.map(enr => { const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut)); return (<tr key={enr.id} className="hover:bg-slate-50"><td className="px-6 py-3 font-mono text-xs">{enr.rut}</td><td className="px-6 py-3 font-bold text-slate-700">{u ? `${u.paternalSurname} ${u.names}` : 'RUT no en Base Maestra'}</td><td className="px-6 py-3 text-xs text-slate-500">{u?.email || '-'}</td><td className="px-6 py-3"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{enr.state}</span></td><td className="px-6 py-3 text-center"><button onClick={() => handleUnenrollFromList(enr.id, u ? `${u.names} ${u.paternalSurname}` : enr.rut)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all shadow-sm">Desmatricular</button></td></tr>)})}</tbody></table></div></div>)} {activeDetailTab === 'tracking' && (<div className="animate-fadeIn"><div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center"><h3 className="font-bold text-slate-700">Sábana de Notas y Asistencia</h3><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400' : 'bg-green-500'} animate-pulse`}></span><span className="text-xs text-slate-500 italic">Modo edición por fila activo</span></div></div><div className="overflow-x-auto custom-scrollbar"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200"><tr><th className="px-4 py-3 w-60 bg-slate-100 sticky left-0 border-r z-10">Estudiante</th><th className="px-2 py-3 text-center w-32 border-r border-slate-200">Asistencia</th>{Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (<th key={i} className="px-2 py-3 text-center w-20 border-r border-slate-200">N{i+1}</th>))}<th className="px-2 py-3 text-center w-20 bg-slate-50 font-bold border-r border-slate-200">Final</th><th className="px-4 py-3 text-center w-28 border-r border-slate-200">Estado</th><th className="px-4 py-3 text-center w-28">Certificado</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedEnrollments.map(enr => { const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut)); 
                const activeEnr = pendingChanges[enr.id] || enr;
                
                return (<tr key={enr.id} className="hover:bg-slate-50 group"><td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-10 group-hover:bg-slate-50"><div className="font-bold text-slate-700 truncate w-56" title={`${student?.paternalSurname} ${student?.names}`}>{student ? `${student.paternalSurname}, ${student.names}` : 'Sin Info en Base Maestra'}</div><div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div></td><td className="px-4 py-2 text-center border-r border-slate-200"><div className="flex flex-col items-center"><div className="flex gap-1 justify-center mb-1">{Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => (<input key={idx} type="checkbox" checked={!!activeEnr[`attendanceSession${idx+1}`]} onChange={() => handleLocalToggleAttendance(enr, idx)} className="w-3 h-3 text-[#647FBC] rounded border-slate-300 focus:ring-[#647FBC] cursor-pointer"/>))}</div><span className={`text-[10px] font-bold ${(activeEnr.attendancePercentage || 0) < (config.minAttendancePercentage || 75) ? 'text-red-500' : 'text-green-600'}`}>{activeEnr.attendancePercentage || 0}% Asistencia</span></div></td>{Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => (<td key={idx} className="px-1 py-2 text-center border-r border-slate-100"><input type="number" step="0.1" min="1" max="7" className={`w-16 text-center border rounded py-1 text-sm font-bold focus:ring-2 focus:ring-[#647FBC] focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${activeEnr.grades?.[idx] && activeEnr.grades[idx] < 4 ? 'text-red-600 border-red-200 bg-red-50' : 'text-slate-700 border-slate-200'}`} value={activeEnr.grades?.[idx] || ''} onChange={(e) => handleLocalUpdateGrade(enr, idx, e.target.value)} disabled={isSyncing}/></td>))}<td className="px-2 py-2 text-center border-r border-slate-200 bg-slate-50 font-bold text-slate-800"><span className={activeEnr.finalGrade && activeEnr.finalGrade < 4 ? 'text-red-600' : ''}>{activeEnr.finalGrade || '-'}</span></td><td className="px-2 py-2 text-center border-r border-slate-200">
                {pendingChanges[enr.id] ? (
                    <button 
                        onClick={() => handleCommitRowChanges(enr.id)}
                        className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1.5 rounded shadow-sm hover:bg-indigo-700 transition-all transform active:scale-95 animate-pulse"
                    >
                        Ingresar/Actualizar
                    </button>
                ) : (
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : enr.state === ActivityState.REPROBADO ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{enr.state}</span>
                )}
                </td><td className="px-2 py-2 text-center"><button onClick={() => student && handleGenerateCertificate(enr, student)} disabled={enr.state !== ActivityState.APROBADO || isGeneratingPdf} className={`p-1.5 rounded transition-colors ${enr.state === ActivityState.APROBADO ? 'text-[#647FBC] hover:bg-blue-50 hover:text-blue-800' : 'text-slate-300 cursor-not-allowed'}`} title={enr.state === ActivityState.APROBADO ? "Descargar Certificado PDF" : "No disponible (Debe Aprobar)"}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button></td></tr>)})}</tbody></table></div></div></div>)}</div></div></div>);
  }

  return (
      <div className="animate-fadeIn space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos Curriculares</h2>
                <p className="text-sm text-slate-500">Administración de asignaturas académicas y registro de notas.</p>
            </div>
            <div className="flex gap-4">
                {/* BOTÓN CONSULTA ACADÉMICA (NUEVO) */}
                <button 
                    onClick={() => { setKioskSearchRut(''); setKioskSearchSurname(''); setKioskFoundUser(null); setKioskRutSuggestions([]); setKioskSurnameSuggestions([]); setShowKioskModal(true); }}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 shadow-sm"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    Consulta Académica
                </button>

                {(isAdmin || isAdvisor) && (
                    <button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1', nombre: '', version: 'V1', modality: 'Presencial', hours: 0, moduleCount: 1, evaluationCount: 3, relator: '', startDate: '', endDate: '' }); setView('create'); }} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nuevo Curso</button>
                )}
            </div>
        </div>

        {/* MODAL CONSULTA ACADÉMICA (NUEVO) */}
        {showKioskModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                    <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 leading-tight">Consulta de Expediente Académico</h3>
                                <p className="text-xs text-slate-500">Historial completo de participaciones del docente.</p>
                            </div>
                        </div>
                        <button onClick={() => setShowKioskModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                    </div>

                    <div className="p-6 bg-indigo-50 border-b border-indigo-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por RUT</label>
                                <input 
                                    type="text" 
                                    placeholder="Ingrese RUT..." 
                                    value={kioskSearchRut} 
                                    onChange={(e) => { 
                                        const val = e.target.value;
                                        setKioskSearchRut(val); 
                                        setKioskSearchSurname(''); 
                                        if (val.length >= 2) {
                                            const clean = normalizeRut(val);
                                            const matches = users.filter(u => normalizeRut(u.rut).includes(clean));
                                            setKioskRutSuggestions(matches.slice(0, 5));
                                            setKioskSurnameSuggestions([]);
                                            setShowKioskSuggestions(true);
                                        } else {
                                            setKioskRutSuggestions([]);
                                            setShowKioskSuggestions(false);
                                        }
                                    }} 
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                                {showKioskSuggestions && kioskRutSuggestions.length > 0 && (
                                    <div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">
                                        {kioskRutSuggestions.map((u) => (
                                            <div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                                                <span className="font-bold block text-slate-800">{u.rut}</span>
                                                <span className="text-xs text-slate-500">{u.names} {u.paternalSurname}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por Apellido Paterno</label>
                                <input 
                                    type="text" 
                                    placeholder="Ingrese Apellido..." 
                                    value={kioskSearchSurname} 
                                    onChange={(e) => { 
                                        const val = e.target.value;
                                        setKioskSearchSurname(val); 
                                        setKioskSearchRut(''); 
                                        if (val.length >= 2) {
                                            const lower = val.toLowerCase();
                                            const matches = users.filter(u => u.paternalSurname.toLowerCase().includes(lower));
                                            setKioskSurnameSuggestions(matches.slice(0, 5));
                                            setKioskRutSuggestions([]);
                                            setShowKioskSuggestions(true);
                                        } else {
                                            setKioskSurnameSuggestions([]);
                                            setShowKioskSuggestions(false);
                                        }
                                    }} 
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                                {showKioskSuggestions && kioskSurnameSuggestions.length > 0 && (
                                    <div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">
                                        {kioskSurnameSuggestions.map((u) => (
                                            <div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                                                <span className="font-bold block text-slate-800">{u.paternalSurname} {u.maternalSurname}</span>
                                                <span className="text-xs text-slate-500">{u.names} ({u.rut})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#F9F8F6]">
                        {kioskFoundUser ? (
                            <div className="space-y-8 animate-fadeIn">
                                {/* PERFIL DOCENTE */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6">
                                    <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-3xl shadow-inner border-2 border-white">
                                        {kioskFoundUser.photoUrl ? (
                                            <img src={kioskFoundUser.photoUrl} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
                                        ) : kioskFoundUser.names.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-2xl font-black text-slate-800 leading-tight">{kioskFoundUser.paternalSurname}, {kioskFoundUser.names}</h4>
                                        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-500 font-medium">
                                            <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg> RUT: {kioskFoundUser.rut}</span>
                                            <span className="flex items-center gap-1.5 uppercase"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> {kioskFoundUser.faculty}</span>
                                        </div>
                                    </div>
                                    <div className="text-center bg-indigo-50 px-6 py-3 rounded-2xl border border-indigo-100">
                                        <span className="block text-2xl font-black text-indigo-700">{kioskResults.length}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Actividades</span>
                                    </div>
                                </div>

                                {/* LISTADO AGRUPADO */}
                                {kioskGroupedResults.map(([period, items]) => (
                                    <div key={period} className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <h5 className="bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-md">{period}</h5>
                                            <div className="h-px flex-1 bg-slate-200"></div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            {items.map((res, i) => {
                                                const cat = res.activity?.category;
                                                const isApproved = res.enrollment.state === ActivityState.APROBADO;
                                                return (
                                                    <div key={i} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group flex flex-row items-center gap-4">
                                                        <div className="flex-1 min-w-0 grid grid-cols-12 items-center gap-4">
                                                            {/* Category & Code */}
                                                            <div className="col-span-2 flex flex-col pl-2">
                                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border w-fit ${
                                                                    cat === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                    cat === 'GENERAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                    cat === 'ADVISORY' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                    'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                                }`}>
                                                                    {cat === 'POSTGRADUATE' ? 'POSTÍTULO' : cat === 'GENERAL' ? 'EXTENSIÓN' : cat === 'ADVISORY' ? 'ASESORÍA' : 'CURSO'}
                                                                </span>
                                                                <span className="text-[9px] text-slate-400 font-mono truncate mt-1">{res.activity?.internalCode}</span>
                                                            </div>
                                                            
                                                            {/* Name */}
                                                            <div className="col-span-4">
                                                                <h6 className="font-bold text-slate-800 text-xs leading-tight group-hover:text-indigo-700 transition-colors truncate" title={res.activity?.name}>{res.activity?.name}</h6>
                                                            </div>

                                                            {/* Info inline */}
                                                            <div className="col-span-3 flex gap-4 text-[9px] text-slate-500 font-bold uppercase">
                                                                <div className="flex flex-col">
                                                                    <span className="text-slate-300">Inicio</span>
                                                                    <span className="whitespace-nowrap">{formatDateCL(res.activity?.startDate)}</span>
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="text-slate-300">Horas</span>
                                                                    <span className="whitespace-nowrap">{res.activity?.hours}h {res.activity?.modality === 'Presencial' ? 'Cr.' : 'Pd.'}</span>
                                                                </div>
                                                            </div>

                                                            {/* Grade & Status */}
                                                            <div className="col-span-3 flex items-center justify-end gap-3 border-l border-slate-100 pl-4">
                                                                <div className="text-right">
                                                                    <span className="block text-[8px] font-black text-slate-300 uppercase leading-none">Nota</span>
                                                                    <span className={`text-lg font-black ${isApproved ? 'text-indigo-600' : 'text-slate-400'}`}>{res.enrollment.finalGrade || '-'}</span>
                                                                </div>
                                                                <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border whitespace-nowrap min-w-[80px] text-center ${
                                                                    isApproved ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                                                                }`}>
                                                                    {res.enrollment.state}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <div className="max-w-xs">
                                    <h4 className="font-bold text-slate-400 text-lg uppercase tracking-tight">Sin Selección</h4>
                                    <p className="text-slate-400 text-xs">Ingrese un RUT o Apellido en los campos superiores para cargar los datos del docente.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-indigo-600 text-white text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Unidad de Acompañamiento Docente • GestorSMEAD</p>
                    </div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{sortedAcademicActivities.map(course => { 
        const courseEnrs = enrollments.filter(e => e.activityId === course.id);
        const enrolledCount = courseEnrs.length;
        const approvedCount = courseEnrs.filter(e => e.state === ActivityState.APROBADO).length;
        const advancingCount = courseEnrs.filter(e => e.state === ActivityState.AVANZANDO).length;
        const isSecondSemester = course.academicPeriod?.endsWith("-2") || course.academicPeriod?.toLowerCase().includes("2do") || course.academicPeriod?.toLowerCase().includes("segundo");

        return (<div key={course.id} className={`${isSecondSemester ? 'bg-sky-50' : 'bg-white'} rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group`}><div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><svg className="w-24 h-24 text-[#647FBC]" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" /></svg></div><div className="relative z-10"><div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${isSecondSemester ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{course.academicPeriod || course.year}</span><span className="text-xs text-slate-400 font-mono">{course.internalCode}</span></div><h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight h-14 line-clamp-2" title={course.name}>{course.name}</h3><div className="flex items-center gap-4 text-xs text-slate-500 mb-2"><span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-14 0 7 7 0 0114 0z" /></svg>{enrolledCount} Inscritos</span><span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>{course.modality}</span></div><div className="flex items-center gap-2 mb-4">
            <span className="bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {approvedCount} APROBADOS
            </span>
            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                {advancingCount} AVANZANDO
            </span>
        </div><div className="flex gap-2"><button onClick={() => { setSelectedCourseId(course.id); setView('details'); }} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white hover:border-[#647FBC] transition-all shadow-sm">Gestionar Curso</button>{(isAdmin || isAdvisor) && (<button onClick={() => handleCloneCourse(course)} title="Clonar Curso" className="px-3 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-all shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg></button>)}</div></div></div>)})} {academicActivities.length === 0 && (<div className="col-span-full py-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl"><p className="text-slate-500 font-medium">No hay cursos registrados en el sistema.</p>{(isAdmin || isAdvisor) && <p className="text-xs text-slate-400 mt-1">Utilice el botón "Nuevo Curso" para comenzar.</p>}</div>)}</div></div>
  );
};