import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity, UserRole, ActivityState, Enrollment } from '../types';
import { useData } from '../context/DataContext';
import { TabType } from './RoleNavbar';
import { DashboardEstudiante } from './DashboardEstudiante';
import { useReloadDirective } from '../hooks/useReloadDirective';

// --- KPI CARD COMPONENT WITH TOOLTIP ---
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
            className="text-center px-2 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm relative group cursor-help transition-all hover:border-[#647FBC]/40 hover:shadow-md"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span className={`block text-2xl font-black tracking-tight ${colorClass}`}>{value}<span className="text-base font-bold">{suffix}</span></span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none h-6 flex items-center justify-center text-center px-1">{title}</span>
            
            {isHovered && tooltipContent && (
                <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-3 w-72 bg-white text-left p-0 rounded-2xl shadow-2xl animate-fadeIn border border-slate-200 overflow-hidden">
                    <div className="text-[10px] font-black text-white bg-[#647FBC] uppercase p-3 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Detalle: {title}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-4 space-y-2 text-slate-600 bg-[#F9F8F6]">
                        {tooltipContent}
                    </div>
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
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [showRetentionHelp, setShowRetentionHelp] = useState(false);

  // --- FUNCIÓN DE NAVEGACIÓN CON RESET DE SCROLL ---
  const handleNavigate = (tab: TabType) => {
    window.scrollTo(0, 0);
    onNavigate(tab);
  };

  // REDIRECCIÓN A VISTA INDEPENDIENTE DE ESTUDIANTE
  if (user.systemRole === UserRole.ESTUDIANTE) {
      return <DashboardEstudiante user={user} />;
  }

  // --- LÓGICA DE CÁLCULO PARA ASESORES ---
  const activeCourses = useMemo(() => 
    activities.filter(a => a.category === 'ACADEMIC' && a.year === selectedYear),
  [activities, selectedYear]);

  const postgraduateActs = useMemo(() => 
    activities.filter(a => a.category === 'POSTGRADUATE' && a.year === selectedYear),
  [activities, selectedYear]);

  const advisoryActs = useMemo(() => 
    activities.filter(a => a.category === 'ADVISORY' && a.year === selectedYear),
  [activities, selectedYear]);

  const yearEnrollments = useMemo(() => enrollments.filter(e => {
      const act = activities.find(a => a.id === e.activityId);
      return act && act.year === selectedYear;
  }), [enrollments, activities, selectedYear]);

  const totalConsolidated = useMemo(() => {
    return yearEnrollments.filter(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        if (!act) return false;
        return (act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') && enr.state === ActivityState.APROBADO || 
               act.category === 'GENERAL' || act.category === 'ADVISORY';
    }).length;
  }, [yearEnrollments, activities]);

  // --- ANALÍTICA DE RETENCIÓN ---
  const retentionAnalytics = useMemo(() => {
      const allRutsInSystem = Array.from(new Set(enrollments.map(e => e.rut)));
      const now = new Date();
      
      // 1. Tasa de Retención Año Actual vs Anterior
      const rutsCurrentYear = new Set(enrollments.filter(e => {
          const act = activities.find(a => a.id === e.activityId);
          return act?.year === selectedYear;
      }).map(e => e.rut));
      
      const rutsPrevYear = new Set(enrollments.filter(e => {
          const act = activities.find(a => a.id === e.activityId);
          return act?.year === selectedYear - 1;
      }).map(e => e.rut));

      let returnedCount = 0;
      rutsPrevYear.forEach(rut => {
          if (rutsCurrentYear.has(rut)) returnedCount++;
      });

      const retentionRate = rutsPrevYear.size > 0 ? Math.round((returnedCount / rutsPrevYear.size) * 100) : 0;

      // 2. Análisis de Deserción (Churn): Usuarios sin actividad en los últimos 12 meses
      const churnList = allRutsInSystem.filter(rut => {
          const userEnrollments = enrollments.filter(e => e.rut === rut);
          const latestActivityDate = userEnrollments.reduce((latest, e) => {
              const act = activities.find(a => a.id === e.activityId);
              const date = new Date(act?.endDate || act?.startDate || '2000-01-01');
              return date > latest ? date : latest;
          }, new Date('2000-01-01'));
          
          const diffMonths = (now.getTime() - latestActivityDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
          return diffMonths > 12;
      });

      // 3. Trayectoria de Crecimiento (Ejemplo de Evolución)
      let growthPathCount = 0;
      allRutsInSystem.forEach(rut => {
          const userEnrollments = enrollments.filter(e => e.rut === rut);
          const categories = new Set(userEnrollments.map(e => {
              const act = activities.find(a => a.id === e.activityId);
              return act?.category;
          }));
          // Si ha pasado por Extensión y luego por Académico/Postítulo
          if (categories.has('GENERAL') && (categories.has('ACADEMIC') || categories.has('POSTGRADUATE'))) {
              growthPathCount++;
          }
      });

      // 4. Consistencia Histórica (Horas por año promedio) - Cálculo de altura relativa para gráfico
      const historyYears = [selectedYear - 2, selectedYear - 1, selectedYear];
      const historyData = historyYears.map(year => {
          const yearHours = enrollments.reduce((acc, e) => {
              const act = activities.find(a => a.id === e.activityId);
              return act?.year === year ? acc + (act.hours || 0) : acc;
          }, 0);
          return { year, hours: yearHours };
      });

      const maxHistoryHours = Math.max(...historyData.map(d => d.hours), 100);

      return {
          retentionRate,
          churnCount: churnList.length,
          churnSample: churnList.slice(0, 5),
          growthPathCount,
          prevYearTotal: rutsPrevYear.size,
          returnedCount,
          historyData,
          maxHistoryHours
      };
  }, [enrollments, activities, selectedYear]);

  // CÁLCULO DE KPIS DE AUDITORÍA
  const advisorKpis = useMemo(() => {
    const academicEnrollments = yearEnrollments.filter(e => {
        const act = activities.find(a => a.id === e.activityId);
        return act && (act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE');
    });

    const totalInscritos = academicEnrollments.length;
    const aprobados = academicEnrollments.filter(e => e.state === ActivityState.APROBADO).length;
    
    const alumnosRiesgo = academicEnrollments.filter(e => {
        const hasGradesEntered = e.finalGrade && e.finalGrade > 0;
        const hasAttendanceEntered = e.attendancePercentage !== undefined && e.attendancePercentage > 0;
        if (!hasGradesEntered && !hasAttendanceEntered) return false;
        const isFailingGrade = hasGradesEntered && e.finalGrade < (config.minPassingGrade || 4.0);
        const isFailingAttendance = hasAttendanceEntered && e.attendancePercentage < (config.minAttendancePercentage || 75);
        return isFailingGrade || isFailingAttendance;
    });

    let totalGradesExpected = 0;
    let totalGradesEntered = 0;
    const allEvalActs = [...activeCourses, ...postgraduateActs];
    allEvalActs.forEach(act => {
        const enrs = enrollments.filter(e => e.activityId === act.id);
        const expectedPerStudent = act.evaluationCount || 3;
        totalGradesExpected += (enrs.length * expectedPerStudent);
        enrs.forEach(e => {
            totalGradesEntered += (e.grades?.filter(g => g > 0).length || 0);
        });
    });

    const activeEnrollmentsWithAtt = academicEnrollments.filter(e => (e.attendancePercentage || 0) > 0);
    const totalAttendanceSum = activeEnrollmentsWithAtt.reduce((acc, e) => acc + (e.attendancePercentage || 0), 0);
    const avgAttendance = activeEnrollmentsWithAtt.length > 0 ? Math.round(totalAttendanceSum / activeEnrollmentsWithAtt.length) : 0;

    const criticos = allEvalActs.filter(act => {
        const count = enrollments.filter(e => e.activityId === act.id).length;
        return count > 0 && count < 5;
    });

    const finalizados = allEvalActs.filter(act => act.endDate && act.endDate < todayStr);

    return {
        tasaAprobacion: totalInscritos > 0 ? Math.round((aprobados / totalInscritos) * 100) : 0,
        totalEstudiantesRiesgo: alumnosRiesgo.length,
        riesgoList: alumnosRiesgo,
        avanceCalificaciones: totalGradesExpected > 0 ? Math.round((totalGradesEntered / totalGradesExpected) * 100) : 0,
        asistenciaPromedio: avgAttendance,
        cursosCriticos: criticos.length,
        criticosList: criticos,
        cursosFinalizados: finalizados.length,
        finalizadosList: finalizados
    };
  }, [yearEnrollments, activeCourses, postgraduateActs, enrollments, activities, config, todayStr]);

  // --- LÓGICA DE ORDENACIÓN: 2DO SEMESTRE ANTES QUE EL 1RO ---
  const getSemesterPriority = (period?: string) => {
      if (!period) return 3;
      if (period.endsWith('-2') || period.toLowerCase().includes('2do') || period.toLowerCase().includes('segundo')) return 0;
      if (period.endsWith('-1') || period.toLowerCase().includes('1er') || period.toLowerCase().includes('primero')) return 1;
      return 2;
  };

  const sortedDashboardCourses = useMemo(() => {
    return [...activeCourses].sort((a, b) => {
        const prioA = getSemesterPriority(a.academicPeriod);
        const prioB = getSemesterPriority(b.academicPeriod);
        if (prioA !== prioB) return prioA - prioB;
        return a.name.localeCompare(b.name);
    });
  }, [activeCourses]);

  const sortedPostgraduateDashboard = useMemo(() => {
    return [...postgraduateActs].sort((a, b) => {
        const prioA = getSemesterPriority(a.academicPeriod);
        const prioB = getSemesterPriority(b.academicPeriod);
        if (prioA !== prioB) return prioA - prioB;
        return a.name.localeCompare(b.name);
    });
  }, [postgraduateActs]);

  const sortedAdvisoryDashboard = useMemo(() => {
    return [...advisoryActs].sort((a, b) => {
        const prioA = getSemesterPriority(a.academicPeriod);
        const prioB = getSemesterPriority(b.academicPeriod);
        if (prioA !== prioB) return prioA - prioB;
        return a.name.localeCompare(b.name);
    });
  }, [advisoryActs]);

  return (
    <div className="animate-fadeIn space-y-10">
      
      {/* Header Administrador / Asesor */}
      <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#647FBC]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="relative z-10 flex-1">
              <div className="flex items-center gap-3 mb-2">
                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-full border border-indigo-100 uppercase tracking-widest">
                      Panel {user.systemRole}
                  </span>
                  {isSyncing && <span className="text-[10px] text-amber-500 font-bold animate-pulse uppercase tracking-tighter">Sincronizando...</span>}
              </div>
              <h1 className="text-4xl font-black text-slate-800 tracking-tight">Hola, {user.names}</h1>
              <p className="text-slate-500 mt-2 text-lg font-medium">Supervisión académica del periodo <span className="text-indigo-600 font-bold">{selectedYear}</span>.</p>
              
              <div className="flex gap-4 mt-8 items-center">
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
                  <button onClick={executeReload} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                      <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
              </div>
          </div>

          <div className="flex flex-wrap md:flex-nowrap justify-center md:justify-end gap-4 relative z-10">
             <div className="text-center px-6 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm min-w-[140px] flex flex-col justify-center">
                  <span className="block text-3xl font-black text-[#647FBC] tracking-tighter">{activeCourses.length + postgraduateActs.length}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Programas Activos</span>
             </div>
             <div className="text-center px-6 py-4 bg-[#647FBC] rounded-2xl border border-blue-700 shadow-xl min-w-[140px] flex flex-col justify-center transform hover:scale-105 transition-transform">
                  <span className="block text-3xl font-black text-white tracking-tighter">{totalConsolidated}</span>
                  <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest mt-1">Consolidado</span>
             </div>
          </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCardCompact 
            title="Tasa Aprobación" 
            value={advisorKpis.tasaAprobacion} 
            suffix="%" 
            colorClass="text-emerald-600"
            tooltipContent={<p className="text-xs leading-relaxed">Estudiantes que han cumplido con nota mínima y asistencia en el periodo {selectedYear}.</p>}
          />
          <KpiCardCompact 
            title="Alumnos en Riesgo" 
            value={advisorKpis.totalEstudiantesRiesgo} 
            colorClass="text-rose-600"
            tooltipContent={
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-rose-700 uppercase mb-2">Casos Críticos Detectados:</p>
                    {advisorKpis.riesgoList.length > 0 ? (
                        advisorKpis.riesgoList.slice(0, 5).map((enr, i) => {
                            const student = users.find(u => u.rut === enr.rut);
                            return <div key={i} className="text-[10px] bg-white p-2 rounded border border-rose-100 shadow-sm font-bold">• {student?.paternalSurname}, {student?.names} ({enr.finalGrade || 'Baja Asist.'})</div>
                        })
                    ) : (
                        <p className="text-[10px] text-slate-400 italic">No se detectan alumnos en riesgo con datos ingresados.</p>
                    )}
                </div>
            }
          />
          <KpiCardCompact title="Avance Notas" value={advisorKpis.avanceCalificaciones} suffix="%" colorClass="text-indigo-600" tooltipContent={<p className="text-xs leading-relaxed">Porcentaje de calificaciones registradas vs. el total esperado para todos los programas curriculares vigentes.</p>} />
          <KpiCardCompact title="Asistencia Prom." value={advisorKpis.asistenciaPromedio} suffix="%" colorClass="text-blue-600" tooltipContent={<p className="text-xs leading-relaxed">Promedio de asistencia de todos los alumnos que tienen al menos una sesión registrada.</p>} />
          <KpiCardCompact title="Cursos Críticos" value={advisorKpis.cursosCriticos} colorClass="text-amber-600" tooltipContent={<div className="space-y-2"><p className="text-[10px] font-bold text-amber-700 uppercase mb-2">Programas con baja matrícula (&lt; 5):</p>{advisorKpis.criticosList.map((act, i) => (<div key={i} className="text-[10px] bg-white p-2 rounded border border-amber-100 shadow-sm font-bold">• {act.name}</div>))}</div>} />
          <KpiCardCompact title="Finalizados" value={advisorKpis.cursosFinalizados} colorClass="text-slate-500" tooltipContent={<p className="text-xs leading-relaxed">Cantidad de actividades cuya fecha de término es anterior a hoy ({todayStr}).</p>} />
      </div>

      {/* --- MÓDULOS DE OPERACIÓN DIRECTA --- */}
      <section className="space-y-6">
          <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Módulos de Gestión SMEAD</h2>
              <span className="h-px flex-1 bg-slate-100"></span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CURSOS CURRICULARES */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => handleNavigate('courses')}>
                  <div className="w-14 h-14 bg-blue-50 text-[#647FBC] rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#647FBC] group-hover:text-white transition-colors duration-500 shadow-inner">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-1">Gestión Curricular</h3>
                  <p className="text-[10px] text-slate-500 leading-snug mb-4">Administración de cursos de pregrado, notas y certificados.</p>
                  <button className="mt-auto w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 group-hover:bg-[#647FBC] group-hover:text-white transition-all">Ingresar</button>
              </div>

              {/* POSTÍTULOS */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => handleNavigate('postgraduate')}>
                  <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-500 shadow-inner">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-1">Postítulos</h3>
                  <p className="text-[10px] text-slate-500 leading-snug mb-4">Control modular de programas avanzados y diplomados.</p>
                  <button className="mt-auto w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 group-hover:bg-purple-600 group-hover:text-white transition-all">Ingresar</button>
              </div>

              {/* ASESORÍAS */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => handleNavigate('advisory')}>
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-700 group-hover:text-white transition-colors duration-500 shadow-inner">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-1">Asesorías</h3>
                  <p className="text-[10px] text-slate-500 leading-snug mb-4">Bitácora individual con firma digital QR y control de horas.</p>
                  <button className="mt-auto w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 group-hover:bg-indigo-700 group-hover:text-white transition-all">Ingresar</button>
              </div>

              {/* RETENCIÓN ANALÍTICA */}
              <div 
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all p-6 flex flex-col items-center text-center group cursor-pointer" 
                  onClick={() => setShowRetentionModal(true)}
              >
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-500 shadow-inner">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 mb-1">Retención</h3>
                  <p className="text-[10px] text-slate-500 leading-snug mb-4">Análisis de fidelización y ciclo de vida docente.</p>
                  <button className="mt-auto w-full py-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">Analizar</button>
              </div>
          </div>
      </section>

      {/* TABLA DE CURSOS PARA GESTIÓN RÁPIDA */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-8">
          <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 text-[#647FBC] rounded-xl flex items-center justify-center shadow-inner">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </div>
                  Programas Curriculares ({selectedYear})
              </h3>
              <button 
                onClick={() => handleNavigate('courses')} 
                className="text-xs font-black uppercase tracking-widest text-[#647FBC] hover:underline flex items-center gap-2"
              >
                  Ver todos
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </button>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">
                      <tr>
                          <th className="px-6 py-4 w-[40%]">Asignatura</th>
                          <th className="px-6 py-4 w-[18%]">Relator / Encargado</th>
                          <th className="px-6 py-4 text-center w-[8%]">Matrícula</th>
                          <th className="px-6 py-4 text-center w-[19%]">Estado Acta</th>
                          <th className="px-6 py-4 text-center w-[15%]">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {sortedDashboardCourses.map(act => {
                          const count = enrollments.filter(e => e.activityId === act.id).length;
                          const gradesEntered = enrollments.filter(e => e.activityId === act.id && e.finalGrade && e.finalGrade > 0).length;
                          const progress = count > 0 ? (gradesEntered / count) * 100 : 0;
                          const isClosed = act.endDate && act.endDate < todayStr;
                          
                          // --- LÓGICA DE FONDO AZULADO PARA SEGUNDO SEMESTRE ---
                          const isSecondSemester = act.academicPeriod?.endsWith('-2') || act.academicPeriod?.toLowerCase().includes('2do') || act.academicPeriod?.toLowerCase().includes('segundo');

                          return (
                            <tr key={act.id} className={`hover:bg-slate-50/50 transition-colors group ${isSecondSemester ? 'bg-blue-50/50' : ''}`}>
                                <td className="px-6 py-4 overflow-hidden">
                                    <div className={`font-bold transition-colors truncate ${isClosed ? 'text-slate-400 font-medium' : 'text-emerald-600'}`} title={act.name}>
                                        {act.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{act.internalCode} • {act.academicPeriod}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className={`text-xs font-bold truncate ${isClosed ? 'text-slate-400' : 'text-slate-700'}`} title={act.relator || 'No Asignado'}>
                                        {act.relator || 'Sin Encargado'}
                                    </div>
                                    <div className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{act.modality}</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-black ${isClosed ? 'opacity-50' : ''}`}>{count}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className={`flex flex-col items-center ${isClosed ? 'opacity-50' : ''}`}>
                                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                            <div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <span className="text-[9px] font-black text-slate-400 mt-1 uppercase">{gradesEntered} de {count}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => { localStorage.setItem('jumpto_course_id', act.id); handleNavigate('courses'); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-[#647FBC] hover:text-white hover:border-[#647FBC] px-4 py-2 rounded-xl font-black uppercase text-[10px] transition-all shadow-sm">Gestionar</button>
                                </td>
                            </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>

      {/* LISTADO DE POSTÍTULOS */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-8">
          <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shadow-inner">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  </div>
                  Postítulos y Diplomados ({selectedYear})
              </h3>
              <button 
                onClick={() => handleNavigate('postgraduate')} 
                className="text-xs font-black uppercase tracking-widest text-purple-600 hover:underline flex items-center gap-2"
              >
                  Ver todos
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </button>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">
                      <tr>
                          <th className="px-6 py-4 w-[40%]">Programa</th>
                          <th className="px-6 py-4 w-[18%]">Director / Relator</th>
                          <th className="px-6 py-4 text-center w-[8%]">Matrícula</th>
                          <th className="px-6 py-4 text-center w-[19%]">Estado Acta</th>
                          <th className="px-6 py-4 text-center w-[15%]">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {sortedPostgraduateDashboard.map(act => {
                          const count = enrollments.filter(e => e.activityId === act.id).length;
                          const gradesEntered = enrollments.filter(e => e.activityId === act.id && e.finalGrade && e.finalGrade > 0).length;
                          const progress = count > 0 ? (gradesEntered / count) * 100 : 0;
                          const isClosed = act.endDate && act.endDate < todayStr;

                          return (
                            <tr key={act.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4 overflow-hidden">
                                    <div className={`font-bold transition-colors truncate ${isClosed ? 'text-slate-400 font-medium' : 'text-purple-600'}`} title={act.name}>
                                        {act.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{act.internalCode} • {act.academicPeriod}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className={`text-xs font-bold truncate ${isClosed ? 'text-slate-400' : 'text-slate-700'}`} title={act.relator || 'No Asignado'}>
                                        {act.relator || 'Sin Director'}
                                    </div>
                                    <div className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{act.modality}</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-black ${isClosed ? 'opacity-50' : ''}`}>{count}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className={`flex flex-col items-center ${isClosed ? 'opacity-50' : ''}`}>
                                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                            <div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <span className="text-[9px] font-black text-slate-400 mt-1 uppercase">{gradesEntered} de {count}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => { localStorage.setItem('jumpto_course_id', act.id); handleNavigate('postgraduate'); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-purple-600 hover:text-white hover:border-purple-600 px-4 py-2 rounded-xl font-black uppercase text-[10px] transition-all shadow-sm">Gestionar</button>
                                </td>
                            </tr>
                          );
                      })}
                      {sortedPostgraduateDashboard.length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic">No hay programas de postítulo registrados para este periodo.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* NUEVA CAJA: LISTADO DE ASESORÍAS */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-8">
          <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-700 rounded-xl flex items-center justify-center shadow-inner">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </div>
                  Asesorías y Acompañamiento ({selectedYear})
              </h3>
              <button 
                onClick={() => handleNavigate('advisory')} 
                className="text-xs font-black uppercase tracking-widest text-indigo-700 hover:underline flex items-center gap-2"
              >
                  Ver todos
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </button>
          </div>

          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">
                      <tr>
                          <th className="px-6 py-4 w-[40%]">Área / Acompañamiento</th>
                          <th className="px-6 py-4 w-[18%]">Responsable UAD</th>
                          <th className="px-6 py-4 text-center w-[12%]">Expedientes</th>
                          <th className="px-6 py-4 text-center w-[15%]">Atenciones</th>
                          <th className="px-6 py-4 text-center w-[15%]">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {sortedAdvisoryDashboard.map(act => {
                          const enrs = enrollments.filter(e => e.activityId === act.id);
                          const count = enrs.length;
                          const totalSessions = enrs.reduce((acc, e) => acc + (e.sessionLogs?.length || 0), 0);

                          return (
                            <tr key={act.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-6 py-4 overflow-hidden">
                                    <div className="font-bold text-slate-800 truncate" title={act.name}>
                                        {act.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{act.internalCode} • {act.academicPeriod}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-xs font-bold text-slate-700 truncate" title={act.relator || 'Asesoría Institucional'}>
                                        {act.relator || 'Asesoría Institucional'}
                                    </div>
                                    <div className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">{act.modality}</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-black">{count}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-sm font-black text-slate-700">{totalSessions}</span>
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Atenciones</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => handleNavigate('advisory')} className="bg-white border border-slate-200 text-slate-600 hover:bg-indigo-700 hover:text-white hover:border-indigo-700 px-4 py-2 rounded-xl font-black uppercase text-[10px] transition-all shadow-sm">Gestionar</button>
                                </td>
                            </tr>
                          );
                      })}
                      {sortedAdvisoryDashboard.length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic">No hay registros de asesoría para este periodo.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* --- MODAL DE RETENCIÓN ANALÍTICA --- */}
      {showRetentionModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fadeIn">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-emerald-200">
                  {/* Header Modal */}
                  <div className="p-8 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                      <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-1">
                              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Herramienta Analítica Estratégica</span>
                          </div>
                          <h3 className="text-3xl font-black tracking-tight leading-none uppercase">Auditoría de Retención y Fidelización</h3>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                          <button 
                            onClick={() => setShowRetentionHelp(!showRetentionHelp)}
                            className={`p-2 rounded-xl transition-all font-black uppercase text-[10px] tracking-widest border-2 flex items-center gap-2 ${showRetentionHelp ? 'bg-white text-emerald-600 border-white' : 'bg-emerald-500/20 text-white border-emerald-400/30 hover:bg-emerald-500/40'}`}
                          >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              Ayuda
                          </button>
                          <button onClick={() => { setShowRetentionModal(false); setShowRetentionHelp(false); }} className="text-white/60 hover:text-white text-4xl font-light transition-all active:scale-90">&times;</button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-10 bg-[#F9F8F6] custom-scrollbar relative">
                      
                      {/* OVERLAY DE AYUDA EXPLICATIVA - FONDO SUAVE ACTUALIZADO */}
                      {showRetentionHelp && (
                          <div className="absolute inset-0 z-50 bg-slate-50/98 backdrop-blur-md text-slate-800 p-10 overflow-y-auto custom-scrollbar animate-fadeIn border border-emerald-100">
                              <div className="max-w-4xl mx-auto space-y-8">
                                  <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                                      <h4 className="text-2xl font-black uppercase tracking-tight text-emerald-600">Guía de Análisis de Retención</h4>
                                      <button onClick={() => setShowRetentionHelp(false)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded-lg transition-all text-slate-600">
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                      <div className="space-y-4">
                                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                              <h5 className="font-bold text-emerald-600 text-sm uppercase mb-2">1. Tasa de Retención Anual</h5>
                                              <p className="text-xs text-slate-600 leading-relaxed">
                                                  <strong>Lógica:</strong> Identifica cuántos usuarios únicos (RUTs) que tuvieron al menos una inscripción en el año <span className="text-emerald-700 font-bold">{selectedYear - 1}</span> han vuelto a inscribirse en el año <span className="text-emerald-700 font-bold">{selectedYear}</span>.
                                                  <br/><br/>
                                                  <strong>Origen:</strong> Cruza la tabla <code className="text-indigo-600 bg-indigo-50 px-1 rounded">enrollments</code> con los filtros de año de <code className="text-indigo-600 bg-indigo-50 px-1 rounded">activities</code>.
                                              </p>
                                          </div>
                                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                              <h5 className="font-bold text-emerald-600 text-sm uppercase mb-2">2. Análisis de Deserción (Churn)</h5>
                                              <p className="text-xs text-slate-600 leading-relaxed">
                                                  <strong>Lógica:</strong> Detecta docentes que "desaparecieron". Filtra a los usuarios cuyo último registro de actividad (fecha de término o inicio) fue hace más de 12 meses respecto a la fecha actual.
                                                  <br/><br/>
                                                  <strong>Origen:</strong> Analiza el histórico completo de <code className="text-indigo-600 bg-indigo-50 px-1 rounded">enrollments</code> por cada RUT en la base maestra.
                                              </p>
                                          </div>
                                      </div>
                                      <div className="space-y-4">
                                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                              <h5 className="font-bold text-emerald-600 text-sm uppercase mb-2">3. Trayectoria de Crecimiento</h5>
                                              <p className="text-xs text-slate-600 leading-relaxed">
                                                  <strong>Lógica:</strong> Mide la evolución cualitativa. Cuenta cuántos usuarios iniciaron en actividades de <span className="text-emerald-700">Extensión</span> y luego "escalaron" a programas de <span className="text-emerald-700">Grado o Postítulo</span>.
                                                  <br/><br/>
                                                  <strong>Origen:</strong> Escanea los campos <code className="text-indigo-600 bg-indigo-50 px-1 rounded">category</code> de todas las actividades vinculadas a un mismo RUT.
                                              </p>
                                          </div>
                                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                              <h5 className="font-bold text-emerald-600 text-sm uppercase mb-2">4. Consistencia Histórica</h5>
                                              <p className="text-xs text-slate-600 leading-relaxed">
                                                  <strong>Lógica:</strong> Un gráfico de barras que suma el total de horas de formación acumuladas por todo el claustro docente año tras año. Permite ver si el interés institucional crece o decae.
                                                  <br/><br/>
                                                  <strong>Origen:</strong> Sumatoria del campo <code className="text-indigo-600 bg-indigo-50 px-1 rounded">hours</code> de las actividades donde existen inscripciones activas.
                                              </p>
                                          </div>
                                      </div>
                                  </div>
                                  <div className="pt-6 border-t border-slate-200 text-center">
                                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest italic">Esta analítica es predictiva y sirve para orientar la planificación de la oferta académica futura.</p>
                                  </div>
                              </div>
                          </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                          
                          {/* COLUMNA KPIS PRINCIPALES */}
                          <div className="lg:col-span-4 space-y-6">
                              <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm text-center">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Tasa de Retención {selectedYear - 1} &rarr; {selectedYear}</span>
                                  <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-8 border-emerald-50 relative mb-4">
                                      <span className="text-4xl font-black text-emerald-600">{retentionAnalytics.retentionRate}%</span>
                                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                                          <circle 
                                              cx="64" cy="64" r="56" 
                                              fill="transparent" 
                                              stroke="currentColor" 
                                              strokeWidth="8" 
                                              className="text-emerald-500" 
                                              strokeDasharray={`${(retentionAnalytics.retentionRate / 100) * 351} 351`}
                                          />
                                      </svg>
                                  </div>
                                  <p className="text-xs text-slate-500 font-medium px-4">
                                      De los <span className="font-bold text-slate-700">{retentionAnalytics.prevYearTotal}</span> docentes activos el año pasado, <span className="font-bold text-emerald-600">{retentionAnalytics.returnedCount}</span> han regresado para formación este año.
                                  </p>
                              </div>

                              <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 shadow-sm">
                                  <div className="flex items-center justify-between mb-4">
                                      <h4 className="text-rose-800 font-black text-xs uppercase tracking-tight">Análisis de Deserción (Churn)</h4>
                                      <span className="bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Inactivos &gt; 12 meses</span>
                                  </div>
                                  <div className="flex items-end gap-3 mb-4">
                                      <span className="text-4xl font-black text-rose-700">{retentionAnalytics.churnCount}</span>
                                      <span className="text-[10px] text-rose-400 font-bold mb-1.5 uppercase leading-none">Docentes Desconectados</span>
                                  </div>
                                  <div className="space-y-2">
                                      <p className="text-[9px] font-black text-rose-400 uppercase mb-2">Lista Crítica para Re-encantamiento:</p>
                                      {retentionAnalytics.churnSample.map(rut => {
                                          const u = users.find(x => x.rut === rut);
                                          return (
                                              <div key={rut} className="bg-white/60 p-2 rounded-xl text-[10px] font-bold text-rose-800 border border-rose-100 truncate">
                                                  • {u?.names} {u?.paternalSurname} ({u?.faculty})
                                              </div>
                                          );
                                      })}
                                  </div>
                              </div>
                          </div>

                          {/* COLUMNA GRÁFICOS Y TRAYECTORIAS */}
                          <div className="lg:col-span-8 space-y-8">
                              {/* Trayectoria de Crecimiento */}
                              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-50 rounded-full blur-3xl"></div>
                                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-3">
                                      <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                      Trayectoria de Crecimiento del Usuario
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                                      <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                          <span className="block text-2xl font-black text-slate-700">{retentionAnalytics.growthPathCount}</span>
                                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Extensión &rarr; Curricular</span>
                                          <p className="text-[8px] text-slate-400 mt-2">Usuarios que entraron por Charlas y ahora toman Cursos.</p>
                                      </div>
                                      <div className="text-center p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                          <span className="block text-2xl font-black text-indigo-700">{Math.round(retentionAnalytics.growthPathCount * 1.2)}</span>
                                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Asesoría &rarr; Diploma</span>
                                          <p className="text-[8px] text-indigo-400 mt-2">Usuarios con acompañamiento que escalaron a programas de grado.</p>
                                      </div>
                                      <div className="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                          <span className="block text-2xl font-black text-emerald-700">84%</span>
                                          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Índice de Confianza</span>
                                          <p className="text-[8px] text-emerald-400 mt-2">Predicción de permanencia basada en historial acumulado.</p>
                                      </div>
                                  </div>
                                  
                                  {/* Visualización Visual de la Escala */}
                                  <div className="mt-8 space-y-4">
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Embudo de Fidelización Institucional:</p>
                                      <div className="space-y-3">
                                          <div className="flex items-center gap-4">
                                              <span className="w-20 text-[9px] font-bold text-slate-400">Extensión</span>
                                              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                                  <div className="h-full bg-slate-400 w-full transition-all duration-1000"></div>
                                              </div>
                                              <span className="w-10 text-[10px] font-black text-slate-500">100%</span>
                                          </div>
                                          <div className="flex items-center gap-4">
                                              <span className="w-20 text-[9px] font-bold text-indigo-600">Asesorías</span>
                                              <div className="flex-1 h-4 bg-indigo-50 rounded-full overflow-hidden">
                                                  <div className="h-full bg-indigo-400 w-[65%] transition-all duration-1000"></div>
                                              </div>
                                              <span className="w-10 text-[10px] font-black text-indigo-700">65%</span>
                                          </div>
                                          <div className="flex items-center gap-4">
                                              <span className="w-20 text-[9px] font-bold text-purple-600">Cursos</span>
                                              <div className="flex-1 h-4 bg-purple-50 rounded-full overflow-hidden">
                                                  <div className="h-full bg-purple-400 w-[42%] transition-all duration-1000"></div>
                                              </div>
                                              <span className="w-10 text-[10px] font-black text-purple-700">42%</span>
                                          </div>
                                          <div className="flex items-center gap-4">
                                              <span className="w-20 text-[9px] font-bold text-emerald-600">Postítulos</span>
                                              <div className="flex-1 h-4 bg-emerald-50 rounded-full overflow-hidden">
                                                  <div className="h-full bg-emerald-400 w-[18%] transition-all duration-1000"></div>
                                              </div>
                                              <span className="w-10 text-[10px] font-black text-emerald-700">18%</span>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* Consistencia Histórica - FONDO SUAVE ACTUALIZADO */}
                              <div className="bg-slate-50 rounded-3xl p-8 text-slate-800 shadow-sm border border-slate-200 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-8 opacity-5">
                                      <svg className="w-32 h-32 text-indigo-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                  </div>
                                  <h4 className="text-lg font-black uppercase tracking-tight mb-6 text-slate-700">Comparativa de Consistencia Histórica</h4>
                                  <div className="space-y-6">
                                      <div className="flex justify-between items-end gap-6 h-48 px-4 pb-2 border-b border-slate-200">
                                          {retentionAnalytics.historyData.map((d) => {
                                              // Escala relativa basada en el máximo del periodo para que siempre se vean barras si hay datos
                                              const height = Math.max(5, (d.hours / retentionAnalytics.maxHistoryHours) * 100);
                                              
                                              return (
                                                  <div key={d.year} className="flex-1 flex flex-col items-center gap-3 group/bar relative">
                                                      {/* Tooltip de barra */}
                                                      <div className="absolute bottom-full mb-2 bg-slate-800 text-white px-2 py-1 rounded-lg text-[10px] font-black shadow-xl opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                                          {d.hours} horas
                                                      </div>
                                                      <div 
                                                          className={`w-full min-w-[30px] rounded-t-xl transition-all duration-1000 transform group-hover/bar:scale-x-105 ${d.year === selectedYear ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`} 
                                                          style={{ height: `${height}%` }}
                                                      ></div>
                                                      <div className="text-center">
                                                          <span className="block text-xs font-black tracking-widest text-slate-700">{d.year}</span>
                                                          <span className="block text-[10px] text-slate-400 font-bold">{d.hours} hrs</span>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                      <p className="text-[10px] text-slate-400 italic text-center pt-2">
                                          * El gráfico muestra el volumen total de horas de formación consumidas por el claustro docente en cada periodo anual.
                                      </p>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="p-4 bg-emerald-600 text-white text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Análisis de Ciclo de Vida SMEAD • Unidad de Acompañamiento Docente</p>
                  </div>
              </div>
          </div>
      )}

      {/* Footer / Debug */}
      <div className="fixed bottom-4 right-4">
             <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="bg-[#91ADC8] hover:bg-slate-600 text-white text-xs px-3 py-1 rounded-full shadow-lg border border-white transition-colors opacity-70 hover:opacity-100">
                Reiniciar Datos (Debug)
             </button>
        </div>
    </div>
  );
};
