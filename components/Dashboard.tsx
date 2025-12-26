import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity, UserRole, ActivityState } from '../types';
import { useData } from '../context/DataContext';
import { TabType } from './RoleNavbar';
import { DataExporter } from './DataExporter';
// @ts-ignore
import { jsPDF } from 'jspdf';
import { SmartSelect } from './SmartSelect';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { useReloadDirective } from '../hooks/useReloadDirective';

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
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
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
                                {hasAcademic && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-50'}`}></div>}
                                {hasGeneral && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-teal-200' : 'bg-teal-500'}`}></div>}
                                {hasPostgraduate && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                            </div>

                            {/* Tooltip */}
                            {dayActs.length > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded z-20 shadow-xl pointer-events-none text-left">
                                    {dayActs.map(a => (
                                        <div key={a.id} className="mb-1 last:mb-0 border-b border-slate-600 last:pb-1">
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
            className="text-center px-2 py-3 bg-white rounded-xl border border-slate-200 shadow-sm relative group cursor-help transition-all hover:border-[#647FBC]/30"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span className={`block text-xl font-bold ${colorClass}`}>{value}<span className="text-base">{suffix}</span></span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight leading-none h-6 flex items-center justify-center">{title}</span>
            
            {isHovered && tooltipContent && (
                <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white text-left p-0 rounded-xl shadow-2xl animate-fadeIn border border-indigo-200 overflow-hidden">
                    <div className="text-[10px] font-black text-indigo-700 bg-indigo-50 uppercase border-b border-indigo-100 p-3 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {title}
                    </div>
                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar p-3 space-y-2 overflow-x-hidden text-slate-600">
                        {tooltipContent}
                    </div>
                    <div className="absolute -top-2 left-0 w-full h-2 bg-transparent"></div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-white"></div>
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
  const { activities, users, enrollments, config } = useData();
  const { isSyncing, executeReload } = useReloadDirective(); 

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    executeReload();
  }, [selectedYear, executeReload]);

  const sortedDashboardCourses = useMemo(() => {
    return activities
      .filter(a => a.category === 'ACADEMIC' && a.year === selectedYear)
      .sort((a, b) => {
        const periodA = a.academicPeriod || '';
        const periodB = b.academicPeriod || '';
        const isSecondA = periodA.endsWith('-2') || periodA.toLowerCase().includes('2do') || periodA.toLowerCase().includes('segundo');
        const isSecondB = periodB.endsWith('-2') || periodB.toLowerCase().includes('2do') || periodB.toLowerCase().includes('segundo');
        if (isSecondA && !isSecondB) return -1;
        if (!isSecondA && isSecondB) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [activities, selectedYear]);

  const activeCoursesCount = activities.filter(a => a.category === 'ACADEMIC' && a.year === selectedYear).length;
  const activeGeneralCount = activities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).length;
  const activePostgraduateCount = activities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).length;
  
  const yearEnrollments = enrollments.filter(e => {
      const act = activities.find(a => a.id === e.activityId);
      return act && act.year === selectedYear;
  });

  const totalEnrollmentsPeriod = yearEnrollments.length;
  const totalApprovedPeriod = yearEnrollments.filter(e => e.state === ActivityState.APROBADO).length;

  const totalConsolidatedPeriod = useMemo(() => {
    return yearEnrollments.filter(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        if (!act) return false;
        if ((act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') && enr.state === ActivityState.APROBADO) return true;
        if (act.category === 'GENERAL') return true;
        if (act.category === 'ADVISORY') return true;
        return false;
    }).length;
  }, [yearEnrollments, activities]);

  const advisorKpis = useMemo(() => {
    if (user.systemRole === UserRole.ESTUDIANTE) return null;

    const minGrade = config.minPassingGrade || 4.0;
    const minAtt = config.minAttendancePercentage || 75;
    const now = new Date();
    const hoyStr = now.toISOString().split('T')[0];

    const yearAcademicActivities = activities.filter(a => a.year === selectedYear && (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE'));
    const academicEnrollments = enrollments.filter(e => yearAcademicActivities.some(a => a.id === e.activityId));
    
    const aprobados = academicEnrollments.filter(e => e.state === ActivityState.APROBADO).length;
    const tasaAprobacion = academicEnrollments.length > 0 ? Math.round((aprobados / academicEnrollments.length) * 100) : 0;
    
    const detallesAprobacion = yearAcademicActivities.map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id);
        const count = enrs.length;
        const approved = enrs.filter(e => e.state === ActivityState.APROBADO).length;
        return { name: act.name, pct: count > 0 ? Math.round((approved / count) * 100) : 0, approved, count };
    }).sort((a,b) => b.pct - a.pct).slice(0, 10);

    const estudiantesRiesgo: { name: string, course: string, reason: string }[] = [];
    academicEnrollments.forEach(e => {
        if (e.state === ActivityState.APROBADO) return;
        const activity = yearAcademicActivities.find(a => a.id === e.activityId);
        if (!activity) return;
        const expectedGrades = activity.evaluationCount || 1;
        const recordedGrades = (e.grades || []).filter(g => g !== undefined && g !== null && g > 0).length;
        const hasAllGrades = recordedGrades >= expectedGrades;
        const isFailingGrade = e.finalGrade !== undefined && e.finalGrade < minGrade && e.finalGrade > 0;
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

    let totalSlots = 0;
    let filledSlots = 0;
    const avancePorCurso = yearAcademicActivities.map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id);
        let cTotal = enrs.length * (act.evaluationCount || 1);
        let cFilled = enrs.reduce((acc, e) => acc + (e.grades?.filter(g => g > 0).length || 0), 0);
        totalSlots += cTotal;
        filledSlots += cFilled;
        return { name: act.name, pct: cTotal > 0 ? Math.round((cFilled / cTotal) * 100) : 0, filled: cFilled, total: cTotal };
    }).sort((a,b) => a.pct - b.pct).slice(0, 10);

    const avanceCalificaciones = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    const enrollmentsWithAttendance = academicEnrollments.filter(e => typeof e.attendancePercentage === 'number' && e.attendancePercentage > 0);
    const asistenciaPromedio = enrollmentsWithAttendance.length > 0 ? Math.round(enrollmentsWithAttendance.reduce((acc, e) => acc + (e.attendancePercentage || 0), 0) / enrollmentsWithAttendance.length) : 0;
    
    const asistenciaPorCurso = yearAcademicActivities.map(act => {
        const enrs = academicEnrollments.filter(e => e.activityId === act.id && typeof e.attendancePercentage === 'number' && e.attendancePercentage > 0);
        const avg = enrs.length > 0 ? Math.round(enrs.reduce((acc, e) => acc + (e.attendancePercentage || 0), 0) / enrs.length) : 0;
        return { name: act.name, avg };
    }).filter(a => a.avg > 0).sort((a,b) => a.avg - a.avg).slice(0, 10);

    const cursosCriticosList = yearAcademicActivities.map(a => {
        const count = academicEnrollments.filter(e => e.activityId === a.id).length;
        return { name: a.name, count };
    }).filter(c => c.count < 5).sort((a,b) => a.count - b.count);
    
    const finalizadosList = yearAcademicActivities.map(a => {
        if (a.endDate && a.endDate < hoyStr) return { name: a.name, date: a.endDate, finished: true };
        if (!a.endDate && (a.year || 0) < new Date().getFullYear()) return { name: a.name, date: `${a.year}-12-31`, finished: true };
        return { name: a.name, date: a.endDate || '', finished: false };
    }).filter(item => item.finished);

    return {
        tasaAprobacion,
        detallesTasa: detallesAprobacion,
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

  const handleAdvisorNavigate = (act: Activity, targetTab: 'enrollment' | 'tracking' = 'tracking') => {
      if (act.category === 'GENERAL') {
          localStorage.setItem('jumpto_activity_id', act.id);
          onNavigate('generalActivities');
      } else if (act.category === 'POSTGRADUATE') {
          localStorage.setItem('jumpto_postgrad_id', act.id);
          onNavigate('postgraduate');
      } else {
          localStorage.setItem('jumpto_course_id', act.id);
          localStorage.setItem('jumpto_tab_course', targetTab); 
          onNavigate('courses');
      }
  };

  const getCourseMetrics = (actId: string, evaluationCount: number = 3) => {
      const enrolled = enrollments.filter(e => e.activityId === actId);
      const count = enrolled.length;
      let totalSlots = count * (evaluationCount || 1);
      if (totalSlots === 0) totalSlots = 1;
      let filledSlots = 0;
      enrolled.forEach(e => {
          if (e.grades && e.grades.length > 0) {
              filledSlots += e.grades.filter(g => g > 0).length;
          }
      });
      return { count, progress: Math.round((filledSlots / totalSlots) * 100) };
  };

  const getPostgradMetrics = (act: Activity) => {
      const enrolled = enrollments.filter(e => e.activityId === act.id);
      const count = enrolled.length;
      const totalEvalCount = act.programConfig?.modules?.reduce((acc, m) => acc + (m.evaluationCount || 0), 0) || 0;
      
      let totalSlots = count * totalEvalCount;
      if (totalSlots === 0) return { count, progress: 0 };
      
      let filledSlots = 0;
      enrolled.forEach(e => {
          if (e.grades && e.grades.length > 0) {
              filledSlots += e.grades.filter(g => g > 0).length;
          }
      });
      
      return { count, progress: Math.min(100, Math.round((filledSlots / totalSlots) * 100)) };
  };

  return (
    <div className="animate-fadeIn space-y-8">
      
      {/* Welcome Section */}
      <div className="bg-white rounded-xl p-8 pr-10 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#647FBC]/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="relative z-10 flex-1">
              <h1 className="text-3xl font-bold text-slate-800">Hola, {user.names}</h1>
              <p className="text-slate-500 mt-1 text-lg">Panel de Gestión Académica SMEAD.</p>
              
              <div className="flex gap-2 mt-6 items-center">
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
                            
                            <div className="h-4 w-px bg-slate-200 mx-2"></div>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></div>
                                <span className="text-[8px] font-black uppercase text-slate-400">{isSyncing ? 'Sincronizando' : 'Actualizado'}</span>
                            </div>
                        </div>
                  )}
              </div>
          </div>

          <div className="flex flex-wrap md:flex-nowrap justify-center md:justify-end gap-2 relative z-10 mr-2">
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-[#647FBC]">{activeCoursesCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Cursos UAD</span>
             </div>
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-purple-600">{activePostgraduateCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Postítulos</span>
             </div>
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-teal-600">{activeGeneralCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Extensión</span>
             </div>
             
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-indigo-600 rounded-xl border border-indigo-700 shadow-md min-w-[100px] transform hover:scale-105 transition-transform">
                  <span className="block text-2xl font-black text-white">{totalConsolidatedPeriod}</span>
                  <span className="text-[9px] font-black text-indigo-100 uppercase tracking-wide whitespace-nowrap">Consolidado</span>
             </div>

             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-slate-800">{totalEnrollmentsPeriod}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Inscritos</span>
             </div>
          </div>
      </div>

      {(user.systemRole === UserRole.ASESOR || user.systemRole === UserRole.ADMIN) && advisorKpis && (
          <div className="space-y-12 animate-fadeIn">
              
              <div>
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-600 flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                          Indicadores Clave de Gestión ({selectedYear})
                      </h3>
                      {isSyncing && <span className="text-[10px] font-black text-indigo-500 animate-pulse uppercase tracking-widest">Calculando KPIs en tiempo real...</span>}
                  </div>

                  <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3`}>
                      <KpiCardCompact 
                        title="Tasa Aprobación" 
                        value={advisorKpis.tasaAprobacion} 
                        suffix="%" 
                        colorClass="text-emerald-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Rendimiento en Cursos Curriculares (Abiertos/Cerrados)</p>
                                {advisorKpis.detallesTasa.length > 0 ? (
                                    <ul className="text-[10px] space-y-1.5">
                                        {advisorKpis.detallesTasa.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                                <span className="truncate flex-1 font-medium text-slate-700">{c.name}</span>
                                                <span className="font-black text-emerald-600 whitespace-nowrap">{c.approved}/{c.count} ({c.pct}%)</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : "Sin datos en el período."}
                            </div>
                        }
                      />

                      <KpiCardCompact 
                        title="Alumnos en Riesgo" 
                        value={advisorKpis.totalEstudiantesRiesgo} 
                        colorClass="text-amber-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Alertas Académicas Vigentes</p>
                                {advisorKpis.detallesEstudiantesRiesgo.length > 0 ? (
                                    <div className="space-y-2">
                                        {advisorKpis.detallesEstudiantesRiesgo.map((item, i) => (
                                            <div key={i} className="bg-slate-50 p-2 rounded border border-slate-200">
                                                <div className="font-bold text-[10px] text-slate-800 leading-tight mb-0.5">{item.name}</div>
                                                <div className="text-[9px] text-slate-500 mb-1 leading-tight">{item.course}</div>
                                                <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Causa: {item.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : "Sin riesgos detectados en el período."}
                            </div>
                        }
                      />

                      <KpiCardCompact 
                        title="Avance Notas" 
                        value={advisorKpis.avanceCalificaciones} 
                        suffix="%" 
                        colorClass="text-indigo-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Carga de Calificaciones por Programa</p>
                                {advisorKpis.detallesAvance.length > 0 ? (
                                    <ul className="text-[10px] space-y-1.5">
                                        {advisorKpis.detallesAvance.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                                <span className="truncate flex-1 font-medium text-slate-700">{c.name}</span>
                                                <span className={`font-black whitespace-nowrap ${c.pct < 50 ? 'text-red-600' : 'text-indigo-600'}`}>{c.filled}/{c.total} ({c.pct}%)</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : "Sin registros de notas."}
                            </div>
                        }
                      />

                      <KpiCardCompact 
                        title="Asistencia Media" 
                        value={advisorKpis.asistenciaPromedio} 
                        suffix="%" 
                        colorClass="text-blue-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Participación Real Promediada</p>
                                {advisorKpis.detallesAsistencia.length > 0 ? (
                                    <ul className="text-[10px] space-y-1.5">
                                        {advisorKpis.detallesAsistencia.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                                <span className="truncate flex-1 font-medium text-slate-700">{c.name}</span>
                                                <span className="font-black text-blue-600">{c.avg}%</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : "Sin datos de asistencia."}
                            </div>
                        }
                      />

                      <KpiCardCompact 
                        title="Cursos Críticos" 
                        value={advisorKpis.cursosCriticos} 
                        colorClass="text-red-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Cursos Curriculares con Inscripción &lt; 5</p>
                                {advisorKpis.detallesCursosCriticos.length > 0 ? (
                                    <ul className="text-[10px] space-y-1.5">
                                        {advisorKpis.detallesCursosCriticos.map((c, i) => (
                                            <li key={i} className="flex justify-between items-center gap-2 border-b border-slate-100 pb-1 last:border-0">
                                                <span className="truncate flex-1 font-medium text-slate-700">{c.name}</span>
                                                <span className="font-black text-red-600">{c.count} alumnos</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : "Todos los cursos tienen quórum suficiente."}
                            </div>
                        }
                      />

                      <KpiCardCompact 
                        title="Finalizados" 
                        value={advisorKpis.cursosFinalizados} 
                        colorClass="text-purple-600" 
                        tooltipContent={
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-tight">Cierres de Período Académico</p>
                                {advisorKpis.detallesCursosFinalizados.length > 0 ? (
                                    <ul className="text-[10px] space-y-1.5">
                                        {advisorKpis.detallesCursosFinalizados.map((c, i) => (
                                            <li key={i} className="flex flex-col border-b border-slate-100 pb-1 last:border-0">
                                                <span className="truncate text-slate-700 font-bold leading-tight">{c.name}</span>
                                                <span className="text-[8px] text-slate-400 uppercase font-mono">Concluyó: {formatDateCL(c.date)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : "No hay cierres detectados."}
                            </div>
                        }
                      />

                      {(user.systemRole === UserRole.ASESOR || user.systemRole === UserRole.ADMIN) && (
                        <KpiCardCompact 
                            title="Total Aprobados" 
                            value={totalApprovedPeriod} 
                            colorClass="text-emerald-700" 
                            tooltipContent={
                                <p className="text-[10px] text-slate-500">Número consolidado de estudiantes que han completado satisfactoriamente sus programas en el período {selectedYear}.</p>
                            }
                        />
                      )}
                  </div>
              </div>

              <div className="space-y-10">
                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-indigo-200 pb-4">
                          <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          Cursos Curriculares (Seguimiento {selectedYear})
                      </h3>
                      
                      <div className="bg-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden">
                          <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-indigo-50 text-indigo-800 font-bold border-b border-indigo-100">
                                      <tr>
                                          <th className="px-6 py-4 min-w-[320px]">Curso Académico</th>
                                          <th className="px-6 py-4">Matrícula</th>
                                          <th className="px-6 py-4">Avance Notas</th>
                                          <th className="px-6 py-4 text-center">Acción</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {sortedDashboardCourses.map(act => {
                                          const { count, progress } = getCourseMetrics(act.id, act.evaluationCount);
                                          const hoy = new Date().toISOString().split('T')[0];
                                          const isFinished = act.endDate ? (act.endDate < hoy) : ((act.year || 0) < new Date().getFullYear());
                                          const isSecondSemester = act.academicPeriod?.endsWith("-2") || act.academicPeriod?.toLowerCase().includes("2do") || act.academicPeriod?.toLowerCase().includes("segundo");
                                          return (
                                              <tr key={act.id} className={`transition-colors group ${isSecondSemester ? 'bg-indigo-50/40 hover:bg-indigo-100/50' : 'bg-white hover:bg-slate-50'} border-l-4 ${!isFinished ? 'border-emerald-500' : 'border-transparent opacity-80'}`}>
                                                  <td className="px-6 py-4">
                                                      <div className={`font-bold break-words leading-tight max-w-sm ${isFinished ? 'text-slate-400 font-medium' : 'text-emerald-700'}`}>{act.name}</div>
                                                      <div className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{act.internalCode || act.id} | {act.academicPeriod}</div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <span className={`px-3 py-1.5 rounded-full text-xs font-black border flex items-center justify-center gap-2 w-fit ${isFinished ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                                          {isFinished ? (
                                                              <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Curso Cerrado"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                          ) : (
                                                              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Curso Abierto"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                                          )}
                                                          {count}
                                                      </span>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <div className="flex items-center gap-3">
                                                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                                              <div className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                                                          </div>
                                                          <span className="text-xs font-bold text-slate-600 w-10 text-right">{progress}%</span>
                                                      </div>
                                                  </td>
                                                  <td className="px-6 py-4 text-center">
                                                      <div className="flex items-center justify-center gap-2">
                                                          <button onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act, 'enrollment'); }} className="text-emerald-600 hover:text-white hover:bg-emerald-600 font-bold text-xs bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg transition-colors shadow-sm">Matricular</button>
                                                          <button onClick={(e) => { e.stopPropagation(); handleAdvisorNavigate(act, 'tracking'); }} className="text-indigo-600 hover:text-white hover:bg-indigo-600 font-bold text-xs bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg transition-colors shadow-sm">Notas</button>
                                                      </div>
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>

                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-purple-200 pb-4">
                          <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          Diplomados y Postítulos ({selectedYear})
                      </h3>
                      
                      <div className="bg-white border border-purple-100 rounded-xl shadow-sm overflow-hidden">
                          <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-purple-50 text-purple-800 font-bold border-b border-purple-100">
                                      <tr>
                                          <th className="px-6 py-4">Programa</th>
                                          <th className="px-6 py-4">Matrícula</th>
                                          <th className="px-6 py-4">Avance Notas</th>
                                          <th className="px-6 py-4">Módulos</th>
                                          <th className="px-6 py-4 text-center">Gestión</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {activities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear).map(act => {
                                          const { count, progress } = getPostgradMetrics(act);
                                          return (
                                              <tr key={act.id} className="hover:bg-purple-50/30 transition-colors group">
                                                  <td className="px-6 py-4">
                                                      <div className="font-bold text-slate-800">{act.name}</div>
                                                      <div className="text-xs text-slate-500 font-mono">{act.internalCode || act.id}</div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full text-xs font-black border border-purple-200">
                                                          {count} Docentes
                                                      </span>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <div className="flex items-center gap-3">
                                                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 min-w-[100px]">
                                                              <div className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${progress}%` }}></div>
                                                          </div>
                                                          <span className="text-xs font-bold text-slate-600 w-10 text-right">{progress}%</span>
                                                      </div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <div className="flex items-center gap-2">
                                                          <span className="font-bold text-slate-700">{act.programConfig?.modules?.length || 0}</span>
                                                      </div>
                                                  </td>
                                                  <td className="px-6 py-4 text-center">
                                                      <button onClick={() => handleAdvisorNavigate(act)} className="text-purple-600 hover:text-white hover:bg-purple-600 font-bold text-xs bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg transition-colors">Ver Detalles</button>
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>

                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6 border-b border-teal-200 pb-4">
                          <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                          Actividades de Extensión y Vinculación ({selectedYear})
                      </h3>
                      
                      <div className="bg-white border border-teal-100 rounded-xl shadow-sm overflow-hidden">
                          <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-teal-50 text-teal-800 font-bold border-b border-teal-100">
                                      <tr>
                                          <th className="px-6 py-4">Actividad / Evento</th>
                                          <th className="px-6 py-4">Inscritos</th>
                                          <th className="px-6 py-4">Modalidad</th>
                                          <th className="px-6 py-4 text-center">Gestión</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {activities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).map(act => {
                                          const count = enrollments.filter(e => e.activityId === act.id).length;
                                          return (
                                              <tr key={act.id} className="hover:bg-teal-50/30 transition-colors group">
                                                  <td className="px-6 py-4">
                                                      <div className="font-bold text-slate-800">{act.name}</div>
                                                      <div className="text-xs text-slate-500">{act.activityType} | {formatDateCL(act.startDate)}</div>
                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <span className="bg-teal-100 text-teal-700 px-3 py-1.5 rounded-full text-xs font-black border border-teal-200 flex items-center gap-1.5 w-fit">
                                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                          {count}
                                                      </span>
                                                  </td>
                                                  <td className="px-6 py-4 font-medium text-slate-600">{act.modality}</td>
                                                  <td className="px-6 py-4 text-center">
                                                      <button onClick={() => handleAdvisorNavigate(act)} className="text-teal-600 hover:text-white hover:bg-teal-600 font-bold text-xs bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg transition-colors">Gestionar</button>
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                      {activities.filter(a => a.category === 'GENERAL' && a.year === selectedYear).length === 0 && (
                                          <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No hay actividades registradas en este período.</td></tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {user.systemRole === UserRole.ESTUDIANTE && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
              <div className="lg:col-span-2 space-y-8">
                  <div className="bg-gradient-to-r from-[#647FBC] to-indigo-600 rounded-2xl p-8 shadow-md text-center text-white">
                      <h2 className="text-2xl font-bold mb-2">Consulta tus Resultados Académicos</h2>
                      <p className="text-blue-100 max-w-2xl mx-auto mb-6 font-medium text-sm">Ingresa tu RUT para revisar el estado de tus cursos, asistencia y calificaciones en tiempo real.</p>
                      <div className="max-w-md mx-auto bg-white/10 p-2 rounded-xl border border-white/20 flex gap-2 backdrop-blur-sm">
                          <input type="text" placeholder="Ingresa tu RUT (ej: 12345678-9)" value={kioskRut} onChange={(e) => setKioskRut(e.target.value)} className="flex-1 pl-4 py-2 rounded-lg border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white"/>
                          <button onClick={() => setActiveSearchRut(cleanRutFormat(kioskRut))} className="bg-white text-[#647FBC] px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors shadow-sm">Buscar</button>
                      </div>
                  </div>
                  
                  {activeSearchRut && (
                      <div className="border-t-4 border-[#647FBC] bg-white rounded-xl shadow-md p-6 relative animate-fadeIn">
                          <button onClick={() => { setActiveSearchRut(null); setKioskRut(''); }} className="absolute top-4 right-4 text-slate-400 hover:text-red-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">Resultados para: {activeSearchRut}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {enrollments.filter(e => e.rut === activeSearchRut).map(enr => {
                                  const act = activities.find(a => a.id === enr.activityId);
                                  return (
                                      <div key={enr.id} className="border border-slate-200 rounded-xl p-5 bg-slate-50 relative group">
                                          <div className="flex justify-between items-start mb-2">
                                              <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${enr.state === ActivityState.APROBADO ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{enr.state}</span>
                                          </div>
                                          <h4 className="font-bold text-slate-800 text-base mb-1 line-clamp-2 h-10">{act?.name}</h4>
                                          <button onClick={() => { setSelectedEnrollmentId(enr.id); setShowDetailModal(true); }} className="w-full text-xs bg-[#647FBC] text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-sm flex justify-center items-center gap-2 mt-4">Ver Detalles</button>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}
              </div>
              <div className="lg:col-span-1"><MiniCalendar activities={activities.filter(a => a.isPublic !== false)} /></div>
          </div>
      )}

      {showDetailModal && selectedEnrollmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
                {(() => {
                    const enr = enrollments.find(e => e.id === selectedEnrollmentId);
                    const act = activities.find(a => a.id === enr?.activityId);
                    return (
                        <>
                            <div className="p-6 border-b flex justify-between items-start bg-slate-50 border-slate-100"><div><h3 className="text-xl font-bold text-slate-800">{act?.name}</h3><p className="text-sm text-slate-500 mt-1">{act?.modality} • {act?.year}</p></div><button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none">&times;</button></div>
                            <div className="p-6"><div className="space-y-6"><div className="grid grid-cols-2 gap-4"><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center"><span className="block text-3xl font-bold text-slate-700">{enr?.finalGrade || '-'}</span><span className="text-xs font-bold text-slate-400 uppercase">Nota Final</span></div><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center"><span className={`block text-3xl font-bold ${(enr?.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-emerald-600'}`}>{enr?.attendancePercentage || 0}%</span><span className="text-xs font-bold text-slate-400 uppercase">Asistencia</span></div></div></div></div>
                        </>
                    );
                })()}
            </div>
        </div>
      )}
    </div>
  );
};