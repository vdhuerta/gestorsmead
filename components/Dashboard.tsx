
import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity, UserRole, ActivityState } from '../types';
import { useData } from '../context/DataContext';
import { TabType } from './RoleNavbar';
import { DataExporter } from './DataExporter';
// @ts-ignore
import { jsPDF } from 'jspdf';
import { SmartSelect } from './SmartSelect';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';

// Utility para formatear Fecha (DD-MM-AAAA)
const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

// Utility para limpiar RUT
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

// --- MINI CALENDAR COMPONENT ---
const MiniCalendar: React.FC<{ activities: Activity[] }> = ({ activities }) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    
    // Nombres de días y meses
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dayNames = ["L", "M", "M", "J", "V", "S", "D"];

    // Calcular días del mes
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 (Sun) - 6 (Sat)
    
    // Ajustar para que Lunes sea 0 (ISO)
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Generar Array de Días
    const days = [];
    // Relleno previo
    for (let i = 0; i < adjustedFirstDay; i++) {
        days.push(null);
    }
    // Días reales
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }

    // Mapear actividades por día
    const activitiesByDay: Record<number, Activity[]> = {};
    activities.forEach(act => {
        if(act.startDate) {
            const [y, m, d] = act.startDate.split('-').map(Number);
            // Verificar si es el mes actual (m-1 porque en DB viene 1-12 y JS usa 0-11)
            if (y === currentYear && (m - 1) === currentMonth) {
                if(!activitiesByDay[d]) activitiesByDay[d] = [];
                activitiesByDay[d].push(act);
            }
        }
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Calendario de Actividades
                </h3>
                <span className="text-xs font-bold text-[#647FBC] uppercase bg-blue-50 px-2 py-1 rounded">
                    {monthNames[currentMonth]} {currentYear}
                </span>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {dayNames.map((d, i) => (
                    <span key={i} className="text-[10px] font-bold text-slate-400 uppercase">{d}</span>
                ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center">
                {days.map((day, idx) => {
                    if (day === null) return <div key={idx} className="h-10"></div>;
                    
                    const dayActs = activitiesByDay[day] || [];
                    const hasAcademic = dayActs.some(a => a.category === 'ACADEMIC');
                    const hasGeneral = dayActs.some(a => a.category === 'GENERAL');
                    const isToday = day === today.getDate();

                    return (
                        <div key={idx} className={`h-10 flex flex-col items-center justify-center rounded-lg border transition-all relative group
                            ${isToday ? 'bg-[#647FBC] text-white border-[#647FBC]' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'}
                            ${dayActs.length > 0 ? 'font-bold cursor-help' : ''}
                        `}>
                            <span className="text-sm z-10">{day}</span>
                            
                            {/* Dots Indicators */}
                            <div className="flex gap-0.5 mt-0.5">
                                {hasAcademic && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-500'}`}></div>}
                                {hasGeneral && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-teal-200' : 'bg-teal-500'}`}></div>}
                            </div>

                            {/* Tooltip */}
                            {dayActs.length > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded z-20 shadow-xl pointer-events-none text-left">
                                    {dayActs.map(a => (
                                        <div key={a.id} className="mb-1 last:mb-0 border-b border-slate-600 last:border-0 pb-1 last:pb-0">
                                            <span className={`font-bold ${a.category === 'ACADEMIC' ? 'text-indigo-300' : 'text-teal-300'}`}>
                                                • {a.category === 'ACADEMIC' ? 'Curso' : 'Ext.'}: 
                                            </span> {a.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-4 mt-4 text-[10px] justify-center text-slate-500">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Académico</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-500"></div> Extensión</div>
            </div>
        </div>
    );
};

interface DashboardProps {
  user: User;
  onNavigate: (tab: TabType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const { activities, users, enrollments, enrollUser, upsertUsers, config, getUser } = useData();
  
  // Dynamic Lists from Config
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // --- STATES FOR STUDENT SEARCH (KIOSK MODE) ---
  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);

  // --- STATE FOR STUDENT SELF-ENROLLMENT MODAL ---
  const [showStudentEnrollModal, setShowStudentEnrollModal] = useState(false);
  const [targetEnrollActivity, setTargetEnrollActivity] = useState<Activity | null>(null);
  const [enrollSuccessMsg, setEnrollSuccessMsg] = useState<string | null>(null);
  
  // --- FORM STATE (13 Fields Base Maestra) ---
  const [enrollForm, setEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      campus: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', academicRole: ''
  });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [rutFound, setRutFound] = useState(false); 

  // Initialize form with logged user data when modal opens (optional fallback)
  useEffect(() => {
      if (showStudentEnrollModal && user) {
          setEnrollForm({
              rut: user.rut, 
              names: user.names,
              paternalSurname: user.paternalSurname,
              maternalSurname: user.maternalSurname || '',
              email: user.email || '',
              phone: user.phone || '',
              campus: user.campus || '',
              faculty: user.faculty || '',
              department: user.department || '',
              career: user.career || '',
              contractType: user.contractType || '',
              teachingSemester: user.teachingSemester || '',
              academicRole: user.academicRole || ''
          });
          setFormErrors([]);
          setRutFound(true); 
      }
  }, [showStudentEnrollModal, user]);

  // --- KPIs Calculation ---
  const totalStudents = users.filter(u => u.systemRole === UserRole.ESTUDIANTE).length;
  const activeCourses = activities.filter(a => a.category === 'ACADEMIC').length;
  const activeGeneral = activities.filter(a => a.category === 'GENERAL').length;
  const totalEnrollments = enrollments.length;

  // --- LOGIC: SPLIT OFFER vs CATALOG (14 DAYS RULE) ---
  const { offerActivities, catalogActivities } = useMemo(() => {
      // Si NO es estudiante, ve todo en "Oferta" (modo gestión) para simplificar la vista admin
      if (user.systemRole !== UserRole.ESTUDIANTE) {
          return { offerActivities: activities, catalogActivities: [] };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const offer: Activity[] = [];
      const catalog: Activity[] = [];

      activities.forEach(act => {
          // Si no tiene fecha, asumimos que está vigente por defecto
          if (!act.startDate) {
              offer.push(act);
              return;
          }

          const [y, m, d] = act.startDate.split('-').map(Number);
          const startDate = new Date(y, m - 1, d); // Mes 0-indexado
          
          // Lógica: La matrícula está habilitada desde el inicio hasta 14 días después.
          const deadline = new Date(startDate);
          deadline.setDate(deadline.getDate() + 14);

          // Si hoy es <= fecha limite (Inicio + 14), está en oferta.
          if (today <= deadline) {
              offer.push(act);
          } else {
              // Si ya pasó el tiempo de matrícula, va al catálogo histórico
              catalog.push(act);
          }
      });

      return { offerActivities: offer, catalogActivities: catalog };

  }, [activities, user.systemRole]);


  // --- HANDLERS ---
  const handleOpenEnrollModal = (act: Activity) => {
    if (user.systemRole === UserRole.ESTUDIANTE) {
         setTargetEnrollActivity(act);
         setShowStudentEnrollModal(true);
         setEnrollSuccessMsg(null);
    } else {
         if (confirm(`¿Ir a la gestión del curso "${act.name}"?`)) {
             localStorage.setItem(act.category === 'GENERAL' ? 'jumpto_activity_id' : 'jumpto_course_id', act.id);
             onNavigate(act.category === 'GENERAL' ? 'generalActivities' : 'courses');
         }
    }
  };

  const handleEnrollFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEnrollForm(prev => ({ ...prev, [name]: value }));
      if (name === 'rut') {
          setRutFound(false);
      }
  };

  const handleCheckRut = () => {
      if (!enrollForm.rut || enrollForm.rut.length < 2) return;
      const clean = cleanRutFormat(enrollForm.rut);
      const foundUser = getUser(clean);

      if (foundUser) {
          setEnrollForm({
              rut: foundUser.rut,
              names: foundUser.names,
              paternalSurname: foundUser.paternalSurname,
              maternalSurname: foundUser.maternalSurname || '',
              email: foundUser.email || '',
              phone: foundUser.phone || '',
              campus: foundUser.campus || '',
              faculty: foundUser.faculty || '',
              department: foundUser.department || '',
              career: foundUser.career || '',
              contractType: foundUser.contractType || '',
              teachingSemester: foundUser.teachingSemester || '',
              academicRole: foundUser.academicRole || ''
          });
          setRutFound(true);
          setFormErrors([]);
      } else {
          setRutFound(false);
          setEnrollForm(prev => ({ ...prev, rut: clean }));
          alert("El RUT ingresado no se encuentra en la Base Maestra. Por favor complete sus datos manualmente.");
      }
  };

  const handleEnrollFormSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!targetEnrollActivity) return;

      const errors: string[] = [];
      if (!enrollForm.rut) errors.push("RUT obligatorio");
      if (!enrollForm.names) errors.push("Nombres obligatorios");
      if (!enrollForm.paternalSurname) errors.push("Apellido Paterno obligatorio");
      if (!enrollForm.email) errors.push("Email obligatorio");
      if (!enrollForm.campus) errors.push("Sede obligatoria");
      
      if (errors.length > 0) {
          setFormErrors(errors);
          return;
      }

      const updatedUser: User = {
          rut: enrollForm.rut,
          names: enrollForm.names,
          paternalSurname: enrollForm.paternalSurname,
          maternalSurname: enrollForm.maternalSurname,
          email: enrollForm.email,
          phone: enrollForm.phone,
          campus: enrollForm.campus,
          faculty: enrollForm.faculty,
          department: enrollForm.department,
          career: enrollForm.career,
          contractType: enrollForm.contractType,
          teachingSemester: enrollForm.teachingSemester,
          academicRole: enrollForm.academicRole,
          systemRole: (enrollForm.rut === user.rut) ? user.systemRole : UserRole.ESTUDIANTE,
          password: (enrollForm.rut === user.rut) ? user.password : undefined,
          photoUrl: (enrollForm.rut === user.rut) ? user.photoUrl : undefined
      };

      await upsertUsers([updatedUser]);
      await enrollUser(enrollForm.rut, targetEnrollActivity.id);
      
      setEnrollSuccessMsg(`¡Matrícula Exitosa en ${targetEnrollActivity.name}!`);
      
      setTimeout(() => {
          setShowStudentEnrollModal(false);
          setTargetEnrollActivity(null);
          setEnrollSuccessMsg(null);
      }, 2000);
  };

  const handleSearchMyCourses = (e: React.FormEvent) => {
      e.preventDefault();
      if(!kioskRut) return;
      const clean = cleanRutFormat(kioskRut);
      setActiveSearchRut(clean);
  };

  const handleClearSearch = () => {
      setActiveSearchRut(null);
      setKioskRut('');
  };

  const handleShowDetail = (id: string) => {
      setSelectedEnrollmentId(id);
      setShowDetailModal(true);
  };

  const handleAdvisorNavigate = (act: Activity, targetTab: 'enrollment' | 'tracking' = 'tracking') => {
      if (act.category === 'GENERAL') {
          localStorage.setItem('jumpto_activity_id', act.id);
          onNavigate('generalActivities');
      } else {
          localStorage.setItem('jumpto_course_id', act.id);
          localStorage.setItem('jumpto_tab_course', targetTab); 
          onNavigate('courses');
      }
  };

  const getCourseMetrics = (actId: string, evaluationCount: number = 3) => {
      const enrolled = enrollments.filter(e => e.activityId === actId);
      const count = enrolled.length;
      let totalSlots = count * evaluationCount;
      if (totalSlots === 0) totalSlots = 1;
      let filledSlots = 0;
      enrolled.forEach(e => {
          if (e.grades && e.grades.length > 0) {
              filledSlots += e.grades.filter(g => g > 0).length;
          }
      });
      const progress = Math.round((filledSlots / totalSlots) * 100);
      return { count, progress };
  };

  const searchResults = useMemo(() => {
      if (!activeSearchRut) return [];
      return enrollments.filter(e => e.rut.toLowerCase() === activeSearchRut.toLowerCase());
  }, [enrollments, activeSearchRut]);

  const searchTargetUser = useMemo(() => {
      if (!activeSearchRut) return null;
      return users.find(u => u.rut.toLowerCase() === activeSearchRut.toLowerCase());
  }, [users, activeSearchRut]);

  const selectedEnrollmentDetail = useMemo(() => {
      if (!selectedEnrollmentId) return null;
      return enrollments.find(e => e.id === selectedEnrollmentId);
  }, [enrollments, selectedEnrollmentId]);


  return (
    <div className="animate-fadeIn space-y-8">
      
      {/* Welcome Section */}
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#647FBC]/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="relative z-10">
              <h1 className="text-3xl font-bold text-slate-800">Hola, {user.names}</h1>
              <p className="text-slate-500 mt-1 text-lg">Bienvenido al Panel de Gestión Académica SMEAD.</p>
              <div className="flex gap-2 mt-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                      user.systemRole === UserRole.ADMIN ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      user.systemRole === UserRole.ASESOR ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                      {user.systemRole}
                  </span>
                  {user.campus && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-50 text-slate-600 border border-slate-200">
                          Sede {user.campus}
                      </span>
                  )}
              </div>
          </div>

          <div className="flex gap-4 relative z-10">
             <div className="text-center px-6 py-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <span className="block text-3xl font-bold text-[#647FBC]">{activeCourses}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cursos UAD</span>
             </div>
             <div className="text-center px-6 py-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <span className="block text-3xl font-bold text-teal-600">{activeGeneral}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Extensión</span>
             </div>
             {user.systemRole !== UserRole.ESTUDIANTE && (
                <div className="text-center px-6 py-4 bg-white rounded-xl border border-slate-100 shadow-sm hidden sm:block">
                      <span className="block text-3xl font-bold text-slate-700">{totalEnrollments}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Inscripciones</span>
                </div>
             )}
          </div>
      </div>

      {/* ========================================================= */}
      {/* VISTA ESTUDIANTE: BÚSQUEDA Y RESULTADOS (AGREGADO)        */}
      {/* ========================================================= */}
      {user.systemRole === UserRole.ESTUDIANTE && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* COLUMNA IZQUIERDA: BÚSQUEDA Y RESULTADOS */}
              <div className="lg:col-span-2 space-y-8">
                  {/* 1. SECCIÓN DE BÚSQUEDA (KIOSCO) */}
                  <div className="bg-gradient-to-r from-[#647FBC] to-indigo-600 rounded-2xl p-8 shadow-md text-center text-white">
                      <h2 className="text-2xl font-bold mb-2">Consulta tus Resultados Académicos</h2>
                      <p className="text-blue-100 max-w-2xl mx-auto mb-6 font-medium text-sm">
                          Ingresa tu RUT para revisar el estado de tus cursos, asistencia y calificaciones en tiempo real.
                      </p>
                      
                      <div className="max-w-md mx-auto bg-white/10 p-2 rounded-xl border border-white/20 flex gap-2 backdrop-blur-sm">
                          <input 
                              type="text" 
                              placeholder="Ingresa tu RUT (ej: 12345678-9)" 
                              value={kioskRut} 
                              onChange={(e) => setKioskRut(e.target.value)} 
                              className="flex-1 pl-4 py-2 rounded-lg border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white"
                          />
                          <button 
                              onClick={handleSearchMyCourses}
                              className="bg-white text-[#647FBC] px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors shadow-sm"
                          >
                              Buscar
                          </button>
                      </div>
                  </div>

                  {/* 2. RESULTADOS DE BÚSQUEDA */}
                  {activeSearchRut && (
                      <div className="border-t-4 border-[#647FBC] bg-white rounded-xl shadow-md p-6 relative animate-fadeIn">
                          <button onClick={handleClearSearch} className="absolute top-4 right-4 text-slate-400 hover:text-red-500">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          
                          <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                              <svg className="w-6 h-6 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              Resultados para: {searchTargetUser ? `${searchTargetUser.names} ${searchTargetUser.paternalSurname}` : activeSearchRut}
                          </h3>
                          
                          {searchResults.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                  {searchResults.map(enr => {
                                      const act = activities.find(a => a.id === enr.activityId);
                                      const isApproved = enr.state === ActivityState.APROBADO;
                                      return (
                                          <div key={enr.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all bg-slate-50 relative group">
                                              <div className="flex justify-between items-start mb-2">
                                                  <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                                      {enr.state}
                                                  </span>
                                                  <span className="text-xs text-slate-400 font-mono">{act?.year}</span>
                                              </div>
                                              <h4 className="font-bold text-slate-800 text-base mb-1 line-clamp-2 h-10">{act?.name}</h4>
                                              <p className="text-xs text-slate-500 mb-4">{act?.modality}</p>
                                              <button 
                                                  onClick={() => handleShowDetail(enr.id)} 
                                                  className="w-full text-xs bg-[#647FBC] text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-sm flex justify-center items-center gap-2"
                                              >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                  Ver Detalles Académicos
                                              </button>
                                          </div>
                                      );
                                  })}
                              </div>
                          ) : (
                              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed mt-4">
                                  No se encontraron registros académicos para este RUT.
                              </div>
                          )}
                      </div>
                  )}
              </div>

              {/* COLUMNA DERECHA: CALENDARIO */}
              <div className="lg:col-span-1">
                 <MiniCalendar activities={offerActivities} />
              </div>
          </div>
      )}

      {/* Admin Quick Actions & Data Export */}
      {user.systemRole === UserRole.ADMIN && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => onNavigate('participants')} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#647FBC] hover:shadow-md transition-all flex items-center gap-4 group">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      </div>
                      <div className="text-left">
                          <h3 className="font-bold text-slate-700 group-hover:text-[#647FBC]">Base Maestra</h3>
                          <p className="text-xs text-slate-400">Gestionar Estudiantes y Docentes</p>
                      </div>
                  </button>

                  <button onClick={() => onNavigate('advisors')} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#647FBC] hover:shadow-md transition-all flex items-center gap-4 group">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </div>
                      <div className="text-left">
                          <h3 className="font-bold text-slate-700 group-hover:text-[#647FBC]">Asesores</h3>
                          <p className="text-xs text-slate-400">Gestionar Permisos</p>
                      </div>
                  </button>

                  <button onClick={() => onNavigate('courses')} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#647FBC] hover:shadow-md transition-all flex items-center gap-4 group">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                      </div>
                      <div className="text-left">
                          <h3 className="font-bold text-slate-700 group-hover:text-[#647FBC]">Cursos UAD</h3>
                          <p className="text-xs text-slate-400">Gestión Académica</p>
                      </div>
                  </button>
                  
                  <button onClick={() => onNavigate('config')} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-[#647FBC] hover:shadow-md transition-all flex items-center gap-4 group">
                      <div className="p-3 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-slate-600 group-hover:text-white transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <div className="text-left">
                          <h3 className="font-bold text-slate-700 group-hover:text-[#647FBC]">Configuración</h3>
                          <p className="text-xs text-slate-400">Listas y Parámetros</p>
                      </div>
                  </button>
              </div>

              <div className="lg:col-span-1">
                  <DataExporter />
              </div>
          </div>
      )}

      {/* ========================================================= */}
      {/* VISTA ASESOR: PANEL DE SEGUIMIENTO (REEMPLAZA OFERTA)     */}
      {/* ========================================================= */}
      {user.systemRole === UserRole.ASESOR ? (
          <div className="space-y-12">
              
              {/* SECCIÓN 1: CURSOS CURRICULARES (ACADÉMICOS) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-indigo-200 pb-4">
                      <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                      Cursos Curriculares (Seguimiento)
                  </h3>
                  
                  <div className="bg-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-indigo-50 text-indigo-800 font-bold border-b border-indigo-100">
                                  <tr>
                                      <th className="px-6 py-4">Curso Académico</th>
                                      <th className="px-6 py-4">Periodo</th>
                                      <th className="px-6 py-4">Matrícula</th>
                                      <th className="px-6 py-4">Avance Notas</th>
                                      <th className="px-6 py-4 text-center">Acción</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {offerActivities.filter(a => a.category === 'ACADEMIC').map(act => {
                                      const { count, progress } = getCourseMetrics(act.id, act.evaluationCount);
                                      return (
                                          <tr key={act.id} className="hover:bg-indigo-50/30 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-slate-800">{act.name}</div>
                                                  <div className="text-xs text-slate-500 font-mono">{act.internalCode || act.id}</div>
                                              </td>
                                              <td className="px-6 py-4 text-xs text-slate-600">
                                                  <span className="bg-slate-100 px-2 py-1 rounded">{act.year} - {act.version}</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                                                      {count} Alumnos
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-3">
                                                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                          <div 
                                                              className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                                                              style={{ width: `${progress}%` }}
                                                          ></div>
                                                      </div>
                                                      <span className="text-xs font-bold text-slate-600 w-10 text-right">{progress}%</span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-center">
                                                  <div className="flex items-center justify-center gap-2">
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act, 'enrollment'); }}
                                                          className="text-emerald-600 hover:text-white hover:bg-emerald-600 font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg transition-colors shadow-sm"
                                                      >
                                                          Matricular
                                                      </button>
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act, 'tracking'); }}
                                                          className="text-indigo-600 hover:text-white hover:bg-indigo-600 font-bold text-xs bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg transition-colors shadow-sm"
                                                      >
                                                          Notas
                                                      </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {offerActivities.filter(a => a.category === 'ACADEMIC').length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay cursos académicos asignados actualmente.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

              {/* SECCIÓN 2: ACTIVIDADES DE EXTENSIÓN (GENERAL) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-teal-200 pb-4">
                      <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      Actividades de Extensión (Charlas y Talleres)
                  </h3>
                  
                  <div className="bg-white border border-teal-100 rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-teal-50 text-teal-800 font-bold border-b border-teal-100">
                                  <tr>
                                      <th className="px-6 py-4">Nombre Actividad</th>
                                      <th className="px-6 py-4">Tipo</th>
                                      <th className="px-6 py-4">Fecha</th>
                                      <th className="px-6 py-4">Inscritos</th>
                                      <th className="px-6 py-4 text-center">Acción</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {offerActivities.filter(a => a.category === 'GENERAL').map(act => {
                                      // Para actividades generales solo contamos inscritos
                                      const count = enrollments.filter(e => e.activityId === act.id).length;
                                      return (
                                          <tr key={act.id} onClick={() => handleAdvisorNavigate(act)} className="hover:bg-teal-50/30 cursor-pointer transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-slate-800">{act.name}</div>
                                                  <div className="text-xs text-slate-500 font-mono">{act.internalCode || act.id}</div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="bg-teal-100 text-teal-800 text-[10px] uppercase font-bold px-2 py-1 rounded border border-teal-200">
                                                      {act.activityType || 'General'}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-sm text-slate-600">
                                                  {formatDateCL(act.startDate)}
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                      <span className="font-bold text-slate-700">{count}</span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-center">
                                                  <div className="flex items-center justify-center gap-2">
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act); }}
                                                          className="text-emerald-600 hover:text-white hover:bg-emerald-600 font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg transition-colors shadow-sm"
                                                      >
                                                          Inscribir
                                                      </button>
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act); }}
                                                          className="text-teal-600 hover:text-white hover:bg-teal-600 font-bold text-xs bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg transition-colors shadow-sm"
                                                      >
                                                          Gestionar
                                                      </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {offerActivities.filter(a => a.category === 'GENERAL').length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay actividades de extensión registradas.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

          </div>
      ) : (
          /* ========================================================= */
          /* VISTA STANDARD (ADMIN/STUDENT): OFERTA ACADÉMICA VIGENTE  */
          /* ========================================================= */
          <div className="space-y-12">
              
              {/* BLOQUE 1: OFERTA VIGENTE */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-slate-200 pb-4">
                      <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                      Oferta Académica Vigente
                  </h3>
                  
                  {offerActivities.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {offerActivities.map(act => {
                              const isAcademic = act.category === 'ACADEMIC';
                              const isStudent = user.systemRole === UserRole.ESTUDIANTE;
                              
                              let btnColorClass = 'bg-emerald-600 hover:bg-emerald-700';
                              if (isStudent) {
                                  btnColorClass = isAcademic 
                                    ? 'bg-indigo-600 hover:bg-indigo-700' 
                                    : 'bg-teal-600 hover:bg-teal-700';
                              }

                              return (
                              <div key={act.id} className="relative bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                                  
                                  <div className="absolute top-4 left-4">
                                      {act.category === 'ACADEMIC' ? (
                                          <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-1 rounded font-bold uppercase border border-indigo-100 shadow-sm">
                                              CURSO UAD
                                          </span>
                                      ) : (
                                          <span className="bg-teal-50 text-teal-700 text-[10px] px-2 py-1 rounded font-bold uppercase border border-teal-100 shadow-sm">
                                              EXTENSIÓN
                                          </span>
                                      )}
                                  </div>

                                  <div className="absolute top-4 right-4">
                                      <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-1 rounded font-bold uppercase border border-amber-200 animate-pulse shadow-sm">
                                          Inscripciones Abiertas
                                      </span>
                                  </div>

                                  <div className="mt-10">
                                      <h4 className="font-bold text-slate-900 text-lg mb-2 line-clamp-2 h-14 leading-tight">{act.name}</h4>
                                      <div className="text-sm text-slate-600 space-y-1 mb-6">
                                          <p className="flex items-center gap-2"><span className="text-slate-400">📅</span> Inicio: {formatDateCL(act.startDate)}</p>
                                          <p className="flex items-center gap-2"><span className="text-slate-400">🎓</span> Modalidad: {act.modality}</p>
                                          <p className="flex items-center gap-2"><span className="text-slate-400">👨‍🏫</span> {act.relator || 'Docente UPLA'}</p>
                                      </div>
                                      <button 
                                          onClick={() => handleOpenEnrollModal(act)}
                                          className={`w-full text-white py-3 rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2 ${btnColorClass}`}
                                      >
                                          {user.systemRole === UserRole.ESTUDIANTE ? 'Matricúlate Ahora' : 'Gestionar'}
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                      </button>
                                  </div>
                              </div>
                          )})}
                      </div>
                  ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                          <p className="text-slate-600 font-medium">No hay actividades con matrícula abierta en este momento.</p>
                          <p className="text-sm text-slate-400 mt-1">Revisa periódicamente este portal.</p>
                      </div>
                  )}
              </div>

              {/* BLOQUE 2: CATALOGO / REFERENCIA (VISTA ESTUDIANTE) */}
              {/* Esta sección muestra cursos que ya pasaron su fecha de inscripción pero siguen en la BD */}
              {user.systemRole === UserRole.ESTUDIANTE && (
                  <div className="animate-fadeIn">
                      <h3 className="text-2xl font-bold text-slate-600 flex items-center gap-2 mb-6 border-b border-slate-200 pb-4">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          Catálogo de Cursos (Historial Anual)
                      </h3>
                      
                      {catalogActivities.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {catalogActivities.map(act => (
                                  <div key={act.id} className="relative bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                                      
                                      <div className="flex justify-between items-start mb-4">
                                         <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded font-bold uppercase border border-slate-300">
                                              {act.category === 'ACADEMIC' ? 'Curso UAD' : 'Extensión'}
                                         </span>
                                         <span className="text-slate-400 text-[10px] font-bold uppercase border border-slate-200 px-2 py-1 rounded">
                                              Matrícula Cerrada
                                         </span>
                                      </div>

                                      <h4 className="font-bold text-slate-700 text-lg mb-2 line-clamp-2 h-14 leading-tight">{act.name}</h4>
                                      <div className="text-sm text-slate-500 space-y-1 mb-6">
                                          <p className="flex items-center gap-2"><span className="text-slate-400">📅</span> Inicio: {formatDateCL(act.startDate)}</p>
                                          <p className="flex items-center gap-2"><span className="text-slate-400">🎓</span> Modalidad: {act.modality}</p>
                                      </div>
                                      <button 
                                          className="w-full text-slate-500 border border-slate-300 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 cursor-not-allowed bg-slate-100"
                                          disabled
                                      >
                                          Solo Referencia
                                      </button>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center border-dashed">
                              <p className="text-slate-400 italic">No hay cursos finalizados o cerrados en el historial de este año.</p>
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

      {/* MODAL DETALLE ACADÉMICO EXPANDIDO */}
      {showDetailModal && selectedEnrollmentDetail && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
                  
                  {/* Modal Header */}
                  <div className="bg-[#647FBC] p-4 text-white flex justify-between items-center">
                      <h3 className="font-bold flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                          Detalle Académico Completo
                      </h3>
                      <button onClick={() => setShowDetailModal(false)} className="text-white hover:bg-white/20 p-1 rounded">✕</button>
                  </div>
                  
                  <div className="p-6">
                      {(() => {
                          const act = activities.find(a => a.id === selectedEnrollmentDetail.activityId);
                          const isApproved = selectedEnrollmentDetail.state === 'Aprobado';
                          
                          return (
                              <div className="space-y-6">
                                  {/* 1. Información del Curso */}
                                  <div className="border-b border-slate-100 pb-4">
                                      <div className="flex justify-between items-start">
                                          <div>
                                              <h2 className="text-xl font-bold text-slate-800 mb-1">{act?.name || 'Actividad No Encontrada'}</h2>
                                              <div className="flex gap-2 text-xs text-slate-500">
                                                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">COD: {act?.internalCode || act?.id}</span>
                                                  <span>|</span>
                                                  <span>{act?.year}</span>
                                                  <span>|</span>
                                                  <span>{act?.relator}</span>
                                              </div>
                                          </div>
                                          <div className="flex flex-col items-end">
                                              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isApproved ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                                  {selectedEnrollmentDetail.state}
                                              </span>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      
                                      {/* 2. Panel de Asistencia */}
                                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                          <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                              Registro de Asistencia
                                          </h4>
                                          
                                          <div className="flex justify-between mb-4 px-1">
                                              {[1, 2, 3, 4, 5, 6].map(num => {
                                                  // @ts-ignore
                                                  const isPresent = selectedEnrollmentDetail[`attendanceSession${num}`];
                                                  return (
                                                      <div key={num} className="flex flex-col items-center gap-1">
                                                          <span className="text-[10px] text-slate-400 font-bold">S{num}</span>
                                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${isPresent ? 'bg-green-500 border-green-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-300'}`}>
                                                              {isPresent ? (
                                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                              ) : (
                                                                  <span className="text-xs">•</span>
                                                              )}
                                                          </div>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                          
                                          <div className="flex justify-between items-center border-t border-blue-100 pt-2">
                                              <span className="text-xs text-blue-700 font-medium">Porcentaje Total</span>
                                              <span className="text-xl font-bold text-slate-700">{selectedEnrollmentDetail.attendancePercentage || 0}%</span>
                                          </div>
                                      </div>

                                      {/* 3. Panel de Calificaciones */}
                                      <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                                          <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2-2z" /></svg>
                                              Evaluaciones Parciales
                                          </h4>
                                          
                                          <div className="flex flex-wrap gap-2 mb-4 justify-center">
                                              {selectedEnrollmentDetail.grades && selectedEnrollmentDetail.grades.length > 0 ? (
                                                  selectedEnrollmentDetail.grades.map((g, idx) => (
                                                      <div key={idx} className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-center shadow-sm min-w-[50px]">
                                                          <span className={`block text-lg font-bold ${g >= 4.0 ? 'text-slate-700' : 'text-red-500'}`}>{g}</span>
                                                          <span className="text-[10px] text-slate-400 font-bold uppercase">Nota {idx + 1}</span>
                                                      </div>
                                                  ))
                                              ) : (
                                                  <span className="text-sm text-slate-400 italic py-2">Sin notas registradas</span>
                                              )}
                                          </div>
                                          
                                          <div className="flex justify-between items-center border-t border-amber-100 pt-2">
                                              <span className="text-xs text-amber-800 font-medium">Promedio Final</span>
                                              <div className="bg-white px-3 py-1 rounded border border-slate-200 shadow-sm">
                                                  <span className={`text-xl font-bold ${selectedEnrollmentDetail.finalGrade && selectedEnrollmentDetail.finalGrade >= 4 ? 'text-blue-600' : 'text-red-500'}`}>
                                                      {selectedEnrollmentDetail.finalGrade || '--'}
                                                  </span>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                                      <p className="text-xs text-slate-500">
                                          Estado Académico Actual: <strong className="uppercase text-slate-700">{selectedEnrollmentDetail.state}</strong>
                                      </p>
                                  </div>
                              </div>
                          );
                      })()}
                  </div>
              </div>
          </div>
      )}

      {/* --- MODAL DE AUTO-MATRÍCULA FORMULARIO COMPLETO (VISTA ESTUDIANTE) --- */}
      {showStudentEnrollModal && targetEnrollActivity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 transform transition-all scale-100 my-8">
                  
                  {/* Header Visual */}
                  <div className="bg-[#647FBC] px-6 py-6 text-white flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                      <div className="relative z-10 text-center md:text-left">
                          <h3 className="text-lg font-bold uppercase tracking-wider mb-1 opacity-90">Formulario de Matrícula</h3>
                          <h2 className="text-2xl font-bold leading-tight">{targetEnrollActivity.name}</h2>
                          <div className="flex gap-2 mt-2 justify-center md:justify-start">
                              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">{targetEnrollActivity.internalCode || 'ACTIVIDAD'}</span>
                              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">{targetEnrollActivity.year}</span>
                          </div>
                      </div>
                      <div className="relative z-10 mt-4 md:mt-0 bg-white/10 p-3 rounded-lg backdrop-blur-md border border-white/20">
                          <p className="text-xs font-bold text-blue-100 uppercase mb-1">Identificación</p>
                          <p className="text-lg font-mono font-bold truncate max-w-[150px]">{enrollForm.rut || '...'}</p>
                      </div>
                  </div>

                  {enrollSuccessMsg ? (
                      <div className="p-12 text-center animate-fadeIn">
                          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                          <h4 className="text-2xl font-bold text-slate-800 mb-2">¡Matrícula Exitosa!</h4>
                          <p className="text-slate-600 mb-6">
                              Tus datos han sido actualizados en la Base Maestra y tu inscripción ha sido confirmada.
                          </p>
                          <div className="inline-block px-4 py-2 bg-slate-100 rounded text-xs text-slate-500 font-mono">
                              Redirigiendo...
                          </div>
                      </div>
                  ) : (
                      <form onSubmit={handleEnrollFormSubmit} className="p-8">
                          <div className="mb-6 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r text-amber-800 text-sm">
                              <strong>Instrucciones:</strong> Ingrese su RUT y presione "Cargar Datos" para verificar su registro en la Base Maestra. Complete los 13 campos obligatorios de la Ficha Académica.
                          </div>

                          <div className="space-y-6">
                              {/* 1. IDENTIFICACIÓN */}
                              <div>
                                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 pb-2 mb-4">Datos Personales</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <div className="md:col-span-1">
                                          <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                          <div className="flex gap-2">
                                              <input 
                                                  type="text" 
                                                  name="rut" 
                                                  placeholder="12345678-9"
                                                  value={enrollForm.rut} 
                                                  onChange={handleEnrollFormChange} 
                                                  className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-[#647FBC] font-bold ${rutFound ? 'bg-green-50 border-green-300 text-green-700' : 'border-slate-300'}`}
                                              />
                                              <button 
                                                  type="button"
                                                  onClick={handleCheckRut}
                                                  className="bg-[#647FBC] hover:bg-blue-700 text-white px-3 py-2 rounded font-bold text-xs flex items-center shadow-sm"
                                                  title="Buscar en Base Maestra"
                                              >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                              </button>
                                          </div>
                                          {rutFound && <p className="text-[10px] text-green-600 mt-1 font-medium">✓ Datos cargados desde Base Maestra</p>}
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">Nombres *</label>
                                          <input type="text" name="names" value={enrollForm.names} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC]"/>
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">Apellido Paterno *</label>
                                          <input type="text" name="paternalSurname" value={enrollForm.paternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC]"/>
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">Apellido Materno</label>
                                          <input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC]"/>
                                      </div>
                                      <div className="md:col-span-2">
                                          <label className="block text-xs font-bold text-slate-700 mb-1">Email Institucional *</label>
                                          <input type="email" name="email" value={enrollForm.email} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC]"/>
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono</label>
                                          <input type="tel" name="phone" value={enrollForm.phone} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC]"/>
                                      </div>
                                  </div>
                              </div>

                              {/* 2. ANTECEDENTES ACADÉMICOS */}
                              <div>
                                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 pb-2 mb-4">Ficha Académica (Base Maestra)</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <SmartSelect label="Sede / Campus *" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso"]} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Facultad *" name="faculty" value={enrollForm.faculty} options={listFaculties} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Departamento *" name="department" value={enrollForm.department} options={listDepts} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Carrera / Programa *" name="career" value={enrollForm.career} options={listCareers} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Rol Académico *" name="academicRole" value={enrollForm.academicRole} options={listRoles} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Tipo Contrato *" name="contractType" value={enrollForm.contractType} options={listContracts} onChange={handleEnrollFormChange} required />
                                      <SmartSelect label="Semestre Docencia *" name="teachingSemester" value={enrollForm.teachingSemester} options={listSemesters} onChange={handleEnrollFormChange} required />
                                  </div>
                              </div>
                          </div>

                          {formErrors.length > 0 && (
                              <div className="mt-6 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                                  <p className="font-bold mb-1">Por favor corrija los siguientes errores:</p>
                                  <ul className="list-disc pl-5">
                                      {formErrors.map((err, idx) => <li key={idx}>{err}</li>)}
                                  </ul>
                              </div>
                          )}

                          <div className="flex gap-4 pt-8 border-t border-slate-100 mt-6">
                              <button 
                                  type="button"
                                  onClick={() => setShowStudentEnrollModal(false)}
                                  className="w-1/3 py-3 bg-white border border-slate-300 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                              >
                                  Cancelar
                              </button>
                              <button 
                                  type="submit"
                                  className="flex-1 py-3 bg-[#647FBC] text-white font-bold rounded-xl hover:bg-blue-800 shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2"
                              >
                                  Confirmar Datos y Matricular
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              </button>
                          </div>
                      </form>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};
