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
  
  const [isAnalyzingIA, setIsAnalyzingIA] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CompetencySuggestion[]>([]);
  const [showAiReview, setShowAiReview] = useState(false);

  // States for Details View
  const [pendingGrades, setPendingGrades] = useState<Record<string, number[]>>({});
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

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

  const [enrollForm, setEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);

  const selectedCourse = useMemo(() => activities.find(a => a.id === selectedCourseId), [activities, selectedCourseId]);
  const courseEnrollments = useMemo(() => enrollments.filter(e => e.activityId === selectedCourseId), [enrollments, selectedCourseId]);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => normalizeRut(u.rut) === normalizeRut(a.rut));
          const userB = users.find(u => normalizeRut(u.rut) === normalizeRut(b.rut));
          return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '');
      });
  }, [courseEnrollments, users]);

  // --- Search & Selection Handlers ---

  const handleSelectKioskUser = (u: User) => {
    setKioskFoundUser(u);
    setKioskSearchRut(u.rut);
    setKioskSearchSurname(u.paternalSurname);
    setKioskRutSuggestions([]);
    setKioskSurnameSuggestions([]);
    setShowKioskSuggestions(false);
  };

  const handleEnrollFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEnrollForm(prev => ({ ...prev, [name]: value }));
      if (name === 'rut') {
          const rawInput = normalizeRut(value);
          if (rawInput.length >= 2) { 
              const matches = users.filter(u => normalizeRut(u.rut).includes(rawInput));
              setSuggestions(matches.slice(0, 5)); 
              setShowSuggestions(matches.length > 0);
          } else { 
              setSuggestions([]); 
              setShowSuggestions(false); 
          }
      }
  };

  const handleSelectEnrollSuggestion = (user: User) => {
      suggestionClickedRef.current = true;
      setEnrollForm({
          rut: user.rut, 
          names: user.names, 
          paternalSurname: user.paternalSurname, 
          maternalSurname: user.maternalSurname || '', 
          email: user.email || '', 
          phone: user.phone || '', 
          academicRole: user.academicRole || '', 
          faculty: user.faculty || '', 
          department: user.department || '', 
          career: user.career || '', 
          contractType: user.contractType || '', 
          teachingSemester: user.teachingSemester || '', 
          campus: user.campus || '', 
          systemRole: user.systemRole
      });
      setShowSuggestions(false); setSuggestions([]);
      setTimeout(() => { suggestionClickedRef.current = false; }, 300);
  };

  const handleRutBlur = () => {
    setTimeout(() => {
        if (suggestionClickedRef.current) return;
        if (showSuggestions) setShowSuggestions(false);
        if (!enrollForm.rut) return;
        const formatted = cleanRutFormat(enrollForm.rut);
        const rawSearch = normalizeRut(formatted);
        setEnrollForm(prev => ({ ...prev, rut: formatted }));
        const masterUser = users.find(u => normalizeRut(u.rut) === rawSearch);
        if (masterUser) handleSelectEnrollSuggestion(masterUser);
    }, 200);
  };

  // --- CRUD Handlers ---

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const newId = selectedCourseId || `ACAD-${Date.now()}`;
      const safeDate = formData.startDate || new Date().toISOString().split('T')[0];
      const activityPayload: Activity = {
          ...formData,
          id: newId, 
          category: 'ACADEMIC', 
          year: Number(formData.year),
          hours: Number(formData.hours),
          moduleCount: Number(formData.moduleCount),
          evaluationCount: Number(formData.evaluationCount),
          startDate: safeDate,
          isPublic: true
      };
      try { 
          await addActivity(activityPayload); 
          await executeReload(); 
          setView('list'); 
          setSelectedCourseId(null); 
      } catch (err) { alert(`Error al guardar: ${err}`); }
  };

  const handleEditCourse = (course: Activity) => {
      setSelectedCourseId(course.id);
      setFormData({
          internalCode: course.internalCode || '', year: course.year || new Date().getFullYear(), academicPeriod: course.academicPeriod || '', nombre: course.name, version: course.version || 'V1', modality: course.modality, hours: course.hours, moduleCount: course.moduleCount || 1, evaluationCount: course.evaluationCount || 3, relator: course.relator || '', startDate: course.startDate || '', endDate: course.endDate || '', competencyCodes: course.competencyCodes || [] 
      });
      setView('edit');
  };

  const handleDeleteActivity = async () => {
      if (!selectedCourseId || !selectedCourse) return;
      if (confirm(`¿Está seguro de eliminar permanentemente el curso "${selectedCourse.name}"?`)) {
          await deleteActivity(selectedCourseId);
          await executeReload();
          setView('list');
          setSelectedCourseId(null);
      }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId) return;
      if (!enrollForm.rut || !enrollForm.names || !enrollForm.paternalSurname) {
          setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios (*).' }); return;
      }
      setIsProcessingBatch(true);
      const formattedRut = cleanRutFormat(enrollForm.rut);
      try {
          await upsertUsers([{ ...enrollForm, rut: formattedRut, systemRole: enrollForm.systemRole as UserRole }]);
          await enrollUser(formattedRut, selectedCourseId);
          await executeReload();
          setEnrollMsg({ type: 'success', text: 'Estudiante matriculado exitosamente.' });
          setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
      } catch (error: any) { setEnrollMsg({ type: 'error', text: `Error: ${error.message}` });
      } finally { setIsProcessingBatch(false); }
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
                const delimiter = text.includes(';') ? ';' : ',';
                rows = text.split(/\r\n|\n/).filter(l => l.trim() !== '').map(line => line.split(delimiter));
            }
            if (rows.length < 1) { setIsProcessingBatch(false); return; }

            const rutsToEnroll: string[] = [];
            let startRow = hasHeaders ? 1 : 0;

            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0 || !row[0]) continue;
                const cleanRut = cleanRutFormat(String(row[0]).trim());
                rutsToEnroll.push(cleanRut);
            }

            if (rutsToEnroll.length > 0) {
                await bulkEnroll(rutsToEnroll, selectedCourseId);
                await executeReload();
                setEnrollMsg({ type: 'success', text: `Éxito: ${rutsToEnroll.length} registros procesados.` });
            }
        } catch (err: any) { setEnrollMsg({ type: 'error', text: `Error: ${err.message}` });
        } finally { setIsProcessingBatch(false); setUploadFile(null); }
    };
    isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  // --- Grade & Attendance Handlers ---

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

  const handleBatchSaveGrades = async () => {
    const ids = Object.keys(pendingGrades);
    if (ids.length === 0) return;
    setIsProcessingBatch(true);
    try {
        for (const eid of ids) {
            const grades = pendingGrades[eid];
            const validGrades = grades.filter(g => g > 0);
            const finalGrade = validGrades.length > 0 ? parseFloat((validGrades.reduce((a, b) => a + b, 0) / validGrades.length).toFixed(1)) : 0;
            const state = finalGrade >= (config.minPassingGrade || 4.0) ? ActivityState.APROBADO : ActivityState.PENDIENTE;
            await updateEnrollment(eid, { grades, finalGrade, state });
        }
        await executeReload();
        setPendingGrades({});
        alert("Calificaciones guardadas correctamente.");
    } catch (err) { alert("Error al guardar calificaciones.");
    } finally { setIsProcessingBatch(false); }
  };

  const handleToggleAttendance = async (enrollmentId: string, sessionIdx: number) => {
    const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return;
    const sessionKey = `attendanceSession${sessionIdx + 1}` as keyof Enrollment;
    const newVal = !enrollment[sessionKey];
    
    // Calculate new percentage
    let presentCount = 0;
    const totalSessions = selectedCourse?.evaluationCount || 3;
    for (let i = 0; i < totalSessions; i++) {
        const key = `attendanceSession${i + 1}` as keyof Enrollment;
        const val = (i === sessionIdx) ? newVal : enrollment[key];
        if (val) presentCount++;
    }
    const attendancePercentage = Math.round((presentCount / totalSessions) * 100);

    await updateEnrollment(enrollmentId, { [sessionKey]: newVal, attendancePercentage });
    await executeReload();
  };

  // --- Views ---

  if (view === 'create' || view === 'edit') {
    return (
        <div className="max-w-5xl mx-auto animate-fadeIn">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">{view === 'create' ? 'Crear Nuevo Curso' : 'Editar Curso Curricular'}</h2>
                <form onSubmit={handleCreateSubmit} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">Nombre del Curso</label><input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"/></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label><input required type="text" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono"/></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Año</label><input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Periodo Acad.</label><select value={formData.academicPeriod} onChange={e => setFormData({...formData, academicPeriod: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg">{listSemesters.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Horas</label><input type="number" value={formData.hours} onChange={e => setFormData({...formData, hours: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label><select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg">{listModalities.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Cant. Notas</label><input type="number" min="1" max="10" value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                        </div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Relator / Docente</label><input type="text" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg"/></div>
                    </div>
                    <div className="flex justify-between pt-6 border-t">
                        {view === 'edit' && <button type="button" onClick={handleDeleteActivity} className="text-red-600 font-bold text-sm">Eliminar Curso</button>}
                        <button type="submit" className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700 ml-auto">Guardar Cambios</button>
                    </div>
                </form>
            </div>
        </div>
    );
  }

  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
              <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm font-bold">← Volver al listado</button>
              
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
                    <button onClick={() => handleEditCourse(selectedCourse)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs transition-colors">Modificar Datos</button>
                  </div>
              </div>

              <div className="flex items-end gap-2 border-b border-slate-200 pl-4">
                  <button onClick={() => setActiveDetailTab('enrollment')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'enrollment' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Matrícula</button>
                  <button onClick={() => setActiveDetailTab('tracking')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'tracking' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-100'}`}>Notas y Asistencia</button>
                  <button onClick={() => setActiveDetailTab('acta')} className={`px-6 py-3 rounded-t-xl font-bold text-sm border-t-4 transition-all ${activeDetailTab === 'acta' ? 'bg-white text-indigo-700 border-t-indigo-600 border-x border-slate-200 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-transparent hover:bg-slate-100'}`}>Acta Final</button>
              </div>

              <div className="bg-white rounded-b-xl shadow-sm border border-slate-200 border-t-0 p-8">
                  {activeDetailTab === 'enrollment' && (
                      <div className="space-y-8">
                          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-inner">
                              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-200">
                                  <div className="p-2 bg-indigo-600 text-white rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg></div>
                                  <h3 className="font-bold text-slate-800 text-lg">Inscripción Manual (13 Campos Base Maestra)</h3>
                              </div>

                              <form onSubmit={handleEnrollSubmit} className="space-y-8">
                                  <div className="space-y-4">
                                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Identidad y Contacto
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                          <div className="relative">
                                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">RUT *</label>
                                              <input type="text" name="rut" placeholder="12345678-9" value={enrollForm.rut} onChange={handleEnrollFormChange} onBlur={handleRutBlur} autoComplete="off" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500"/>
                                              {showSuggestions && suggestions.length > 0 && (
                                                  <div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                      {suggestions.map(s => (<div key={s.rut} onMouseDown={() => handleSelectEnrollSuggestion(s)} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs border-b last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-slate-500">{s.names} {s.paternalSurname}</span></div>))}
                                                  </div>
                                              )}
                                          </div>
                                          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombres *</label><input type="text" name="names" value={enrollForm.names} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/></div>
                                          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={enrollForm.paternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/></div>
                                          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/></div>
                                          <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Email Institucional</label><input type="email" name="email" value={enrollForm.email} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/></div>
                                          <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Teléfono</label><input type="text" name="phone" value={enrollForm.phone} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"/></div>
                                      </div>
                                  </div>

                                  <div className="space-y-4 pt-4 border-t border-slate-200">
                                      <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Datos Institucionales
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                          <SmartSelect label="Sede" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Facultad" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Departamento" name="department" value={enrollForm.department} options={listDepts} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Carrera" name="career" value={enrollForm.career} options={listCareers} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Rol Académico" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Tipo Contrato" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={handleEnrollFormChange} />
                                          <SmartSelect label="Semestre" name="teachingSemester" value={enrollForm.teachingSemester} options={listSemesters} onChange={handleEnrollFormChange} />
                                          <div className="flex items-end">
                                              <button type="submit" disabled={isProcessingBatch || isSyncing} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50">
                                                  {isProcessingBatch ? 'Procesando...' : 'Inscribir en Curso'}
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                                  {enrollMsg && <p className={`text-xs text-center font-bold p-3 rounded-lg ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>{enrollMsg.text}</p>}
                              </form>
                          </div>

                          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 flex flex-col">
                              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>Carga Masiva (Solo RUTs)</h3>
                              <div className="flex-1 space-y-4 flex flex-col justify-center max-w-xl mx-auto w-full">
                                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-white hover:bg-indigo-50 transition-all">
                                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                          {uploadFile ? <p className="text-xs font-bold text-indigo-600">{uploadFile.name}</p> : <p className="text-xs text-slate-400">Seleccionar CSV / Excel</p>}
                                      </div>
                                      <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)}/>
                                  </label>
                                  <div className="flex justify-center gap-4">
                                      <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-indigo-600"/> Ignorar Encabezados</label>
                                      <button onClick={handleBulkUpload} disabled={!uploadFile || isProcessingBatch} className="bg-slate-800 text-white px-8 py-2 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-black disabled:opacity-50">Procesar Archivo</button>
                                  </div>
                              </div>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-slate-200">
                              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nómina del Curso</h4>
                                  <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">{sortedEnrollments.length} Inscritos</span>
                              </div>
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-50 text-slate-700 font-bold border-b">
                                      <tr><th className="px-6 py-3">Participante</th><th className="px-6 py-3">Unidad Académica</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3 text-center">Acciones</th></tr>
                                  </thead>
                                  <tbody className="divide-y">
                                      {sortedEnrollments.map(enr => {
                                          const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut));
                                          return (
                                              <tr key={enr.id} className="hover:bg-slate-50">
                                                  <td className="px-6 py-3"><div className="font-bold text-slate-800">{u?.names} {u?.paternalSurname}</div><div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div></td>
                                                  <td className="px-6 py-3 text-xs text-slate-500"><div>{u?.faculty}</div><div className="italic">{u?.department}</div></td>
                                                  <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full font-black text-[9px] uppercase border ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{enr.state}</span></td>
                                                  <td className="px-6 py-3 text-center">
                                                      <button onClick={async () => { if(confirm("¿Eliminar matrícula?")) { await deleteEnrollment(enr.id); await executeReload(); } }} className="text-red-500 hover:text-red-700 font-bold text-[10px] uppercase tracking-widest bg-red-50 px-2 py-1 rounded border border-red-100">Retirar</button>
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {activeDetailTab === 'tracking' && (
                      <div className="space-y-6 animate-fadeIn">
                          <div className="flex justify-between items-center mb-4">
                              <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg"><span className="text-xs text-indigo-400 font-bold uppercase tracking-widest block">Inscritos</span><span className="text-xl font-black text-indigo-700">{courseEnrollments.length}</span></div>
                              <div className="flex gap-2">
                                  <button onClick={handleBatchSaveGrades} disabled={Object.keys(pendingGrades).length === 0 || isProcessingBatch} className={`px-6 py-2 rounded-lg font-black text-xs uppercase shadow-md transition-all ${Object.keys(pendingGrades).length > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700 animate-pulse' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Guardar Cambios Pendientes</button>
                              </div>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                              <table className="w-full text-sm text-left border-collapse">
                                  <thead className="bg-slate-50 text-slate-500 font-bold border-b">
                                      <tr>
                                          <th className="px-4 py-3 sticky left-0 bg-slate-50 border-r z-10 w-[220px]">Docente</th>
                                          {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                              <th key={i} className="px-2 py-3 text-center border-r">N{i+1}</th>
                                          ))}
                                          <th className="px-4 py-3 text-center bg-slate-100 border-r">Prom.</th>
                                          {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                              <th key={`att-${i}`} className="px-2 py-3 text-center border-r text-[10px]">S{i+1}</th>
                                          ))}
                                          <th className="px-4 py-3 text-center">% Asist.</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y bg-white">
                                      {sortedEnrollments.map(enr => {
                                          const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
                                          const grades = pendingGrades[enr.id] || enr.grades || [];
                                          const validGrades = grades.filter(g => g > 0);
                                          const currentAvg = validGrades.length > 0 ? (validGrades.reduce((a, b) => a + b, 0) / validGrades.length).toFixed(1) : '-';
                                          
                                          return (
                                              <tr key={enr.id} className="hover:bg-indigo-50/20">
                                                  <td className="px-4 py-3 sticky left-0 bg-white border-r z-10"><div className="font-bold text-slate-800 truncate" title={`${student?.names} ${student?.paternalSurname}`}>{student?.paternalSurname}, {student?.names}</div><div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div></td>
                                                  {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                                      <td key={i} className="px-1 py-2 border-r"><input type="number" step="0.1" min="1" max="7" value={grades[i] || ''} onChange={e => handleUpdateGradeLocal(enr.id, i, e.target.value)} className="w-12 text-center border rounded py-1 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"/></td>
                                                  ))}
                                                  <td className="px-4 py-3 text-center font-black text-indigo-700 bg-slate-50 border-r">{currentAvg}</td>
                                                  {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => {
                                                      const key = `attendanceSession${i + 1}` as keyof Enrollment;
                                                      return (
                                                          <td key={`att-cell-${i}`} className="px-1 py-2 text-center border-r"><input type="checkbox" checked={!!enr[key]} onChange={() => handleToggleAttendance(enr.id, i)} className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"/></td>
                                                      );
                                                  })}
                                                  <td className={`px-4 py-3 text-center font-bold ${(enr.attendancePercentage || 0) < (config.minAttendancePercentage || 75) ? 'text-red-500' : 'text-green-600'}`}>{enr.attendancePercentage || 0}%</td>
                                              </tr>
                                          );
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}

                  {activeDetailTab === 'acta' && (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 max-w-2xl mx-auto animate-fadeIn">
                          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-inner"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                          <div><h3 className="text-2xl font-black text-slate-800">Generación de Acta de Calificaciones</h3><p className="text-slate-500 mt-2">Este informe consolida el rendimiento final del grupo curso, incluyendo promedios y porcentajes de asistencia oficial.</p></div>
                          <button onClick={async () => {
                              const doc = new jsPDF('landscape');
                              doc.setFontSize(18); doc.text(`ACTA DE CALIFICACIONES - ${selectedCourse.name}`, 14, 20);
                              doc.setFontSize(10); doc.text(`Periodo: ${selectedCourse.academicPeriod} | Código: ${selectedCourse.internalCode} | Docente: ${selectedCourse.relator}`, 14, 30);
                              const body = sortedEnrollments.map(enr => {
                                  const u = users.find(x => normalizeRut(x.rut) === normalizeRut(enr.rut));
                                  return [enr.rut, `${u?.paternalSurname} ${u?.names}`, enr.finalGrade || '-', `${enr.attendancePercentage || 0}%`, enr.state.toUpperCase()];
                              });
                              // @ts-ignore
                              doc.autoTable({ head: [['RUT', 'NOMBRE', 'NOTA FINAL', '% ASIST.', 'ESTADO']], body, startY: 40 });
                              doc.save(`ACTA_${selectedCourse.internalCode}_${selectedYear}.pdf`);
                          }} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-3"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Descargar Acta Oficial PDF</button>
                      </div>
                  )}
              </div>
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
                <button onClick={() => setShowKioskModal(true)} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 shadow-sm"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Consulta Académica</button>
                {(isAdmin || isAdvisor) && (<button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1', nombre: '', version: 'V1', modality: 'Presencial', hours: 0, moduleCount: 1, evaluationCount: 3, relator: '', startDate: '', endDate: '', competencyCodes: [] }); setView('create'); }} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nuevo Curso</button>)}
            </div>
        </div>

        {/* MODAL CONSULTA ACADÉMICA */}
        {showKioskModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                    <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div><div><h3 className="text-xl font-bold text-slate-800 leading-tight">Consulta de Expediente Académico</h3><p className="text-xs text-slate-500">Historial completo de participaciones del docente.</p></div></div>
                        <button onClick={() => setShowKioskModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                    </div>

                    <div className="p-6 bg-indigo-50 border-b border-indigo-100"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="relative"><label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por RUT</label><input type="text" placeholder="Ingrese RUT..." value={kioskSearchRut} onChange={(e) => { const val = e.target.value; setKioskSearchRut(val); setKioskSearchSurname(''); if (val.length >= 2) { const clean = normalizeRut(val); const matches = users.filter(u => normalizeRut(u.rut).includes(clean)); setKioskRutSuggestions(matches.slice(0, 5)); setKioskSurnameSuggestions([]); setShowKioskSuggestions(true); } else { setKioskRutSuggestions([]); setShowKioskSuggestions(false); } }} className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/>{showKioskSuggestions && kioskRutSuggestions.length > 0 && (<div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">{kioskRutSuggestions.map((u) => (<div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{u.rut}</span><span className="text-xs text-slate-500">{u.names} {u.paternalSurname}</span></div>))}</div>)}</div><div className="relative"><label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1.5">Búsqueda por Apellido Paterno</label><input type="text" placeholder="Ingrese Apellido..." value={kioskSearchSurname} onChange={(e) => { const val = e.target.value; setKioskSearchSurname(val); setKioskSearchRut(''); if (val.length >= 2) { const lower = val.toLowerCase(); const matches = users.filter(u => u.paternalSurname.toLowerCase().includes(lower)); setKioskSurnameSuggestions(matches.slice(0, 5)); setKioskRutSuggestions([]); setShowKioskSuggestions(true); } else { setKioskSurnameSuggestions([]); setShowKioskSuggestions(false); } }} className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-sm"/>{showKioskSuggestions && kioskSurnameSuggestions.length > 0 && (<div ref={kioskSuggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">{kioskSurnameSuggestions.map((u) => (<div key={u.rut} onMouseDown={() => handleSelectKioskUser(u)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{u.paternalSurname} {u.maternalSurname}</span><span className="text-xs text-slate-500">{u.names} ({u.rut})</span></div>))}</div>)}</div></div></div>

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
                                {Object.entries((() => {
                                    const groups: Record<string, any[]> = {};
                                    const normRut = normalizeRut(kioskFoundUser.rut);
                                    enrollments.filter(e => normalizeRut(e.rut) === normRut).forEach(e => {
                                        const act = activities.find(a => a.id === e.activityId);
                                        if(!act) return;
                                        const p = act.academicPeriod || String(act.year);
                                        if(!groups[p]) groups[p] = [];
                                        groups[p].push({ enrollment: e, activity: act });
                                    });
                                    return groups;
                                })()).sort((a,b) => b[0].localeCompare(a[0])).map(([period, items]) => (
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedAcademicActivities.map(course => { 
            const enrolledCount = enrollments.filter(e => e.activityId === course.id).length;
            const isSecondSemester = course.academicPeriod?.endsWith("-2") || course.academicPeriod?.toLowerCase().includes("2do") || course.academicPeriod?.toLowerCase().includes("segundo");
            return (
              <div key={course.id} className={`${isSecondSemester ? 'bg-sky-50' : 'bg-white'} rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${isSecondSemester ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{course.academicPeriod}</span><span className="text-xs text-slate-400 font-mono">{course.internalCode}</span></div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight h-14 line-clamp-2" title={course.name}>{course.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-4"><span>{enrolledCount} Inscritos</span><span>{course.modality}</span><span>{course.hours}h</span></div>
                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedCourseId(course.id); setView('details'); setActiveDetailTab('enrollment'); }} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white transition-all shadow-sm">Gestionar Curso</button>
                    {(isAdmin || isAdvisor) && (<button onClick={() => handleEditCourse(course)} className="px-3 py-2 bg-white border border-slate-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>)}
                  </div>
                </div>
              </div>
            );
          })} 
        </div>
      </div>
  );
};