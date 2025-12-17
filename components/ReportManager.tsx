
import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { User, Enrollment, Activity, ActivityState } from '../types';

type DetailFilter = {
    faculty: string;
    category?: 'ACADEMIC' | 'POSTGRADUATE' | 'GENERAL' | 'ADVISORY' | 'TOTAL';
};

export const ReportManager: React.FC = () => {
    const { enrollments, activities, users } = useData();
    const [activeReport, setActiveReport] = useState<'consolidated' | 'effectiveness' | 'preferences' | 'advisoryImpact' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
    const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);

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
        const today = new Date().toISOString().split('T')[0];
        
        return enrollments.filter(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act) return false;

            if (act.category === 'ACADEMIC' && enr.state === ActivityState.APROBADO) return true;
            if (act.category === 'POSTGRADUATE' && enr.state === ActivityState.APROBADO) return true;
            if (act.category === 'GENERAL' && act.endDate && act.endDate < today) return true;
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

            if (!matrix[faculty]) {
                matrix[faculty] = { ACADEMIC: 0, POSTGRADUATE: 0, GENERAL: 0, ADVISORY: 0, total: 0 };
            }

            const cat = act.category || 'ACADEMIC';
            matrix[faculty][cat as keyof typeof matrix[string]] += 1;
            matrix[faculty].total += 1;
        });

        return Object.entries(matrix).map(([faculty, stats]) => ({
            faculty, ...stats
        })).sort((a, b) => b.total - a.total);
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

        return Object.entries(stats).map(([faculty, data]) => ({
            faculty,
            ...data
        })).sort((a, b) => b.sessions - a.sessions);
    }, [enrollments, activities, users]);

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

    const handleExportCSV = () => {
        const headers = [
            "Fecha Registro", "RUT", "Nombres", "Ap. Paterno", "Ap. Materno", "Email", "Telefono", 
            "Sede", "Facultad", "Departamento", "Carrera", "Rol Academico", 
            "Tipo Contrato", "Semestre Docencia", "Actividad Origen", "Estado/Tipo"
        ];
        const rows = consolidatedList.map(item => [
            item.displayDate, item.rut, item.userData?.names || '', item.userData?.paternalSurname || '',
            item.userData?.maternalSurname || '', item.userData?.email || '', item.userData?.phone || '',
            item.userData?.campus || '', item.userData?.faculty || '', item.userData?.department || '',
            item.userData?.career || '', item.userData?.academicRole || '', item.userData?.contractType || '',
            item.userData?.teachingSemester || '', item.activityData?.name || '', item.state || item.activityData?.category || ''
        ]);
        const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `REPORTE_CONSOLIDADO_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="animate-fadeIn space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Centro de Informes Académicos</h2>
                    <p className="text-sm text-slate-500">Generación de reportes estratégicos y análisis de participación institucional.</p>
                </div>
            </div>

            {/* GRID DE INFORMES DISPONIBLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* INFORME CONSOLIDADO */}
                <div onClick={() => setActiveReport('consolidated')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Informe Consolidado</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Listado maestro de alumnos con actividades aprobadas, extensión o asesorías.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Ver Listado</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* INFORME EFECTIVIDAD */}
                <div onClick={() => setActiveReport('effectiveness')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Tasa de Efectividad Académica</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Porcentaje de aprobación vs inscripción por unidad académica (Cursos y Postítulos).</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Ver Análisis</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* MATRIZ DE PREFERENCIAS */}
                <div onClick={() => setActiveReport('preferences')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Matriz de Preferencias</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Cruzamiento de participación por Tipo de Actividad vs Facultad. ¿Qué prefiere cada unidad?</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ver Matriz</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* MAPA DE IMPACTO DE ASESORÍAS */}
                <div onClick={() => setActiveReport('advisoryImpact')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-700 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Impacto de Asesorías</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Mapa de facultades con mayor demanda de acompañamiento y sesiones realizadas.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Ver Mapa de Impacto</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-6 opacity-60 cursor-not-allowed">
                    <h3 className="font-bold text-slate-400">Informe de Permanencia</h3>
                    <p className="text-xs text-slate-400 mt-2">Próximamente: Análisis de continuidad en la oferta formativa.</p>
                </div>
            </div>

            {/* MODAL INFORME CONSOLIDADO */}
            {activeReport === 'consolidated' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div><h3 className="text-xl font-bold text-slate-800">Informe Consolidado de Participación Académica</h3><p className="text-xs text-slate-500 mt-1">Criterio: Aprobados, Extensión Finalizada y Asesorías Abiertas.</p></div>
                            <div className="flex items-center gap-3"><button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Exportar CSV</button><button onClick={() => setActiveReport(null)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button></div>
                        </div>
                        <div className="p-4 bg-white border-b border-slate-100"><div className="relative max-w-md"><input type="text" placeholder="Buscar por RUT, Nombre o Actividad..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"/><svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div></div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                    <tr><th className="px-4 py-3 bg-slate-100 border-r text-indigo-700">Fecha</th><th className="px-4 py-3 bg-slate-50 sticky left-0 border-r z-10">RUT</th><th className="px-4 py-3">Nombre Completo</th><th className="px-4 py-3">Unidad Académica (Facultad)</th><th className="px-4 py-3">Carrera / Depto</th><th className="px-4 py-3">Rol / Cargo</th><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Origen del Registro</th><th className="px-4 py-3">Estado Académico</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {consolidatedList.filter(i => !searchQuery || i.rut.includes(searchQuery) || i.userData?.names.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-4 py-3 font-mono font-bold text-indigo-600 bg-indigo-50/30 border-r">{item.displayDate}</td><td className="px-4 py-3 font-mono font-bold text-slate-700 bg-white sticky left-0 border-r z-10">{item.rut}</td><td className="px-4 py-3"><div className="font-bold text-slate-800">{item.userData?.paternalSurname}, {item.userData?.names}</div><div className="text-[10px] text-slate-400">{item.userData?.email}</div></td><td className="px-4 py-3 text-slate-600">{item.userData?.faculty}</td><td className="px-4 py-3"><div>{item.userData?.career}</div><div className="text-[10px] text-slate-400">{item.userData?.department}</div></td><td className="px-4 py-3"><div>{item.userData?.academicRole}</div><div className="text-[10px] text-slate-400">{item.userData?.contractType}</div></td><td className="px-4 py-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">{item.userData?.campus}</span></td><td className="px-4 py-3"><div className="font-bold text-indigo-700">{item.activityData?.name}</div><div className="text-[10px] text-slate-400 uppercase">{item.activityData?.category} ({item.activityData?.year})</div></td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full font-black text-[9px] uppercase border ${item.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700 border-green-200' : item.activityData?.category === 'ADVISORY' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{item.state || 'Registrado'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL TASA DE EFECTIVIDAD */}
            {activeReport === 'effectiveness' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-emerald-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div><h3 className="text-xl font-bold text-slate-800">Tasa de Efectividad Académica por Facultad</h3><p className="text-xs text-slate-500 mt-1">Porcentaje de aprobación en cursos curriculares desglosado por unidad académica.</p></div>
                            <button onClick={() => { setActiveReport(null); setSelectedFaculty(null); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                        </div>
                        <div className="flex-1 flex overflow-hidden">
                            <div className={`w-full md:w-1/2 flex flex-col border-r border-slate-100 ${selectedFaculty ? 'hidden md:flex' : 'flex'}`}>
                                <div className="p-4 bg-emerald-50/30 border-b border-slate-100"><h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Resumen Institucional</h4></div>
                                <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
                                    {effectivenessData.map((item, idx) => (
                                        <div key={idx} onClick={() => setSelectedFaculty(item.faculty)} className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${selectedFaculty === item.faculty ? 'bg-emerald-600 border-emerald-700 text-white shadow-lg scale-[1.02]' : 'bg-white border-slate-100 hover:border-emerald-300'}`}>
                                            <div className="flex-1 pr-4"><h5 className={`font-bold text-sm ${selectedFaculty === item.faculty ? 'text-white' : 'text-slate-700'}`}>{item.faculty}</h5><div className={`text-[10px] mt-1 ${selectedFaculty === item.faculty ? 'text-emerald-100' : 'text-slate-400'}`}>{item.approved} Aprobados / {item.total} Inscritos</div></div>
                                            <div className="text-right"><div className={`text-2xl font-black ${selectedFaculty === item.faculty ? 'text-white' : 'text-emerald-600'}`}>{item.percentage}%</div><div className={`text-[9px] font-bold uppercase ${selectedFaculty === item.faculty ? 'text-emerald-200' : 'text-slate-400'}`}>Efectividad</div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className={`flex-1 flex flex-col bg-slate-50/50 ${selectedFaculty ? 'flex' : 'hidden md:flex items-center justify-center'}`}>
                                {selectedFaculty ? (
                                    <div className="flex flex-col h-full animate-fadeIn">
                                        <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-start"><div><span className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Análisis Detallado</span><h4 className="text-lg font-bold text-slate-800">{selectedFaculty}</h4></div><button onClick={() => setSelectedFaculty(null)} className="md:hidden text-xs font-bold text-slate-500 border border-slate-200 px-2 py-1 rounded">Volver</button></div>
                                        <div className="flex-1 overflow-auto custom-scrollbar p-6">
                                            <table className="w-full text-left text-xs"><thead className="text-slate-400 font-bold uppercase tracking-tighter border-b border-slate-200"><tr><th className="pb-3 pr-4">Docente</th><th className="pb-3 pr-4">Curso / Programa</th><th className="pb-3 text-right">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">
                                                {enrollments.filter(enr => { const u = users.find(u => u.rut === enr.rut); const f = u?.faculty || 'Sin Facultad / Externo'; const act = activities.find(a => a.id === enr.activityId); return f === selectedFaculty && (act?.category === 'ACADEMIC' || act?.category === 'POSTGRADUATE'); }).map((enr, i) => { const u = users.find(u => u.rut === enr.rut); const act = activities.find(a => a.id === enr.activityId); return (
                                                    <tr key={i} className="hover:bg-white transition-colors"><td className="py-3 pr-4"><div className="font-bold text-slate-700">{u?.names} {u?.paternalSurname}</div><div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div></td><td className="py-3 pr-4"><div className="font-medium text-slate-600">{act?.name}</div><div className="text-[9px] text-slate-400 uppercase">{act?.category}</div></td><td className="py-3 text-right"><span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${enr.state === ActivityState.APROBADO ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{enr.state}</span></td></tr>
                                                );})}
                                            </tbody></table>
                                        </div>
                                    </div>
                                ) : (<div className="text-center p-12"><div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></div><h4 className="font-bold text-slate-400">Seleccione una facultad</h4></div>)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL MATRIZ DE PREFERENCIAS */}
            {activeReport === 'preferences' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border border-blue-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">Matriz de Preferencias: Actividad vs Facultad</h3>
                                <p className="text-xs text-slate-500 mt-1">Análisis cruzado del volumen de participación por tipo de formación.</p>
                            </div>
                            <button onClick={() => { setActiveReport(null); setDetailFilter(null); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* TABLA DE MATRIZ */}
                            <div className={`flex-1 overflow-auto custom-scrollbar p-6 ${detailFilter ? 'hidden lg:block lg:max-w-[60%]' : 'w-full'}`}>
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="text-xs font-bold text-slate-400 uppercase tracking-tighter border-b border-slate-200">
                                            <th className="pb-3 sticky left-0 bg-white z-10 pr-4">Facultad / Unidad</th>
                                            <th className="pb-3 text-center px-3">Cursos</th>
                                            <th className="pb-3 text-center px-3">Postítulos</th>
                                            <th className="pb-3 text-center px-3">Extensión</th>
                                            <th className="pb-3 text-center px-3">Asesorías</th>
                                            <th className="pb-3 text-center px-3 bg-slate-50 rounded-t-lg">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {preferenceMatrix.map((row, idx) => (
                                            <tr key={idx} className={`hover:bg-blue-50/30 transition-colors group ${detailFilter?.faculty === row.faculty ? 'bg-blue-50' : ''}`}>
                                                <td className={`py-3 sticky left-0 z-10 pr-4 font-bold text-slate-700 transition-colors ${detailFilter?.faculty === row.faculty ? 'bg-blue-50' : 'bg-white group-hover:bg-blue-50/30'}`}>
                                                    {row.faculty}
                                                </td>
                                                <td onClick={() => setDetailFilter({ faculty: row.faculty, category: 'ACADEMIC' })} className="py-3 text-center cursor-pointer hover:bg-indigo-100 font-medium text-indigo-600">{row.ACADEMIC || '-'}</td>
                                                <td onClick={() => setDetailFilter({ faculty: row.faculty, category: 'POSTGRADUATE' })} className="py-3 text-center cursor-pointer hover:bg-purple-100 font-medium text-purple-600">{row.POSTGRADUATE || '-'}</td>
                                                <td onClick={() => setDetailFilter({ faculty: row.faculty, category: 'GENERAL' })} className="py-3 text-center cursor-pointer hover:bg-teal-100 font-medium text-teal-600">{row.GENERAL || '-'}</td>
                                                <td onClick={() => setDetailFilter({ faculty: row.faculty, category: 'ADVISORY' })} className="py-3 text-center cursor-pointer hover:bg-blue-100 font-medium text-blue-600">{row.ADVISORY || '-'}</td>
                                                <td onClick={() => setDetailFilter({ faculty: row.faculty, category: 'TOTAL' })} className="py-3 text-center cursor-pointer bg-slate-50 font-black text-slate-800 group-hover:bg-blue-100">{row.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* DETALLE (DRILL-DOWN) */}
                            {detailFilter && (
                                <div className="w-full lg:w-[40%] flex flex-col bg-slate-50/50 border-l border-slate-200 animate-fadeInRight">
                                    <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-start">
                                        <div>
                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 block">Participantes Detallados</span>
                                            <h4 className="text-lg font-bold text-slate-800 leading-tight">{detailFilter.faculty}</h4>
                                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold mt-1 inline-block">
                                                Categoría: {detailFilter.category === 'TOTAL' ? 'Todas' : detailFilter.category}
                                            </span>
                                        </div>
                                        <button onClick={() => setDetailFilter(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
                                    </div>
                                    <div className="flex-1 overflow-auto custom-scrollbar p-6">
                                        {filteredDrillDown.length > 0 ? (
                                            <div className="space-y-4">
                                                {filteredDrillDown.map((item, i) => (
                                                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="font-bold text-slate-800 text-sm">{item.user?.names} {item.user?.paternalSurname}</div>
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                                                item.activity?.category === 'ACADEMIC' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                                item.activity?.category === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                'bg-teal-50 text-teal-700 border-teal-100'
                                                            }`}>
                                                                {item.activity?.category}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 font-medium mb-1">{item.activity?.name}</div>
                                                        <div className="flex justify-between items-center text-[10px] mt-2 pt-2 border-t border-slate-50">
                                                            <span className="text-slate-400 font-mono">{item.rut}</span>
                                                            <span className="text-slate-600 font-bold">{item.state}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12 text-slate-400 italic">No hay registros para este filtro.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL MAPA DE IMPACTO DE ASESORÍAS */}
            {activeReport === 'advisoryImpact' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-indigo-300">
                        <div className="p-6 bg-indigo-50 border-b border-indigo-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-indigo-900">Mapa de Impacto de Asesorías Individuales</h3>
                                <p className="text-xs text-indigo-700 mt-1">Análisis de acompañamiento pedagógico por unidad académica (Facultad).</p>
                            </div>
                            <button onClick={() => { setActiveReport(null); setSelectedFaculty(null); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* LISTADO DE FACULTADES (IMPACTO) */}
                            <div className={`w-full md:w-1/2 flex flex-col border-r border-slate-100 ${selectedFaculty ? 'hidden md:flex' : 'flex'}`}>
                                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ranking por Demanda</h4>
                                    <span className="text-[10px] font-bold text-indigo-600 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100">Total Sesiones</span>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
                                    {advisoryImpactData.map((item, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setSelectedFaculty(item.faculty)}
                                            className={`p-5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                selectedFaculty === item.faculty 
                                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl scale-[1.02]' 
                                                : 'bg-white border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30'
                                            }`}
                                        >
                                            <div className="flex-1 pr-4">
                                                <h5 className={`font-bold text-sm ${selectedFaculty === item.faculty ? 'text-white' : 'text-slate-800'}`}>{item.faculty}</h5>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className={`text-[10px] flex items-center gap-1 font-bold ${selectedFaculty === item.faculty ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                        {item.files} Docentes
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-2xl font-black ${selectedFaculty === item.faculty ? 'text-white' : 'text-indigo-600'}`}>{item.sessions}</div>
                                                <div className={`text-[9px] font-bold uppercase tracking-tighter ${selectedFaculty === item.faculty ? 'text-indigo-200' : 'text-slate-400'}`}>Sesiones Totales</div>
                                            </div>
                                        </div>
                                    ))}
                                    {advisoryImpactData.length === 0 && (
                                        <div className="py-20 text-center text-slate-400 italic text-sm">
                                            No hay registros de asesoría para procesar.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DETALLE DE DOCENTES ASESORADOS */}
                            <div className={`flex-1 flex flex-col bg-slate-50/50 ${selectedFaculty ? 'flex' : 'hidden md:flex items-center justify-center'}`}>
                                {selectedFaculty ? (
                                    <div className="flex flex-col h-full animate-fadeIn">
                                        <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-start shadow-sm relative z-10">
                                            <div>
                                                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1 block">Docentes en Acompañamiento</span>
                                                <h4 className="text-lg font-bold text-slate-800 leading-tight">{selectedFaculty}</h4>
                                            </div>
                                            <button onClick={() => setSelectedFaculty(null)} className="md:hidden text-xs font-bold text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg bg-white shadow-sm">Volver</button>
                                        </div>
                                        <div className="flex-1 overflow-auto custom-scrollbar p-6">
                                            <div className="space-y-4">
                                                {enrollments.filter(enr => {
                                                    const u = users.find(u => u.rut === enr.rut);
                                                    const f = u?.faculty || 'Sin Facultad / Externo';
                                                    const act = activities.find(a => a.id === enr.activityId);
                                                    return f === selectedFaculty && act?.category === 'ADVISORY';
                                                }).map((enr, i) => {
                                                    const u = users.find(user => user.rut === enr.rut);
                                                    const sessionCount = enr.sessionLogs?.length || 0;
                                                    
                                                    return (
                                                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-300 transition-colors">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-sm">
                                                                    {u?.names.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-slate-800 text-sm group-hover:text-indigo-700 transition-colors">{u?.names} {u?.paternalSurname}</div>
                                                                    <div className="text-[10px] text-slate-400 font-mono">{enr.rut}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-lg font-bold text-slate-700">{sessionCount}</div>
                                                                <div className="text-[9px] font-bold text-slate-400 uppercase">Atenciones</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-12">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                        </div>
                                        <h4 className="font-bold text-slate-400">Análisis Institucional</h4>
                                        <p className="text-xs text-slate-400 mt-1 max-w-[250px] mx-auto">Seleccione una facultad para visualizar el detalle de los docentes que reciben acompañamiento.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-indigo-50 border-t border-indigo-200 text-center">
                             <p className="text-[10px] text-indigo-800/60 font-bold uppercase tracking-widest italic">
                                Informe exclusivo para gestión de Asesorías Pedagógicas Individuales
                             </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
