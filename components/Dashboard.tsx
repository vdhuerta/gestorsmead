import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity, UserRole, ActivityState, Enrollment } from '../types';
import { useData, normalizeRut } from '../context/DataContext';
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
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dayNames = ["L", "M", "M", "J", "V", "S", "D"];

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const days = [];
    for (let i = 0; i < adjustedFirstDay; i++) { days.push(null); }
    for (let i = 1; i <= daysInMonth; i++) { days.push(i); }

    const activitiesByDay: Record<number, Activity[]> = {};
    activities.forEach(act => {
        if(act.startDate) {
            const [y, m, d] = act.startDate.split('-').map(Number);
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
            
            <div className="grid grid-cols-7 gap-1 text-center mb-6">
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
                            <div className="flex gap-0.5 mt-0.5">
                                {hasAcademic && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-500'}`}></div>}
                                {hasGeneral && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-teal-200' : 'bg-teal-500'}`}></div>}
                                {hasPostgraduate && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                            </div>

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

            {/* Leyenda del Calendario */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Categorías</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        <span className="text-[10px] font-bold text-slate-600">Cursos Curriculares</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="text-[10px] font-bold text-slate-600">Postítulos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                        <span className="text-[10px] font-bold text-slate-600">Extensión / General</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- KPI CARD COMPONENT ---
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
  const { activities, users, enrollments, config, upsertUsers, enrollUser } = useData();
  const { isSyncing, executeReload } = useReloadDirective(); 

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // --- ESTADOS VISTA ESTUDIANTE ---
  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Estados para Matriculación Estudiante
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [activityToEnroll, setActivityToEnroll] = useState<Activity | null>(null);
  const [studentEnrollForm, setStudentEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      campus: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', academicRole: ''
  });
  const [enrollStatus, setEnrollStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    executeReload();
  }, [selectedYear, executeReload]);

  // --- FILTROS DE ACTIVIDADES (ESTUDIANTE) ---
  const nowStr = new Date().toISOString().split('T')[0];
  
  const openActivities = useMemo(() => {
      return activities.filter(a => 
        (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE') && 
        a.isPublic !== false && 
        (!a.endDate || a.endDate >= nowStr)
      );
  }, [activities, nowStr]);

  const closedActivities = useMemo(() => {
      return activities.filter(a => 
        (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE') && 
        a.isPublic !== false && 
        (a.endDate && a.endDate < nowStr)
      );
  }, [activities, nowStr]);

  const yearEnrollments = enrollments.filter(e => {
      const act = activities.find(a => a.id === e.activityId);
      return act && act.year === selectedYear;
  });

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

  const activeCoursesCount = useMemo(() => {
    return activities.filter(a => a.year === selectedYear && (a.category === 'ACADEMIC' || !a.category)).length;
  }, [activities, selectedYear]);

  // --- LOGICA DE CURSOS CERTIFICADOS PARA ESTUDIANTE ---
  const studentCertifiedCount = useMemo(() => {
      const rutToSearch = activeSearchRut || user.rut;
      if (!rutToSearch) return 0;
      
      const normRutToSearch = normalizeRut(rutToSearch);
      
      return enrollments.filter(e => {
          if (normalizeRut(e.rut) !== normRutToSearch) return false;
          
          const act = activities.find(a => a.id === e.activityId);
          if (!act) return false;

          if ((act.category === 'ACADEMIC' || act.category === 'POSTGRADUATE') && e.state === ActivityState.APROBADO) return true;
          if (act.category === 'GENERAL') return true;
          
          return false;
      }).length;
  }, [enrollments, activities, activeSearchRut, user.rut]);

  // --- HANDLERS MATRICULACIÓN ---
  const handleOpenEnrollmentModal = (act: Activity) => {
      setActivityToEnroll(act);
      setEnrollStatus(null);
      if (user && user.systemRole === UserRole.ESTUDIANTE && user.rut !== '9.876.543-2') {
          setStudentEnrollForm({
              rut: user.rut, names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '',
              email: user.email || '', phone: user.phone || '', campus: user.campus || '', faculty: user.faculty || '',
              department: user.department || '', career: user.career || '', contractType: user.contractType || '',
              teachingSemester: user.teachingSemester || '', academicRole: user.academicRole || ''
          });
      } else {
          setStudentEnrollForm({
            rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
            campus: '', faculty: '', department: '', career: '', contractType: '',
            teachingSemester: '', academicRole: ''
          });
      }
      setShowEnrollmentModal(true);
  };

  const handleEnrollFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setStudentEnrollForm(prev => ({ ...prev, [name]: value }));
  };

  const handleStudentEnrollSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activityToEnroll) return;
      
      setEnrollStatus(null);
      const formattedRut = cleanRutFormat(studentEnrollForm.rut);
      const normRut = normalizeRut(formattedRut);

      const alreadyEnrolled = enrollments.some(enr => enr.activityId === activityToEnroll.id && normalizeRut(enr.rut) === normRut);
      if (alreadyEnrolled) {
          setEnrollStatus({ type: 'error', text: 'Ya te encuentras matriculado en este curso.' });
          return;
      }

      try {
          const studentUser: User = {
              ...studentEnrollForm,
              rut: formattedRut,
              systemRole: UserRole.ESTUDIANTE
          };
          await upsertUsers([studentUser]);
          await enrollUser(formattedRut, activityToEnroll.id);
          
          setEnrollStatus({ type: 'success', text: '¡Matriculación exitosa! Ya puedes ver el curso en tus resultados.' });
          executeReload();
          setTimeout(() => { setShowEnrollmentModal(false); }, 2500);
      } catch (err: any) {
          setEnrollStatus({ type: 'error', text: 'Error al procesar la matrícula. Por favor intente más tarde.' });
      }
  };

  // --- CERTIFICATE GENERATION LOGIC ---
  const handleGenerateCertificate = async (enrollment: Enrollment, student: User, act: Activity) => {
      setIsGeneratingPdf(true);
      try {
          const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const bgUrl = "https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Formato_Constancia.png";
          
          const img = new Image();
          img.crossOrigin = "anonymous";
          const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              img.onload = () => resolve(img);
              img.onerror = (e) => reject(e);
              img.src = bgUrl;
          });
          
          doc.addImage(bgImg, 'PNG', 0, 0, pageWidth, pageHeight);
          doc.setTextColor(30, 41, 59);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(17);
          const fullName = `${student.names} ${student.paternalSurname} ${student.maternalSurname || ''}`.toUpperCase();
          doc.text(fullName, 55, 103, { align: "left" });

          const date = new Date();
          const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
          const dateText = `Valparaíso, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
          doc.text(dateText, 60, 113, { align: "left" });

          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          const splitCourseName = doc.splitTextToSize(act.name.toUpperCase(), pageWidth - 40);
          doc.text(splitCourseName, 108, 140, { align: "center" });

          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const combinedInfo = `Duración: ${act.hours} horas cronológicas      RUT: ${student.rut}`;
          doc.text(combinedInfo, 108, 180, { align: "center" });

          const certCode = enrollment.certificateCode || `UPLA-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          doc.setFont("courier", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`ID VERIFICACIÓN: ${certCode}`, 125, 220);

          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_cert&code=${certCode}`)}`;
          const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const qimg = new Image();
              qimg.crossOrigin = "anonymous";
              qimg.onload = () => resolve(qimg);
              qimg.onerror = (e) => reject(e);
              qimg.src = qrUrl;
          });
          doc.addImage(qrImg, 'PNG', 145, 225, 25, 25);

          doc.save(`Certificado_${student.rut}_${act.internalCode || 'UPLA'}.pdf`);
      } catch (err) {
          console.error(err);
          alert("Error al descargar certificado.");
      } finally {
          setIsGeneratingPdf(false);
      }
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
              </div>
          </div>

          <div className="flex flex-wrap md:flex-nowrap justify-center md:justify-end gap-2 relative z-10 mr-2">
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-white rounded-xl border border-slate-100 shadow-sm min-w-[100px]">
                  <span className="block text-2xl font-bold text-[#647FBC]">{activeCoursesCount}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Cursos UAD</span>
             </div>
             <div className="flex-shrink-0 text-center px-4 py-2.5 bg-indigo-600 rounded-xl border border-indigo-700 shadow-md min-w-[100px] transform hover:scale-105 transition-transform">
                  <span className="block text-2xl font-black text-white">{totalConsolidatedPeriod}</span>
                  <span className="text-[9px] font-black text-indigo-100 uppercase tracking-wide whitespace-nowrap">Consolidado</span>
             </div>
          </div>
      </div>

      {/* VISTA ESTUDIANTE COMPLETA */}
      {user.systemRole === UserRole.ESTUDIANTE && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
              <div className="lg:col-span-2 space-y-12">
                  
                  {/* BUSCADOR DE RESULTADOS */}
                  <div className="bg-gradient-to-r from-[#647FBC] to-indigo-600 rounded-2xl p-8 shadow-md text-center text-white">
                      <h2 className="text-2xl font-bold mb-2">Consulta tus Resultados Académicos</h2>
                      <p className="text-blue-100 max-w-2xl mx-auto mb-6 font-medium text-sm">Ingresa tu RUT para revisar el estado de tus cursos, asistencia y calificaciones en tiempo real.</p>
                      <div className="max-w-md mx-auto bg-white/10 p-2 rounded-xl border border-white/20 flex gap-2 backdrop-blur-sm">
                          <input type="text" placeholder="Ingresa tu RUT (ej: 12345678-9)" value={kioskRut} onChange={(e) => setKioskRut(e.target.value)} className="flex-1 pl-4 py-2 rounded-lg border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white"/>
                          <button onClick={() => setActiveSearchRut(cleanRutFormat(kioskRut))} className="bg-white text-[#647FBC] px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors shadow-sm">Buscar</button>
                      </div>
                  </div>
                  
                  {activeSearchRut && (
                      <div className="border-t-4 border-[#647FBC] bg-white rounded-xl shadow-md p-8 relative animate-fadeIn">
                          <button onClick={() => { setActiveSearchRut(null); setKioskRut(''); }} className="absolute top-4 right-4 text-slate-400 hover:text-red-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          <div className="mb-8 border-b border-slate-100 pb-4">
                              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">Resultados para: {activeSearchRut}</h3>
                              <p className="text-xs text-slate-400 mt-1 uppercase font-black tracking-widest">Historial de Participación Académica</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).map(enr => {
                                  const act = activities.find(a => a.id === enr.activityId);
                                  if (!act) return null;
                                  
                                  return (
                                      <div key={enr.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col h-full border-l-4 border-l-[#647FBC] relative group">
                                          <div className="flex justify-between items-start mb-4">
                                              <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-tighter ${
                                                  enr.state === ActivityState.APROBADO ? 'bg-emerald-100 text-emerald-700' : 
                                                  enr.state === ActivityState.REPROBADO ? 'bg-rose-100 text-rose-700' :
                                                  'bg-amber-100 text-amber-700'
                                              }`}>{enr.state}</span>
                                              <span className="text-[9px] text-slate-400 font-mono">{act.internalCode}</span>
                                          </div>
                                          
                                          <span className="text-[9px] font-black text-indigo-500 uppercase mb-1">{act.category === 'ACADEMIC' ? 'Curso' : act.category === 'POSTGRADUATE' ? 'Postítulo' : 'Extensión'}</span>
                                          <h3 className="text-base font-bold text-slate-800 leading-tight mb-3 flex-1">{act.name}</h3>
                                          
                                          <div className="space-y-2 text-[11px] text-slate-500 mb-6 border-t border-slate-50 pt-3">
                                              <p className="flex items-center gap-2"><svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Duración: {act.hours} Horas</p>
                                              <p className="flex items-center gap-2"><svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> Modalidad: {act.modality}</p>
                                              <p className="flex items-center gap-2"><svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Inicio: {formatDateCL(act.startDate)}</p>
                                          </div>
                                          
                                          <button onClick={() => { setSelectedEnrollmentId(enr.id); setShowDetailModal(true); }} className="w-full text-[10px] uppercase tracking-widest bg-slate-100 text-slate-600 px-3 py-2 rounded-lg font-black hover:bg-[#647FBC] hover:text-white transition-all shadow-sm flex justify-center items-center gap-2">Ver Detalles Académicos</button>
                                      </div>
                                  );
                              })}
                              {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).length === 0 && (
                                  <div className="col-span-full py-16 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                      <p className="text-slate-400 italic">No se encontraron registros vinculados a este RUT en el sistema.</p>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  {/* NUEVA SECCIÓN: CURSOS ABIERTOS */}
                  <div className="space-y-6">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                          </div>
                          <div>
                              <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Cursos Abiertos</h2>
                              <p className="text-xs text-slate-500">Programas con matriculación vigente en el sistema.</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {openActivities.map(act => (
                              <div key={act.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow flex flex-col h-full border-t-4 border-t-emerald-500">
                                  <div className="flex justify-between items-start mb-4">
                                      <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">{act.category === 'ACADEMIC' ? 'Curso' : 'Postítulo'}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">{act.internalCode}</span>
                                  </div>
                                  <h3 className="text-lg font-bold text-slate-800 leading-tight mb-2 flex-1">{act.name}</h3>
                                  <div className="space-y-2 text-xs text-slate-500 mb-6">
                                      <p className="flex items-center gap-2"><svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Duración: {act.hours} Horas Cronológicas</p>
                                      <p className="flex items-center gap-2"><svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> Modalidad: {act.modality}</p>
                                      <p className="flex items-center gap-2"><svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Fecha Inicio: {formatDateCL(act.startDate)}</p>
                                  </div>
                                  <button onClick={() => handleOpenEnrollmentModal(act)} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold text-sm hover:bg-emerald-700 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                      Matricúlate Ahora
                                  </button>
                              </div>
                          ))}
                          {openActivities.length === 0 && (
                              <div className="col-span-full py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400">
                                  No hay cursos abiertos disponibles en este momento.
                              </div>
                          )}
                      </div>
                  </div>

                  {/* NUEVA SECCIÓN: CATALOGO CURSOS CERRADOS */}
                  <div className="space-y-6">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          </div>
                          <div>
                              <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Histórico de Programas Realizados</h2>
                              <p className="text-xs text-slate-500">Catálogo de cursos concluidos por la UAD.</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {closedActivities.map(act => (
                              <div key={act.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">{act.category}</span>
                                  <h4 className="text-sm font-bold text-slate-700 leading-tight mb-3 flex-1">{act.name}</h4>
                                  <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                                      <span>{act.year}</span>
                                      <span>{act.hours}h</span>
                                  </div>
                              </div>
                          ))}
                          {closedActivities.length === 0 && (
                              <p className="col-span-full text-center text-slate-400 italic text-xs py-4">Sin registros históricos públicos.</p>
                          )}
                      </div>
                  </div>

              </div>

              {/* BARRA LATERAL */}
              <div className="lg:col-span-1 space-y-8">
                  <MiniCalendar activities={activities.filter(a => a.isPublic !== false)} />
                  
                  <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-lg overflow-hidden relative group transition-all">
                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform"><svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
                      <h3 className="font-bold text-lg mb-2 relative z-10">Logros Académicos</h3>
                      <p className="text-indigo-100 text-[10px] mb-4 relative z-10 leading-tight">Total de cursos curriculares aprobados y actividades de extensión registradas.</p>
                      <div className="text-5xl font-black relative z-10 animate-fadeIn">{studentCertifiedCount}</div>
                      <div className="text-[9px] uppercase font-black text-indigo-300 mt-2 relative z-10 tracking-widest">
                          {activeSearchRut ? `Viendo registros de: ${activeSearchRut}` : 'Global (Visitante)'}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DE MATRICULACIÓN ESTUDIANTE (13 CAMPOS BASE MAESTRA) */}
      {showEnrollmentModal && activityToEnroll && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col border border-emerald-200">
                  <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shadow-lg relative z-10">
                      <div>
                          <h3 className="text-xl font-bold uppercase tracking-tight">Formulario de Matriculación Académica</h3>
                          <p className="text-emerald-100 text-xs mt-1">Programa: {activityToEnroll.name}</p>
                      </div>
                      <button onClick={() => setShowEnrollmentModal(false)} className="text-white hover:text-emerald-200 text-3xl font-light">&times;</button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#F9F8F6]">
                      <form onSubmit={handleStudentEnrollSubmit} className="space-y-8">
                          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                              <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-50 pb-2">1. Antecedentes Personales</h4>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div className="md:col-span-1">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">RUT *</label>
                                      <input name="rut" required type="text" placeholder="12.345.678-9" value={studentEnrollForm.rut} onChange={handleEnrollFormChange} onBlur={() => setStudentEnrollForm(prev => ({...prev, rut: cleanRutFormat(prev.rut)}))} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold"/>
                                  </div>
                                  <div className="md:col-span-1">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombres *</label>
                                      <input name="names" required type="text" value={studentEnrollForm.names} onChange={handleEnrollFormChange} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                                  </div>
                                  <div className="md:col-span-1">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Paterno *</label>
                                      <input name="paternalSurname" required type="text" value={studentEnrollForm.paternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                                  </div>
                                  <div className="md:col-span-1">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ap. Materno</label>
                                      <input name="maternalSurname" type="text" value={studentEnrollForm.maternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                                  </div>
                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Correo Institucional *</label>
                                      <input name="email" required type="email" placeholder="ejemplo@upla.cl" value={studentEnrollForm.email} onChange={handleEnrollFormChange} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                                  </div>
                                  <div className="md:col-span-2">
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Teléfono</label>
                                      <input name="phone" type="tel" placeholder="+569..." value={studentEnrollForm.phone} onChange={handleEnrollFormChange} className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500"/>
                                  </div>
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                              <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-50 pb-2">2. Información Institucional (Base Maestra)</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <SmartSelect label="Sede / Campus" name="campus" value={studentEnrollForm.campus} options={config.campuses || ["Valparaíso", "San Felipe"]} onChange={handleEnrollFormChange} />
                                  <SmartSelect label="Facultad" name="faculty" value={studentEnrollForm.faculty} options={config.faculties || FACULTY_LIST} onChange={handleEnrollFormChange} />
                                  <SmartSelect label="Departamento" name="department" value={studentEnrollForm.department} options={config.departments || DEPARTMENT_LIST} onChange={handleEnrollFormChange} />
                                  <SmartSelect label="Carrera" name="career" value={studentEnrollForm.career} options={config.careers || CAREER_LIST} onChange={handleEnrollFormChange} />
                                  <SmartSelect label="Tipo Contrato" name="contractType" value={studentEnrollForm.contractType} options={config.contractTypes || CONTRACT_TYPE_LIST} onChange={handleEnrollFormChange} />
                                  <SmartSelect label="Semestre Docencia" name="teachingSemester" value={studentEnrollForm.teachingSemester} options={config.semesters || ["1er Semestre", "2do Semestre", "Anual"]} onChange={handleEnrollFormChange} />
                                  <div className="md:col-span-3">
                                      <SmartSelect label="Rol Académico Actual" name="academicRole" value={studentEnrollForm.academicRole} options={config.academicRoles || ACADEMIC_ROLES} onChange={handleEnrollFormChange} />
                                  </div>
                              </div>
                          </div>

                          <div className="flex flex-col items-center gap-4 pt-4">
                              {enrollStatus && (
                                  <div className={`w-full p-4 rounded-xl text-center font-bold animate-fadeIn ${enrollStatus.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                      {enrollStatus.text}
                                  </div>
                              )}
                              <button 
                                  type="submit" 
                                  disabled={isSyncing || enrollStatus?.type === 'success'}
                                  className={`w-full md:w-auto px-12 py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-xl hover:bg-emerald-700 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed`}
                              >
                                  {isSyncing ? 'Procesando Matriculación...' : 'Confirmar Matrícula'}
                              </button>
                              <p className="text-[10px] text-slate-400 text-center italic">Al confirmar, tus datos serán actualizados en la Base Maestra de la Unidad de Acompañamiento Docente.</p>
                          </div>
                      </form>
                  </div>
              </div>
          </div>
      )}

      {showDetailModal && selectedEnrollmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
                {(() => {
                    const enr = enrollments.find(e => e.id === selectedEnrollmentId);
                    const act = activities.find(a => a.id === enr?.activityId);
                    const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr?.rut || ''));
                    
                    if (!enr || !act) return null;

                    return (
                        <>
                            <div className="p-6 border-b flex justify-between items-start bg-slate-50 border-slate-100">
                                <div>
                                    <span className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Ficha de Seguimiento Alumno</span>
                                    <h3 className="text-xl font-bold text-slate-800 leading-tight">{act.name}</h3>
                                    <p className="text-sm text-slate-500 mt-1">{act.modality} • {act.year}</p>
                                </div>
                                <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-3xl font-light leading-none">&times;</button>
                            </div>
                            
                            <div className="p-8 space-y-8">
                                {/* CURSO INFO */}
                                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100 shadow-sm">
                                    <div className="space-y-3">
                                        <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Instructor / Relator</span><span className="text-sm font-bold text-slate-700">{act.relator || 'Por Asignar'}</span></div>
                                        <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Inicio Actividad</span><span className="text-sm font-bold text-slate-700">{formatDateCL(act.startDate)}</span></div>
                                    </div>
                                    <div className="space-y-3">
                                        <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Duración</span><span className="text-sm font-bold text-slate-700">{act.hours} Horas Cronológicas</span></div>
                                        <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Modalidad</span><span className="text-sm font-bold text-slate-700">{act.modality}</span></div>
                                    </div>
                                </div>

                                {/* DESEMPEÑO */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Rendimiento Académico</h4>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
                                            <span className={`block text-3xl font-black ${(enr.finalGrade || 0) < 4 ? 'text-rose-600' : 'text-slate-800'}`}>{enr.finalGrade || '-'}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Nota Final</span>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
                                            <span className={`block text-3xl font-black ${(enr.attendancePercentage || 0) < (config.minAttendancePercentage || 75) ? 'text-rose-600' : 'text-emerald-600'}`}>{enr.attendancePercentage || 0}%</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Asistencia</span>
                                        </div>
                                    </div>

                                    {/* NOTAS PARCIALES */}
                                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                                        <span className="block text-[10px] font-bold text-indigo-400 uppercase mb-3">Detalle de Calificaciones Parciales</span>
                                        <div className="flex flex-wrap gap-2">
                                            {(enr.grades || []).map((grade, idx) => (
                                                <div key={idx} className="bg-white border border-indigo-100 rounded-lg px-3 py-2 text-center min-w-[60px] shadow-sm">
                                                    <span className="block text-[9px] font-bold text-indigo-300 uppercase mb-1">N{idx + 1}</span>
                                                    <span className={`text-sm font-black ${grade < 4 ? 'text-rose-500' : 'text-slate-700'}`}>{grade || '0.0'}</span>
                                                </div>
                                            ))}
                                            {(!enr.grades || enr.grades.length === 0) && <span className="text-xs text-slate-400 italic">No hay notas registradas.</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* CERTIFICADO BUTTON */}
                                <div className="pt-6 border-t border-slate-100 flex flex-col items-center">
                                    {enr.state === ActivityState.APROBADO ? (
                                        <button 
                                            onClick={() => student && handleGenerateCertificate(enr, student, act)}
                                            disabled={isGeneratingPdf}
                                            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-xl transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isGeneratingPdf ? (
                                                <>
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    Generando Certificado...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    Descargar Certificado de Aprobación
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 w-full text-center">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Certificado no disponible</span>
                                            <p className="text-[10px] text-slate-400 mt-1 italic">Debe cumplir con los requisitos de aprobación (nota y asistencia) para obtener el documento.</p>
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