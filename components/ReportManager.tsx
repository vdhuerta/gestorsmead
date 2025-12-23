import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData, normalizeRut } from '../context/DataContext';
import { User, Enrollment, Activity, ActivityState } from '../types';
import { useReloadDirective } from '../hooks/useReloadDirective';

type DetailFilter = {
    faculty: string;
    category?: 'ACADEMIC' | 'POSTGRADUATE' | 'GENERAL' | 'ADVISORY' | 'TOTAL';
};

const CATEGORY_NAMES: Record<string, string> = {
    'ACADEMIC': 'Curso',
    'POSTGRADUATE': 'Postítulo',
    'GENERAL': 'Extensión',
    'ADVISORY': 'Asesoría',
    'TOTAL': 'Todas'
};

export const ReportManager: React.FC = () => {
    const { enrollments, activities, users } = useData();
    const { isSyncing, executeReload } = useReloadDirective(); // DIRECTIVA_RECARGA

    const [activeReport, setActiveReport] = useState<'consolidated' | 'effectiveness' | 'preferences' | 'advisoryImpact' | 'frequentTeachers' | 'academicHistory' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
    const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);

    // --- ESTADOS PARA CONSULTA DE HISTORIAL ---
    const [historySearch, setHistorySearch] = useState('');
    const [historyUser, setHistoryUser] = useState<User | null>(null);
    const [historySuggestions, setHistorySuggestions] = useState<User[]>([]);
    const historySearchRef = useRef<HTMLDivElement>(null);

    // --- EFECTO: RECARGA AUTOMÁTICA AL ENTRAR A UN INFORME ---
    useEffect(() => {
        if (activeReport) {
            executeReload();
        }
    }, [activeReport]);

    // Click outside for history suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (historySearchRef.current && !historySearchRef.current.contains(event.target as Node)) {
                setHistorySuggestions([]);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- HELPER: FORMAT dd-mmm-aa (Spanish) ---
    const formatReportDate = (rawDate: string | undefined): string => {
        if (!rawDate) return '-';
        try {
            const d = new Date(rawDate + 'T12:00:00');
            const day = String(d.getDate()).padStart(2, '0');
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const month = months[d.getMonth()];
            const year = String(d.getFullYear()).slice(-2);
            return `${day}-${month}-${year}`;
        } catch (e) {
            return '-';
        }
    };

    // --- LÓGICA FILTRO CONSOLIDADO ---
    const consolidatedList = useMemo(() => {
        return enrollments.filter(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act) return false;

            if ((act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') && enr.state === ActivityState.APROBADO) return true;
            if (act.category === 'GENERAL') return true;
            if (act.category === 'ADVISORY') return true;
            return false;
        }).map(enr => {
            const user = users.find(u => u.rut === enr.rut);
            const act = activities.find(a => a.id === enr.activityId);
            
            let relevantDate = '';
            if (act?.category === 'ADVISORY' && enr.sessionLogs && enr.sessionLogs.length > 0) {
                const sortedLogs = [...enr.sessionLogs].sort((a,b) => b.date.localeCompare(a.date));
                relevantDate = sortedLogs[0].date;
            } else {
                relevantDate = act?.endDate || act?.startDate || '';
            }

            return {
                ...enr,
                userData: user,
                activityData: act,
                displayDate: formatReportDate(relevantDate)
            };
        });
    }, [enrollments, activities, users]);

    const consolidatedStats = useMemo(() => {
        const stats = { total: consolidatedList.length, approved: 0, extension: 0, advisory: 0 };
        consolidatedList.forEach(item => {
            if (item.activityData?.category === 'ACADEMIC' || item.activityData?.category === 'POSTGRADUATE') stats.approved++;
            else if (item.activityData?.category === 'GENERAL') stats.extension++;
            else if (item.activityData?.category === 'ADVISORY') stats.advisory++;
        });
        return stats;
    }, [consolidatedList]);

    // --- LÓGICA TASA DE EFECTIVIDAD POR FACULTAD ---
    const effectivenessData = useMemo(() => {
        const stats: Record<string, { total: number, approved: number }> = {};
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || (act.category !== 'ACADEMIC' && act.category !== 'POSTGRADUATE')) return;
            const user = users.find(u => u.rut === enr.rut);
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (!stats[faculty]) stats[faculty] = { total: 0, approved: 0 };
            stats[faculty].total += 1;
            if (enr.state === ActivityState.APROBADO) stats[faculty].approved += 1;
        });
        return Object.entries(stats).map(([faculty, data]) => ({
            faculty, total: data.total, approved: data.approved,
            percentage: data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0
        })).sort((a, b) => b.percentage - a.percentage);
    }, [enrollments, activities, users]);

    // --- LÓGICA MATRIZ DE PREFERENCIAS ---
    const preferenceMatrix = useMemo(() => {
        const matrix: Record<string, { ACADEMIC: number, POSTGRADUATE: number, GENERAL: number, ADVISORY: number, total: number }> = {};
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act) return;
            const user = users.find(u => u.rut === enr.rut);
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (!matrix[faculty]) matrix[faculty] = { ACADEMIC: 0, POSTGRADUATE: 0, GENERAL: 0, ADVISORY: 0, total: 0 };
            const cat = act.category || 'ACADEMIC';
            matrix[faculty][cat as keyof typeof matrix[string]] += 1;
            matrix[faculty].total += 1;
        });
        return Object.entries(matrix).map(([faculty, stats]) => ({ faculty, ...stats })).sort((a, b) => b.total - a.total);
    }, [enrollments, activities, users]);

    // --- LÓGICA MAPA DE IMPACTO DE ASESORÍAS ---
    const advisoryImpactData = useMemo(() => {
        const stats: Record<string, { files: number, sessions: number }> = {};
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.category !== 'ADVISORY') return;
            const user = users.find(u => u.rut === enr.rut);
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (!stats[faculty]) stats[faculty] = { files: 0, sessions: 0 };
            stats[faculty].files += 1;
            stats[faculty].sessions += (enr.sessionLogs?.length || 0);
        });
        return Object.entries(stats).map(([faculty, data]) => ({ faculty, ...data })).sort((a, b) => b.sessions - a.sessions);
    }, [enrollments, activities, users]);

    // --- LÓGICA DOCENTES FRECUENTES ---
    const frequentTeachersData = useMemo(() => {
        const userApprovedCount: Record<string, number> = {};
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act) return;
            const isApproved = enr.state === ActivityState.APROBADO;
            const isExtensionOrAdvisory = act.category === 'GENERAL' || act.category === 'ADVISORY';
            if (isApproved || isExtensionOrAdvisory) {
                userApprovedCount[enr.rut] = (userApprovedCount[enr.rut] || 0) + 1;
            }
        });
        const stats: Record<string, { frequentCount: number, teacherRuts: string[] }> = {};
        Object.entries(userApprovedCount).forEach(([rut, count]) => {
            if (count >= 2) {
                const user = users.find(u => u.rut === rut);
                const faculty = user?.faculty || 'Sin Facultad / Externo';
                if (!stats[faculty]) stats[faculty] = { frequentCount: 0, teacherRuts: [] };
                stats[faculty].frequentCount += 1;
                stats[faculty].teacherRuts.push(rut);
            }
        });
        return Object.entries(stats).map(([faculty, data]) => ({ faculty, ...data })).sort((a, b) => b.frequentCount - a.frequentCount);
    }, [enrollments, users, activities]);

    const filteredDrillDown = useMemo(() => {
        if (!detailFilter) return [];
        return enrollments.filter(enr => {
            const user = users.find(u => u.rut === enr.rut);
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (faculty !== detailFilter.faculty) return false;
            if (!detailFilter.category || detailFilter.category === 'TOTAL') return true;
            const act = activities.find(a => a.id === enr.activityId);
            return act?.category === detailFilter.category;
        }).map(enr => ({
            ...enr,
            user: users.find(u => u.rut === enr.rut),
            activity: activities.find(a => a.id === enr.activityId)
        }));
    }, [detailFilter, enrollments, activities, users]);

    // --- LÓGICA CONSULTA HISTORIAL ACADÉMICO ---
    const handleHistorySearch = (val: string) => {
        setHistorySearch(val);
        setHistoryUser(null);
        if (val.length < 2) {
            setHistorySuggestions([]);
            return;
        }
        const norm = normalizeRut(val);
        const matches = users.filter(u => 
            normalizeRut(u.rut).includes(norm) || 
            u.paternalSurname.toLowerCase().includes(val.toLowerCase())
        );
        setHistorySuggestions(matches.slice(0, 5));
    };

    const academicHistory = useMemo(() => {
        if (!historyUser) return [];
        const userEnrollments = enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(historyUser.rut));
        return userEnrollments.map(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            return { ...enr, activity: act };
        }).filter(item => item.activity)
          .sort((a, b) => {
              // Orden cronológico inverso (Más reciente primero)
              const yearA = a.activity?.year || 0;
              const yearB = b.activity?.year || 0;
              if (yearA !== yearB) return yearB - yearA;
              return (b.activity?.academicPeriod || '').localeCompare(a.activity?.academicPeriod || '');
          });
    }, [historyUser, enrollments, activities]);

    // Agrupación por Año/Semestre para el reporte detallado
    const groupedHistory = useMemo(() => {
        const groups: Record<string, any[]> = {};
        academicHistory.forEach(item => {
            const key = `${item.activity?.year} - ${item.activity?.academicPeriod || 'Sin Periodo'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [academicHistory]);

    // EXPORTS (HTML & CSV) ...
    const handleExportFacultyHTML = () => { /* ... existing ... */ };
    const handleExportCSV = () => { /* ... existing ... */ };

    return (
        <div className="animate-fadeIn space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Centro de Informes Académicos</h2>
                    <p className="text-sm text-slate-500">Generación de reportes estratégicos y análisis de participación institucional.</p>
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                    <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                    <span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Actualizando Datos...' : 'Datos Actualizados'}</span>
                </div>
            </div>

            {/* GRID DE INFORMES DISPONIBLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* NUEVO: CONSULTA DE HISTORIAL ACADÉMICO */}
                <div onClick={() => setActiveReport('academicHistory')} className="bg-white rounded-xl shadow-sm border-2 border-indigo-100 p-6 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 -mr-8 -mt-8 rounded-full transition-transform group-hover:scale-110"></div>
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-lg flex items-center justify-center mb-4 relative z-10">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg relative z-10">Consulta Historial Docente</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed relative z-10">Búsqueda detallada por RUT o Apellido. Cursos, asistencias y bitácora completa.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center relative z-10">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Consultar Docente</span>
                        <svg className="w-4 h-4 text-indigo-500 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* INFORME CONSOLIDADO */}
                <div onClick={() => setActiveReport('consolidated')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Informe Consolidado</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Listado maestro de alumnos con actividades aprobadas, extensión o asesorías.</p>
                </div>

                {/* INFORME EFECTIVIDAD */}
                <div onClick={() => setActiveReport('effectiveness')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Efectividad Académica</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Porcentaje de aprobación vs inscripción por unidad académica.</p>
                </div>

                {/* MATRIZ DE PREFERENCIAS */}
                <div onClick={() => setActiveReport('preferences')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Matriz de Preferencias</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Cruzamiento de participación por Tipo de Actividad vs Facultad.</p>
                </div>

                {/* MAPA DE IMPACTO DE ASESORÍAS */}
                <div onClick={() => setActiveReport('advisoryImpact')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-700 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Impacto de Asesorías</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Mapa de facultades con mayor demanda de acompañamiento.</p>
                </div>

                {/* ÍNDICE DE DOCENTES FRECUENTES */}
                <div onClick={() => setActiveReport('frequentTeachers')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Docentes Frecuentes</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Índice de fidelización: Docentes con 2 o más actividades.</p>
                </div>
            </div>

            {/* MODAL: CONSULTA HISTORIAL ACADÉMICO (DETALLADO) */}
            {activeReport === 'academicHistory' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border-2 border-indigo-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Consulta de Historial Académico por Docente
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-tighter">Reporte detallado de cursos, extensión, postítulos y asesorías.</p>
                            </div>
                            <button onClick={() => { setActiveReport(null); setHistoryUser(null); setHistorySearch(''); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                        </div>

                        <div className="p-6 bg-indigo-50/30 border-b border-indigo-100">
                            <div className="relative max-w-xl mx-auto" ref={historySearchRef}>
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Ingrese RUT o Apellido Paterno para buscar..." 
                                    value={historySearch}
                                    onChange={(e) => handleHistorySearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-white border-2 border-indigo-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all font-bold text-slate-700 shadow-sm"
                                />
                                {historySuggestions.length > 0 && (
                                    <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-2xl border border-indigo-100 overflow-hidden animate-fadeInDown">
                                        <div className="px-4 py-2 bg-indigo-50 text-[10px] font-black text-indigo-700 uppercase tracking-widest">Sugerencias encontradas</div>
                                        {historySuggestions.map(u => (
                                            <button 
                                                key={u.rut}
                                                onClick={() => { setHistoryUser(u); setHistorySuggestions([]); setHistorySearch(u.rut); }}
                                                className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex items-center justify-between group border-b border-slate-50 last:border-0"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-800 group-hover:text-indigo-700">{u.paternalSurname}, {u.names}</span>
                                                    <span className="text-xs text-slate-400 font-mono">{u.rut}</span>
                                                </div>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-bold group-hover:bg-indigo-600 group-hover:text-white">{u.faculty}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar p-6 bg-slate-50/50">
                            {historyUser ? (
                                <div className="space-y-8 max-w-5xl mx-auto">
                                    {/* Ficha de Identidad */}
                                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-center">
                                        <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center font-black text-4xl text-indigo-600 shadow-inner border-2 border-white">
                                            {historyUser.names.charAt(0)}
                                        </div>
                                        <div className="flex-1 text-center md:text-left">
                                            <h4 className="text-2xl font-black text-slate-800 leading-tight">{historyUser.paternalSurname} {historyUser.maternalSurname}, {historyUser.names}</h4>
                                            <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-2">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5" /></svg>{historyUser.rut}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>{historyUser.email}</div>
                                            </div>
                                            <p className="mt-4 text-xs font-black text-indigo-700 uppercase tracking-widest">{historyUser.academicRole} | {historyUser.faculty} | {historyUser.department}</p>
                                        </div>
                                        <div className="bg-indigo-600 text-white p-4 rounded-2xl text-center min-w-[120px]">
                                            <span className="block text-3xl font-black">{academicHistory.length}</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Actividades Totales</span>
                                        </div>
                                    </div>

                                    {/* Listado Agrupado */}
                                    <div className="space-y-10">
                                        {Object.entries(groupedHistory).length > 0 ? (
                                            Object.entries(groupedHistory).map(([period, items]) => {
                                                // FIX: Cast items as any[] to avoid TypeScript error: Property 'map' does not exist on type 'unknown'
                                                const itemsArray = items as any[];
                                                return (
                                                    <div key={period} className="relative">
                                                        <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-sm py-2 mb-4">
                                                            <h5 className="text-indigo-800 font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                                                <div className="h-4 w-1 bg-indigo-600 rounded-full"></div>
                                                                Periodo: {period}
                                                            </h5>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {itemsArray.map((item, idx) => (
                                                                <div key={idx} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between">
                                                                    <div>
                                                                        <div className="flex justify-between items-start mb-3">
                                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                                                                item.activity?.category === 'ACADEMIC' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                                item.activity?.category === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                                item.activity?.category === 'GENERAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                                'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                                            }`}>
                                                                                {CATEGORY_NAMES[item.activity?.category || '']}
                                                                            </span>
                                                                            <span className="text-[10px] font-mono text-slate-400">{item.activity?.internalCode}</span>
                                                                        </div>
                                                                        <h6 className="font-bold text-slate-800 text-sm leading-tight mb-2">{item.activity?.name}</h6>
                                                                        <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-500 mb-4">
                                                                            <div className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{item.activity?.hours} Horas</div>
                                                                            <div className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{item.activity?.modality}</div>
                                                                            <div className="flex items-center gap-1.5 col-span-2"><svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Fin: {formatReportDate(item.activity?.endDate)}</div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Seguimiento Detallado por Fila */}
                                                                    <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between border border-slate-100">
                                                                        <div className="flex items-center gap-4">
                                                                            <div><span className="block text-[9px] font-bold text-slate-400 uppercase">Nota</span><span className={`text-sm font-black ${item.finalGrade && item.finalGrade < 4 ? 'text-red-600' : 'text-slate-700'}`}>{item.finalGrade || '-'}</span></div>
                                                                            <div><span className="block text-[9px] font-bold text-slate-400 uppercase">Asist.</span><span className={`text-sm font-black ${item.attendancePercentage && item.attendancePercentage < 75 ? 'text-red-600' : 'text-slate-700'}`}>{item.attendancePercentage || 0}%</span></div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                                                                item.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' :
                                                                                item.state === ActivityState.REPROBADO ? 'bg-red-100 text-red-700' :
                                                                                'bg-slate-200 text-slate-600'
                                                                            }`}>{item.state || 'Registrado'}</span>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {item.activity?.category === 'ADVISORY' && item.sessionLogs && item.sessionLogs.length > 0 && (
                                                                        <div className="mt-3 pt-3 border-t border-indigo-50">
                                                                            <span className="text-[10px] font-bold text-indigo-600 uppercase mb-1 block">Última Asesoría:</span>
                                                                            <p className="text-[10px] text-slate-500 line-clamp-2 italic">"{item.sessionLogs[item.sessionLogs.length-1].observation}"</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="py-20 text-center text-slate-400 italic">No se encontraron actividades registradas para este docente.</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-20 px-8">
                                    <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 border-2 border-indigo-50">
                                        <svg className="w-12 h-12 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-400">Inicie una búsqueda</h4>
                                    <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto">Ingrese un RUT o Apellido para visualizar el expediente académico completo del docente en el sistema.</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 bg-white border-t border-slate-200 text-center">
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">
                                Informe exclusivo de consulta interna académica para gestión de acompañamiento
                             </p>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL INFORME CONSOLIDADO (Existente) */}
            {activeReport === 'consolidated' && (
                /* ... (Keep original modal content) ... */
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div><h3 className="text-xl font-bold text-slate-800">Informe Consolidado de Participación Académica</h3><p className="text-xs text-slate-500 mt-1">Criterio: Aprobados, Extensión y Asesorías Abiertas.</p></div>
                            <div className="flex items-center gap-3"><button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Exportar CSV</button><button onClick={() => setActiveReport(null)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button></div>
                        </div>

                        <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100 flex flex-wrap gap-4 md:gap-8 items-center">
                             <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-indigo-700 leading-none">{consolidatedStats.total}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Total Consolidado</span>
                                 </div>
                             </div>
                             <div className="h-8 w-px bg-indigo-200 hidden md:block"></div>
                             <div className="flex items-center gap-2">
                                 <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
                                 <div>
                                     <span className="block text-sm font-black text-slate-700 leading-none">{consolidatedStats.approved}</span>
                                     <span className="text-[9px] font-bold text-slate-400 uppercase">Aprobados (Cursos/Post)</span>
                                 </div>
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-sm"></span>
                                 <div>
                                     <span className="block text-sm font-black text-slate-700 leading-none">{consolidatedStats.extension}</span>
                                     <span className="text-[9px] font-bold text-slate-400 uppercase">Extensión (Total)</span>
                                 </div>
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>
                                 <div>
                                     <span className="block text-sm font-black text-slate-700 leading-none">{consolidatedStats.advisory}</span>
                                     <span className="text-[9px] font-bold text-slate-400 uppercase">Asesorías (Expedientes)</span>
                                 </div>
                             </div>
                        </div>

                        <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between">
                            <div className="relative max-w-md w-full">
                                <input type="text" placeholder="Buscar por RUT, Nombre o Actividad..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"/>
                                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                    <tr><th className="px-4 py-3 bg-slate-100 border-r text-indigo-700">Fecha</th><th className="px-4 py-3 bg-slate-50 sticky left-0 border-r z-10">RUT</th><th className="px-4 py-3">Nombre Completo</th><th className="px-4 py-3">Unidad Académica (Facultad)</th><th className="px-4 py-3">Carrera / Depto</th><th className="px-4 py-3">Rol / Cargo</th><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Origen del Registro</th><th className="px-4 py-3">Estado Académico</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {consolidatedList.filter(i => !searchQuery || i.rut.includes(searchQuery) || i.userData?.names.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-4 py-3 font-mono font-bold text-indigo-600 bg-indigo-50/30 border-r">{item.displayDate}</td><td className="px-4 py-3 font-mono font-bold text-slate-700 bg-white sticky left-0 border-r z-10">{item.rut}</td><td className="px-4 py-3"><div className="font-bold text-slate-800">{item.userData?.paternalSurname}, {item.userData?.names}</div><div className="text-[10px] text-slate-400">{item.userData?.email}</div></td><td className="px-4 py-3 text-slate-600">{item.userData?.faculty}</td><td className="px-4 py-3"><div>{item.userData?.career}</div><div className="text-[10px] text-slate-400">{item.userData?.department}</div></td><td className="px-4 py-3"><div>{item.userData?.academicRole}</div><div className="text-[10px] text-slate-400">{item.userData?.contractType}</div></td><td className="px-4 py-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{item.userData?.campus}</span></td><td className="px-4 py-3"><div className="font-bold text-indigo-700">{item.activityData?.name}</div><div className="text-[10px] text-slate-400 uppercase">{item.activityData?.category} ({item.activityData?.year})</div></td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full font-black text-[9px] uppercase border ${item.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : item.activityData?.category === 'ADVISORY' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{item.state || 'Registrado'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            {/* OTRAS MODALES (Effectiveness, Preferences, etc) Mantener igual */}
        </div>
    );
};