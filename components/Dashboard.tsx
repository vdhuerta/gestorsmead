
import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity, UserRole, ActivityState } from '../types';
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

  // CÁLCULO DE KPIS DE AUDITORÍA
  const advisorKpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
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

    const finalizados = allEvalActs.filter(act => act.endDate && act.endDate < today);

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
  }, [yearEnrollments, activeCourses, postgraduateActs, enrollments, activities, config, selectedYear]);

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

              {/* INFORME DE PERMANENCIA (EN CONSTRUCCIÓN) */}
              <div className="bg-slate-50 rounded-3xl border border-slate-200 shadow-inner p-6 flex flex-col items-center text-center opacity-60 cursor-not-allowed">
                  <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-400 mb-1">Permanencia</h3>
                  <p className="text-[10px] text-slate-400 leading-snug mb-4 italic">Pronto disponible: Análisis de retención interanual y ciclo de vida docente.</p>
                  <button className="mt-auto w-full py-2 bg-slate-200 border border-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-not-allowed">En Construcción</button>
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
                          <th className="px-6 py-4 text-center w-[15%]">Sesiones Registradas</th>
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
    </div>
  );
};
