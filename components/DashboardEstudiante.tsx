import React, { useState, useMemo } from 'react';
import { User, Activity, ActivityState, Enrollment, UserRole } from '../types';
import { useData, normalizeRut } from '../context/DataContext';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
import { useReloadDirective } from '../hooks/useReloadDirective';
// @ts-ignore
import { jsPDF } from 'jspdf';

// --- UTILITIES ---
const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '').replace(/^0+/, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

// Helper para cargar imagen remota a PDF (Promise)
const loadImageToPdf = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

// --- MINI CALENDAR COMPONENT (Interactividad de Meses añadida) ---
const MiniCalendar: React.FC<{ activities: Activity[] }> = ({ activities }) => {
    const today = new Date();
    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dayNames = ["L", "M", "M", "J", "V", "S", "D"];
    
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const days = [];
    for (let i = 0; i < adjustedFirstDay; i++) { days.push(null); }
    for (let i = 1; i <= daysInMonth; i++) { days.push(i); }

    const activitiesByDay: Record<number, Activity[]> = {};
    activities.forEach(act => {
        if(act.startDate) {
            const [y, m, d] = act.startDate.split('-').map(Number);
            if (y === viewYear && (m - 1) === viewMonth) {
                if(!activitiesByDay[d]) activitiesByDay[d] = [];
                activitiesByDay[d].push(act);
            }
        }
    });

    const nextMonth = () => {
        setViewDate(new Date(viewYear, viewMonth + 1, 1));
    };

    const prevMonth = () => {
        setViewDate(new Date(viewYear, viewMonth - 1, 1));
    };

    const resetToToday = () => {
        setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Calendario
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={resetToToday} className="text-[10px] font-black text-[#647FBC] uppercase bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">
                        {monthNames[viewMonth]} {viewYear}
                    </button>
                    <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {dayNames.map((d, i) => (
                    <span key={i} className="text-[10px] font-bold text-slate-400 uppercase">{d}</span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
                {days.map((day, idx) => {
                    if (day === null) return <div key={idx} className="h-9"></div>;
                    const dayActs = activitiesByDay[day] || [];
                    const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                    return (
                        <div key={idx} className={`h-9 flex flex-col items-center justify-center rounded-lg border transition-all relative group
                            ${isToday ? 'bg-[#647FBC] text-white border-[#647FBC] shadow-md scale-105 z-10' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'}
                            ${dayActs.length > 0 ? 'font-bold cursor-help' : ''}
                        `}>
                            <span className="text-xs">{day}</span>
                            <div className="flex gap-0.5 mt-0.5">
                                {dayActs.some(a => a.category === 'ACADEMIC') && <div className={`w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-500'}`}></div>}
                                {dayActs.some(a => a.category === 'POSTGRADUATE') && <div className={`w-1 h-1 rounded-full ${isToday ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                                {dayActs.some(a => a.category === 'GENERAL') && <div className={`w-1 h-1 rounded-full ${isToday ? 'bg-teal-200' : 'bg-teal-500'}`}></div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* LEYENDA DEL CALENDARIO */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Cursos</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Postítulos</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Extensión</span>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
export const DashboardEstudiante: React.FC<{ user: User }> = ({ user }) => {
  const { activities, users, enrollments, config, upsertUsers, enrollUser, updateEnrollment } = useData();
  const { isSyncing, executeReload } = useReloadDirective();

  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Enrollment Modal States
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [activityToEnroll, setActivityToEnroll] = useState<Activity | null>(null);
  const [enrollForm, setEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      campus: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', academicRole: ''
  });
  const [enrollStatus, setEnrollStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // FILTROS INDEPENDIENTES
  const openActivities = useMemo(() => {
    return activities.filter(a => 
      (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE') && 
      a.isPublic !== false &&
      (!a.endDate || a.endDate >= todayStr)
    );
  }, [activities, todayStr]);

  const closedActivities = useMemo(() => {
    return activities.filter(a => 
      (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE') && 
      a.isPublic !== false &&
      (a.endDate && a.endDate < todayStr)
    );
  }, [activities, todayStr]);

  const handleRutBlur = () => {
    if (!enrollForm.rut) return;
    const formatted = cleanRutFormat(enrollForm.rut);
    const rawSearch = normalizeRut(formatted);
    setEnrollForm(prev => ({ ...prev, rut: formatted }));
    
    const existingUser = users.find(u => normalizeRut(u.rut) === rawSearch);
    if (existingUser) {
        setEnrollForm({
            rut: existingUser.rut, names: existingUser.names, paternalSurname: existingUser.paternalSurname, maternalSurname: existingUser.maternalSurname || '',
            email: existingUser.email || '', phone: existingUser.phone || '', campus: existingUser.campus || '', faculty: existingUser.faculty || '',
            department: existingUser.department || '', career: existingUser.career || '', contractType: existingUser.contractType || '',
            teachingSemester: existingUser.teachingSemester || '', academicRole: existingUser.academicRole || ''
        });
    }
  };

  const handleOpenEnrollment = (act: Activity) => {
    setActivityToEnroll(act);
    setEnrollStatus(null);
    if (user.rut !== '9.876.543-2') {
        setEnrollForm({
            rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '',
            email: user.email || '', phone: user.phone || '', campus: user.campus || '', faculty: user.faculty || '',
            department: user.department || '', career: user.career || '', contractType: user.contractType || '',
            teachingSemester: user.teachingSemester || '', academicRole: user.academicRole || ''
        });
    } else {
        setEnrollForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', campus: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', academicRole: '' });
    }
    setShowEnrollmentModal(true);
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activityToEnroll) return;
      
      const formattedRut = cleanRutFormat(enrollForm.rut);
      const isAlreadyEnrolled = enrollments.some(enr => enr.activityId === activityToEnroll.id && normalizeRut(enr.rut) === normalizeRut(formattedRut));
      
      if (isAlreadyEnrolled) {
          setEnrollStatus({ type: 'error', text: 'Usted ya registra una matrícula activa en este programa.' });
          return;
      }

      try {
          await upsertUsers([{ ...enrollForm, rut: formattedRut, systemRole: UserRole.ESTUDIANTE }]);
          await enrollUser(formattedRut, activityToEnroll.id);
          await executeReload();
          setEnrollStatus({ type: 'success', text: '¡Matrícula Exitosa! Su expediente académico ha sido actualizado.' });
          setTimeout(() => setShowEnrollmentModal(false), 2000);
      } catch (err) {
          setEnrollStatus({ type: 'error', text: 'Error de comunicación. Intente nuevamente.' });
      }
  };

  const handleDownloadCertificate = async (enrollment: Enrollment, activity: Activity, student: User) => {
      setIsGeneratingPdf(true);
      try {
          const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth(); 
          const pageHeight = doc.internal.pageSize.getHeight(); 
          const bgUrl = "https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Formato_Constancia.png";
          
          const bgImg = await loadImageToPdf(bgUrl);
          doc.addImage(bgImg, 'PNG', 0, 0, pageWidth, pageHeight);
          doc.setTextColor(30, 41, 59);

          // Nombre Estudiante
          doc.setFont("helvetica", "bold");
          doc.setFontSize(17); 
          const fullName = `${student.names} ${student.paternalSurname} ${student.maternalSurname || ''}`.toUpperCase();
          doc.text(fullName, 55, 103, { align: "left" });

          // Fecha Emisión
          const date = new Date();
          const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
          const dateText = `Valparaíso, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
          doc.text(dateText, 60, 113, { align: "left" });

          // Nombre Curso
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          const splitCourseName = doc.splitTextToSize(activity.name.toUpperCase(), pageWidth - 40);
          doc.text(splitCourseName, 108, 140, { align: "center" });

          // Horas y RUT
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const combinedInfo = `Duración: ${activity.hours} horas cronológicas      RUT: ${student.rut}`;
          doc.text(combinedInfo, 108, 180, { align: "center" });

          // Verificación y QR
          const certCode = enrollment.certificateCode || `UPLA-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          doc.setFont("courier", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139); 
          doc.text(`ID VERIFICACIÓN: ${certCode}`, 125, 220);

          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_cert&code=${certCode}`)}`;
          const qrImg = await loadImageToPdf(qrUrl);
          doc.addImage(qrImg, 'PNG', 145, 225, 25, 25);
          
          if (!enrollment.certificateCode) {
              await updateEnrollment(enrollment.id, { certificateCode: certCode });
          }

          doc.save(`Certificado_${student.rut}_${activity.internalCode || 'UPLA'}.pdf`);
      } catch (err) {
          alert("Error al generar el certificado.");
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
        
        {/* COLUMNA IZQUIERDA: CONTENIDO ESTUDIANTE */}
        <div className="lg:col-span-2 space-y-12">
            
            {/* BUSCADOR DE RESULTADOS (PRIVADO) */}
            <section className="bg-gradient-to-br from-[#647FBC] to-indigo-700 rounded-3xl p-8 shadow-xl text-center text-white relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Consulta Académica</h2>
                    <p className="text-blue-100 max-w-xl mx-auto mb-6 text-sm">Visualiza el estado de tus notas, asistencia y certificaciones oficiales.</p>
                    <div className="max-w-md mx-auto bg-white/10 p-2 rounded-2xl border border-white/20 flex gap-2 backdrop-blur-md">
                        <input 
                            type="text" 
                            placeholder="Ingrese su RUT (ej: 12345678-9)" 
                            value={kioskRut} 
                            onChange={(e) => setKioskRut(e.target.value)} 
                            className="flex-1 pl-4 py-3 rounded-xl border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white shadow-inner"
                        />
                        <button 
                            onClick={() => setActiveSearchRut(cleanRutFormat(kioskRut))} 
                            className="bg-white text-[#647FBC] px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-blue-50 transition-all shadow-lg active:scale-95"
                        >
                            Consultar
                        </button>
                    </div>
                </div>
            </section>

            {/* RESULTADOS FILTRADOS */}
            {activeSearchRut && (
                <div className="border-t-8 border-[#647FBC] bg-white rounded-3xl shadow-xl p-8 relative animate-fadeInDown">
                    <button onClick={() => { setActiveSearchRut(null); setKioskRut(''); }} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <h3 className="text-lg font-black text-slate-800 mb-8 flex items-center gap-3">Expediente de: <span className="text-[#647FBC] font-mono">{activeSearchRut}</span></h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).map(enr => {
                            const act = activities.find(a => a.id === enr.activityId);
                            if (!act) return null;
                            return (
                                <div key={enr.id} className="border border-slate-100 rounded-2xl p-6 bg-slate-50 hover:bg-white hover:shadow-lg transition-all border-l-4 border-l-[#647FBC]">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-wider ${enr.state === ActivityState.APROBADO ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{enr.state}</span>
                                        <span className="text-[9px] text-slate-400 font-mono">{act.internalCode}</span>
                                    </div>
                                    <h4 className="font-bold text-slate-800 text-sm mb-4 leading-tight min-h-[32px] line-clamp-2">{act.name}</h4>
                                    <button 
                                        onClick={() => { setSelectedEnrollmentId(enr.id); setShowDetailModal(true); }} 
                                        className="w-full text-[10px] font-black uppercase tracking-widest bg-[#647FBC] text-white py-2.5 rounded-xl hover:bg-blue-800 transition-all shadow-md flex justify-center items-center gap-2"
                                    >
                                        VER DETALLES ACADÉMICOS
                                    </button>
                                </div>
                            );
                        })}
                        {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).length === 0 && (
                            <p className="col-span-full py-8 text-center text-slate-400 italic">No se encontraron matrículas para el RUT ingresado.</p>
                        )}
                    </div>
                </div>
            )}

            {/* SECCIÓN CURSOS ABIERTOS */}
            <section className="space-y-8">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </div>
                        CURSOS ABIERTOS
                    </h2>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full animate-pulse">Inscripción Activa</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {openActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 hover:shadow-2xl transition-all flex flex-col h-full border-t-8 border-t-emerald-500 group">
                            <div className="flex justify-between items-start mb-6">
                                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-full border border-indigo-100 uppercase">{act.academicPeriod || act.year}</span>
                                <span className="text-[10px] text-slate-300 font-mono font-bold">{act.internalCode}</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 leading-tight mb-6 flex-1 group-hover:text-emerald-700 transition-colors">{act.name}</h3>
                            <div className="space-y-3 text-xs text-slate-500 mb-8 bg-slate-50 p-4 rounded-2xl">
                                <p className="flex items-center gap-3">
                                    <svg className="w-4 h-4 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    Docente: <span className="font-bold text-slate-700">{act.relator || 'No asignado'}</span>
                                </p>
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Inicio: <span className="font-bold text-slate-700">{formatDateCL(act.startDate)}</span></p>
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Horas: <span className="font-bold text-slate-700">{act.hours}h Cronológicas</span></p>
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Modalidad: <span className="font-bold text-slate-700">{act.modality}</span></p>
                            </div>
                            <button 
                                onClick={() => handleOpenEnrollment(act)}
                                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                Matricúlate Ahora
                            </button>
                        </div>
                    ))}
                    {openActivities.length === 0 && (
                        <div className="col-span-full py-16 text-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">No hay convocatorias de matrícula abiertas en este momento.</div>
                    )}
                </div>
            </section>

            {/* SECCIÓN CURSOS CERRADOS (CATÁLOGO) */}
            <section className="space-y-8 pt-8 border-t border-slate-200">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-500 flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center shadow-sm">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        </div>
                        CATÁLOGO HISTÓRICO UAD
                    </h2>
                    <span className="bg-slate-100 text-slate-500 px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-slate-200">Total: {closedActivities.length} Programas</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {closedActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-2xl border border-slate-100 p-5 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all">
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 uppercase">{act.year}</span>
                                <span className="text-[9px] text-emerald-600 font-black uppercase">Finalizado</span>
                            </div>
                            <h4 className="font-bold text-slate-700 text-xs leading-tight line-clamp-2 h-10 mb-3">{act.name}</h4>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase border-t border-slate-50 pt-3">
                                <span>{act.modality}</span>
                                <span>{act.hours}H</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>

        {/* SIDEBAR DERECHO */}
        <aside className="lg:col-span-1 space-y-8">
            <MiniCalendar activities={activities.filter(a => a.isPublic !== false)} />
            
            <div className="bg-[#647FBC] rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group border border-white/20">
                <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
                <div className="relative z-10">
                    <h3 className="font-black text-xl mb-4 tracking-tight">Soporte UAD</h3>
                    <p className="text-xs text-blue-100 leading-relaxed mb-6">¿Tienes dudas sobre tus calificaciones? Contáctanos directamente vía correo institucional para recibir asistencia técnica o académica.</p>
                    <a href={`mailto:${config.contactEmail}`} className="inline-flex items-center gap-2 bg-white text-[#647FBC] px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Contactar</a>
                </div>
            </div>
        </aside>

        {/* MODAL DE MATRÍCULA (13 CAMPOS) */}
        {showEnrollmentModal && activityToEnroll && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col border border-slate-200">
                    <div className="p-8 bg-emerald-600 text-white flex justify-between items-center shadow-lg relative z-10">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1 block">Formulario Oficial de Matrícula</span>
                            <h3 className="text-2xl font-black tracking-tight leading-none">{activityToEnroll.name.toUpperCase()}</h3>
                        </div>
                        <button onClick={() => setShowEnrollmentModal(false)} className="text-white/60 hover:text-white text-4xl font-light transition-all">&times;</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 bg-[#F9F8F6]">
                        <form onSubmit={handleEnrollSubmit} className="space-y-10">
                            
                            {/* SECCIÓN 1: IDENTIFICACIÓN */}
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8 relative">
                                <div className="absolute top-0 left-8 -translate-y-1/2 bg-emerald-100 text-emerald-700 text-[10px] font-black px-4 py-1.5 rounded-full border border-emerald-200 uppercase tracking-widest">1. Datos Personales</div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">RUT *</label>
                                        <input required name="rut" placeholder="12.345.678-9" value={enrollForm.rut} onChange={e => setEnrollForm({...enrollForm, rut: e.target.value})} onBlur={handleRutBlur} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-bold shadow-inner bg-slate-50/50"/>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Nombres *</label>
                                        <input required name="names" value={enrollForm.names} onChange={e => setEnrollForm({...enrollForm, names: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Ap. Paterno *</label>
                                        <input required name="paternalSurname" value={enrollForm.paternalSurname} onChange={e => setEnrollForm({...enrollForm, paternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/>
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Ap. Materno</label>
                                        <input name="maternalSurname" value={enrollForm.maternalSurname} onChange={e => setEnrollForm({...enrollForm, maternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Email *</label>
                                        <input required type="email" name="email" value={enrollForm.email} onChange={e => setEnrollForm({...enrollForm, email: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Teléfono</label>
                                        <input name="phone" placeholder="+569 ..." value={enrollForm.phone} onChange={e => setEnrollForm({...enrollForm, phone: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 2: DATOS ACADÉMICOS */}
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8 relative">
                                <div className="absolute top-0 left-8 -translate-y-1/2 bg-blue-100 text-blue-700 text-[10px] font-black px-4 py-1.5 rounded-full border border-blue-200 uppercase tracking-widest">2. Ficha Institucional</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    <SmartSelect label="Sede / Campus *" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso", "San Felipe"]} onChange={(e) => setEnrollForm({...enrollForm, campus: e.target.value})} required />
                                    <SmartSelect label="Facultad *" name="faculty" value={enrollForm.faculty} options={FACULTY_LIST} onChange={(e) => setEnrollForm({...enrollForm, faculty: e.target.value})} required />
                                    <SmartSelect label="Departamento" name="department" value={enrollForm.department} options={DEPARTMENT_LIST} onChange={(e) => setEnrollForm({...enrollForm, department: e.target.value})} />
                                    <SmartSelect label="Carrera Profesional" name="career" value={enrollForm.career} options={CAREER_LIST} onChange={(e) => setEnrollForm({...enrollForm, career: e.target.value})} />
                                    <SmartSelect label="Tipo de Contrato" name="contractType" value={enrollForm.contractType} options={CONTRACT_TYPE_LIST} onChange={(e) => setEnrollForm({...enrollForm, contractType: e.target.value})} />
                                    <SmartSelect label="Semestre Docencia" name="teachingSemester" value={enrollForm.teachingSemester} options={config.semesters || ["Primer Semestre", "Segundo Semestre"]} onChange={(e) => setEnrollForm({...enrollForm, teachingSemester: e.target.value})} />
                                    <SmartSelect label="Rol / Cargo Académico *" name="academicRole" value={enrollForm.academicRole} options={ACADEMIC_ROLES} onChange={(e) => setEnrollForm({...enrollForm, academicRole: e.target.value})} required />
                                </div>
                            </div>

                            <div className="flex flex-col gap-6 pt-4">
                                <button type="submit" disabled={isSyncing} className={`w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-emerald-700 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-4 ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}>
                                    {isSyncing ? "Procesando Matrícula..." : "Confirmar Matrícula Académica"}
                                </button>
                                {enrollStatus && (
                                    <div className={`p-6 rounded-2xl text-center font-black uppercase text-xs tracking-widest animate-fadeIn ${enrollStatus.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                        {enrollStatus.text}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DETALLE DE RESULTADOS (MEJORADO) */}
        {showDetailModal && selectedEnrollmentId && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200 flex flex-col">
                    {(() => {
                        const enr = enrollments.find(e => e.id === selectedEnrollmentId);
                        const act = activities.find(a => a.id === enr?.activityId);
                        const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr?.rut || ''));
                        if (!enr || !act || !student) return null;

                        const isApproved = enr.state === ActivityState.APROBADO;

                        return (
                            <>
                                {/* Header del Modal */}
                                <div className="p-8 border-b flex justify-between items-start bg-slate-50 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#647FBC]/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
                                    <div className="relative z-10">
                                        <span className="text-[10px] font-black text-[#647FBC] uppercase tracking-widest mb-1 block">Ficha de Desempeño Académico</span>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{act.name}</h3>
                                        <p className="text-xs text-slate-400 font-mono mt-1">{act.internalCode} • {act.academicPeriod || act.year}</p>
                                    </div>
                                    <button onClick={() => setShowDetailModal(false)} className="text-slate-300 hover:text-slate-600 text-3xl font-light leading-none z-20">&times;</button>
                                </div>

                                <div className="p-8 space-y-8">
                                    {/* Información del Curso (Igual a Cursos Abiertos) */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3 text-xs text-slate-500 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                            <p className="flex items-center gap-3">
                                                <svg className="w-4 h-4 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                Docente: <span className="font-bold text-slate-700">{act.relator || 'No asignado'}</span>
                                            </p>
                                            <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Inicio: <span className="font-bold text-slate-700">{formatDateCL(act.startDate)}</span></p>
                                            <p className="flex items-center gap-3"><svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Horas: <span className="font-bold text-slate-700">{act.hours}h Cronológicas</span></p>
                                            <p className="flex items-center gap-3"><svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Modalidad: <span className="font-bold text-slate-700">{act.modality}</span></p>
                                        </div>

                                        {/* KPIs Principales */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl text-center flex flex-col justify-center">
                                                <span className="block text-4xl font-black text-indigo-700 mb-1">{enr.finalGrade || '-'}</span>
                                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">Promedio Final</span>
                                            </div>
                                            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl text-center flex flex-col justify-center">
                                                <span className={`block text-4xl font-black ${(enr.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-emerald-700'}`}>{enr.attendancePercentage || 0}%</span>
                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Asistencia</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notas Parciales */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2 flex items-center gap-2">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                            Desglose de Calificaciones
                                        </h4>
                                        <div className="flex flex-wrap gap-4">
                                            {Array.from({ length: act.evaluationCount || 3 }).map((_, idx) => {
                                                const grade = enr.grades?.[idx];
                                                return (
                                                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 w-20 text-center shadow-sm">
                                                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">N{idx + 1}</span>
                                                        <span className={`text-lg font-black ${grade && grade < 4 ? 'text-red-500' : 'text-slate-700'}`}>{grade || '-'}</span>
                                                    </div>
                                                );
                                            })}
                                            {(!enr.grades || enr.grades.length === 0) && (
                                                <p className="text-sm text-slate-400 italic">No hay calificaciones parciales registradas aún.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Acción de Certificado */}
                                    <div className="pt-8 border-t border-slate-100 flex flex-col items-center">
                                        {isApproved ? (
                                            <div className="w-full max-w-sm text-center space-y-4">
                                                <div className="bg-green-100 text-green-800 p-4 rounded-2xl border-2 border-green-200 flex items-center gap-3 justify-center mb-4">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                    <span className="font-black uppercase text-xs tracking-widest">Aprobado con Éxito</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleDownloadCertificate(enr, act, student)}
                                                    disabled={isGeneratingPdf}
                                                    className="w-full bg-[#647FBC] hover:bg-blue-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                                >
                                                    {isGeneratingPdf ? (
                                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                    )}
                                                    Descargar Certificado PDF
                                                </button>
                                                <p className="text-[9px] text-slate-400 mt-4 leading-tight">Su certificado incluye firma digital y código de validación institucional para acreditar su participación.</p>
                                            </div>
                                        ) : (
                                            <div className="text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-3xl w-full">
                                                <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                <p className="text-sm font-bold text-slate-500">Certificación no disponible aún</p>
                                                <p className="text-xs text-slate-400 mt-1">Debe cumplir con los requisitos de aprobación (Nota 4.0 y 75% Asistencia) para descargar su certificado.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>
        )}
    </div>
  );
};