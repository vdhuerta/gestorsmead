
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
// @ts-ignore
import { jsPDF } from 'jspdf';

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
  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  const isAdvisor = currentUser?.systemRole === UserRole.ASESOR;
  
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
  
  // States for Sync & Loading
  const [isSyncing, setIsSyncing] = useState(false);
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
      setIsSyncing(true);
      await refreshData();
      setTimeout(() => setIsSyncing(false), 800);
  };

  const handleUpdateGrade = async (enrollmentId: string, gradeIndex: number, value: string) => {
      // 1. Validar input
      let numValue = parseFloat(value.replace(',', '.'));
      if (value === '') numValue = 0; // Borrar nota
      if (isNaN(numValue)) return; // Ignorar no-números
      if (numValue > 7.0) numValue = 7.0;
      if (numValue < 0) numValue = 0;

      // 2. Obtener enrollment actual
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;

      // 3. Actualizar array de notas
      const currentGrades = enrollment.grades ? [...enrollment.grades] : [];
      // Rellenar con 0 si el índice es mayor al largo actual
      while (currentGrades.length <= gradeIndex) currentGrades.push(0);
      
      currentGrades[gradeIndex] = parseFloat(numValue.toFixed(1));

      // 4. Calcular promedio simple (ignorando ceros para promedio parcial)
      const validGrades = currentGrades.filter(g => g > 0);
      let finalGrade = 0;
      if (validGrades.length > 0) {
          const sum = validGrades.reduce((a, b) => a + b, 0);
          // Si queremos promedio final real, se divide por total de notas esperadas (selectedCourse.evaluationCount)
          // Si queremos promedio parcial ("lo que lleva"), se divide por validGrades.length
          // Usemos lógica de promedio final estricto: Suma / Total Esperado
          const totalExpected = selectedCourse?.evaluationCount || 3;
          // OJO: Si faltan notas, el promedio baja.
          // Alternativa común: Promedio de notas puestas.
          finalGrade = parseFloat((sum / validGrades.length).toFixed(1));
      }

      const isPassing = finalGrade >= (config.minPassingGrade || 4.0);

      // 5. Enviar actualización
      await updateEnrollment(enrollmentId, {
          grades: currentGrades,
          finalGrade: finalGrade,
          state: isPassing ? ActivityState.APROBADO : ActivityState.REPROBADO
      });
  };

  const handleToggleAttendance = async (enrollmentId: string, sessionIndex: number) => {
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;

      const fieldName = `attendanceSession${sessionIndex + 1}`;
      // @ts-ignore
      const newVal = !enrollment[fieldName];
      
      // Calcular nuevo porcentaje (asumiendo 6 sesiones base para este ejemplo simple)
      // En un caso real, esto debería basarse en el total de sesiones configuradas
      let presentCount = 0;
      for (let i = 1; i <= 6; i++) {
          const key = `attendanceSession${i}`;
          // @ts-ignore
          if ((i === sessionIndex + 1) ? newVal : enrollment[key]) presentCount++;
      }
      const percentage = Math.round((presentCount / 6) * 100);

      await updateEnrollment(enrollmentId, {
          [fieldName]: newVal,
          attendancePercentage: percentage
      });
  };

  // --- MANUAL ENROLLMENT FORM HANDLERS ---
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
      setEnrollMsg({ type: 'success', text: 'Matriculado correctamente.' });
      setManualForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', academicRole: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE });
      setIsFoundInMaster(false);
  };

  // --- RENDER ---

  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
               <button onClick={() => { setSelectedCourseId(null); setView('list'); }} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
              
              <div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2>
                      <p className="text-slate-500 text-sm mt-1">{selectedCourse.modality} • {selectedCourse.year}</p>
                  </div>
                  
                  {/* --- BARRA DE SINCRONIZACIÓN --- */}
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
              </div>

              <div className="mt-8">
                  <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 mb-0">
                        <button onClick={() => setActiveDetailTab('enrollment')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Matrícula</button>
                        <button onClick={() => setActiveDetailTab('tracking')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'tracking' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Seguimiento Académico</button>
                  </div>
                  
                  <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-[#647FBC]/30 border-t-0 p-8">
                      
                      {/* TAB: ENROLLMENT */}
                      {activeDetailTab === 'enrollment' && (
                          <div className="space-y-8 animate-fadeIn">
                              {/* Formulario Manual */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                  <h3 className="font-bold text-slate-700 mb-4">Inscripción Manual</h3>
                                  <form onSubmit={handleEnrollSubmit} className="space-y-4">
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                          <div className="relative md:col-span-1">
                                              <label className="block text-xs font-bold mb-1">RUT (Buscar)</label>
                                              <input type="text" name="rut" value={manualForm.rut} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded" placeholder="12345678-9"/>
                                              {showSuggestions && suggestions.length > 0 && (
                                                  <div className="absolute z-10 w-full bg-white border mt-1 rounded shadow-xl">
                                                      {suggestions.map(s => (
                                                          <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-xs">
                                                              {s.rut} - {s.names}
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                          <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Nombres</label><input type="text" name="names" value={manualForm.names} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                          <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Ap. Paterno</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                          <div className="md:col-span-1"><label className="block text-xs font-bold mb-1">Email</label><input type="email" name="email" value={manualForm.email} onChange={handleEnrollChange} className="w-full px-3 py-2 border rounded"/></div>
                                      </div>
                                      <button type="submit" className="bg-[#647FBC] text-white px-4 py-2 rounded text-sm font-bold">Matricular</button>
                                      {enrollMsg && <p className={`text-xs ${enrollMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{enrollMsg.text}</p>}
                                  </form>
                              </div>

                              {/* Tabla Matriculados */}
                              <div className="overflow-x-auto">
                                  <table className="w-full text-sm text-left">
                                      <thead className="bg-slate-100 text-slate-600">
                                          <tr><th className="px-4 py-2">RUT</th><th className="px-4 py-2">Estudiante</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Estado</th></tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {sortedEnrollments.map(enr => {
                                              const u = users.find(user => user.rut === enr.rut);
                                              return (
                                                  <tr key={enr.id}>
                                                      <td className="px-4 py-2 font-mono text-xs">{enr.rut}</td>
                                                      <td className="px-4 py-2 font-bold text-slate-700">{u?.paternalSurname} {u?.names}</td>
                                                      <td className="px-4 py-2 text-xs text-slate-500">{u?.email}</td>
                                                      <td className="px-4 py-2"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{enr.state}</span></td>
                                                  </tr>
                                              )
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}

                      {/* TAB: TRACKING */}
                      {activeDetailTab === 'tracking' && (
                          <div className="animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                      <h3 className="font-bold text-slate-700">Sábana de Notas</h3>
                                      <span className="text-xs text-slate-400 italic">Los cambios se guardan automáticamente en tiempo real.</span>
                                  </div>
                                  
                                  <div className="overflow-x-auto custom-scrollbar">
                                      <table className="w-full text-sm text-left whitespace-nowrap">
                                          <thead className="bg-slate-100 text-slate-600 font-bold">
                                              <tr>
                                                  <th className="px-2 py-3 w-60 bg-slate-100 sticky left-0 border-r z-10">Estudiante</th>
                                                  {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                                      <th key={i} className="px-2 py-3 text-center w-16">N{i+1}</th>
                                                  ))}
                                                  <th className="px-2 py-3 text-center w-16 bg-slate-100 font-bold border-l">Final</th>
                                                  <th className="px-2 py-3 text-center w-24">Asistencia</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {sortedEnrollments.map(enr => {
                                                  const student = users.find(u => u.rut === enr.rut);
                                                  return (
                                                      <tr key={enr.id} className="hover:bg-slate-50">
                                                          <td className="px-2 py-2 sticky left-0 bg-white border-r z-10">
                                                              <div className="font-bold text-slate-700 truncate w-56" title={`${student?.paternalSurname} ${student?.names}`}>
                                                                  {student?.paternalSurname}, {student?.names}
                                                              </div>
                                                              <div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div>
                                                          </td>
                                                          
                                                          {/* Inputs de Notas */}
                                                          {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => (
                                                              <td key={idx} className="px-1 py-2 text-center">
                                                                  <input 
                                                                      type="number"
                                                                      step="0.1"
                                                                      min="1"
                                                                      max="7"
                                                                      className={`w-full text-center border rounded py-1 text-xs font-bold focus:ring-2 focus:ring-[#647FBC] ${enr.grades?.[idx] && enr.grades[idx] < 4 ? 'text-red-500 border-red-200 bg-red-50' : 'text-slate-700 border-slate-200'}`}
                                                                      value={enr.grades?.[idx] || ''}
                                                                      onChange={(e) => handleUpdateGrade(enr.id, idx, e.target.value)}
                                                                      disabled={isSyncing}
                                                                  />
                                                              </td>
                                                          ))}
                                                          
                                                          <td className="px-2 py-2 text-center border-l bg-slate-50 font-bold text-slate-800">
                                                              {enr.finalGrade || '-'}
                                                          </td>
                                                          
                                                          {/* Asistencia Simple (Checkbox simulando sesiones) */}
                                                          <td className="px-2 py-2 text-center">
                                                              <div className="flex gap-1 justify-center">
                                                                  {[0,1,2,3,4,5].map(idx => (
                                                                      <input 
                                                                          key={idx}
                                                                          type="checkbox"
                                                                          // @ts-ignore
                                                                          checked={!!enr[`attendanceSession${idx+1}`]}
                                                                          onChange={() => handleToggleAttendance(enr.id, idx)}
                                                                          className="w-3 h-3 text-[#647FBC] rounded"
                                                                      />
                                                                  ))}
                                                              </div>
                                                              <span className={`text-[10px] font-bold block mt-1 ${(enr.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-green-600'}`}>
                                                                  {enr.attendancePercentage || 0}%
                                                              </span>
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
              {isAdmin && (
                  <button onClick={() => setView('create')} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-blue-800 transition-colors flex items-center gap-2">
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

                              <button 
                                  onClick={() => { setSelectedCourseId(course.id); setView('details'); }}
                                  className="w-full py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-[#647FBC] hover:text-white hover:border-[#647FBC] transition-all shadow-sm"
                              >
                                  Gestionar Curso
                              </button>
                          </div>
                      </div>
                  )
              })}
              
              {academicActivities.length === 0 && (
                  <div className="col-span-full py-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                      <p className="text-slate-500 font-medium">No hay cursos registrados en el sistema.</p>
                      {isAdmin && <p className="text-xs text-slate-400 mt-1">Utilice el botón "Nuevo Curso" para comenzar.</p>}
                  </div>
              )}
          </div>
      </div>
  );
};
