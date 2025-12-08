
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserRole, User, ActivityState, Activity, Enrollment } from '../types';
import { DataExporter } from './DataExporter';
import { useData } from '../context/DataContext';
import { SmartSelect } from './SmartSelect';
import { FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, ACADEMIC_ROLES } from '../constants';
import { TabType } from './RoleNavbar';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface DashboardProps {
  user: User;
  onNavigate?: (tab: TabType) => void;
}

// Colores Institucionales
const COLORS = ['#647FBC', '#91ADC8', '#AED6CF', '#FFBB28', '#FF8042'];
const STATUS_COLORS: Record<string, string> = {
    'Aprobado': '#AED6CF',
    'APROBADO': '#AED6CF',
    'Reprobado': '#FF8042',
    'REPROBADO': '#FF8042',
    'Inscrito': '#647FBC',
    'INSCRITO': '#647FBC',
    'No Cursado': '#E2E8F0',
    'Pendiente': '#91ADC8',
    'En Curso': '#FCD34D'
};

// Utility para formatear RUT
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

// Utility para formatear Fecha (DD-MM-AAAA)
const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const { activities, users, enrollments, enrollUser, upsertUsers, config } = useData();
  
  // State for Asesor View
  const [viewState, setViewState] = useState<'dashboard' | 'courseDetail'>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // --- STATE FOR STUDENT SELF-ENROLLMENT (RESTAURADO) ---
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [targetActivity, setTargetActivity] = useState<Activity | null>(null);
  
  // Listas
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  // --- KIOSK MODE STATES ---
  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  
  // CALENDARIO STATES (RESTAURADO)
  const [calDate, setCalDate] = useState(new Date());

  // Search Results
  const kioskResults = useMemo(() => {
      if (!activeSearchRut) return null;
      return enrollments.filter(e => e.rut.toLowerCase() === activeSearchRut.toLowerCase());
  }, [enrollments, activeSearchRut]);

  // User Search
  const searchedUser = useMemo(() => {
      if (!activeSearchRut) return null;
      return users.find(u => u.rut.toLowerCase() === activeSearchRut.toLowerCase()) || null;
  }, [users, activeSearchRut]);

  // Detail Modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  
  const selectedEnrollmentDetail = useMemo(() => {
      if (!selectedEnrollmentId) return null;
      return enrollments.find(e => e.id === selectedEnrollmentId) || null;
  }, [enrollments, selectedEnrollmentId]);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Auto-Enroll Form State
  const [enrollForm, setEnrollForm] = useState<User>({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      faculty: '', department: '', career: '', contractType: '', teachingSemester: '',
      campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
  });
  
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  // --- KPIS ADMIN (Solo se calculan si es admin/asesor para ahorrar recursos) ---
  const healthData = useMemo(() => {
      if (user.systemRole === UserRole.ESTUDIANTE) return [];
      const incomplete = users.filter(u => !u.email || !u.contractType || !u.campus).length;
      return [
          { name: 'Perfiles Completos', value: users.length - incomplete, color: '#647FBC' },
          { name: 'Incompletos', value: incomplete, color: '#FF8042' }
      ];
  }, [users, user.systemRole]);

  const approvalData = useMemo(() => {
      if (user.systemRole === UserRole.ESTUDIANTE) return [];
      const counts = { Aprobado: 0, Reprobado: 0, Inscrito: 0, Otros: 0 };
      enrollments.forEach(e => {
          if (e.state === ActivityState.APROBADO) counts.Aprobado++;
          else if (e.state === ActivityState.REPROBADO) counts.Reprobado++;
          else if (e.state === ActivityState.INSCRITO) counts.Inscrito++;
          else counts.Otros++;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [enrollments, user.systemRole]);

  const facultyData = useMemo(() => {
      if (user.systemRole === UserRole.ESTUDIANTE) return [];
      const map: Record<string, number> = {};
      enrollments.forEach(e => {
          const u = users.find(usr => usr.rut === e.rut);
          if (u?.faculty) {
             const shortName = u.faculty.replace('Facultad de ', '').substring(0, 15) + '...';
             map[shortName] = (map[shortName] || 0) + 1;
          }
      });
      return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [enrollments, users, user.systemRole]);

  const modalityData = useMemo(() => {
      if (user.systemRole === UserRole.ESTUDIANTE) return [];
      const map: Record<string, number> = {};
      activities.forEach(a => map[a.modality] = (map[a.modality] || 0) + 1);
      return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [activities, user.systemRole]);

  const attendanceTrendData = useMemo(() => {
      if (user.systemRole === UserRole.ESTUDIANTE) return [];
      const monthMap: Record<string, { total: number, count: number }> = {};
      enrollments.forEach(e => {
          const act = activities.find(a => a.id === e.activityId);
          if (act?.startDate && e.attendancePercentage !== undefined) {
              const date = new Date(act.startDate);
              const key = date.toLocaleString('es-CL', { month: 'short' });
              if (!monthMap[key]) monthMap[key] = { total: 0, count: 0 };
              monthMap[key].total += e.attendancePercentage;
              monthMap[key].count += 1;
          }
      });
      const order = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return Object.entries(monthMap)
        .map(([month, data]) => ({ month, promedio: Math.round(data.total / data.count) }))
        .sort((a, b) => order.indexOf(a.month) - order.indexOf(b.month));
  }, [enrollments, activities, user.systemRole]);


  // --- HANDLERS (General) ---
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

  const handleShowDetail = (enrollmentId: string) => {
      setSelectedEnrollmentId(enrollmentId);
      setShowDetailModal(true);
  };
  
  // --- CALENDAR HANDLERS ---
  const changeMonth = (offset: number) => {
      setCalDate(prev => {
          const newDate = new Date(prev);
          newDate.setMonth(prev.getMonth() + offset);
          return newDate;
      });
  };

  const getCalendarCells = () => {
      const year = calDate.getFullYear();
      const month = calDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for(let i = 0; i < firstDay; i++) cells.push(null);
      for(let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
      return cells;
  };

  // --- AUTOMATRICULA HANDLERS ---
  const handleOpenEnrollModal = (act: Activity) => {
      setTargetActivity(act);
      // Resetear formulario para nueva matrícula pública
      setEnrollForm({
          rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
          faculty: '', department: '', career: '', contractType: '',
          teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
      });
      setEnrollMsg(null);
      setShowEnrollModal(true);
  };

  const handleEnrollFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEnrollForm(prev => ({ ...prev, [name]: value }));
  };

  const handleRutBlurEnroll = () => {
      if (!enrollForm.rut) return;
      const formatted = cleanRutFormat(enrollForm.rut);
      const existingUser = users.find(u => u.rut === formatted);

      if (existingUser) {
          setEnrollForm(existingUser);
          setEnrollMsg({ type: 'success', text: `¡Hola ${existingUser.names}! Tus datos se cargaron automáticamente.` });
      } else {
          setEnrollForm(prev => ({ ...prev, rut: formatted }));
      }
  };

  const handleSubmitSelfEnroll = (e: React.FormEvent) => {
      e.preventDefault();
      if (!targetActivity) return;
      if (!enrollForm.rut || !enrollForm.names || !enrollForm.email) {
          setEnrollMsg({type: 'error', text: 'Por favor complete RUT, Nombre y Email.'});
          return;
      }
      
      const cleanRut = cleanRutFormat(enrollForm.rut);
      const alreadyEnrolled = enrollments.some(e => e.rut === cleanRut && e.activityId === targetActivity.id);
      
      if (alreadyEnrolled) {
          setEnrollMsg({type: 'error', text: '¡Ya estás inscrito en este curso!'});
          return;
      }

      const userToSave: User = {
          ...enrollForm,
          rut: cleanRut, 
          systemRole: UserRole.ESTUDIANTE // Always student for public enrollment
      };

      upsertUsers([userToSave]);
      enrollUser(cleanRut, targetActivity.id);
      
      alert(`¡Inscripción Exitosa!\nTe has matriculado en: ${targetActivity.name}`);
      setShowEnrollModal(false);
      setTargetActivity(null);
  };

  // --- CERTIFICADOS ---
  const generateHTMLCertificate = (user: User, course: Activity, dateStr: string) => {
        const win = window.open('', '_blank');
        if (!win) { alert("Permita los pop-ups."); return; }
        const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
        win.document.write(`
          <html><head><title>Certificado</title></head><body>
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>${fullName}</h1>
                <h2>${course.name}</h2>
                <p>${dateStr}</p>
                <p>Certificado generado por GestorSMEAD</p>
                <script>window.print();</script>
            </div>
          </body></html>
        `);
        win.document.close();
  };

  const handleGenerateCertificate = async (user: User | undefined, course: Activity | undefined) => {
      if (!user || !course) return;
      setIsGeneratingPdf(true);
      const dateStr = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
      
      try {
          const doc: any = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = "https://github.com/vdhuerta/assets-aplications/blob/main/Formato_Constancia.png?raw=true";
          
          img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = img.width; canvas.height = img.height;
              const ctx = canvas.getContext("2d");
              if(ctx) {
                  ctx.drawImage(img, 0, 0);
                  doc.addImage(canvas.toDataURL("image/png"), 'PNG', 0, 0, 297, 210);
                  doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.text(`${user.names} ${user.paternalSurname}`.toUpperCase(), 148.5, 100, { align: "center" });
                  doc.setFontSize(18); doc.text(course.name.toUpperCase(), 148.5, 135, { align: "center" });
                  doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text(dateStr, 170, 155);
                  doc.save(`Certificado.pdf`);
              }
              setIsGeneratingPdf(false);
          };
          img.onerror = () => { generateHTMLCertificate(user, course, dateStr); setIsGeneratingPdf(false); };
      } catch (e) { generateHTMLCertificate(user, course, dateStr); setIsGeneratingPdf(false); }
  };

  // =========================================================
  // VISTA 1: ESTUDIANTE (VISITA PÚBLICA)
  // =========================================================
  if (user.systemRole === UserRole.ESTUDIANTE) {
    const today = new Date();
    // 14 días atrás para lógica de "Activo"
    const limitDate = new Date();
    limitDate.setDate(today.getDate() - 14);

    // 1. ZONA PÚBLICA: OFERTA ACADÉMICA (ACTIVIDADES VIGENTES)
    // Criterio: Fecha inicio futura O Fecha inicio en los últimos 14 días.
    const publicActiveActivities = activities.filter(a => {
        if (!a.startDate) return false;
        // Fix simple para string YYYY-MM-DD
        const [y, m, d] = a.startDate.split('-').map(Number);
        const actDateObj = new Date(y, m - 1, d);
        
        return actDateObj >= limitDate; 
    });

    // 2. ZONA PÚBLICA: HISTORIAL INSTITUCIONAL (CATÁLOGO DE REFERENCIA)
    // Criterio: Fecha inicio anterior a 14 días.
    const publicPastActivities = activities.filter(a => {
        if (!a.startDate) return true; // Si no tiene fecha, asumimos antiguo
        const [y, m, d] = a.startDate.split('-').map(Number);
        const actDateObj = new Date(y, m - 1, d);
        return actDateObj < limitDate;
    });

    // Mensaje de Convocatoria (Semestral)
    const currentMonth = today.getMonth(); // 0-11
    const nextCallMsg = currentMonth < 6 
        ? "Próxima Convocatoria: 2do Semestre 2025" 
        : "Próxima Convocatoria: 1er Semestre 2026";

    // 3. ZONA PERSONAL: RESULTADOS DE BÚSQUEDA
    // Se calcula solo si hay activeSearchRut
    const targetEnrollments = activeSearchRut ? kioskResults || [] : [];
    const searchTargetUser = searchedUser || (activeSearchRut ? { names: 'Usuario', paternalSurname: 'Externo', rut: activeSearchRut } as User : null);

    // Calendar Cells for the current view
    const calendarCells = getCalendarCells();

    return (
        <div className="animate-fadeIn space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* COLUMNA IZQUIERDA (2/3): CONTENIDO PRINCIPAL */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* HERO & SEARCH SECTION (NUEVO COLOR) */}
                    <div className="bg-gradient-to-r from-[#647FBC] to-indigo-600 rounded-2xl p-8 shadow-md text-center text-white">
                        <h2 className="text-3xl font-bold mb-2">Portal Académico Público</h2>
                        <p className="text-blue-100 max-w-2xl mx-auto mb-6 font-medium">
                            Consulta tus certificados, revisa la oferta vigente e inscríbete en nuevas actividades.
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

                    {/* ZONA 1: RESULTADOS DE BÚSQUEDA PERSONAL (SOLO SI SE BUSCÓ) */}
                    {activeSearchRut && (
                        <div className="border-t-4 border-[#647FBC] bg-white rounded-xl shadow-md p-6 relative animate-fadeIn">
                            <button onClick={handleClearSearch} className="absolute top-4 right-4 text-slate-400 hover:text-red-500">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                            
                            <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                <svg className="w-6 h-6 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Resultados para: {searchTargetUser?.names} {searchTargetUser?.paternalSurname}
                            </h3>
                            <p className="text-slate-500 text-sm mb-6">RUT: {activeSearchRut}</p>

                            {targetEnrollments.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {targetEnrollments.map(enr => {
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
                                                    className="w-full text-xs bg-[#647FBC] text-white px-3 py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-sm"
                                                >
                                                    Ver Detalles Académicos
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                                    No se encontraron registros académicos para este RUT.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ZONA 2: OFERTA ACADÉMICA VIGENTE (PÚBLICA) */}
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6">
                            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                            Oferta Académica Vigente (Abierta)
                        </h3>
                        
                        {publicActiveActivities.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {publicActiveActivities.map(act => (
                                    <div key={act.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                                        <div className="absolute top-0 right-0 p-4">
                                            <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-1 rounded font-bold uppercase border border-amber-200 animate-pulse">
                                                Inscripciones Abiertas
                                            </span>
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="font-bold text-slate-900 text-lg mb-2 line-clamp-2 h-14">{act.name}</h4>
                                            <div className="text-sm text-slate-600 space-y-1 mb-6">
                                                <p className="flex items-center gap-2"><span className="text-slate-400">📅</span> Inicio: {formatDateCL(act.startDate)}</p>
                                                <p className="flex items-center gap-2"><span className="text-slate-400">🎓</span> Modalidad: {act.modality}</p>
                                                <p className="flex items-center gap-2"><span className="text-slate-400">👨‍🏫</span> {act.relator || 'Docente UPLA'}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleOpenEnrollModal(act)}
                                                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md transition-colors flex items-center justify-center gap-2"
                                            >
                                                Matricúlate Ahora
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                                <p className="text-slate-600 font-medium">No hay actividades con matrícula abierta en este momento.</p>
                                <p className="text-sm text-slate-400 mt-1">Revisa periódicamente este portal.</p>
                            </div>
                        )}
                    </div>

                    {/* ZONA 3: HISTORIAL INSTITUCIONAL (REFERENCIA) */}
                    <div className="border-t border-slate-200 pt-8">
                        <h3 className="text-xl font-bold text-slate-600 flex items-center gap-2 mb-4 opacity-80">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Historial de Cursos Realizados (Cerrados)
                        </h3>
                        
                        <div className="bg-slate-100 rounded-xl p-6">
                            <div className="flex items-center gap-4 bg-indigo-50 border border-indigo-100 p-4 rounded-lg mb-6">
                                <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <div>
                                    <h4 className="font-bold text-indigo-900">Catálogo de Referencia</h4>
                                    <p className="text-sm text-indigo-700">Estos cursos ya finalizaron. {nextCallMsg}.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
                                {publicPastActivities.slice(0, 8).map(act => (
                                    <div key={act.id} className="bg-white p-4 rounded-lg border border-slate-200">
                                        <h5 className="font-bold text-slate-700 text-sm mb-1 truncate" title={act.name}>{act.name}</h5>
                                        <p className="text-xs text-slate-500 mb-2">{act.year} • {act.modality}</p>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded">Finalizado</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA (1/3): CALENDARIO RESTAURADO */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden sticky top-24">
                        <div className="bg-[#647FBC] p-4 text-white flex justify-between items-center">
                            <button onClick={() => changeMonth(-1)} className="hover:bg-white/20 p-1 rounded"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <span className="font-bold text-lg capitalize">{calDate.toLocaleString('es-CL', { month: 'long', year: 'numeric' })}</span>
                            <button onClick={() => changeMonth(1)} className="hover:bg-white/20 p-1 rounded"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                        <div className="p-4">
                            <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-400 mb-2">
                                <div>Do</div><div>Lu</div><div>Ma</div><div>Mi</div><div>Ju</div><div>Vi</div><div>Sa</div>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {calendarCells.map((date, i) => {
                                    if (!date) return <div key={i} className="h-8"></div>;
                                    
                                    // Check for activities on this date
                                    const dateStr = date.toISOString().split('T')[0];
                                    const hasActivity = activities.some(a => a.startDate === dateStr);
                                    const isToday = date.toDateString() === new Date().toDateString();

                                    return (
                                        <div key={i} className={`h-8 flex items-center justify-center rounded-full text-sm relative group cursor-pointer hover:bg-slate-100 ${isToday ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-600'}`}>
                                            {date.getDate()}
                                            {hasActivity && (
                                                <span className="absolute bottom-1 w-1 h-1 bg-[#647FBC] rounded-full"></span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Eventos del Mes</h4>
                                <div className="space-y-2">
                                    {activities
                                        .filter(a => {
                                            if (!a.startDate) return false;
                                            const d = new Date(a.startDate);
                                            return d.getMonth() === calDate.getMonth() && d.getFullYear() === calDate.getFullYear();
                                        })
                                        .slice(0, 3)
                                        .map(act => (
                                            <div key={act.id} className="text-xs flex gap-2 items-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#647FBC] flex-shrink-0"></div>
                                                <span className="text-slate-600 truncate">{formatDateCL(act.startDate)} - {act.name}</span>
                                            </div>
                                        ))
                                    }
                                    {activities.filter(a => a.startDate && new Date(a.startDate).getMonth() === calDate.getMonth()).length === 0 && (
                                        <p className="text-xs text-slate-400 italic">Sin actividades programadas.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* MODAL DETALLE ACADÉMICO (Solo lectura personal) */}
            {showDetailModal && selectedEnrollmentDetail && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="bg-[#647FBC] p-4 text-white flex justify-between items-center">
                            <h3 className="font-bold">Detalle Académico</h3>
                            <button onClick={() => setShowDetailModal(false)} className="text-white hover:bg-white/20 p-1 rounded">✕</button>
                        </div>
                        <div className="p-6">
                            {/* Reutilizando lógica de mostrar notas... */}
                            <div className="text-center mb-6">
                                <span className={`text-3xl font-bold ${selectedEnrollmentDetail.state === 'Aprobado' ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {selectedEnrollmentDetail.finalGrade || '--'}
                                </span>
                                <p className="text-xs text-slate-400 uppercase">Nota Final</p>
                            </div>
                            {selectedEnrollmentDetail.state === 'Aprobado' && (
                                <button 
                                    onClick={() => handleGenerateCertificate(searchTargetUser || user, activities.find(a => a.id === selectedEnrollmentDetail.activityId)!)}
                                    className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold"
                                >
                                    Descargar Certificado
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL AUTO-MATRÍCULA (PÚBLICO) */}
            {showEnrollModal && targetActivity && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-emerald-600 p-6 text-white">
                            <h3 className="text-xl font-bold">Matricúlate en Línea</h3>
                            <p className="text-emerald-100 text-sm mt-1">{targetActivity.name}</p>
                        </div>
                        <form onSubmit={handleSubmitSelfEnroll} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">RUT *</label>
                                <input type="text" name="rut" required placeholder="12345678-9" value={enrollForm.rut} onChange={handleEnrollFormChange} onBlur={handleRutBlurEnroll} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo *</label>
                                <input type="text" name="names" required value={enrollForm.names} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico *</label>
                                <input type="email" name="email" required value={enrollForm.email} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border rounded-lg"/>
                            </div>
                            
                            {enrollMsg && (
                                <div className={`text-xs p-3 rounded text-center font-bold ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {enrollMsg.text}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEnrollModal(false)} className="flex-1 py-2 border border-slate-300 text-slate-600 rounded-lg font-bold">Cancelar</button>
                                <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Confirmar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
  }

  // =========================================================
  // VISTA 2: ASESOR (OPERATIVO - MODO EQUIPO COLABORATIVO)
  // =========================================================
  if (user.systemRole === UserRole.ASESOR) {
      
      // 1. CARGA GLOBAL DE CURSOS (Sin filtrar por relator)
      const allAcademicCourses = activities.filter(a => (!a.category || a.category === 'ACADEMIC'));
      const allExtensionActivities = activities.filter(a => a.category === 'GENERAL');

      // 2. OBTENER LISTA DE ASESORES (Para el panel de equipo)
      const activeAdvisors = users.filter(u => u.systemRole === UserRole.ASESOR);

      return (
          <div className="animate-fadeIn space-y-8">
              
              <div className="flex flex-col md:flex-row gap-6">
                  {/* PANEL DE BIENVENIDA */}
                  <div className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-8 shadow-md text-white">
                      <h2 className="text-3xl font-bold mb-2">Espacio de Gestión Colaborativa</h2>
                      <p className="text-indigo-100 max-w-xl text-sm">
                          Has ingresado al panel unificado de Asesores. Todos los miembros del equipo tienen visibilidad completa sobre la Base Maestra y el Catálogo de Actividades.
                      </p>
                  </div>

                  {/* PANEL DE EQUIPO (Visualización de Asesores) */}
                  <div className="w-full md:w-auto bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-center min-w-[300px]">
                      <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 text-center tracking-wider">Equipo de Asesores Activo</h3>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                          {activeAdvisors.map((adv) => {
                              const isMe = adv.rut === user.rut;
                              return (
                                  <div key={adv.rut} className="relative group flex flex-col items-center">
                                      <div className={`w-10 h-10 rounded-full overflow-hidden border-2 ${isMe ? 'border-green-400 ring-2 ring-green-100' : 'border-slate-100'}`}>
                                          {adv.photoUrl ? (
                                              <img src={adv.photoUrl} alt={adv.names} className="w-full h-full object-cover" />
                                          ) : (
                                              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
                                                  {adv.names.charAt(0)}
                                              </div>
                                          )}
                                      </div>
                                      {/* Tooltip */}
                                      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap transition-opacity pointer-events-none z-10">
                                          {adv.names} {isMe && '(Tú)'}
                                      </div>
                                      {/* Online Status Dot (Only for self as confirmed, others visual) */}
                                      {isMe && (
                                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
                                      )}
                                  </div>
                              );
                          })}
                          <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 font-bold ml-1">
                              {activeAdvisors.length}
                          </div>
                      </div>
                  </div>
              </div>

              {/* TABLA 1: CATALOGO GLOBAL ACADÉMICO */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          Catálogo Global de Cursos Académicos
                      </h3>
                      <span className="bg-[#647FBC] text-white text-xs font-bold px-2 py-1 rounded-full">{allAcademicCourses.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                  <th className="px-6 py-3">Código</th>
                                  <th className="px-6 py-3">Nombre del Curso</th>
                                  <th className="px-6 py-3">Relator (Responsable)</th>
                                  <th className="px-6 py-3">Modalidad</th>
                                  <th className="px-6 py-3 text-center">Inscritos</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {allAcademicCourses.map(course => {
                                  const enrolledCount = enrollments.filter(e => e.activityId === course.id).length;
                                  // Highlight user's own courses slightly
                                  const isMyCourse = course.relator && user.paternalSurname && course.relator.toLowerCase().includes(user.paternalSurname.toLowerCase());
                                  
                                  return (
                                      <tr 
                                        key={course.id} 
                                        onClick={() => {
                                            if (onNavigate) {
                                                localStorage.setItem('jumpto_course_id', course.id);
                                                onNavigate('courses');
                                            }
                                        }}
                                        title="Click para gestionar este curso"
                                        className={`transition-colors cursor-pointer group ${isMyCourse ? 'bg-blue-50/40 hover:bg-blue-100' : 'hover:bg-blue-50'}`}
                                      >
                                          <td className="px-6 py-4 font-mono text-slate-500 text-xs">{course.internalCode || course.id}</td>
                                          <td className="px-6 py-4 font-medium text-slate-800 group-hover:text-blue-700 transition-colors">{course.name}</td>
                                          <td className="px-6 py-4 text-slate-600">
                                              {course.relator}
                                              {isMyCourse && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">MIO</span>}
                                          </td>
                                          <td className="px-6 py-4 text-slate-500">{course.modality}</td>
                                          <td className="px-6 py-4 text-center font-bold text-[#647FBC] group-hover:scale-110 transition-transform">{enrolledCount}</td>
                                      </tr>
                                  );
                              })}
                              {allAcademicCourses.length === 0 && (
                                  <tr>
                                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No hay cursos académicos registrados en la Base Maestra.</td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>

              {/* TABLA 2: ACTIVIDADES DE EXTENSIÓN GLOBAL */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          Todas las Actividades de Extensión
                      </h3>
                      <span className="bg-teal-600 text-white text-xs font-bold px-2 py-1 rounded-full">{allExtensionActivities.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                  <th className="px-6 py-3">Tipo</th>
                                  <th className="px-6 py-3">Nombre Actividad</th>
                                  <th className="px-6 py-3">Relator</th>
                                  <th className="px-6 py-3">Fecha</th>
                                  <th className="px-6 py-3 text-right">Recursos</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {allExtensionActivities.map(act => (
                                  <tr 
                                    key={act.id} 
                                    onClick={() => {
                                        if (onNavigate) {
                                            localStorage.setItem('jumpto_activity_id', act.id);
                                            onNavigate('generalActivities');
                                        }
                                    }}
                                    title="Click para gestionar esta actividad"
                                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                  >
                                      <td className="px-6 py-4">
                                          <span className="bg-teal-50 text-teal-700 px-2 py-1 rounded text-xs font-bold border border-teal-100 group-hover:bg-teal-100">
                                              {act.activityType || 'General'}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 font-medium text-slate-800 group-hover:text-teal-700 transition-colors">{act.name}</td>
                                      <td className="px-6 py-4 text-slate-600">{act.relator || 'N/A'}</td>
                                      <td className="px-6 py-4 text-slate-600">{formatDateCL(act.startDate)}</td>
                                      <td className="px-6 py-4 text-right">
                                          {act.linkResources ? (
                                              <a 
                                                href={act.linkResources} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="text-teal-600 hover:text-teal-800 font-bold text-xs underline z-10 relative"
                                                onClick={(e) => e.stopPropagation()} // Prevent row click
                                              >
                                                  Ver Recursos
                                              </a>
                                          ) : (
                                              <span className="text-slate-300 text-xs">-</span>
                                          )}
                                      </td>
                                  </tr>
                              ))}
                              {allExtensionActivities.length === 0 && (
                                  <tr>
                                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">No hay actividades de extensión registradas.</td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      );
  }

  // =========================================================
  // VISTA 3: ADMINISTRADOR (GERENCIAL)
  // =========================================================
  // ... (Rest of the component remains largely same, just referencing ESTUDIANTE instead of VISITA) ...
  // ... including RoleNavbar updates handled in RoleNavbar.tsx ...

  return (
    <div className="animate-fadeIn space-y-6">
        <div className="bg-[#647FBC]/5 border border-[#647FBC]/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
                <h2 className="text-2xl font-bold text-[#647FBC]">Panel de Administración</h2>
                <p className="text-[#647FBC]/80">Inteligencia de Negocios y Estado del Sistema</p>
            </div>
            <DataExporter />
        </div>
        
        {/* Gráficos Admin */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 mb-4">Salud de Base Maestra</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={healthData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {healthData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-500 mb-4">Distribución por Facultad</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={facultyData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 10}} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#647FBC" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 mb-4">Tasas de Aprobación</h3>
                <div className="h-48 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={approvalData}
                                cx="50%"
                                cy="50%"
                                outerRadius={70}
                                dataKey="value"
                                labelLine={false}
                            >
                                {approvalData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                             <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 mb-4">Modalidad de Cursos</h3>
                 <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modalityData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{fontSize: 11}} />
                            <YAxis />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="value" fill="#91ADC8" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 mb-4">Tendencia de Asistencia Promedio (Anual)</h3>
                 <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={attendanceTrendData}>
                            <defs>
                                <linearGradient id="colorAsist" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#AED6CF" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#AED6CF" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" />
                            <YAxis domain={[0, 100]} />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <Tooltip />
                            <Area type="monotone" dataKey="promedio" stroke="#AED6CF" fillOpacity={1} fill="url(#colorAsist)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    </div>
  );
};
