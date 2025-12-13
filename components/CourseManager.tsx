
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
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
    let clean = rut.replace(/[^0-9kK]/g, '');
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
type DetailTab = 'enrollment' | 'tracking';

interface CourseManagerProps {
    currentUser?: User;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, getUser, config, refreshData } = useData();
  const { isSyncing, executeReload } = useReloadDirective(); // DIRECTIVA_RECARGA

  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  const isAdvisor = currentUser?.systemRole === UserRole.ASESOR;
  
  // Filtrar lista de Asesores para el dropdown
  const advisors = useMemo(() => users.filter(u => u.systemRole === UserRole.ASESOR), [users]);

  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "Online"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  const academicActivities = activities.filter(a => !a.category || a.category === 'ACADEMIC');

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Form States
  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1',
    nombre: '', version: 'V1', modality: 'Presencial', hours: 0,
    moduleCount: 1, evaluationCount: 3, relator: '',
    startDate: '', endDate: ''
  });

  // Manual Enrollment State
  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);
  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  // Bulk Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  // --- AUTO-GENERATE INTERNAL CODE LOGIC ---
  useEffect(() => {
      // Solo proponer código automáticamente si estamos en modo CREAR (para no sobrescribir en edición accidentalmente)
      if (view === 'create') {
          // 1. Acrónimo del Nombre (Primeras letras de cada palabra, max 4)
          const words = formData.nombre.trim().split(/\s+/);
          let acronym = '';
          
          if (words.length === 1 && words[0].length > 0) {
              acronym = words[0].substring(0, 4).toUpperCase();
          } else {
              acronym = words.map(w => w[0]).join('').substring(0, 4).toUpperCase();
          }
          
          if (acronym.length === 0) acronym = 'CURS';

          // 2. Fecha DDMMYY
          let dateStr = '010125'; // Fallback
          if (formData.startDate) {
              const parts = formData.startDate.split('-'); // YYYY-MM-DD
              if (parts.length === 3) {
                  const [y, m, d] = parts;
                  dateStr = `${d}${m}${y.slice(2)}`;
              }
          } else {
              // Si no hay fecha, usar hoy
              const now = new Date();
              const d = String(now.getDate()).padStart(2, '0');
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const y = String(now.getFullYear()).slice(2);
              dateStr = `${d}${m}${y}`;
          }

          // 3. Versión
          const ver = formData.version.trim().toUpperCase().replace(/\s/g, '') || 'V1';

          // FORMATO FINAL: ACRO + FECHA + -VER
          const autoCode = `${acronym}${dateStr}-${ver}`;
          
          setFormData(prev => ({ ...prev, internalCode: autoCode }));
      }
  }, [formData.nombre, formData.startDate, formData.version, view]);

  // --- AUTO-JUMP LOGIC (From Dashboard) ---
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

  const selectedCourse = academicActivities.find(a => a.id === selectedCourseId);
  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => u.rut === a.rut);
          const userB = users.find(u => u.rut === b.rut);
          return (userA?.paternalSurname || '').localeCompare(userB?.paternalSurname || '');
      });
  }, [courseEnrollments, users]);

  // --- HANDLERS ---

  const handleRefresh = async () => {
      await executeReload(); // DIRECTIVA_RECARGA
  };

  const handleGenerateCertificate = async (enrollment: Enrollment, user: User) => {
      if (!selectedCourse) return;
      setIsGeneratingPdf(true);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      
      // --- LOGICA DE CERTIFICADO (MOCK) ---
      doc.setFontSize(22);
      doc.text("CERTIFICADO DE APROBACIÓN", 105, 40, { align: "center" });
      doc.setFontSize(14);
      doc.text("Se certifica que:", 105, 60, { align: "center" });
      doc.setFontSize(18);
      doc.text(`${user.names} ${user.paternalSurname}`, 105, 75, { align: "center" });
      doc.setFontSize(12);
      doc.text(`RUT: ${user.rut}`, 105, 85, { align: "center" });
      doc.text(`Ha aprobado satisfactoriamente el curso:`, 105, 100, { align: "center" });
      doc.setFontSize(16);
      doc.text(selectedCourse.name, 105, 115, { align: "center" });
      doc.setFontSize(12);
      doc.text(`Con una nota final de: ${enrollment.finalGrade}`, 105, 130, { align: "center" });
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 105, 150, { align: "center" });
      
      doc.save(`Constancia_${user.rut}_${selectedCourse.internalCode || 'Curso'}.pdf`);
      setIsGeneratingPdf(false);
  };

  // --- LÓGICA CENTRALIZADA DE ESTADO ---
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

  const handleUpdateGrade = async (enrollmentId: string, gradeIndex: number, value: string) => {
      let numValue = parseFloat(value.replace(',', '.'));
      if (value === '') numValue = 0; 
      if (isNaN(numValue)) return; 
      if (numValue > 7.0) numValue = 7.0;
      if (numValue < 0) numValue = 0;

      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;

      const currentGrades = enrollment.grades ? [...enrollment.grades] : [];
      while (currentGrades.length <= gradeIndex) currentGrades.push(0);
      currentGrades[gradeIndex] = parseFloat(numValue.toFixed(1));

      const validGrades = currentGrades.filter(g => g > 0);
      let finalGrade = 0;
      if (validGrades.length > 0) {
          const sum = validGrades.reduce((a, b) => a + b, 0);
          finalGrade = parseFloat((sum / validGrades.length).toFixed(1));
      }

      const totalExpected = selectedCourse?.evaluationCount || 3;
      const currentAtt = enrollment.attendancePercentage || 0;
      const newState = determineState(currentGrades, currentAtt, totalExpected);

      await updateEnrollment(enrollmentId, {
          grades: currentGrades,
          finalGrade: finalGrade,
          state: newState
      });
      await executeReload(); // DIRECTIVA_RECARGA
  };

  const handleToggleAttendance = async (enrollmentId: string, sessionIndex: number) => {
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;

      const fieldName = `attendanceSession${sessionIndex + 1}`;
      // @ts-ignore
      const newVal = !enrollment[fieldName];
      
      let presentCount = 0;
      for (let i = 1; i <= 6; i++) {
          const key = `attendanceSession${i}`;
          // @ts-ignore
          if ((i === sessionIndex + 1) ? newVal : enrollment[key]) presentCount++;
      }
      const percentage = Math.round((presentCount / 6) * 100);

      const totalExpected = selectedCourse?.evaluationCount || 3;
      const currentGrades = enrollment.grades || [];
      const newState = determineState(currentGrades, percentage, totalExpected);

      await updateEnrollment(enrollmentId, {
          [fieldName]: newVal,
          attendancePercentage: percentage,
          state: newState
      });
      await executeReload(); // DIRECTIVA_RECARGA
  };

  // --- COURSE CRUD HANDLERS (UPDATED WITH ROBUST VALIDATION) ---
  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const newId = selectedCourseId || `ACAD-${Date.now()}`;
      const safeDate = formData.startDate || new Date().toISOString().split('T')[0];
      const safeRelator = formData.relator || (isAdvisor ? '' : 'Por Asignar');

      // Validación crítica para la Base de Datos (Evita que el upsert falle)
      if (isAdvisor && !safeRelator) {
          alert("Error: Debe seleccionar un Director/Relator para crear el curso.");
          return;
      }

      const activityPayload: Activity = {
          id: newId,
          category: 'ACADEMIC',
          name: formData.nombre || 'Nuevo Curso',
          internalCode: formData.internalCode || `UAD-${Date.now()}`,
          year: Number(formData.year) || new Date().getFullYear(),
          academicPeriod: formData.academicPeriod || '2025-1',
          version: formData.version || 'V1',
          modality: formData.modality || 'Presencial',
          hours: Number(formData.hours) || 0,
          relator: safeRelator,
          startDate: safeDate,
          endDate: formData.endDate, // Puede ser undefined, DB lo acepta
          evaluationCount: Number(formData.evaluationCount) || 3,
          moduleCount: Number(formData.moduleCount) || 1,
          isPublic: true,
          // Importante: No enviar programConfig para cursos académicos para evitar errores de tipo en la BD si no es jsonb válido
          programConfig: undefined 
      };

      try {
          // Esperamos a que la operación termine. Si falla en DataContext, lanzará excepción.
          await addActivity(activityPayload);
          await executeReload(); // DIRECTIVA_RECARGA
          // Éxito:
          setView('list');
          setSelectedCourseId(null);
      } catch (err: any) {
          console.error("Error al guardar curso en BD:", err);
          // EXTRACT ACTUAL ERROR MESSAGE FROM OBJECT
          const errorMsg = err.message || err.error_description || JSON.stringify(err);
          const errorHint = err.hint || err.details || '';
          
          alert(`ERROR CRÍTICO: No se pudo crear el curso en la Base de Datos.\n\nError: ${errorMsg}\n${errorHint ? `Detalle: ${errorHint}\n` : ''}\nSugerencia: Verifique los permisos en 'Configuración -> Implementación DB' o el formato de las fechas.`);
          // No limpiamos el formulario para que el usuario pueda reintentar
      }
  };

  const handleEditCourse = (course: Activity) => {
      setSelectedCourseId(course.id);
      setFormData({
          internalCode: course.internalCode || '',
          year: course.year || new Date().getFullYear(),
          academicPeriod: course.academicPeriod || '',
          nombre: course.name,
          version: course.version || '',
          modality: course.modality,
          hours: course.hours,
          moduleCount: course.moduleCount || 1,
          evaluationCount: course.evaluationCount || 3,
          relator: course.relator || '',
          startDate: course.startDate || '',
          endDate: course.endDate || ''
      });
      setView('edit');
  };

  const handleCloneCourse = async (course: Activity) => {
      if (confirm(`¿Desea clonar el curso "${course.name}" para reutilizar sus datos base?\n\nSe creará una copia sin estudiantes.`)) {
          const newId = `ACAD-${Date.now()}`;
          const clonedActivity: Activity = {
              ...course,
              id: newId,
              name: `${course.name} (Copia)`,
              internalCode: course.internalCode ? `${course.internalCode}-CPY` : '',
          };
          
          await addActivity(clonedActivity);
          await executeReload(); // DIRECTIVA_RECARGA
          alert("Curso clonado correctamente. Redirigiendo a edición.");
          setSelectedCourseId(newId);
          handleEditCourse(clonedActivity); 
      }
  };

  const handleDeleteCourse = async () => {
      if (!selectedCourseId) return;
      if (confirm("¿Está seguro de eliminar este curso y todos sus datos asociados?")) {
          await deleteActivity(selectedCourseId);
          await executeReload(); // DIRECTIVA_RECARGA
          setView('list');
          setSelectedCourseId(null);
      }
  };

  // --- MANUAL ENROLLMENT HANDLERS ---
  const handleEnrollChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setManualForm(prev => ({ ...prev, [name]: value }));
      if (name === 'rut') {
          setIsFoundInMaster(false);
          setEnrollMsg(null);
          const rawInput = value.replace(/[^0-9kK]/g, '').toLowerCase();
          if (rawInput.length >= 2) { 
              const matches = users.filter(u => u.rut.replace(/[^0-9kK]/g, '').toLowerCase().includes(rawInput));
              setSuggestions(matches.slice(0, 5)); 
              setShowSuggestions(matches.length > 0);
          } else { 
              setSuggestions([]); 
              setShowSuggestions(false); 
          }
      }
  };

  const handleSelectSuggestion = (user: User) => {
      setManualForm({
          rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', academicRole: user.academicRole || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', campus: user.campus || '', systemRole: user.systemRole
      });
      setIsFoundInMaster(true); setShowSuggestions(false); setSuggestions([]);
      setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId) return;
      if (!manualForm.rut || !manualForm.names) return;

      const formattedRut = cleanRutFormat(manualForm.rut);
      const userToUpsert: User = {
          ...manualForm,
          rut: formattedRut,
          systemRole: manualForm.systemRole as UserRole
      };

      await upsertUsers([userToUpsert]);
      await enrollUser(formattedRut, selectedCourseId);
      await executeReload(); // DIRECTIVA_RECARGA

      setEnrollMsg({ type: 'success', text: 'Matriculado correctamente.' });
      setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
      setIsFoundInMaster(false);
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
              rutsToEnroll.push(cleanRut);

              const hasName = rowStrings[1] && rowStrings[1].length > 1;
              if (hasName) {
                  usersToUpsert.push({
                      rut: cleanRut,
                      names: rowStrings[1] || '',
                      paternalSurname: rowStrings[2] || '',
                      maternalSurname: rowStrings[3] || '',
                      email: rowStrings[4] || '',
                      phone: rowStrings[5] || '',
                      academicRole: normalizeValue(rowStrings[6], listRoles),
                      faculty: normalizeValue(rowStrings[7], listFaculties),
                      department: normalizeValue(rowStrings[8], listDepts),
                      career: normalizeValue(rowStrings[9], listCareers),
                      contractType: normalizeValue(rowStrings[10], listContracts),
                      teachingSemester: normalizeValue(rowStrings[11], listSemesters),
                      campus: rowStrings[12] || '',
                      systemRole: UserRole.ESTUDIANTE
                  });
              }
          }

          if (usersToUpsert.length > 0) { await upsertUsers(usersToUpsert); }
          const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
          await executeReload(); // DIRECTIVA_RECARGA
          setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos, ${result.skipped} ya existentes.` });
          setUploadFile(null);
      };
      isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  // --- CREATE / EDIT VIEW ---
  if (view === 'create' || view === 'edit') {
      return (
          <div className="animate-fadeIn max-w-4xl mx-auto">
              <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-700 mb-6 flex items-center gap-1 text-sm font-bold">
                  ← Cancelar y Volver
              </button>
              
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                      <h2 className="text-2xl font-bold text-slate-800">
                          {view === 'create' ? 'Crear Nuevo Curso' : 'Editar Curso'}
                      </h2>
                      {view === 'edit' && (
                          <button onClick={handleDeleteCourse} className="text-red-500 hover:text-red-700 text-sm font-bold flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              Eliminar
                          </button>
                      )}
                  </div>

                  <form onSubmit={handleCreateSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="col-span-2">
                              <label className="block text-sm font-bold text-slate-700 mb-1">Nombre del Curso / Asignatura</label>
                              <input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio</label>
                                  <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Versión</label>
                                  <input type="text" value={formData.version} placeholder="V1" onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              {/* CÓDIGO INTERNO (CONDICIONAL VISTA ASESOR) */}
                              <div>
                                  {isAdvisor ? (
                                      <>
                                          <label className="block text-sm font-medium text-slate-700 mb-1">Código Interno</label>
                                          <input 
                                              type="text" 
                                              value={formData.internalCode} 
                                              onChange={e => setFormData({...formData, internalCode: e.target.value})} 
                                              className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50"
                                          />
                                          <p className="text-[10px] text-green-600 mt-1 font-bold">Autogenerado</p>
                                      </>
                                  ) : (
                                      <>
                                          <label className="block text-sm font-medium text-slate-700 mb-1">Código Interno (Autogenerado)</label>
                                          <input 
                                              type="text" 
                                              value={formData.internalCode} 
                                              onChange={e => setFormData({...formData, internalCode: e.target.value})} 
                                              className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50"
                                          />
                                      </>
                                  )}
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label>
                                  <select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg">
                                      {listModalities.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
                                  <input type="number" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Semestre</label>
                                  <input type="text" value={formData.academicPeriod} onChange={e => setFormData({...formData, academicPeriod: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Horas</label>
                                  <input type="number" value={formData.hours} onChange={e => setFormData({...formData, hours: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg"/>
                              </div>
                              
                              {/* DIRECTOR/RELATOR (CONDICIONAL VISTA ASESOR) */}
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Director / Relator</label>
                                  {isAdvisor ? (
                                      <select 
                                          value={formData.relator} 
                                          onChange={e => setFormData({...formData, relator: e.target.value})} 
                                          className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white"
                                          required
                                      >
                                          <option value="">Seleccionar Asesor...</option>
                                          {advisors.map(adv => (
                                              <option key={adv.rut} value={`${adv.names} ${adv.paternalSurname}`}>
                                                  {adv.names} {adv.paternalSurname}
                                              </option>
                                          ))}
                                      </select>
                                  ) : (
                                      <input 
                                          type="text" 
                                          value={formData.relator} 
                                          onChange={e => setFormData({...formData, relator: e.target.value})} 
                                          className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                      />
                                  )}
                              </div>
                          </div>

                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Cant. Evaluaciones</label>
                              <select value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                          </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100 flex justify-end">
                          <button type="submit" disabled={isSyncing} className={`bg-[#647FBC] hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-colors flex items-center gap-2 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              {view === 'create' ? 'Crear Curso' : 'Guardar Cambios'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      );
  }

  // --- VIEW DETAILS ---
  if (view === 'details' && selectedCourse) {
      // ... (Resto del componente details permanece igual)
      return (
          <div className="animate-fadeIn space-y-6">
               <button onClick={() => { setSelectedCourseId(null); setView('list'); }} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
              
              <div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2>
                      <p className="text-slate-500 text-sm mt-1">{selectedCourse.modality} • {selectedCourse.year}</p>
                  </div>
                  
                  {/* --- BARRA DE SINCRONIZACIÓN --- */}
                  <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                                <span className="text-[10px] font-bold uppercase text-slate-500">
                                    {isSyncing ? 'Sincronizando...' : 'En Línea'}
                                </span>
                            </div>
                            <div className="h-4 w-px bg-slate-300 mx-2"></div>
                            <button 
                                onClick={handleRefresh}
                                className="text-xs font-bold text-[#647FBC] hover:text-blue-800 flex items-center gap-1"
                            >
                                <svg className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Actualizar
                            </button>
                        </div>
                        
                        {(isAdmin || isAdvisor) && (
                            <button onClick={() => handleEditCourse(selectedCourse)} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-50">
                                Editar Curso
                            </button>
                        )}
                  </div>
              </div>

              <div className="mt-8">
                  <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 mb-0">
                        <button onClick={() => setActiveDetailTab('enrollment')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Matrícula</button>
                        <button onClick={() => setActiveDetailTab('tracking')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'tracking' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Seguimiento Académico</button>
                  </div>
                  
                  <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-[#647FBC]/30 border-t-0 p-8">
                      
                      {/* TAB: ENROLLMENT (UNIFICADO VERTICAL - Full Width Fix) */}
                      {activeDetailTab === 'enrollment' && (
                          <div className="space-y-12 animate-fadeIn w-full">
                              
                              {/* 1. Formulario Manual (13 Campos) */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2">
                                      <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                      Inscripción Manual (Registro Completo)
                                  </h3>
                                  <form onSubmit={handleEnrollSubmit} className="space-y-6">
                                      {/* Identificación */}
                                      <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-slate-400 uppercase">Identificación</h4>
                                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                              <div className="relative md:col-span-1">
                                                  <label className="block text-xs font-bold mb-1">RUT (Buscar)</label>
                                                  <input type="text" name="rut" value={manualForm.rut} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#647FBC]" placeholder="12345678-9"/>
                                                  {showSuggestions && suggestions.length > 0 && (
                                                      <div className="absolute z-10 w-full bg-white border mt-1 rounded shadow-xl max-h-48 overflow-y-auto">
                                                          {suggestions.map(s => (
                                                              <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-xs border-b border-slate-50">
                                                                  <span className="font-bold block text-slate-800">{s.rut}</span>
                                                                  <span className="text-slate-500">{s.names} {s.paternalSurname}</span>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                              <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Nombres</label><input type="text" name="names" value={manualForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                              <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Ap. Paterno</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                              <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                          </div>
                                      </div>

                                      {/* Contacto */}
                                      <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-slate-400 uppercase">Contacto</h4>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              <div><label className="block text-xs font-bold mb-1">Email</label><input type="email" name="email" value={manualForm.email} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                              <div><label className="block text-xs font-bold mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                          </div>
                                      </div>

                                      {/* Datos Académicos */}
                                      <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-slate-400 uppercase">Ficha Académica</h4>
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                              <div><SmartSelect label="Sede" name="campus" value={manualForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Semestre" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleEnrollChange} /></div>
                                              <div><SmartSelect label="Rol Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleEnrollChange} /></div>
                                          </div>
                                      </div>
                                      
                                      <button type="submit" disabled={isSyncing} className={`w-full bg-[#647FBC] text-white px-4 py-3 rounded-lg text-sm font-bold shadow hover:bg-blue-800 transition-colors mt-4 ${isSyncing ? 'opacity-70 cursor-wait' : ''}`}>
                                          Matricular Estudiante
                                      </button>
                                      {enrollMsg && <p className={`text-xs text-center ${enrollMsg.type === 'success' ? 'text-green-600 font-bold' : 'text-red-600'}`}>{enrollMsg.text}</p>}
                                  </form>
                              </div>

                              {/* 2. Carga Masiva (Debajo del Manual) */}
                              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      Carga Masiva (CSV / Excel)
                                  </h3>
                                  
                                  <div className="flex-1 flex flex-col justify-center space-y-4">
                                      <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                              {uploadFile ? (
                                                  <>
                                                      <svg className="w-8 h-8 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                      <p className="mb-1 text-sm font-bold text-green-700">{uploadFile.name}</p>
                                                  </>
                                              ) : (
                                                  <>
                                                      <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                      <p className="mb-1 text-xs text-slate-500">Click para subir archivo (13 columnas)</p>
                                                  </>
                                              )}
                                          </div>
                                          <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} />
                                      </label>
                                      
                                      <div className="flex items-center gap-2 justify-center">
                                          <input type="checkbox" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-[#647FBC] focus:ring-[#647FBC]"/>
                                          <span className="text-xs text-slate-500">Ignorar encabezados</span>
                                      </div>

                                      <button 
                                          onClick={handleBulkUpload} 
                                          disabled={!uploadFile}
                                          className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors"
                                      >
                                          Procesar Archivo Masivo
                                      </button>
                                  </div>
                              </div>

                              {/* Tabla Resumen Matriculados */}
                              <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                                  <table className="w-full text-sm text-left">
                                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                          <tr><th className="px-6 py-3">RUT</th><th className="px-6 py-3">Estudiante</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Estado</th></tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {sortedEnrollments.map(enr => {
                                              const u = users.find(user => user.rut === enr.rut);
                                              return (
                                                  <tr key={enr.id} className="hover:bg-slate-50">
                                                      <td className="px-6 py-3 font-mono text-xs">{enr.rut}</td>
                                                      <td className="px-6 py-3 font-bold text-slate-700">{u?.paternalSurname} {u?.names}</td>
                                                      <td className="px-6 py-3 text-xs text-slate-500">{u?.email}</td>
                                                      <td className="px-6 py-3"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{enr.state}</span></td>
                                                  </tr>
                                              )
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}

                      {/* TAB: TRACKING (REORDENADO: Estudiante -> Asistencia -> Notas -> Estado -> Certificado) */}
                      {activeDetailTab === 'tracking' && (
                          <div className="animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                      <h3 className="font-bold text-slate-700">Sábana de Notas y Asistencia</h3>
                                      <div className="flex items-center gap-2">
                                          <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400' : 'bg-green-500'} animate-pulse`}></span>
                                          <span className="text-xs text-slate-500 italic">Guardado automático activo</span>
                                      </div>
                                  </div>
                                  
                                  <div className="overflow-x-auto custom-scrollbar">
                                      <table className="w-full text-sm text-left whitespace-nowrap">
                                          <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                              <tr>
                                                  {/* 1. Estudiante */}
                                                  <th className="px-4 py-3 w-60 bg-slate-100 sticky left-0 border-r z-10">Estudiante</th>
                                                  
                                                  {/* 2. Asistencia */}
                                                  <th className="px-2 py-3 text-center w-32 border-r border-slate-200">Asistencia</th>
                                                  
                                                  {/* 3. Notas */}
                                                  {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                                      <th key={i} className="px-2 py-3 text-center w-20 border-r border-slate-200">
                                                          N{i+1}
                                                      </th>
                                                  ))}
                                                  <th className="px-2 py-3 text-center w-20 bg-slate-50 font-bold border-r border-slate-200">Final</th>
                                                  
                                                  {/* 4. Estado */}
                                                  <th className="px-4 py-3 text-center w-28 border-r border-slate-200">Estado</th>
                                                  
                                                  {/* 5. Certificado */}
                                                  <th className="px-4 py-3 text-center w-28">Certificado</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {sortedEnrollments.map(enr => {
                                                  const student = users.find(u => u.rut === enr.rut);
                                                  return (
                                                      <tr key={enr.id} className="hover:bg-slate-50 group">
                                                          {/* 1. Estudiante */}
                                                          <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-200 z-10 group-hover:bg-slate-50">
                                                              <div className="font-bold text-slate-700 truncate w-56" title={`${student?.paternalSurname} ${student?.names}`}>
                                                                  {student?.paternalSurname}, {student?.names}
                                                              </div>
                                                              <div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div>
                                                          </td>
                                                          
                                                          {/* 2. Asistencia */}
                                                          <td className="px-4 py-2 text-center border-r border-slate-200">
                                                              <div className="flex flex-col items-center">
                                                                  <div className="flex gap-1 justify-center mb-1">
                                                                      {[0,1,2,3,4,5].map(idx => (
                                                                          <input 
                                                                              key={idx}
                                                                              type="checkbox"
                                                                              // @ts-ignore
                                                                              checked={!!enr[`attendanceSession${idx+1}`]}
                                                                              onChange={() => handleToggleAttendance(enr.id, idx)}
                                                                              className="w-3 h-3 text-[#647FBC] rounded border-slate-300 focus:ring-[#647FBC] cursor-pointer"
                                                                          />
                                                                      ))}
                                                                  </div>
                                                                  <span className={`text-[10px] font-bold ${(enr.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-green-600'}`}>
                                                                      {enr.attendancePercentage || 0}% Asistencia
                                                                  </span>
                                                              </div>
                                                          </td>

                                                          {/* 3. Notas */}
                                                          {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => (
                                                              <td key={idx} className="px-1 py-2 text-center border-r border-slate-100">
                                                                  <input 
                                                                      type="number"
                                                                      step="0.1"
                                                                      min="1"
                                                                      max="7"
                                                                      className={`w-16 text-center border rounded py-1 text-sm font-bold focus:ring-2 focus:ring-[#647FBC] focus:outline-none transition-all ${enr.grades?.[idx] && enr.grades[idx] < 4 ? 'text-red-600 border-red-200 bg-red-50' : 'text-slate-700 border-slate-200'}`}
                                                                      value={enr.grades?.[idx] || ''}
                                                                      onChange={(e) => handleUpdateGrade(enr.id, idx, e.target.value)}
                                                                      disabled={isSyncing}
                                                                  />
                                                              </td>
                                                          ))}
                                                          
                                                          <td className="px-2 py-2 text-center border-r border-slate-200 bg-slate-50 font-bold text-slate-800">
                                                              <span className={enr.finalGrade && enr.finalGrade < 4 ? 'text-red-600' : ''}>
                                                                  {enr.finalGrade || '-'}
                                                              </span>
                                                          </td>
                                                          
                                                          {/* 4. Estado */}
                                                          <td className="px-2 py-2 text-center border-r border-slate-200">
                                                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : enr.state === ActivityState.REPROBADO ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                  {enr.state}
                                                              </span>
                                                          </td>

                                                          {/* 5. Certificado */}
                                                          <td className="px-2 py-2 text-center">
                                                              <button 
                                                                  onClick={() => student && handleGenerateCertificate(enr, student)}
                                                                  disabled={enr.state !== ActivityState.APROBADO}
                                                                  className={`p-1.5 rounded transition-colors ${enr.state === ActivityState.APROBADO ? 'text-[#647FBC] hover:bg-blue-50 hover:text-blue-800' : 'text-slate-300 cursor-not-allowed'}`}
                                                                  title={enr.state === ActivityState.APROBADO ? "Descargar Certificado PDF" : "No disponible (Debe Aprobar)"}
                                                              >
                                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                              </button>
                                                          </td>
                                                      </tr>
                                                  )
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // --- LIST VIEW (RESTAURADA) ---
  return (
      <div className="animate-fadeIn space-y-6">
          <div className="flex justify-between items-center">
              <div>
                  <h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos Curriculares</h2>
                  <p className="text-sm text-slate-500">Administración de asignaturas académicas y registro de notas.</p>
              </div>
              {(isAdmin || isAdvisor) && (
                  <button 
                    onClick={() => {
                        setFormData({
                            internalCode: '', year: new Date().getFullYear(), academicPeriod: '2025-1',
                            nombre: '', version: 'V1', modality: 'Presencial', hours: 0,
                            moduleCount: 1, evaluationCount: 3, relator: '',
                            startDate: '', endDate: ''
                        });
                        setView('create');
                    }} 
                    className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2"
                  >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Nuevo Curso
                  </button>
              )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {academicActivities.map(course => {
                  const enrolledCount = enrollments.filter(e => e.activityId === course.id).length;
                  return (
                      <div key={course.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <svg className="w-24 h-24 text-[#647FBC]" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" /></svg>
                          </div>
                          
                          <div className="relative z-10">
                              <div className="flex justify-between items-start mb-2">
                                  <span className="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100">
                                      {course.academicPeriod || course.year}
                                  </span>
                                  <span className="text-xs text-slate-400 font-mono">{course.internalCode}</span>
                              </div>
                              
                              <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight h-14 line-clamp-2" title={course.name}>
                                  {course.name}
                              </h3>
                              
                              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                                  <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                      {enrolledCount} Inscritos
                                  </span>
                                  <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                      {course.modality}
                                  </span>
                              </div>

                              <div className="flex gap-2">
                                  <button 
                                      onClick={() => { setSelectedCourseId(course.id); setView('details'); }}
                                      className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white hover:border-[#647FBC] transition-all shadow-sm"
                                  >
                                      Gestionar Curso
                                  </button>
                                  {(isAdmin || isAdvisor) && (
                                      <button 
                                          onClick={() => handleCloneCourse(course)}
                                          title="Clonar Curso"
                                          className="px-3 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
                                      >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                      </button>
                                  )}
                              </div>
                          </div>
                      </div>
                  )
              })}
              
              {academicActivities.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                      <p className="text-slate-500 font-medium">No hay cursos registrados en el sistema.</p>
                      {(isAdmin || isAdvisor) && <p className="text-xs text-slate-400 mt-1">Utilice el botón "Nuevo Curso" para comenzar.</p>}
                  </div>
              )}
          </div>
      </div>
  );
};
