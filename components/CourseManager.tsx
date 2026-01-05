
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, PEI_COMPETENCIES, PMI_COMPETENCIES } from '../constants';
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

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking' | 'config' | 'acta';

interface CourseManagerProps {
    currentUser?: User;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, deleteEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  
  const [cloneSuccessInfo, setCloneSuccessInfo] = useState<{ name: string, period: string } | null>(null);

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

  const sortedAcademicActivities = useMemo(() => {
    const getSemesterValue = (period?: string) => {
        if (!period) return 0;
        const p = period.toLowerCase();
        if (p.endsWith('-2') || p.includes('2do') || p.includes('segundo')) return 2;
        if (p.endsWith('-1') || p.includes('1er') || p.includes('primero')) return 1;
        return 0;
    };
    return [...academicActivities].sort((a, b) => {
        const semA = getSemesterValue(a.academicPeriod);
        const semB = getSemesterValue(b.academicPeriod);
        if (semA !== semB) return semB - semA; 
        return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [academicActivities]);

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [isAnalyzingIA, setIsAnalyzingIA] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CompetencySuggestion[]>([]);
  const [showAiReview, setShowAiReview] = useState(false);

  const [pendingChanges, setPendingChanges] = useState<Record<string, Enrollment>>({});

  const [showKioskModal, setShowKioskModal] = useState(false);
  const [showPassportModal, setShowPassportModal] = useState(false);
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
    startDate: '', endDate: '',
    competencyCodes: [] as string[]
  });

  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);

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

  // --- LÓGICA PASAPORTE EN VISTA ASESOR ---
  const passportData = useMemo(() => {
    if (!kioskFoundUser) return null;
    const normRut = normalizeRut(kioskFoundUser.rut);
    const approvedEnrollments = enrollments.filter(e => normalizeRut(e.rut) === normRut && e.state === ActivityState.APROBADO);
    
    const competencyStats: Record<string, { code: string, name: string, hours: number, activities: {name: string, grade?: number}[] }> = {};
    const masterList = [...PEI_COMPETENCIES, ...PMI_COMPETENCIES];

    approvedEnrollments.forEach(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        if (act && act.competencyCodes) {
            act.competencyCodes.forEach(code => {
                if (!competencyStats[code]) {
                    const meta = masterList.find(m => m.code === code);
                    competencyStats[code] = { code, name: meta?.name || 'Competencia Institucional', hours: 0, activities: [] };
                }
                // CORRECCIÓN: Aseguramos que las horas se traten como número y se sumen correctamente
                competencyStats[code].hours += Number(act.hours || 0);
                competencyStats[code].activities.push({ name: act.name, grade: enr.finalGrade });
            });
        }
    });
    return Object.values(competencyStats).sort((a, b) => b.hours - a.hours);
  }, [kioskFoundUser, enrollments, activities]);

  const handleExportPassportHTML = () => {
    if (!passportData || !kioskFoundUser) return;
    setIsGeneratingHtml(true);

    const student = kioskFoundUser;
    const verificationCode = `PAS-ADV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_passport&code=${verificationCode}`)}`;

    const rowsHtml = passportData.map(c => `
        <div class="competency-card">
            <div class="competency-header">
                <span class="competency-code">${c.code}</span>
                <span class="competency-name">${c.name}</span>
                <span class="competency-hours">${c.hours} Horas de Vuelo</span>
            </div>
            <div class="supporting-docs">
                <p><strong>Evidencia de Acreditación:</strong></p>
                <ul>
                    ${c.activities.map(a => `<li>${a.name} ${a.grade ? `(Promedio: ${a.grade})` : ''}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('');

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pasaporte de Competencias - ${student.paternalSurname}</title><style>body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #f8fafc; padding: 40px; color: #1e293b; } .passport-container { max-width: 800px; margin: auto; background: white; border-radius: 24px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; overflow: hidden; } .header { background: linear-gradient(135deg, #647FBC, #4338ca); color: white; padding: 60px 40px; text-align: center; position: relative; } .header h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; } .header p { opacity: 0.8; margin-top: 10px; font-size: 14px; } .student-info { padding: 40px; background: #f1f5f9; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; } .student-details h2 { margin: 0; font-size: 22px; color: #0f172a; } .student-details span { color: #64748b; font-family: monospace; font-weight: bold; } .content { padding: 40px; } .competency-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; transition: transform 0.2s; } .competency-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; } .competency-code { background: #e0e7ff; color: #4338ca; font-weight: 800; padding: 4px 12px; rounded: 8px; font-size: 12px; border-radius: 6px; } .competency-name { font-weight: bold; font-size: 16px; flex: 1; } .competency-hours { font-size: 12px; font-weight: 800; color: #059669; background: #ecfdf5; padding: 4px 12px; border-radius: 6px; } .supporting-docs { font-size: 13px; color: #475569; } .supporting-docs ul { margin: 10px 0 0 0; padding-left: 20px; } .footer { padding: 40px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; background: #fafafa; } .verification-info { font-size: 11px; color: #94a3b8; max-width: 400px; } .verification-code { font-family: monospace; color: #647FBC; font-weight: bold; display: block; margin-top: 5px; font-size: 13px; } .qr-box { text-align: center; } .qr-box img { width: 100px; border: 1px solid #eee; border-radius: 8px; padding: 5px; background: white; } .qr-box span { display: block; font-size: 9px; font-weight: bold; color: #647FBC; margin-top: 5px; }</style></head><body><div class="passport-container"><div class="header"><h1>Pasaporte de Competencias - ${student.names} ${student.paternalSurname}</h1><p>Emitido por Asesoría UAD • Universidad de Playa Ancha</p></div><div class="student-info"><div class="student-details"><h2>${student.names} ${student.paternalSurname}</h2><span>RUT: ${student.rut}</span></div><div style="text-align: right"><p style="margin:0; font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase">Estado Global</p><p style="margin:0; font-size: 20px; font-weight: 800; color: #059669">CERTIFICADO</p></div></div><div class="content"><p style="font-size: 14px; margin-bottom: 30px; color: #64748b; line-height: 1.6">Este documento acredita las micro-credenciales institucionales acumuladas por el docente.</p>${rowsHtml}</div><div class="footer"><div class="verification-info"><p>Este documento es una micro-credencial oficial emitida por GestorSMEAD.</p><span class="verification-code">ID VERIFICACIÓN: ${verificationCode}</span></div><div class="qr-box"><img src="${qrUrl}" alt="QR"><span>VALIDAR DOCUMENTO</span></div></div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PASAPORTE_COMPETENCIAS_${student.paternalSurname?.toUpperCase()}_${student.rut}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setIsGeneratingHtml(false);
  };

  const kioskGroupedResults = useMemo(() => {
    const groups: Record<string, any[]> = {};
    kioskResults.forEach(res => {
        const period = res.activity?.academicPeriod || res.activity?.year?.toString() || 'Otros';
        if (!groups[period]) groups[period] = [];
        groups[period].push(res);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [kioskResults]);

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
          const semSuffix = formData.academicPeriod.includes('-1') ? '-S1' : formData.academicPeriod.includes('-2') ? '-S2' : '';
          const autoCode = `${acronym}${dateStr}-${ver}${semSuffix}`;
          setFormData(prev => ({ ...prev, internalCode: autoCode, endDate: proposedEndDate }));
      }
  }, [formData.nombre, formData.startDate, formData.version, formData.academicPeriod, view]);

  useEffect(() => {
      const jumpId = localStorage.getItem('jumpto_course_id');
      const jumpTab = localStorage.getItem('jumpto_tab_course');
      if (jumpId) {
          const exists = activities.find(a => a.id === jumpId);
          if (exists) {
              setSelectedCourseId(jumpId);
              if (jumpTab === 'tracking') setActiveDetailTab('tracking');
              setView('details');
          }
          localStorage.removeItem('jumpto_course_id');
          localStorage.removeItem('jumpto_tab_course');
      }
  }, [activities]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) { setShowSuggestions(false); setActiveSearchField(null); }
          if (kioskSuggestionsRef.current && !kioskSuggestionsRef.current.contains(event.target as Node)) { setShowKioskSuggestions(false); }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCourse = useMemo(() => activities.find(a => a.id === selectedCourseId), [activities, selectedCourseId]);
  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '');
      });
  }, [courseEnrollments, users]);

  const handleRefresh = async () => { await executeReload(); };

  const handleToggleCompetence = (code: string) => {
      setFormData(prev => ({
          ...prev,
          competencyCodes: prev.competencyCodes.includes(code)
            ? prev.competencyCodes.filter(c => c !== code)
            : [...prev.competencyCodes, code]
      }));
  };

  const handleAnalyzeSyllabus = async () => {
    if (!syllabusFile) { alert("Por favor suba primero el programa de la asignatura (PDF o TXT)."); return; }
    setIsAnalyzingIA(true);
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const simulatedText = syllabusFile.type.includes('pdf') ? `Análisis de programa: ${syllabusFile.name}. Liderazgo, gestión estratégica y ética institucional.` : e.target?.result as string;
            const suggestions = await suggestCompetencies(simulatedText);
            if (suggestions.length > 0) { setAiSuggestions(suggestions); setShowAiReview(true); } else { alert("La IA no ha podido identificar tributaciones claras."); }
            setIsAnalyzingIA(false);
        };
        if (syllabusFile.type.includes('pdf')) { reader.readAsArrayBuffer(syllabusFile); } else { reader.readAsText(syllabusFile); }
    } catch (err) { alert("Error al conectar con Gemini AI."); setIsAnalyzingIA(false); }
  };

  const applyAiSuggestions = () => {
    const suggestedCodes = aiSuggestions.map(s => s.code);
    setFormData(prev => ({ ...prev, competencyCodes: Array.from(new Set([...prev.competencyCodes, ...suggestedCodes])) }));
    setShowAiReview(false); setAiSuggestions([]); alert("Competencias aplicadas exitosamente.");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const newId = selectedCourseId || `ACAD-${Date.now()}`;
      const safeDate = formData.startDate || new Date().toISOString().split('T')[0];
      const safeRelator = formData.relator || (isAdvisor ? '' : 'Por Asignar');
      if (isAdvisor && !safeRelator) { alert("Error: Debe seleccionar un Director/Relator para crear el curso."); return; }
      const activityPayload: Activity = {
          id: newId, category: 'ACADEMIC', name: formData.nombre || 'Nuevo Curso', internalCode: formData.internalCode || `UAD-${Date.now()}`, year: Number(formData.year) || new Date().getFullYear(), academicPeriod: formData.academicPeriod || '2025-1', version: formData.version || 'V1', modality: formData.modality || 'Presencial', hours: Number(formData.hours) || 0, relator: safeRelator, startDate: safeDate, endDate: formData.endDate, evaluationCount: Number(formData.evaluationCount) || 3, moduleCount: Number(formData.moduleCount) || 1, isPublic: true, competencyCodes: formData.competencyCodes
      };
      try { await addActivity(activityPayload); await executeReload(); setView('list'); setSelectedCourseId(null); } catch (err: any) { alert(`ERROR CRÍTICO: No se pudo crear el curso.`); }
  };

  const handleEditCourse = (course: Activity) => {
      setSelectedCourseId(course.id);
      setFormData({
          internalCode: course.internalCode || '', year: course.year || new Date().getFullYear(), academicPeriod: course.academicPeriod || '', nombre: course.name, version: course.version || 'V1', modality: course.modality, hours: course.hours, moduleCount: course.moduleCount || 1, evaluationCount: course.evaluationCount || 3, relator: course.relator || '', startDate: course.startDate || '', endDate: course.endDate || '', competencyCodes: course.competencyCodes || [] 
      });
      setSyllabusFile(null); setView('edit');
  };

  const handleCloneCourse = async (course: Activity) => {
      if (confirm(`¿Desea clonar el curso "${course.name}"?`)) {
          const now = new Date();
          const currentYearVal = now.getFullYear();
          const currentSemVal = now.getMonth() < 7 ? '1' : '2';
          const currentPeriodStr = `${currentYearVal}-${currentSemVal}`;
          const clonedActivity: Activity = { ...course, id: `ACAD-${Date.now()}`, name: `${course.name} (Copia)`, internalCode: course.internalCode ? `${course.internalCode}-CLON` : `CLON-${Date.now()}`, year: currentYearVal, academicPeriod: currentPeriodStr };
          try { await addActivity(clonedActivity); await executeReload(); setCloneSuccessInfo({ name: course.name, period: `${currentSemVal === '1' ? '1er' : '2do'} Semestre del ${currentYearVal}` }); } catch (err) { alert("Error al clonar."); }
      }
  };

  return (
      <div className="animate-fadeIn space-y-6">
        <div className="flex justify-between items-center">
            <div><h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos Curriculares</h2><p className="text-sm text-slate-500">Administración de asignaturas académicas y registro de notas.</p></div>
            <div className="flex gap-4 items-center">
                <div className="flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-200 shadow-inner group"><label className="text-[10px] font-black text-slate-400 uppercase mr-3">Periodo:</label><select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="text-sm font-black text-[#647FBC] bg-transparent border-none focus:ring-0 p-0 cursor-pointer uppercase"><option value={currentYear}>{currentYear}</option><option value={currentYear - 1}>{currentYear - 1}</option><option value={currentYear - 2}>{currentYear - 2}</option></select></div>
                <button onClick={() => { setKioskSearchRut(''); setKioskSearchSurname(''); setKioskFoundUser(null); setKioskRutSuggestions([]); setKioskSurnameSuggestions([]); setShowKioskModal(true); }} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Consulta Académica</button>
                {(isAdmin || isAdvisor) && (<button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1', nombre: '', version: 'V1', modality: 'Presencial', hours: 0, moduleCount: 1, evaluationCount: 3, relator: '', startDate: '', endDate: '', competencyCodes: [] }); setSyllabusFile(null); setView('create'); }} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nuevo Curso</button>)}
            </div>
        </div>

        {/* MODAL CONSULTA ACADÉMICA (CON PASAPORTE HABILITADO) */}
        {showKioskModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                    <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div><div><h3 className="text-xl font-bold text-slate-800 leading-tight">Consulta de Expediente Académico</h3><p className="text-xs text-slate-500">Historial completo de participaciones del docente.</p></div></div>
                        <button onClick={() => setShowKioskModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                    </div>

                    <div className="p-6 bg-indigo-50 border-b border-indigo-100"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="relative"><label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por RUT</label><input type="text" placeholder="Ingrese RUT..." value={kioskSearchRut} onChange={(e) => { const val = e.target.value; setKioskSearchRut(val); /* // FIX: Corrected typo setSearchSurname to setKioskSearchSurname */ setKioskSearchSurname(''); if (val.length >= 2) { const clean = normalizeRut(val); const matches = users.filter(u => normalizeRut(u.rut).includes(clean)); setKioskRutSuggestions(matches.slice(0, 5)); setKioskSurnameSuggestions([]); setShowKioskSuggestions(true); } else { setKioskRutSuggestions([]); setShowKioskSuggestions(false); } }} className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/>{showKioskSuggestions && kioskRutSuggestions.length > 0 && (<div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">{kioskRutSuggestions.map((u) => (<div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{u.rut}</span><span className="text-xs text-slate-500">{u.names} {u.paternalSurname}</span></div>))}</div>)}</div><div className="relative"><label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por Apellido Paterno</label><input type="text" placeholder="Ingrese Apellido..." value={kioskSearchSurname} onChange={(e) => { const val = e.target.value; setKioskSearchSurname(val); setKioskSearchRut(''); if (val.length >= 2) { const lower = val.toLowerCase(); const matches = users.filter(u => u.paternalSurname.toLowerCase().includes(lower)); setKioskSurnameSuggestions(matches.slice(0, 5)); setKioskRutSuggestions([]); setShowKioskSuggestions(true); } else { setKioskSurnameSuggestions([]); setShowKioskSuggestions(false); } }} className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/>{showKioskSuggestions && kioskSurnameSuggestions.length > 0 && (<div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">{kioskSurnameSuggestions.map((u) => (<div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{u.paternalSurname} {u.maternalSurname}</span><span className="text-xs text-slate-500">{u.names} ({u.rut})</span></div>))}</div>)}</div></div></div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#F9F8F6]">
                        {kioskFoundUser ? (
                            <div className="space-y-8 animate-fadeIn">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-6 relative pr-16">
                                    <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-3xl shadow-inner border-2 border-white">{kioskFoundUser.photoUrl ? (<img src={kioskFoundUser.photoUrl} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />) : kioskFoundUser.names.charAt(0)}</div>
                                    <div className="flex-1">
                                        <h4 className="text-2xl font-black text-slate-800 leading-tight">{kioskFoundUser.paternalSurname}, {kioskFoundUser.names}</h4>
                                        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-slate-500 font-medium"><span className="flex items-center gap-1.5 font-mono">RUT: {kioskFoundUser.rut}</span><span className="flex items-center gap-1.5 uppercase">{kioskFoundUser.faculty}</span></div>
                                    </div>
                                    <button onClick={() => setShowPassportModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all transform active:scale-95"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Pasaporte de Competencias</button>
                                </div>
                                {kioskGroupedResults.map(([period, items]) => (
                                    <div key={period} className="space-y-4">
                                        <div className="flex items-center gap-3"><h5 className="bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-md">{period}</h5><div className="h-px flex-1 bg-slate-200"></div></div>
                                        <div className="grid grid-cols-1 gap-4">{items.map((res, i) => { const cat = res.activity?.category; const isApproved = res.enrollment.state === ActivityState.APROBADO; return (
                                            <div key={i} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group flex flex-row items-center gap-4"><div className="flex-1 min-w-0 grid grid-cols-12 items-center gap-4"><div className="col-span-2 flex flex-col pl-2"><span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border w-fit ${cat === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' : cat === 'GENERAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : cat === 'ADVISORY' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{cat === 'POSTGRADUATE' ? 'POSTÍTULO' : cat === 'GENERAL' ? 'EXTENSIÓN' : cat === 'ADVISORY' ? 'ASESORÍA' : 'CURSO'}</span><span className="text-[9px] text-slate-400 font-mono truncate mt-1">{res.activity?.internalCode}</span></div><div className="col-span-4"><h6 className="font-bold text-slate-800 text-xs leading-tight group-hover:text-indigo-700 transition-colors truncate" title={res.activity?.name}>{res.activity?.name}</h6></div><div className="col-span-3 flex gap-4 text-[9px] text-slate-500 font-bold uppercase"><div className="flex flex-col"><span className="text-slate-300">Inicio</span><span className="whitespace-nowrap">{formatDateCL(res.activity?.startDate)}</span></div><div className="flex flex-col"><span className="text-slate-300">Horas</span><span className="whitespace-nowrap">{res.activity?.hours}h {res.activity?.modality === 'Presencial' ? 'Cr.' : 'Pd.'}</span></div></div><div className="col-span-3 flex items-center justify-end gap-3 border-l border-slate-100 pl-4"><div className="text-right"><span className="block text-[8px] font-black text-slate-300 uppercase leading-none">Nota</span><span className={`text-lg font-black ${isApproved ? 'text-indigo-600' : 'text-slate-400'}`}>{res.enrollment.finalGrade || '-'}</span></div><span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase border whitespace-nowrap min-w-[80px] text-center ${isApproved ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>{res.enrollment.state}</span></div></div></div>
                                        );})}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (<div className="flex flex-col items-center justify-center py-20 text-center space-y-4"><div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div><div className="max-w-xs"><h4 className="font-bold text-slate-400 text-lg uppercase tracking-tight">Sin Selección</h4><p className="text-slate-400 text-xs">Ingrese un RUT o Apellido arriba para cargar los datos del docente.</p></div></div>)}
                    </div>
                </div>
            </div>
        )}

        {/* MODAL PASAPORTE (VISTA ASESOR) */}
        {showPassportModal && passportData && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-lg animate-fadeIn">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-indigo-100">
                    <div className="p-10 bg-gradient-to-br from-indigo-700 to-[#647FBC] text-white flex justify-between items-center shadow-lg relative overflow-hidden"><div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-40 -mt-40"></div><div className="relative z-10 flex items-center gap-6"><div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center border border-white/30 backdrop-blur-md"><svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div><div><h3 className="text-3xl font-black tracking-tighter uppercase leading-none mb-1">Pasaporte de Competencias</h3><p className="text-xs text-blue-100 font-bold uppercase tracking-widest opacity-80">Micro-credenciales y Capacidades Adquiridas (Expediente Asesor)</p></div></div><button onClick={() => setShowPassportModal(false)} className="text-white/60 hover:text-white text-5xl font-light transition-all active:scale-90 relative z-10">&times;</button></div>
                    <div className="flex-1 overflow-y-auto p-12 bg-[#F9F8F6] custom-scrollbar space-y-12">
                        {passportData.length === 0 ? (<div className="py-20 text-center space-y-6"><div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300"><svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><p className="text-slate-400 font-bold text-lg uppercase tracking-tight">Sin micro-credenciales acreditadas</p></div>) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {passportData.map((comp, idx) => (
                                    <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden flex flex-col h-full border-b-4 border-b-indigo-500"><div className="absolute -right-4 -top-4 w-20 h-20 bg-indigo-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div><div className="flex items-center gap-4 mb-6"><div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors uppercase">{comp.code}</div><div className="flex-1 min-w-0"><h4 className="font-black text-slate-800 uppercase text-xs tracking-tight leading-tight mb-1 group-hover:text-indigo-700 transition-colors truncate">{comp.name}</h4><span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">Acreditada</span></div></div><div className="flex-1 space-y-4"><div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horas de Vuelo</span><span className="text-xl font-black text-slate-700">{comp.hours}h</span></div><div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((comp.hours/30)*100, 100)}%` }}></div></div></div><div className="space-y-2"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cursos de Respaldo:</p>{comp.activities.map((a, i) => (<div key={i} className="flex justify-between items-center text-[10px] text-slate-600 py-1 border-b border-slate-50 last:border-0 italic"><span className="truncate pr-4">• {a.name}</span>{a.grade && <span className="font-black text-indigo-600">{a.grade}</span>}</div>))}</div></div></div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-10 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6"><div className="text-left"><p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1 italic">Strategic Portafolio Unit • Micro-credenciales UPLA</p><p className="text-xs text-slate-500 max-w-md">Descarga del expediente oficial de competencias para portafolio docente.</p></div><button onClick={handleExportPassportHTML} disabled={isGeneratingHtml || passportData.length === 0} className="bg-slate-800 hover:bg-black text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50">{isGeneratingHtml ? "Generando..." : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>DESCARGAR MICRO-CREDENCIAL</>)}</button></div>
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedAcademicActivities.map(course => { 
            const courseEnrs = enrollments.filter(e => e.activityId === course.id);
            const enrolledCount = courseEnrs.length;
            const approvedCount = courseEnrs.filter(e => e.state === ActivityState.APROBADO).length;
            const advancingCount = courseEnrs.filter(e => e.state === ActivityState.AVANZANDO).length;
            const isSecondSemester = course.academicPeriod?.endsWith("-2") || course.academicPeriod?.toLowerCase().includes("2do") || course.academicPeriod?.toLowerCase().includes("segundo");

            return (
              <div key={course.id} className={`${isSecondSemester ? 'bg-sky-50' : 'bg-white'} rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><svg className="w-24 h-24 text-[#647FBC]" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" /></svg></div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${isSecondSemester ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{course.academicPeriod || course.year}</span><span className="text-xs text-slate-400 font-mono">{course.internalCode}</span></div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight h-14 line-clamp-2" title={course.name}>{course.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-2"><span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>{enrolledCount} Inscritos</span><span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>{course.modality}</span></div>
                  <div className="flex items-center gap-2 mb-4"><span className="bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded border border-green-100 flex items-center gap-1"><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{approvedCount} APROBADOS</span><span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1"><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>{advancingCount} AVANZANDO</span></div>
                  {course.competencyCodes && course.competencyCodes.length > 0 && (<div className="flex flex-wrap gap-1 mb-4 h-5 overflow-hidden">{course.competencyCodes.map(code => (<span key={code} title={PEI_COMPETENCIES.find(c => c.code === code)?.name || PMI_COMPETENCIES.find(c => c.code === code)?.name || ''} className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter ${code.startsWith('PEI') ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{code}</span>))}</div>)}
                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedCourseId(course.id); setView('details'); }} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white hover:border-[#647FBC] transition-all shadow-sm">Gestionar Curso</button>
                    {(isAdmin || isAdvisor) && (<button onClick={() => handleCloneCourse(course)} title="Clonar Curso para Periodo Actual" className="px-3 py-2 bg-white border border-slate-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6" /></svg></button>)}
                  </div>
                </div>
              </div>
            );
          })} 
        </div>
      </div>
  );
};
