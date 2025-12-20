
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
                    const hasPostgraduate = dayActs.some(a => a.category === 'POSTGRADUATE');
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
                                {hasPostgraduate && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                            </div>

                            {/* Tooltip */}
                            {dayActs.length > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded z-20 shadow-xl pointer-events-none text-left">
                                    {dayActs.map(a => (
                                        <div key={a.id} className="mb-1 last:mb-0 border-b border-slate-600 last:border-0 pb-1 last:pb-0">
                                            <span className={`font-bold ${a.category === 'ACADEMIC' ? 'text-indigo-300' : a.category === 'POSTGRADUATE' ? 'text-purple-300' : 'text-teal-300'}`}>
                                                • {a.category === 'ACADEMIC' ? 'Curso' : a.category === 'POSTGRADUATE' ? 'Post.' : 'Ext.'}: 
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
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Postítulos</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-500"></div> Extensión</div>
            </div>
        </div>
    );
};

// --- KPI CARD COMPONENT for ASESOR with Tooltip Improved ---
const KpiCardCompact: React.FC<{
    title: string;
    value: string | number;
    suffix?: string;
    colorClass?: string;
    tooltipContent?: React.ReactNode;
}> = ({ title, value, suffix = '', colorClass = 'text-slate-700', tooltipContent }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <div 
            className="text-center px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm relative group cursor-help transition-all hover:border-[#647FBC]/30"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span className={`block text-2xl font-bold ${colorClass}`}>{value}<span className="text-lg">{suffix}</span></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-tight h-6 flex items-center justify-center">{title}</span>
            
            {isHovered && tooltipContent && (
                <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 bg-white text-left p-0 rounded-xl shadow-2xl animate-fadeIn border border-indigo-200 overflow-hidden">
                    <div className="text-[10px] font-black text-indigo-700 bg-indigo-50 uppercase border-b border-indigo-100 p-3 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {title}
                    </div>
                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar p-3 space-y-2 overflow-x-hidden text-slate-600">
                        {tooltipContent}
                    </div>
                    {/* Invisible bridge to prevent tooltip disappearing when moving mouse between card and tooltip */}
                    <div className="absolute -bottom-2 left-0 w-full h-2 bg-transparent"></div>
                    {/* Tooltip Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white"></div>
                </div>
            )}
        </div>
    );
};

interface DashboardProps {
  user: User;
  onNavigate: (tab: TabType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const { activities, users, enrollments, enrollUser, upsertUsers, addActivity, config, getUser } = useData();
  
  // --- STATE FOR YEAR SELECTION (ADMIN & ASESOR) ---
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

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

  // --- STATE FOR ADMIN CATALOG ---
  const [catalogYear, setCatalogYear] = useState<number>(new Date().getFullYear() - 1);
  
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

  // --- AUTO-INIT: ASESORÍAS (Self-Repair for Netlify) ---
  useEffect(() => {
      if (user.systemRole === UserRole.ASESOR && activities.length > 0) {
          const advisoryId = `ADVISORY-GENERAL-${new Date().getFullYear()}`;
          const hasAdvisory = activities.some(a => a.category === 'ADVISORY' || a.id === advisoryId);
          
          if (!hasAdvisory) {
              const initAdvisory = async () => {
                  console.log("Auto-inicializando módulo de Asesorías en Dashboard...");
                  await addActivity({
                      id: advisoryId,
                      category: 'ADVISORY',
                      name: `Asesorías y Acompañamiento ${new Date().getFullYear()}`,
                      modality: 'Presencial/Virtual',
                      hours: 0,
                      year: new Date().getFullYear(),
                      isPublic: false,
                      internalCode: 'ASE-GEN',
                      startDate: new Date().toISOString().split('T')[0]
                  });
              };
              initAdvisory();
          }
      }
  }, [user.systemRole, activities, addActivity]);

  // --- General KPIs Calculation (FILTERED BY SELECTED YEAR) ---
  const activeCoursesCount = activities.filter(a => a.category === 'ACADEMIC' && a.year === selectedYear).length;
  const activeGeneralCount = activities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).length;
  const activePostgraduateCount = activities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).length;
  
  // Enrollments filtered by activities in selected year
  const yearEnrollments = enrollments.filter(e => {
      const act = activities.find(a => a.id === e.activityId);
      return act && act.year === selectedYear;
  });

  const totalEnrollments = yearEnrollments.length;

  const totalApprovedPeriod = yearEnrollments.filter(e => e.state === ActivityState.APROBADO).length;

  // --- ASESOR / ADMIN KPIs Calculation (FILTERED BY SELECTED YEAR) ---
  const advisorKpis = useMemo(() => {
    // Only for Advisor and Admin
    if (user.systemRole === UserRole.ESTUDIANTE) return null;

    const minGrade = config.minPassingGrade || 4.0;
    const minAtt = config.minAttendancePercentage || 75;
    const now = new Date();
    const hoyStr = now.toISOString().split('T')[0];
    const month = now.getMonth(); // 0-11 (Mar-Jul is Month 2 to 6, Ago-Dic is 7 to 11)

    // Filter Activities based on Selected Year
    const yearActivities = activities.filter(a => a.year === selectedYear);

    // 1. Tasa de Aprobación & Detalles
    const academicEnrollments = enrollments.filter(e => yearActivities.some(a => a.id === e.activityId && (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE')));
    const aprobados = academicEnrollments.filter(e => e.state === ActivityState.APROBADO).length;
    const tasaAprobacion = academicEnrollments.length > 0 ? Math.round((aprobados / academicEnrollments.length) * 100) : 0;
    
    const topAprobacion = yearActivities.filter(a => a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE').map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id);
        const count = enrs.length;
        const approved = enrs.filter(e => e.state === ActivityState.APROBADO).length;
        return { name: act.name, pct: count > 0 ? Math.round((approved / count) * 100) : 0 };
    }).sort((a,b) => b.pct - a.pct).slice(0, 5);

    // 2. Estudiantes en Riesgo & Detalles
    const estudiantesRiesgo: { name: string, course: string, reason: string }[] = [];
    academicEnrollments.forEach(e => {
        if (e.state === ActivityState.APROBADO) return;

        const activity = yearActivities.find(a => a.id === e.activityId);
        if (!activity) return;

        const expectedGrades = activity.evaluationCount || 3;
        const recordedGrades = (e.grades || []).filter(g => g !== undefined && g !== null && g > 0).length;
        const hasAllGrades = recordedGrades >= expectedGrades;
        const isFailingGrade = e.finalGrade !== undefined && e.finalGrade < minGrade;
        const isFailingAttendance = e.attendancePercentage !== undefined && e.attendancePercentage < minAtt;

        let riskType = "";
        if (hasAllGrades && (isFailingGrade || isFailingAttendance)) {
            riskType = isFailingGrade && isFailingAttendance ? "Nota y Asistencia" : (isFailingGrade ? "Promedio bajo" : "Falta Asistencia");
        } else if (!hasAllGrades && recordedGrades > 0 && isFailingGrade) {
            riskType = "Tendencia reprobatoria";
        }

        if (riskType) {
            const student = users.find(u => u.rut === e.rut);
            estudiantesRiesgo.push({
                name: student ? `${student.names} ${student.paternalSurname}` : e.rut,
                course: activity.name,
                reason: riskType
            });
        }
    });

    // 3. Avance de Calificaciones & Detalles
    let totalSlots = 0;
    let filledSlots = 0;
    const avancePorCurso = yearActivities.filter(a => a.category === 'ACADEMIC').map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id);
        let cTotal = enrs.length * (act.evaluationCount || 3);
        let cFilled = enrs.reduce((acc, e) => acc + (e.grades?.filter(g => g > 0).length || 0), 0);
        totalSlots += cTotal;
        filledSlots += cFilled;
        return { name: act.name, pct: cTotal > 0 ? Math.round((cFilled / cTotal) * 100) : 0 };
    }).sort((a,b) => a.pct - b.pct).slice(0, 5);

    const avanceCalificaciones = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    // 4. Asistencia Promedio & Detalles
    const enrollmentsWithAttendance = academicEnrollments.filter(e => typeof e.attendancePercentage === 'number');
    const asistenciaPromedio = enrollmentsWithAttendance.length > 0 ? Math.round(enrollmentsWithAttendance.reduce((acc, e) => acc + (e.attendancePercentage || 0), 0) / enrollmentsWithAttendance.length) : 0;
    
    const asistenciaPorCurso = yearActivities.filter(a => a.category === 'ACADEMIC').map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id && typeof e.attendancePercentage === 'number');
        const avg = enrs.length > 0 ? Math.round(enrs.reduce((acc, e) => acc + (e.attendancePercentage || 0), 0) / enrs.length) : 0;
        return { name: act.name, avg };
    }).sort((a,b) => a.avg - b.avg).slice(0, 5);

    // 5. Cursos Críticos (<5) & Detalles
    const cursosCriticosList = yearActivities.filter(a => a.category === 'ACADEMIC').map(a => {
        const count = academicEnrollments.filter(e => e.activityId === a.id).length;
        return { name: a.name, count };
    }).filter(c => c.count < 5).sort((a,b) => a.count - b.count);
    
    // 6. Cursos Finalizados & Detalles (LOGIC IMPROVED FOR SEMESTERS)
    const finalizadosList = yearActivities.filter(a => a.category === 'ACADEMIC').map(a => {
        // Criterio 1: Fecha de término pasada
        if (a.endDate && a.endDate < hoyStr) return { name: a.name, date: a.endDate, finished: true };
        
        // Criterio 2: Semestre anterior concluido (Si estamos en Agosto-Diciembre, el Semestre 1 finalizó)
        const isFirstSem = a.academicPeriod?.endsWith("-1") || a.academicPeriod?.toLowerCase().includes("1er") || a.academicPeriod?.toLowerCase().includes("primero");
        if (isFirstSem && month >= 7) { // 7 = Agosto
            return { name: a.name, date: `${a.year}-07-31`, finished: true };
        }
        
        return { name: a.name, date: a.endDate || '', finished: false };
    }).filter(item => item.finished);

    return {
        tasaAprobacion,
        detallesTasa: topAprobacion,
        totalEstudiantesRiesgo: estudiantesRiesgo.length,
        detallesEstudiantesRiesgo: estudiantesRiesgo,
        avanceCalificaciones,
        detallesAvance: avancePorCurso,
        asistenciaPromedio,
        detallesAsistencia: asistenciaPorCurso,
        cursosCriticos: cursosCriticosList.length,
        detallesCursosCriticos: cursosCriticosList,
        cursosFinalizados: finalizadosList.length,
        detallesCursosFinalizados: finalizadosList
    };
  }, [user.systemRole, activities, enrollments, config, selectedYear, users]);


  // --- LOGIC: SPLIT OFFER vs CATALOG (Updated for Students) ---
  const { offerActivities, catalogActivities } = useMemo(() => {
    // Admin and Asesor see everything as "offer"
    if (user.systemRole !== UserRole.ESTUDIANTE) {
        return { offerActivities: activities, catalogActivities: [] };
    }
    
    // Logic for ESTUDIANTE view
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const offer: Activity[] = [];
    const catalog: Activity[] = [];

    activities.forEach(act => {
        // FILTRO DE PRIVACIDAD PARA ESTUDIANTES
        if (act.isPublic === false) return;

        if (!act.startDate) {
            offer.push(act);
            return;
        }

        const [y, m, d] = act.startDate.split('-').map(Number);
        const startDate = new Date(y, m - 1, d);
        
        let deadline: Date;

        if (act.category === 'GENERAL') { // Extensión
            deadline = new Date(startDate);
            deadline.setDate(deadline.getDate() + 2); 
        } else { // Cursos Académicos
            deadline = new Date(startDate);
            deadline.setDate(deadline.getDate() + 14); 
        }

        if (today <= deadline) {
            offer.push(act);
        } else {
            catalog.push(act);
        }
    });
    
    return { offerActivities: offer, catalogActivities: catalog };
  }, [activities, user.systemRole]);

  // --- LOGIC: Mis Cursos (My Enrollments) ---
  const myEnrollments = useMemo(() => {
      return enrollments.filter(e => e.rut === user.rut);
  }, [enrollments, user.rut]);

  // --- LOGIC: FOR ADMIN's HISTORICAL CATALOG ---
  const availableYears = useMemo(() => {
      const cy = new Date().getFullYear();
      const yearSet = new Set<number>();
      activities.forEach(a => {
        if (typeof a.year === 'number' && a.year !== cy) {
            yearSet.add(a.year);
        }
      });
      const uniqueYears = Array.from(yearSet);
      return uniqueYears.sort((a, b) => b - a);
  }, [activities]);

  const catalogActivitiesForAdmin = useMemo(() => {
      return activities.filter(a => a.year === catalogYear);
  }, [activities, catalogYear]);


  // --- LOGIC FOR CALENDAR VIEW ---
  const calendarActivities = useMemo(() => {
    return offerActivities;
  }, [offerActivities]);

  // --- LÓGICA DE ORDENACIÓN ASESOR POR SEMESTRE ACTUAL (REQUERIDO) ---
  const sortedAdvisorAcademicActivities = useMemo(() => {
    const academic = offerActivities.filter(a => a.category === 'ACADEMIC' && a.year === selectedYear);
    const now = new Date();
    const month = now.getMonth(); 
    const currentSemSuffix = (month >= 7) ? "-2" : "-1";

    return [...academic].sort((a, b) => {
        const periodA = a.academicPeriod || '';
        const periodB = b.academicPeriod || '';

        const isCurrentA = periodA.endsWith(currentSemSuffix);
        const isCurrentB = periodB.endsWith(currentSemSuffix);

        if (isCurrentA && !isCurrentB) return -1;
        if (!isCurrentA && isCurrentB) return 1;

        return periodB.localeCompare(periodA);
    });
  }, [offerActivities, selectedYear]);


  // --- HANDLERS ---
  const handleOpenEnrollModal = (act: Activity) => {
    if (user.systemRole === UserRole.ESTUDIANTE) {
         setTargetEnrollActivity(act);
         setShowStudentEnrollModal(true);
         setEnrollSuccessMsg(null);
    } else {
        localStorage.setItem(act.category === 'GENERAL' ? 'jumpto_activity_id' : 'jumpto_course_id', act.id);
        onNavigate(act.category === 'GENERAL' ? 'generalActivities' : 'courses');
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
      } else if (act.category === 'POSTGRADUATE') {
          onNavigate('postgraduate');
      } else if (act.category === 'ADVISORY') {
          onNavigate('advisory');
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
          
          <div className="relative z-10 flex-1">
              <h1 className="text-3xl font-bold text-slate-800">Hola, {user.names}</h1>
              <p className="text-slate-500 mt-1 text-lg">Bienvenido al Panel de Gestión Académica SMEAD.</p>
              <div className="flex gap-2 mt-4 items-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                      user.systemRole === UserRole.ADMIN ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      user.systemRole === UserRole.ASESOR ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                      {user.systemRole}
                  </span>
                  
                  {(user.systemRole === UserRole.ASESOR || user.systemRole === UserRole.ADMIN) && (
                        <div className="flex items-center bg-white rounded-full px-3 py-1 border border-slate-200 shadow-sm ml-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400 mr-2">Periodo:</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="text-xs font-bold text-indigo-700 bg-transparent border-none focus:ring-0 p-0 cursor-pointer outline-none"
                            >
                                <option value={currentYear}>{currentYear} (Vigente)</option>
                                <option value={currentYear - 1}>{currentYear - 1}</option>
                                <option value={currentYear - 2}>{currentYear - 2}</option>
                            </select>
                        </div>
                  )}
              </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 relative z-10 max-w-2xl">
             <div className="text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-[#647FBC]">{activeCoursesCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Cursos UAD</span>
             </div>
             <div className="text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-purple-600">{activePostgraduateCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Postítulos</span>
             </div>
             <div className="text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-teal-600">{activeGeneralCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Extensión</span>
             </div>
             <div className="text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-emerald-600">{totalApprovedPeriod}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Aprobados</span>
             </div>
             {user.systemRole !== UserRole.ESTUDIANTE && (
                <div className="text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                      <span className="block text-2xl font-bold text-slate-700">{totalEnrollments}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Inscripciones</span>
                </div>
             )}
          </div>
      </div>

      {/* ========================================================= */}
      {/* VISTA ESTUDIANTE: BÚSQUEDA Y RESULTADOS                    */}
      {/* ========================================================= */}
      {user.systemRole === UserRole.ESTUDIANTE && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                  <div className="bg-gradient-to-r from-[#647FBC] to-indigo-600 rounded-2xl p-8 shadow-md text-center text-white">
                      <h2 className="text-2xl font-bold mb-2">Consulta tus Resultados Académicos</h2>
                      <p className="text-blue-100 max-w-2xl mx-auto mb-6 font-medium text-sm">
                          Ingresa tu RUT para revisar el estado de tus cursos, asistencia y calificaciones en tiempo real.
                      </p>
                      <div className="max-w-md mx-auto bg-white/10 p-2 rounded-xl border border-white/20 flex gap-2 backdrop-blur-sm">
                          <input type="text" placeholder="Ingresa tu RUT (ej: 12345678-9)" value={kioskRut} onChange={(e) => setKioskRut(e.target.value)} className="flex-1 pl-4 py-2 rounded-lg border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white"/>
                          <button onClick={handleSearchMyCourses} className="bg-white text-[#647FBC] px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors shadow-sm">Buscar</button>
                      </div>
                  </div>
                  {activeSearchRut && (
                      <div className="border-t-4 border-[#647FBC] bg-white rounded-xl shadow-md p-6 relative animate-fadeIn">
                          <button onClick={handleClearSearch} className="absolute top-4 right-4 text-slate-400 hover:text-red-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2"><svg className="w-6 h-6 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>Resultados Búsqueda: {searchTargetUser ? `${searchTargetUser.names} ${searchTargetUser.paternalSurname}` : activeSearchRut}</h3>
                          {searchResults.length > 0 ? (<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">{searchResults.map(enr => (<div key={enr.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all bg-slate-50 relative group"><div className="flex justify-between items-start mb-2"><span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{enr.state}</span><span className="text-xs text-slate-400 font-mono">{activities.find(a => a.id === enr.activityId)?.year}</span></div><h4 className="font-bold text-slate-800 text-base mb-1 line-clamp-2 h-10">{activities.find(a => a.id === enr.activityId)?.name}</h4><p className="text-xs text-slate-500 mb-4">{activities.find(a => a.id === enr.activityId)?.modality}</p><button onClick={() => handleShowDetail(enr.id)} className="w-full text-xs bg-[#647FBC] text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-sm flex justify-center items-center gap-2">Ver Detalles</button></div>))}</div>) : (<div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed mt-4">No se encontraron registros académicos para este RUT.</div>)}
                      </div>
                  )}
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-200 pb-2"><svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>Inscripción Abierta (Oferta Disponible)</h3>
                      {offerActivities.length > 0 ? (<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{offerActivities.map(act => (<div key={act.id} className="relative bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-emerald-300 transition-all"><div className="absolute top-4 right-4"><span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${act.category === 'ACADEMIC' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-teal-50 text-teal-700 border-teal-100'}`}>{act.category === 'ACADEMIC' ? 'CURSO' : 'EXTENSIÓN'}</span></div><div className="mt-6"><h4 className="font-bold text-slate-800 text-base mb-2 line-clamp-2 h-10 leading-tight">{act.name}</h4><div className="text-xs text-slate-600 space-y-1 mb-4"><p className="flex items-center gap-2"><span className="font-bold text-xs text-slate-400">Inicio:</span> {formatDateCL(act.startDate)}</p><p className="flex items-center gap-2"><span className="font-bold text-xs text-slate-400">Mod:</span> {act.modality}</p></div><button onClick={() => handleOpenEnrollModal(act)} className={`w-full py-2 rounded-lg font-bold shadow-sm text-xs transition-colors text-white flex items-center justify-center gap-2 ${act.category === 'ACADEMIC' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-teal-600 hover:bg-teal-700'}`}>Solicitar Inscripción</button></div></div>))}</div>) : (<div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">No hay actividades con matrícula abierta.</div>)}
                  </div>
              </div>
              <div className="lg:col-span-1"><MiniCalendar activities={calendarActivities} /></div>
          </div>
      )}

      {/* ========================================================= */}
      {/* VISTA ADMINISTRADOR: PANEL COMPLETO (REPLICA ASESOR + CARDS) */}
      {/* ========================================================= */}
      {user.systemRole === UserRole.ADMIN && advisorKpis && (
          <div className="space-y-12">
              {/* KPIs Section (Replicated from Advisor) */}
              <div>
                  <h3 className="text-lg font-bold text-slate-600 flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                      Indicadores Clave de Gestión ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {/* Tasa Aprobación */}
                      <KpiCardCompact 
                        title="Tasa Aprobación" 
                        value={advisorKpis.tasaAprobacion} 
                        suffix="%" 
                        colorClass="text-emerald-600" 
                        tooltipContent={
                            advisorKpis.detallesTasa.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesTasa.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className="font-bold text-emerald-600">{c.pct}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Sin datos de aprobación."
                        }
                      />
                      {/* Alumnos Riesgo */}
                      <KpiCardCompact 
                        title="Alumnos en Riesgo" 
                        value={advisorKpis.totalEstudiantesRiesgo} 
                        colorClass="text-amber-600" 
                        tooltipContent={
                            advisorKpis.detallesEstudiantesRiesgo.length > 0 ? (
                                <div className="space-y-2">
                                    {advisorKpis.detallesEstudiantesRiesgo.map((item, i) => (
                                        <div key={i} className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                            <div className="font-bold text-[10px] text-slate-800 leading-tight mb-0.5">{item.name}</div>
                                            <div className="text-[9px] text-slate-500 mb-1 leading-tight break-words">{item.course}</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Causa: {item.reason}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : "Sin estudiantes en riesgo crítico."
                        }
                      />
                      {/* Avance Notas */}
                      <KpiCardCompact 
                        title="Avance Notas" 
                        value={advisorKpis.avanceCalificaciones} 
                        suffix="%" 
                        colorClass="text-indigo-600" 
                        tooltipContent={
                            advisorKpis.detallesAvance.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesAvance.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className={`font-bold ${c.pct < 50 ? 'text-red-600' : 'text-indigo-600'}`}>{c.pct}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Sin avances de notas registrados."
                        }
                      />
                      {/* Asistencia Media */}
                      <KpiCardCompact 
                        title="Asistencia Media" 
                        value={advisorKpis.asistenciaPromedio} 
                        suffix="%" 
                        colorClass="text-blue-600" 
                        tooltipContent={
                            advisorKpis.detallesAsistencia.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesAsistencia.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className={`font-bold ${c.avg < 75 ? 'text-red-600' : 'text-blue-600'}`}>{c.avg}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Sin datos de asistencia."
                        }
                      />
                      {/* Cursos Críticos */}
                      <KpiCardCompact 
                        title="Cursos Críticos" 
                        value={advisorKpis.cursosCriticos} 
                        colorClass="text-red-600" 
                        tooltipContent={
                            advisorKpis.detallesCursosCriticos.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesCursosCriticos.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className="font-bold text-red-600">{c.count} alumnos</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Sin cursos críticos identificados."
                        }
                      />
                      {/* Finalizados */}
                      <KpiCardCompact 
                        title="Finalizados" 
                        value={advisorKpis.cursosFinalizados} 
                        colorClass="text-purple-600" 
                        tooltipContent={
                            advisorKpis.detallesCursosFinalizados.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesCursosFinalizados.map((c, i) => (
                                        <li key={i} className="flex flex-col border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate text-slate-700 font-medium break-words leading-tight">{c.name}</span>
                                            <span className="text-[8px] text-slate-400 uppercase">Cerrado el {formatDateCL(c.date)}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Sin cierres recientes."
                        }
                      />
                  </div>
              </div>

              {/* SECCIÓN 1: CURSOS UAD (CARDS) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-indigo-200 pb-4">
                      <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                      Cursos Curriculares UAD ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {sortedAdvisorAcademicActivities.map(act => {
                          const { count, progress } = getCourseMetrics(act.id, act.evaluationCount);
                          return (
                              <div key={act.id} onClick={() => handleAdvisorNavigate(act)} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:border-indigo-400 transition-all cursor-pointer relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-3"><span className="text-[10px] font-bold text-slate-300 font-mono uppercase group-hover:text-indigo-400">{act.academicPeriod}</span></div>
                                  <h4 className="font-bold text-slate-800 text-lg mb-2 pr-12 line-clamp-2 h-14 group-hover:text-indigo-700">{act.name}</h4>
                                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                                      <span className="flex items-center gap-1 font-bold"><svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> {count} Inscritos</span>
                                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-black uppercase tracking-tighter">{act.modality}</span>
                                  </div>
                                  <div className="space-y-1.5">
                                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase"><span>Avance Calificaciones</span><span>{progress}%</span></div>
                                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div></div>
                                  </div>
                                  <div className="mt-6 pt-4 border-t border-slate-50 flex justify-end">
                                      <span className="text-[10px] font-black uppercase text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">Gestionar Curso <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></span>
                                  </div>
                              </div>
                          );
                      })}
                      {sortedAdvisorAcademicActivities.length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed">No hay cursos curriculares registrados para el periodo {selectedYear}.</div>
                      )}
                  </div>
              </div>

              {/* SECCIÓN 2: ACTIVIDADES DE EXTENSIÓN (CARDS) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-teal-200 pb-4">
                      <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      Actividades de Extensión ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {offerActivities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).map(act => {
                          const count = enrollments.filter(e => e.activityId === act.id).length;
                          return (
                              <div key={act.id} onClick={() => handleAdvisorNavigate(act)} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:border-teal-400 transition-all cursor-pointer relative">
                                  <div className="absolute top-0 right-0 p-3"><span className="text-[9px] font-black text-teal-600 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full uppercase">{act.activityType || 'Extensión'}</span></div>
                                  <h4 className="font-bold text-slate-800 text-lg mb-2 pr-16 line-clamp-2 h-14 group-hover:text-teal-700">{act.name}</h4>
                                  <div className="text-xs text-slate-500 space-y-1 mb-4">
                                      <p className="flex items-center gap-2"><svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> {formatDateCL(act.startDate)}</p>
                                      <p className="flex items-center gap-2"><svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg> {act.modality}</p>
                                  </div>
                                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-50">
                                      <span className="text-xs font-bold text-slate-700">{count} Asistentes Registrados</span>
                                      <span className="text-[10px] font-black uppercase text-teal-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">Gestionar <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></span>
                                  </div>
                              </div>
                          );
                      })}
                      {offerActivities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed">No hay actividades de extensión registradas.</div>
                      )}
                  </div>
              </div>

              {/* SECCIÓN 3: POSTÍTULOS Y DIPLOMADOS (CARDS) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-purple-200 pb-4">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      Postítulos y Diplomados ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {offerActivities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).map(act => {
                          const count = enrollments.filter(e => e.activityId === act.id).length;
                          return (
                              <div key={act.id} onClick={() => handleAdvisorNavigate(act)} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:border-purple-400 transition-all cursor-pointer relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-3 text-right">
                                      <span className="block text-[9px] font-black text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full uppercase mb-1">{act.programConfig?.programType || 'Postítulo'}</span>
                                      <span className="block text-[9px] font-bold text-slate-400 font-mono uppercase tracking-widest">{act.version}</span>
                                  </div>
                                  <h4 className="font-bold text-slate-800 text-lg mb-2 pr-20 line-clamp-2 h-14 group-hover:text-purple-700">{act.name}</h4>
                                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
                                      <span className="bg-slate-100 px-2 py-0.5 rounded font-bold">{act.programConfig?.modules?.length || 0} Módulos</span>
                                      <span className="font-bold flex items-center gap-1"><svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> {count} Matriculados</span>
                                  </div>
                                  <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                                      <div className="text-[10px] text-slate-400 font-mono uppercase">Dir: {act.relator || 'No asignado'}</div>
                                      <span className="text-[10px] font-black uppercase text-purple-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">Gestionar Programa <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></span>
                                  </div>
                              </div>
                          );
                      })}
                      {offerActivities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed">No hay programas de postítulo vigentes en {selectedYear}.</div>
                      )}
                  </div>
              </div>

              {/* SECCIÓN 4: ASESORÍAS (CARDS) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-blue-200 pb-4">
                      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      Asesorías y Acompañamiento ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {offerActivities.filter(a => a.category === 'ADVISORY' && a.year === selectedYear).map(act => {
                          const advisoryEnrollments = enrollments.filter(e => e.activityId === act.id);
                          const count = advisoryEnrollments.length;
                          const totalSessions = advisoryEnrollments.reduce((acc, e) => acc + (e.sessionLogs?.length || 0), 0);
                          return (
                              <div key={act.id} onClick={() => handleAdvisorNavigate(act)} className="group bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-3"><span className="text-[9px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase">Programa Anual</span></div>
                                  <h4 className="font-bold text-slate-800 text-lg mb-4 pr-16 line-clamp-2 h-14 group-hover:text-blue-700">{act.name}</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-100 group-hover:bg-blue-50/50 transition-colors">
                                          <span className="block text-xl font-bold text-blue-700">{count}</span>
                                          <span className="text-[9px] font-black text-slate-400 uppercase">Expedientes</span>
                                      </div>
                                      <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-100 group-hover:bg-blue-50/50 transition-colors">
                                          <span className="block text-xl font-bold text-blue-700">{totalSessions}</span>
                                          <span className="text-[9px] font-black text-slate-400 uppercase">Sesiones</span>
                                      </div>
                                  </div>
                                  <div className="mt-6 pt-4 border-t border-slate-50 flex justify-end">
                                      <span className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">Ver Bitácoras <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></span>
                                  </div>
                              </div>
                          );
                      })}
                      {offerActivities.filter(a => a.category === 'ADVISORY' && a.year === selectedYear).length === 0 && (
                          <div className="col-span-full py-12 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed">No hay expedientes de asesoría activos para el periodo {selectedYear}.</div>
                      )}
                  </div>
              </div>

              {/* CATÁLOGO HISTÓRICO AL FINAL PARA ADMIN */}
              <div className="pt-8 border-t-2 border-slate-100">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                      <h3 className="text-xl font-bold text-slate-400 flex items-center gap-2">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Consultar Catálogo Histórico (Archivados)
                      </h3>
                      <div className="flex items-center gap-2">
                          <label htmlFor="year-selector" className="text-xs font-bold text-slate-500 uppercase">Seleccionar Año:</label>
                          <select 
                              id="year-selector"
                              value={catalogYear} 
                              onChange={e => setCatalogYear(Number(e.target.value))}
                              className="px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm font-bold bg-white"
                          >
                              {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                          </select>
                      </div>
                  </div>
                  
                  {catalogActivitiesForAdmin.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 opacity-75 hover:opacity-100 transition-opacity">
                          {catalogActivitiesForAdmin.map(act => (
                              <div key={act.id} onClick={() => handleOpenEnrollModal(act)} className="bg-slate-100 border border-slate-200 rounded-xl p-4 cursor-pointer hover:bg-white hover:border-slate-400 transition-all group">
                                  <div className="flex justify-between mb-2">
                                      <span className="text-[8px] font-black uppercase text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">{act.category}</span>
                                      <span className="text-[8px] text-slate-400 font-mono">{act.internalCode}</span>
                                  </div>
                                  <h4 className="font-bold text-slate-600 text-sm line-clamp-1 group-hover:text-slate-800">{act.name}</h4>
                                  <p className="text-[10px] text-slate-400 mt-1">Cerrado en {formatDateCL(act.endDate)}</p>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="py-8 text-center text-slate-400 text-sm">No se encontraron registros para el año {catalogYear}.</div>
                  )}
              </div>
          </div>
      )}

      {/* ========================================================= */}
      {/* VISTA ASESOR: PANEL DE SEGUIMIENTO (Sin cambios por prompt) */}
      {/* ========================================================= */}
      {user.systemRole === UserRole.ASESOR && advisorKpis ? (
          <div className="space-y-12">
              
              {/* Indicadores Clave Section */}
              <div>
                  <h3 className="text-lg font-bold text-slate-600 flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                      Indicadores Clave de Gestión ({selectedYear})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {/* 1. Tasa Aprobación */}
                      <KpiCardCompact 
                        title="Tasa Aprobación" 
                        value={advisorKpis.tasaAprobacion} 
                        suffix="%" 
                        colorClass="text-emerald-600" 
                        tooltipContent={
                            advisorKpis.detallesTasa.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesTasa.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className="font-bold text-emerald-600">{c.pct}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "No hay datos de aprobación para el periodo."
                        }
                      />

                      {/* 2. Alumnos Riesgo (FIXED TOOLTIP STYLE) */}
                      <KpiCardCompact 
                        title="Alumnos en Riesgo" 
                        value={advisorKpis.totalEstudiantesRiesgo} 
                        colorClass="text-amber-600" 
                        tooltipContent={
                            advisorKpis.detallesEstudiantesRiesgo.length > 0 ? (
                                <div className="space-y-2">
                                    {advisorKpis.detallesEstudiantesRiesgo.map((item, i) => (
                                        <div key={i} className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                                            <div className="font-bold text-[10px] text-slate-800 leading-tight mb-0.5">{item.name}</div>
                                            <div className="text-[9px] text-slate-500 mb-1 leading-tight break-words">{item.course}</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Causa: {item.reason}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : "Sin estudiantes en situación de riesgo crítico."
                        }
                      />

                      {/* 3. Avance Notas */}
                      <KpiCardCompact 
                        title="Avance Notas" 
                        value={advisorKpis.avanceCalificaciones} 
                        suffix="%" 
                        colorClass="text-indigo-600" 
                        tooltipContent={
                            advisorKpis.detallesAvance.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesAvance.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className={`font-bold ${c.pct < 50 ? 'text-red-600' : 'text-indigo-600'}`}>{c.pct}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Inicie el registro de notas para ver avances."
                        }
                      />

                      {/* 4. Asistencia Media */}
                      <KpiCardCompact 
                        title="Asistencia Media" 
                        value={advisorKpis.asistenciaPromedio} 
                        suffix="%" 
                        colorClass="text-blue-600" 
                        tooltipContent={
                            advisorKpis.detallesAsistencia.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesAsistencia.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className={`font-bold ${c.avg < 75 ? 'text-red-600' : 'text-blue-600'}`}>{c.avg}%</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "Registre asistencias para calcular la media."
                        }
                      />

                      {/* 5. Cursos Críticos */}
                      <KpiCardCompact 
                        title="Cursos Críticos" 
                        value={advisorKpis.cursosCriticos} 
                        colorClass="text-red-600" 
                        tooltipContent={
                            advisorKpis.detallesCursosCriticos.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesCursosCriticos.map((c, i) => (
                                        <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate flex-1">{c.name}</span>
                                            <span className="font-bold text-red-600">{c.count} alumnos</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "No hay cursos por debajo del quórum mínimo (5)."
                        }
                      />

                      {/* 6. Cursos Finalizados (FIXED LOGIC) */}
                      <KpiCardCompact 
                        title="Finalizados" 
                        value={advisorKpis.cursosFinalizados} 
                        colorClass="text-purple-600" 
                        tooltipContent={
                            advisorKpis.detallesCursosFinalizados.length > 0 ? (
                                <ul className="text-[10px] space-y-1.5">
                                    {advisorKpis.detallesCursosFinalizados.map((c, i) => (
                                        <li key={i} className="flex flex-col border-b border-slate-100 pb-1 last:border-0">
                                            <span className="truncate text-slate-700 font-medium break-words leading-tight">{c.name}</span>
                                            <span className="text-[8px] text-slate-400 uppercase">Cerrado el {formatDateCL(c.date)}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : "No se registran cierres de cursos en esta fecha."
                        }
                      />
                  </div>
              </div>

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
                                      <th className="px-6 py-4 min-w-[320px]">Curso Académico</th>
                                      <th className="px-6 py-4 whitespace-nowrap min-w-[120px]">Periodo</th>
                                      <th className="px-6 py-4">Matrícula</th>
                                      <th className="px-6 py-4">Avance Notas</th>
                                      <th className="px-6 py-4 text-center">Acción</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {sortedAdvisorAcademicActivities.map(act => {
                                      const { count, progress } = getCourseMetrics(act.id, act.evaluationCount);
                                      return (
                                          <tr key={act.id} className="hover:bg-indigo-50/30 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-slate-800 break-words leading-tight max-w-sm">{act.name}</div>
                                                  <div className="text-xs text-slate-500 font-mono mt-1">{act.internalCode || act.id}</div>
                                              </td>
                                              <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                                                  <span className="bg-slate-100 px-2 py-1 rounded font-bold">{act.year} - {act.version}</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-black border border-indigo-200 flex items-center justify-center gap-1.5 w-fit">
                                                      {count}
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                      </svg>
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
                                  {sortedAdvisorAcademicActivities.length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay cursos académicos asignados para el año {selectedYear}.
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
                                  {offerActivities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).map(act => {
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
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
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
                                  {offerActivities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay actividades de extensión registradas para el año {selectedYear}.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

              {/* SECCIÓN 3: POSTÍTULOS (NEW) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-purple-200 pb-4">
                      <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      Programas de Postítulo y Diplomados
                  </h3>
                  
                  <div className="bg-white border border-purple-100 rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-purple-50 text-purple-800 font-bold border-b border-purple-100">
                                  <tr>
                                      <th className="px-6 py-4">Programa</th>
                                      <th className="px-6 py-4">Tipo / Versión</th>
                                      <th className="px-6 py-4">Módulos</th>
                                      <th className="px-6 py-4">Matrícula</th>
                                      <th className="px-6 py-4 text-center">Acción</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {offerActivities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).map(act => {
                                      const count = enrollments.filter(e => e.activityId === act.id).length;
                                      return (
                                          <tr key={act.id} className="hover:bg-purple-50/30 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-slate-800">{act.name}</div>
                                                  <div className="text-xs text-slate-500 font-mono">{act.id}</div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex flex-col">
                                                      <span className="text-xs font-bold text-purple-700">{act.programConfig?.programType || 'Postítulo'}</span>
                                                      <span className="text-xs text-slate-500">{act.version}</span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-200">
                                                      {act.programConfig?.modules?.length || 0} Módulos
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                      <span className="font-bold text-slate-700">{count}</span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-center">
                                                  <button 
                                                      onClick={() => handleAdvisorNavigate(act)}
                                                      className="text-purple-600 hover:text-white hover:bg-purple-600 font-bold text-xs bg-purple-50 border border-purple-200 px-4 py-2 rounded-lg transition-colors shadow-sm"
                                                  >
                                                      Gestionar
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {offerActivities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay programas de postítulo activos para el año {selectedYear}.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

              {/* SECCIÓN 4: ASESORÍAS (NEW) */}
              <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-blue-200 pb-4">
                      <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      Asesorías y Acompañamiento
                  </h3>
                  
                  <div className="bg-white border border-blue-100 rounded-xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-blue-50 text-blue-800 font-bold border-b border-blue-100">
                                  <tr>
                                      <th className="px-6 py-4">Programa</th>
                                      <th className="px-6 py-4">Periodo</th>
                                      <th className="px-6 py-4">Docentes en Acompañamiento</th>
                                      <th className="px-6 py-4">Sesiones Realizadas</th>
                                      <th className="px-6 py-4 text-center">Acción</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {offerActivities.filter(a => a.category === 'ADVISORY' && a.year === selectedYear).map(act => {
                                      const advisoryEnrollments = enrollments.filter(e => e.activityId === act.id);
                                      const count = advisoryEnrollments.length;
                                      const totalSessions = advisoryEnrollments.reduce((acc, e) => acc + (e.sessionLogs?.length || 0), 0);
                                      
                                      return (
                                          <tr key={act.id} className="hover:bg-blue-50/30 transition-colors group">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-slate-800">{act.name}</div>
                                                  <div className="text-xs text-slate-500 font-mono">{act.internalCode || act.id}</div>
                                              </td>
                                              <td className="px-6 py-4 text-sm text-slate-600">
                                                  {act.year} - ANUAL
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">
                                                      {count} Expedientes
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2">
                                                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                      <span className="font-bold text-slate-700">{totalSessions} Sesiones</span>
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4 text-center">
                                                  <button 
                                                      onClick={() => handleAdvisorNavigate(act)}
                                                      className="text-blue-600 hover:text-white hover:bg-blue-600 font-bold text-xs bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg transition-colors shadow-sm"
                                                  >
                                                      Gestionar Bitácoras
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {offerActivities.filter(a => a.category === 'ADVISORY' && a.year === selectedYear).length === 0 && (
                                      <tr>
                                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                              No hay programas de asesoría activos para el año {selectedYear}.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>

          </div>
      ) : null }
      
      {/* MODAL DETALLES */}
      {showDetailModal && selectedEnrollmentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
                {(() => {
                    const act = activities.find(a => a.id === selectedEnrollmentDetail.activityId);
                    const isAdvisory = act?.category === 'ADVISORY';
                    return (
                        <>
                            <div className={`p-6 border-b flex justify-between items-start ${isAdvisory ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}><div><h3 className={`text-xl font-bold ${isAdvisory ? 'text-blue-800' : 'text-slate-800'}`}>{act?.name}</h3><p className="text-sm text-slate-500 mt-1">{act?.modality} • {act?.year}</p></div><button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none">&times;</button></div>
                            <div className="p-6">{isAdvisory ? (<div className="space-y-6"><div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center gap-4"><div className="p-3 bg-white rounded-full text-blue-600 shadow-sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg></div><div><h4 className="font-bold text-blue-900">Bitácora de Acompañamiento</h4><p className="text-sm text-blue-700">Historial de sesiones registradas con tu asesor.</p></div></div></div>) : (<div className="space-y-6"><div className="grid grid-cols-2 gap-4"><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center"><span className="block text-3xl font-bold text-slate-700">{selectedEnrollmentDetail.finalGrade || '-'}</span><span className="text-xs font-bold text-slate-400 uppercase">Nota Final</span></div><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center"><span className={`block text-3xl font-bold ${(selectedEnrollmentDetail.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-emerald-600'}`}>{selectedEnrollmentDetail.attendancePercentage || 0}%</span><span className="text-xs font-bold text-slate-400 uppercase">Asistencia</span></div></div></div>)}</div>
                        </>
                    );
                })()}
            </div>
        </div>
      )}

    </div>
  );
};
