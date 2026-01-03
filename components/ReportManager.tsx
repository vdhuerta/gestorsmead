import React, { useState, useMemo, useEffect } from 'react';
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

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [activeReport, setActiveReport] = useState<'consolidated' | 'effectiveness' | 'preferences' | 'advisoryImpact' | 'frequentTeachers' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
    const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);
    const [showEffectivenessHelp, setShowEffectivenessHelp] = useState(false);
    const [showPreferencesHelp, setShowPreferencesHelp] = useState(false);

    // --- EFECTO: RECARGA AUTOMÁTICA AL ENTRAR A UN INFORME O CAMBIAR AÑO ---
    useEffect(() => {
        if (activeReport) {
            executeReload();
        }
    }, [activeReport, selectedYear]);

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

    // --- LÓGICA FILTRO CONSOLIDADO (Filtrado por Año) ---
    const consolidatedList = useMemo(() => {
        return enrollments.filter(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear) return false;

            // 1. Estudiantes aprobados en cursos y postítulos
            if ((act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') && enr.state === ActivityState.APROBADO) return true;
            
            // 2. Participantes en TODAS las actividades de extensión
            if (act.category === 'GENERAL') return true;
            
            // 3. Estudiantes con expediente abierto en asesorías personalizadas
            if (act.category === 'ADVISORY') return true;

            return false;
        }).map(enr => {
            const user = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
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
    }, [enrollments, activities, users, selectedYear]);

    // Estadísticas de resumen para el informe consolidado
    const consolidatedStats = useMemo(() => {
        const stats = {
            total: consolidatedList.length,
            approved: 0,
            extension: 0,
            advisory: 0
        };

        consolidatedList.forEach(item => {
            if (item.activityData?.category === 'ACADEMIC' || item.activityData?.category === 'POSTGRADUATE') {
                stats.approved++;
            } else if (item.activityData?.category === 'GENERAL') {
                stats.extension++;
            } else if (item.activityData?.category === 'ADVISORY') {
                stats.advisory++;
            }
        });

        return stats;
    }, [consolidatedList]);

    // --- LÓGICA TASA DE EFECTIVIDAD POR FACULTAD (Filtrado por Año) ---
    const effectivenessData = useMemo(() => {
        const stats: Record<string, { total: number, approved: number }> = {};
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear || (act.category !== 'ACADEMIC' && act.category !== 'POSTGRADUATE')) return;
            const user = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (!stats[faculty]) stats[faculty] = { total: 0, approved: 0 };
            stats[faculty].total += 1;
            if (enr.state === ActivityState.APROBADO) stats[faculty].approved += 1;
        });
        return Object.entries(stats).map(([faculty, data]) => ({
            faculty, total: data.total, approved: data.approved,
            percentage: data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0
        })).sort((a, b) => b.percentage - a.percentage);
    }, [enrollments, activities, users, selectedYear]);

    // --- TOTALES GLOBALES EFECTIVIDAD ---
    const effectivenessStats = useMemo(() => {
        return effectivenessData.reduce((acc, curr) => ({
            total: acc.total + curr.total,
            approved: acc.approved + curr.approved
        }), { total: 0, approved: 0 });
    }, [effectivenessData]);

    // --- LÓGICA MATRIZ DE PREFERENCIAS (Filtrado por Año) ---
    const preferenceMatrix = useMemo(() => {
        const matrix: Record<string, { ACADEMIC: number, POSTGRADUATE: number, GENERAL: number, ADVISORY: number, total: number }> = {};

        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear) return;

            const user = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
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
    }, [enrollments, activities, users, selectedYear]);

    // --- TOTALES MATRIZ DE PREFERENCIAS ---
    const preferenceTotals = useMemo(() => {
        return preferenceMatrix.reduce((acc, curr) => ({
            ACADEMIC: acc.ACADEMIC + curr.ACADEMIC,
            POSTGRADUATE: acc.POSTGRADUATE + curr.POSTGRADUATE,
            GENERAL: acc.GENERAL + curr.GENERAL,
            ADVISORY: acc.ADVISORY + curr.ADVISORY,
            total: acc.total + curr.total
        }), { ACADEMIC: 0, POSTGRADUATE: 0, GENERAL: 0, ADVISORY: 0, total: 0 });
    }, [preferenceMatrix]);

    // --- LÓGICA MAPA DE IMPACTO DE ASESORÍAS (Filtrado por Año) ---
    const advisoryImpactData = useMemo(() => {
        const stats: Record<string, { files: number, sessions: number }> = {};
        
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.category !== 'ADVISORY' || act.year !== selectedYear) return;

            const user = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
            const faculty = user?.faculty || 'Sin Facultad / Externo';

            if (!stats[faculty]) stats[faculty] = { files: 0, sessions: 0 };
            
            stats[faculty].files += 1;
            stats[faculty].sessions += (enr.sessionLogs?.length || 0);
        });

        return Object.entries(stats).map(([faculty, data]) => ({
            faculty,
            ...data
        })).sort((a, b) => b.sessions - a.sessions);
    }, [enrollments, activities, users, selectedYear]);

    // --- TOTALES MAPA DE IMPACTO DE ASESORÍAS ---
    const advisoryImpactTotals = useMemo(() => {
        return advisoryImpactData.reduce((acc, curr) => ({
            files: acc.files + curr.files,
            sessions: acc.sessions + curr.sessions
        }), { files: 0, sessions: 0 });
    }, [advisoryImpactData]);

    // --- LÓGICA DOCENTES FRECUENTES (FIDELIZACIÓN - Filtrado por Año) ---
    const frequentTeachersData = useMemo(() => {
        const userApprovedCount: Record<string, number> = {};
        
        // Contar actividades de interés para fidelización en el año seleccionado
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear) return;
            
            // Criterio: Aprobados (Cursos) o registrados (Extensión/Asesoría)
            const isApproved = enr.state === ActivityState.APROBADO;
            const isExtensionOrAdvisory = act.category === 'GENERAL' || act.category === 'ADVISORY';
            
            if (isApproved || isExtensionOrAdvisory) {
                const normRut = normalizeRut(enr.rut);
                userApprovedCount[normRut] = (userApprovedCount[normRut] || 0) + 1;
            }
        });

        const stats: Record<string, { frequentCount: number, teacherRuts: string[] }> = {};
        
        Object.entries(userApprovedCount).forEach(([normRut, count]) => {
            // LÓGICA ACTUALIZADA: Se muestra a partir de 1 o más logros acumulados
            if (count >= 1) {
                const user = users.find(u => normalizeRut(u.rut) === normRut);
                const faculty = user?.faculty || 'Sin Facultad / Externo';
                if (!stats[faculty]) stats[faculty] = { frequentCount: 0, teacherRuts: [] };
                stats[faculty].frequentCount += 1;
                // Guardamos el RUT original del usuario para no perder el formato en la lista detalle
                stats[faculty].teacherRuts.push(user?.rut || normRut);
            }
        });

        return Object.entries(stats).map(([faculty, data]) => ({
            faculty,
            ...data
        })).sort((a, b) => b.frequentCount - a.frequentCount);
    }, [enrollments, users, activities, selectedYear]);

    // --- TOTAL DE DOCENTES FIDELIZADOS (Personas únicas) ---
    const totalFrequent = useMemo(() => {
        return frequentTeachersData.reduce((acc, curr) => acc + curr.frequentCount, 0);
    }, [frequentTeachersData]);

    // --- TOTAL DE LOGROS ACUMULADOS (Sumatoria de certificados/participaciones - Coincide con INICIO) ---
    const totalLogros = useMemo(() => {
        let count = 0;
        enrollments.forEach(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear) return;
            
            const isApproved = enr.state === ActivityState.APROBADO;
            const isExtensionOrAdvisory = act.category === 'GENERAL' || act.category === 'ADVISORY';
            
            if (isApproved || isExtensionOrAdvisory) {
                count++;
            }
        });
        return count;
    }, [enrollments, activities, selectedYear]);

    const filteredDrillDown = useMemo(() => {
        if (!detailFilter) return [];
        return enrollments.filter(enr => {
            const user = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
            const faculty = user?.faculty || 'Sin Facultad / Externo';
            if (faculty !== detailFilter.faculty) return false;

            const act = activities.find(a => a.id === enr.activityId);
            if (!act || act.year !== selectedYear) return false;

            if (!detailFilter.category || detailFilter.category === 'TOTAL') return true;
            
            return act.category === detailFilter.category;
        }).map(enr => ({
            ...enr,
            user: users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut)),
            activity: activities.find(a => a.id === enr.activityId)
        }));
    }, [detailFilter, enrollments, activities, users, selectedYear]);

    // --- EXPORTAR INFORME FIDELIZACION FACULTAD HTML ---
    const handleExportFacultyHTML = () => {
        if (!selectedFaculty) return;
        
        const facultyData = frequentTeachersData.find(f => f.faculty === selectedFaculty);
        if (!facultyData) return;

        let rowsHTML = '';
        facultyData.teacherRuts.forEach(rut => {
            const u = users.find(user => normalizeRut(user.rut) === normalizeRut(rut));
            const teacherEnrollments = enrollments.filter(e => {
                const act = activities.find(a => a.id === e.activityId);
                if (!act || act.year !== selectedYear) return false;
                const isApproved = e.state === ActivityState.APROBADO;
                const isExtensionOrAdvisory = act.category === 'GENERAL' || act.category === 'ADVISORY';
                return normalizeRut(e.rut) === normalizeRut(rut) && (isApproved || isExtensionOrAdvisory);
            });

            teacherEnrollments.forEach(enr => {
                const act = activities.find(a => a.id === enr.activityId);
                const isManualCert = act?.category === 'GENERAL' || act?.category === 'ADVISORY';
                const certValue = isManualCert ? 'PARTICIPACIÓN' : (enr.finalGrade || '-');
                
                rowsHTML += `
                    <tr>
                        <td>${u?.names} ${u?.paternalSurname} ${u?.maternalSurname || ''}</td>
                        <td>${u?.rut}</td>
                        <td>${u?.department || 'S/D'}</td>
                        <td>${act?.name || 'N/A'}</td>
                        <td style="text-align: center;">${act?.hours || '0'}</td>
                        <td style="text-align: center;">${enr.attendancePercentage || 0}%</td>
                        <td style="text-align: center; font-weight: bold;">${certValue}</td>
                    </tr>
                `;
            });
        });

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Informe de Fidelización - ${selectedFaculty}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; line-height: 1.6; background-color: #f8fafc; }
                    .container { max-width: 1100px; margin: auto; background: white; padding: 40px; border-radius: 12px; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; }
                    .header { border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
                    h1 { margin: 0; color: #1e293b; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
                    .faculty-name { color: #6366f1; font-weight: 800; font-size: 28px; display: block; margin-top: 5px; }
                    .timestamp { font-size: 12px; color: #94a3b8; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                    th { background-color: #f1f5f9; color: #475569; text-align: left; padding: 12px 10px; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 11px; }
                    td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; }
                    tr:nth-child(even) { background-color: #fcfcfc; }
                    tr:hover { background-color: #f5f3ff; }
                    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; pt: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div>
                            <h1>Informe de Fidelización Docente</h1>
                            <span class="faculty-name">${selectedFaculty}</span>
                        </div>
                        <div class="timestamp">Generado el: ${new Date().toLocaleString()}</div>
                    </div>
                    
                    <p style="font-size: 14px; margin-bottom: 20px;">
                        Este documento contiene el listado de docentes que han participado activamente en el ciclo de formación continua institucional en el periodo <strong>${selectedYear}</strong>, 
                        cumpliendo con el criterio de fidelización (1 o más actividades).
                    </p>

                    <table>
                        <thead>
                            <tr>
                                <th>Nombres y Apellido</th>
                                <th>RUT</th>
                                <th>Departamento</th>
                                <th>Actividad o Participación</th>
                                <th style="text-align: center;">Horas</th>
                                <th style="text-align: center;">Asistencia</th>
                                <th style="text-align: center;">Nota / Certificación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                        </tbody>
                    </table>

                    <div class="footer">
                        © ${new Date().getFullYear()} GestorSMEAD - Unidad de Acompañamiento Docente (UAD) <br>
                        Documento generado automáticamente para fines de gestión académica interna.
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `INFORME_FIDELIDAD_${selectedFaculty.replace(/\s+/g, '_').toUpperCase()}_${selectedYear}.html`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
        link.setAttribute("download", `REPORTE_CONSOLIDADO_${selectedYear}_${new Date().toISOString().split('T')[0]}.csv`);
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
                <div className="flex gap-4 items-center">
                    {/* SELECTOR DE PERIODO (MISMA ESTETICA QUE INICIO) */}
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

                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <div className={`w-2.5 h-2.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{isSyncing ? 'Actualizando Datos...' : 'Datos Actualizados'}</span>
                    </div>
                </div>
            </div>

            {/* GRID DE INFORMES DISPONIBLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* INFORME CONSOLIDADO */}
                <div onClick={() => setActiveReport('consolidated')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9 5 9-5-9-5-9 5zm0 4l9 5 9-5M3 18l9 5 9-5" />
                        </svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Informe Consolidado</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Listado maestro de alumnos con actividades aprobadas, extensión o asesorías en el periodo {selectedYear}.</p>
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
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Porcentaje de aprobación vs inscripción por unidad académica en {selectedYear}.</p>
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
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Cruzamiento de participación por Tipo de Actividad vs Facultad en {selectedYear}.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ver Matriz</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* MAPA DE IMPACTO DE ASESORÍAS */}
                <div onClick={() => setActiveReport('advisoryImpact')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-indigo-50 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-700 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Impacto de Asesorías</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Mapa de facultades con mayor demanda de acompañamiento en {selectedYear}.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Ver Mapa de Impacto</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>

                {/* ÍNDICE DE DOCENTES FRECUENTES */}
                <div onClick={() => setActiveReport('frequentTeachers')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Docentes Frecuentes</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">Índice de fidelización en {selectedYear}: Docentes con 1 o más logros.</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Ver Fidelización</span>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-purple-500 transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </div>
                </div>
            </div>

            {/* MODAL INFORME CONSOLIDADO */}
            {activeReport === 'consolidated' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col overflow-hidden border border-indigo-200">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div><h3 className="text-xl font-bold text-slate-800">Informe Consolidado de Participación Académica ({selectedYear})</h3><p className="text-xs text-slate-500 mt-1">Criterio: Aprobados, Extensión y Asesorías Abiertas.</p></div>
                            <div className="flex items-center gap-3"><button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Exportar CSV</button><button onClick={() => setActiveReport(null)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button></div>
                        </div>

                        {/* PANEL DE RESUMEN DE CONTEOS */}
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
                            {isSyncing && <div className="text-[10px] text-indigo-500 font-bold animate-pulse">Sincronizando registros...</div>}
                        </div>
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                    <tr><th className="px-4 py-3 bg-slate-100 border-r text-indigo-700">Fecha</th><th className="px-4 py-3 bg-slate-50 sticky left-0 border-r z-10">RUT</th><th className="px-4 py-3">Nombre Completo</th><th className="px-4 py-3">Unidad Académica (Facultad)</th><th className="px-4 py-3">Carrera / Depto</th><th className="px-4 py-3">Rol / Cargo</th><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Origen del Registro</th><th className="px-4 py-3">Estado Académico</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {consolidatedList.filter(i => !searchQuery || normalizeRut(i.rut).includes(normalizeRut(searchQuery)) || i.userData?.names.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
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

            {/* MODAL TASA DE EFECTIVIDAD */}
            {activeReport === 'effectiveness' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-emerald-200 relative">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div><h3 className="text-xl font-bold text-slate-800">Tasa de Efectividad Académica por Facultad ({selectedYear})</h3><p className="text-xs text-slate-500 mt-1">Porcentaje de aprobación en cursos curriculares desglosado por unidad académica.</p></div>
                            <div className="flex items-center gap-3">
                                {/* BOTÓN DE AYUDA EFECTIVIDAD */}
                                <button 
                                    onClick={() => setShowEffectivenessHelp(!showEffectivenessHelp)}
                                    className={`p-2 rounded-xl transition-all font-black uppercase text-[10px] tracking-widest border-2 flex items-center gap-2 ${showEffectivenessHelp ? 'bg-white text-emerald-600 border-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Ayuda
                                </button>
                                {isSyncing && <div className="text-[10px] text-emerald-600 font-bold animate-pulse">Sincronizando...</div>}
                                <button onClick={() => { setActiveReport(null); setSelectedFaculty(null); setShowEffectivenessHelp(false); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                            </div>
                        </div>

                        {/* PANEL DE AYUDA OVERLAY */}
                        {showEffectivenessHelp && (
                            <div className="absolute inset-0 z-50 bg-white/98 backdrop-blur-md p-10 overflow-y-auto animate-fadeIn border border-emerald-100">
                                <div className="max-w-4xl mx-auto space-y-8">
                                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                                        <h4 className="text-2xl font-black uppercase tracking-tight text-emerald-600">Guía del Informe de Efectividad</h4>
                                        <button onClick={() => setShowEffectivenessHelp(false)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded-lg transition-all text-slate-600">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm">
                                                <h5 className="font-black text-emerald-700 text-sm uppercase mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                                    Interpretación de Totales
                                                </h5>
                                                <ul className="space-y-4 text-xs text-slate-600 leading-relaxed">
                                                    <li>
                                                        <strong>Total Inscripciones:</strong> Sumatoria de todas las matrículas realizadas en programas de tipo <strong>Cursos Académicos</strong> y <strong>Postítulos</strong> para el año seleccionado. No incluye extensión ni asesorías.
                                                    </li>
                                                    <li>
                                                        <strong>Total Aprobaciones:</strong> Conteo de registros que han alcanzado el estado final de <strong>"Aprobado"</strong> (cumpliendo nota mínima y asistencia).
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                <h5 className="font-black text-slate-700 text-sm uppercase mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    Detalles y Filtros
                                                </h5>
                                                <ul className="space-y-4 text-xs text-slate-600 leading-relaxed">
                                                    <li>
                                                        <strong>Resumen Institucional:</strong> Lista las facultades ordenadas por su tasa de éxito porcentual. Al hacer clic, se activa el panel derecho.
                                                    </li>
                                                    <li>
                                                        <strong>Análisis Detallado (Derecha):</strong> Muestra la nómina individual de docentes de la facultad seleccionada, permitiendo auditar quién aprobó y en qué programa específico participó.
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100 text-center">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] italic">Unidad de Acompañamiento Docente • GestorSMEAD</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PANEL DE RESUMEN EFECTIVIDAD - SIMILAR A DOCENTES FRECUENTES */}
                        <div className="px-6 py-4 bg-emerald-50/30 border-b border-emerald-100 flex items-center gap-6">
                             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-emerald-100 shadow-sm">
                                 <div className="w-10 h-10 bg-emerald-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-emerald-700 leading-none">{effectivenessStats.total}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Total Inscripciones</span>
                                 </div>
                             </div>

                             <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-indigo-700 leading-none">{effectivenessStats.approved}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Total Aprobaciones</span>
                                 </div>
                             </div>

                             <div className="hidden lg:block flex-1 p-3 bg-white/40 rounded-xl border border-slate-100">
                                <p className="text-[10px] text-slate-500 leading-tight italic">
                                    <span className="font-bold text-emerald-600">Nota:</span> Estos datos corresponden exclusivamente a <strong>Cursos Curriculares y Postítulos</strong> del periodo {selectedYear}. 
                                    La tasa de efectividad mide la relación porcentual entre aprobados e inscritos.
                                </p>
                             </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            <div className={`w-full md:w-1/2 flex flex-col border-r border-slate-100 ${selectedFaculty ? 'hidden md:flex' : 'flex'}`}>
                                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen Institucional</h4>
                                </div>
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
                                                {enrollments.filter(enr => { const u = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut)); const f = u?.faculty || 'Sin Facultad / Externo'; const act = activities.find(a => a.id === enr.activityId); return f === selectedFaculty && act?.year === selectedYear && (act?.category === 'ACADEMIC' || act?.category === 'POSTGRADUATE'); }).map((enr, i) => { const u = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut)); const act = activities.find(a => a.id === enr.activityId); return (
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
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border border-blue-200 relative">
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">Matriz de Preferencias: Actividad vs Facultad ({selectedYear})</h3>
                                <p className="text-xs text-slate-500 mt-1">Análisis cruzado del volumen de participación por tipo de formación.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* BOTÓN DE AYUDA PREFERENCIAS */}
                                <button 
                                    onClick={() => setShowPreferencesHelp(!showPreferencesHelp)}
                                    className={`p-2 rounded-xl transition-all font-black uppercase text-[10px] tracking-widest border-2 flex items-center gap-2 ${showPreferencesHelp ? 'bg-white text-blue-600 border-blue-600 shadow-sm' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Ayuda
                                </button>
                                {isSyncing && <div className="text-[10px] text-blue-500 font-bold animate-pulse">Sincronizando...</div>}
                                <button onClick={() => { setActiveReport(null); setDetailFilter(null); setShowPreferencesHelp(false); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                            </div>
                        </div>

                        {/* PANEL DE AYUDA OVERLAY PREFERENCIAS */}
                        {showPreferencesHelp && (
                            <div className="absolute inset-0 z-50 bg-white/98 backdrop-blur-md p-10 overflow-y-auto animate-fadeIn border border-blue-100">
                                <div className="max-w-4xl mx-auto space-y-8">
                                    <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                                        <h4 className="text-2xl font-black uppercase tracking-tight text-blue-600">Guía de la Matriz de Preferencias</h4>
                                        <button onClick={() => setShowPreferencesHelp(false)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded-lg transition-all text-slate-600">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200 shadow-sm">
                                                <h5 className="font-black text-blue-700 text-sm uppercase mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                                    Interpretación de Números Totales
                                                </h5>
                                                <p className="text-xs text-slate-600 leading-relaxed">
                                                    Los totales mostrados en la barra de resumen corresponden a la sumatoria bruta de <strong>participaciones</strong> registradas por cada categoría durante el año {selectedYear}:
                                                </p>
                                                <ul className="space-y-2 text-[11px] text-slate-500 mt-2 list-disc pl-4">
                                                    <li><strong>Cursos:</strong> Matrículas en asignaturas académicas de pregrado.</li>
                                                    <li><strong>Postítulos:</strong> Registros en programas de formación avanzada.</li>
                                                    <li><strong>Extensión:</strong> Participantes en charlas, talleres y webinars.</li>
                                                    <li><strong>Asesorías:</strong> Cantidad de expedientes abiertos para acompañamiento individual.</li>
                                                </ul>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                                <h5 className="font-black text-slate-700 text-sm uppercase mb-3 flex items-center gap-2">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    Detalles y Análisis por Programa
                                                </h5>
                                                <ul className="space-y-4 text-xs text-slate-600 leading-relaxed">
                                                    <li>
                                                        <strong>Interactividad de la Matriz:</strong> Al hacer clic en cualquier número de la tabla (por ejemplo, el total de 'Extensión' de una facultad), se activará el <strong>Panel de Participantes Detallados</strong> a la derecha.
                                                    </li>
                                                    <li>
                                                        <strong>Análisis Nominal:</strong> El desglose muestra el nombre del docente, el programa específico en el que participó, la categoría a la que pertenece y su estado académico final.
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-slate-100 text-center">
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] italic">Unidad de Acompañamiento Docente • GestorSMEAD</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PANEL DE RESUMEN MATRIZ DE PREFERENCIAS - NUEVO */}
                        <div className="px-6 py-4 bg-blue-50/30 border-b border-blue-100 flex flex-wrap items-center gap-6">
                             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-blue-100 shadow-sm">
                                 <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-blue-700 leading-none">{preferenceTotals.total}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Participaciones Totales</span>
                                 </div>
                             </div>

                             <div className="flex items-center gap-4">
                                <div className="text-center px-3 border-r border-slate-200">
                                    <span className="block text-sm font-black text-indigo-600 leading-none">{preferenceTotals.ACADEMIC}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Cursos</span>
                                </div>
                                <div className="text-center px-3 border-r border-slate-200">
                                    <span className="block text-sm font-black text-purple-600 leading-none">{preferenceTotals.POSTGRADUATE}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Postítulos</span>
                                </div>
                                <div className="text-center px-3 border-r border-slate-200">
                                    <span className="block text-sm font-black text-teal-600 leading-none">{preferenceTotals.GENERAL}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Extensión</span>
                                </div>
                                <div className="text-center px-3">
                                    <span className="block text-sm font-black text-blue-600 leading-none">{preferenceTotals.ADVISORY}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">Asesorías</span>
                                </div>
                             </div>

                             <div className="hidden lg:block flex-1 p-3 bg-white/40 rounded-xl border border-slate-100">
                                <p className="text-[10px] text-slate-500 leading-tight italic">
                                    <span className="font-bold text-blue-600">Nota:</span> Estos datos representan la distribución de participaciones por tipo de actividad y unidad académica. 
                                    Un docente puede estar contabilizado en múltiples categorías si ha participado en programas distintos.
                                </p>
                             </div>
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
                                                Categoría: {CATEGORY_NAMES[detailFilter.category || 'TOTAL']}
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
                                                            <div className="font-bold text-slate-800 text-sm">
                                                                {item.user ? `${item.user.names} ${item.user.paternalSurname}` : 'Sin nombre en Base Maestra'}
                                                            </div>
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                                                item.activity?.category === 'ACADEMIC' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                                item.activity?.category === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                'bg-teal-50 text-teal-700 border-teal-100'
                                                            }`}>
                                                                {CATEGORY_NAMES[item.activity?.category || '']}
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
                                <h3 className="text-xl font-bold text-indigo-900">Mapa de Impacto de Asesorías Individuales ({selectedYear})</h3>
                                <p className="text-xs text-indigo-700 mt-1">Análisis de acompañamiento pedagógico por unidad académica (Facultad).</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {isSyncing && <div className="text-[10px] text-indigo-600 font-bold animate-pulse">Sincronizando...</div>}
                                <button onClick={() => { setActiveReport(null); setSelectedFaculty(null); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                            </div>
                        </div>

                        {/* PANEL DE RESUMEN MAPA DE IMPACTO - NUEVO */}
                        <div className="px-6 py-4 bg-indigo-50/30 border-b border-indigo-100 flex items-center gap-6">
                             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-indigo-700 leading-none">{advisoryImpactTotals.files}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Docentes Atendidos</span>
                                 </div>
                             </div>

                             <div className="flex items-center gap-3 bg-indigo-100 px-4 py-2 rounded-xl border border-indigo-200 shadow-sm">
                                 <div className="w-10 h-10 bg-indigo-700 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-indigo-800 leading-none">{advisoryImpactTotals.sessions}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Sesiones Realizadas</span>
                                 </div>
                             </div>

                             <div className="hidden lg:block flex-1 p-3 bg-white/40 rounded-xl border border-slate-100">
                                <p className="text-[10px] text-slate-500 leading-tight italic">
                                    <span className="font-bold text-indigo-600">Nota:</span> Estos datos corresponden al seguimiento institucional de <strong>Asesorías Pedagógicas Individuales</strong> del periodo {selectedYear}.
                                </p>
                             </div>
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
                                                    const u = users.find(u => normalizeRut(u.rut) === normalizeRut(enr.rut));
                                                    const f = u?.faculty || 'Sin Facultad / Externo';
                                                    const act = activities.find(a => a.id === enr.activityId);
                                                    return f === selectedFaculty && act?.category === 'ADVISORY' && act?.year === selectedYear;
                                                }).map((enr, i) => {
                                                    const u = users.find(user => normalizeRut(user.rut) === normalizeRut(enr.rut));
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
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
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

            {/* MODAL ÍNDICE DE DOCENTES FRECUENTES */}
            {activeReport === 'frequentTeachers' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border border-purple-300">
                        <div className="p-6 bg-purple-50 border-b border-purple-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-purple-900">Índice de Docentes Frecuentes (Fidelización - {selectedYear})</h3>
                                <p className="text-xs text-purple-700 mt-1">Identificación de docentes con 1 o más actividades aprobadas por unidad académica.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {isSyncing && <div className="text-[10px] text-purple-600 font-bold animate-pulse">Sincronizando...</div>}
                                <button onClick={() => { setActiveReport(null); setSelectedFaculty(null); }} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                            </div>
                        </div>

                        {/* PANEL DE RESUMEN DOCENTES FRECUENTES - COHERENCIA CON INICIO */}
                        <div className="px-6 py-4 bg-purple-50/30 border-b border-purple-100 flex items-center gap-6">
                             <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-purple-100 shadow-sm">
                                 <div className="w-10 h-10 bg-purple-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-purple-700 leading-none">{totalFrequent}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Docentes Fidelizados (Unicos)</span>
                                 </div>
                             </div>

                             <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md">
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                 </div>
                                 <div>
                                     <span className="block text-xl font-black text-indigo-700 leading-none">{totalLogros}</span>
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Total Logros Acumulados</span>
                                 </div>
                             </div>

                             <div className="hidden lg:block flex-1 p-3 bg-white/40 rounded-xl border border-slate-100">
                                <p className="text-[10px] text-slate-500 leading-tight italic">
                                    <span className="font-bold text-indigo-600">Nota:</span> El total de <strong>Logros ({totalLogros})</strong> coincide con el KPI Consolidado de Inicio. 
                                    La cifra de <strong>Docentes Fidelizados ({totalFrequent})</strong> es menor porque un mismo docente puede tener múltiples logros acumulados.
                                </p>
                             </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* RANKING DE FACULTADES POR FIDELIDAD */}
                            <div className={`w-full md:w-1/2 flex flex-col border-r border-slate-100 ${selectedFaculty ? 'hidden md:flex' : 'flex'}`}>
                                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unidades con Alta Cultura Participativa</h4>
                                    <span className="text-[10px] font-bold text-purple-600 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-100">Docentes Fidelizados</span>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
                                    {frequentTeachersData.map((item, idx) => (
                                        <div 
                                            key={idx}
                                            onClick={() => setSelectedFaculty(item.faculty)}
                                            className={`p-5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                                selectedFaculty === item.faculty 
                                                ? 'bg-purple-600 border-purple-700 text-white shadow-xl scale-[1.02]' 
                                                : 'bg-white border-slate-100 hover:border-purple-300 hover:bg-purple-50/30'
                                            }`}
                                        >
                                            <div className="flex-1 pr-4">
                                                <h5 className={`font-bold text-sm ${selectedFaculty === item.faculty ? 'text-white' : 'text-slate-800'}`}>{item.faculty}</h5>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className={`text-[10px] flex items-center gap-1 font-bold ${selectedFaculty === item.faculty ? 'text-purple-100' : 'text-slate-400'}`}>
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                        {item.frequentCount} Docentes con 1+ logros
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-2xl font-black ${selectedFaculty === item.faculty ? 'text-white' : 'text-purple-600'}`}>{item.frequentCount}</div>
                                                <div className={`text-[9px] font-bold uppercase tracking-tighter ${selectedFaculty === item.faculty ? 'text-purple-200' : 'text-slate-400'}`}>Índice</div>
                                            </div>
                                        </div>
                                    ))}
                                    {frequentTeachersData.length === 0 && (
                                        <div className="py-20 text-center text-slate-400 italic text-sm">
                                            No hay datos suficientes para calcular el índice de fidelización en {selectedYear}.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DETALLE DE DOCENTES POR FACULTAD SELECCIONADA */}
                            <div className={`flex-1 flex flex-col bg-slate-50/50 ${selectedFaculty ? 'flex' : 'hidden md:flex items-center justify-center'}`}>
                                {selectedFaculty ? (
                                    <div className="flex flex-col h-full animate-fadeIn">
                                        <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-start shadow-sm relative z-10">
                                            <div>
                                                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1 block">Ranking de Participación</span>
                                                <h4 className="text-lg font-bold text-slate-800 leading-tight">{selectedFaculty}</h4>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={handleExportFacultyHTML}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                    Exportar HTML
                                                </button>
                                                <button onClick={() => setSelectedFaculty(null)} className="md:hidden text-xs font-bold text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg bg-white shadow-sm">Volver</button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-auto custom-scrollbar p-6">
                                            <div className="space-y-4">
                                                {(() => {
                                                    const facultyData = frequentTeachersData.find(f => f.faculty === selectedFaculty);
                                                    if (!facultyData) return null;
                                                    
                                                    const getPrefix = (cat?: string) => {
                                                        if (cat === 'ACADEMIC' || cat === 'POSTGRADUATE') return 'CUR';
                                                        if (cat === 'GENERAL') return 'EXT';
                                                        if (cat === 'ADVISORY') return 'ASE';
                                                        return 'OTR';
                                                    };

                                                    return facultyData.teacherRuts.map(rut => {
                                                        const u = users.find(user => normalizeRut(user.rut) === normalizeRut(rut));
                                                        const teacherEnrollments = enrollments.filter(e => {
                                                            const act = activities.find(a => a.id === e.activityId);
                                                            if (!act || act.year !== selectedYear) return false;
                                                            const isApproved = e.state === ActivityState.APROBADO;
                                                            const isExtensionOrAdvisory = act.category === 'GENERAL' || act.category === 'ADVISORY';
                                                            return normalizeRut(e.rut) === normalizeRut(rut) && (isApproved || isExtensionOrAdvisory);
                                                        });
                                                        
                                                        return (
                                                            <div key={rut} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm group hover:border-purple-300 transition-all">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center font-bold text-sm">
                                                                            {u?.names.charAt(0)}
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-slate-800 text-sm group-hover:text-purple-700 transition-colors">{u?.names} {u?.paternalSurname}</div>
                                                                            <div className="text-[10px] text-slate-400 font-mono">
                                                                                {u?.rut} {u?.department && <span className="ml-2 text-slate-500 font-sans font-bold">• {u.department}</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="text-lg font-black text-purple-600">{teacherEnrollments.length}</div>
                                                                        <div className="text-[9px] font-bold text-slate-400 uppercase">Logros</div>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="space-y-2 mt-4">
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Historial Detallado:</p>
                                                                    {teacherEnrollments.map((enr, i) => {
                                                                        const act = activities.find(a => a.id === enr.activityId);
                                                                        const prefix = getPrefix(act?.category);
                                                                        
                                                                        return (
                                                                            <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                                                                                <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="font-black text-[9px] text-indigo-500">[{prefix}]</span>
                                                                                        <span className="font-medium">
                                                                                            {act?.name && act.name.length > 47 ? act.name.substring(0, 47) + '...' : act?.name || '---'}
                                                                                        </span>
                                                                                        <span className="text-[9px] font-mono text-slate-400 ml-auto">{act?.hours}h • {act?.year}</span>
                                                                                    </div>
                                                                                    <div className="flex gap-3 text-[9px] text-slate-400 mt-0.5">
                                                                                        {enr.finalGrade !== undefined && enr.finalGrade > 0 && act?.category !== 'GENERAL' && act?.category !== 'ADVISORY' ? (
                                                                                            <span>Nota: <span className="font-bold text-slate-600">{enr.finalGrade}</span></span>
                                                                                        ) : (
                                                                                            <span className="bg-emerald-50 text-emerald-700 px-1 rounded font-bold">PARTICIPACIÓN</span>
                                                                                        )}
                                                                                        <span>Asistencia: <span className="font-bold text-slate-600">{enr.attendancePercentage || 0}%</span></span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-12">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        </div>
                                        <h4 className="font-bold text-slate-400">Análisis de Fidelización</h4>
                                        <p className="text-xs text-slate-400 mt-1 max-w-[250px] mx-auto">Seleccione una unidad académica para listar a sus docentes con 1 o más actividades en el ciclo formativo del año {selectedYear}.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-purple-50 border-t border-purple-200 text-center">
                             <p className="text-[10px] text-purple-800/60 font-bold uppercase tracking-widest italic">
                                Informe basado en la participación histórica acumulada de actividades aprobadas
                             </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};