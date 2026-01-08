import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Activity, ActivityState, Enrollment, UserRole } from '../types';
import { useData, normalizeRut } from '../context/DataContext';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';
import { SmartSelect } from './SmartSelect';
import { useReloadDirective } from '../hooks/useReloadDirective';
import { supabase } from '../services/supabaseClient';
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
    if (clean.length === 8) { clean = '0' + clean; }
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const loadImageToPdf = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });
};

// --- MINI CALENDAR COMPONENT ---
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

    const nextMonth = () => { setViewDate(new Date(viewYear, viewMonth + 1, 1)); };
    const prevMonth = () => { setViewDate(new Date(viewYear, viewMonth - 1, 1)); };
    const resetToToday = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Calendario
                </h3>
                <div className="flex items-center gap-1">
                    <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                    <button onClick={resetToToday} className="text-[10px] font-black text-[#647FBC] uppercase bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">{monthNames[viewMonth]} {viewYear}</button>
                    <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {dayNames.map((d, i) => (<span key={i} className="text-[10px] font-bold text-slate-400 uppercase">{d}</span>))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center relative">
                {days.map((day, idx) => {
                    if (day === null) return <div key={idx} className="h-9"></div>;
                    const dayActs = activitiesByDay[day] || [];
                    const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                    return (
                        <div key={idx} className={`h-9 flex flex-col items-center justify-center rounded-lg border transition-all relative group ${isToday ? 'bg-[#647FBC] text-white border-[#647FBC] shadow-md scale-105 z-10' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'} ${dayActs.length > 0 ? 'font-bold cursor-pointer' : ''}`}>
                            <span className="text-xs">{day}</span>
                            <div className="flex gap-0.5 mt-0.5">
                                {dayActs.some(a => a.category === 'ACADEMIC') && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-500'}`}></div>}
                                {dayActs.some(a => a.category === 'POSTGRADUATE') && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-purple-200' : 'bg-purple-500'}`}></div>}
                                {dayActs.some(a => a.category === 'GENERAL') && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-teal-200' : 'bg-teal-500'}`}></div>}
                            </div>
                            {dayActs.length > 0 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-[10px] rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[60] border border-slate-700">
                                    <div className="font-black border-b border-slate-700 pb-1.5 mb-1.5 uppercase tracking-widest text-blue-300">Actividades {day}/{viewMonth + 1}</div>
                                    <div className="space-y-2">{dayActs.map((act, i) => (<div key={i} className="flex flex-col gap-0.5 border-l-2 border-indigo-400 pl-2"><p className="font-bold leading-tight line-clamp-2">{act.name}</p><p className="opacity-70 flex justify-between"><span>{act.modality}</span><span className="font-black">{act.hours}h</span></p><p className="text-[9px] opacity-60 italic truncate">Docente: {act.relator || 'S/D'}</p></div>))}</div>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-800"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
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
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
  const [isProcessingReenroll, setIsProcessingReenroll] = useState(false);
  
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [activityToEnroll, setActivityToEnroll] = useState<Activity | null>(null);
  const [enrollForm, setEnrollForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      campus: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', academicRole: ''
  });
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [enrollStatus, setEnrollStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
            setShowSuggestions(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // FILTROS ACTUALIZADOS PARA INCLUIR TODAS LAS CATEGORÍAS PÚBLICAS
  const openActivities = useMemo(() => activities.filter(a => 
    (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE' || a.category === 'GENERAL') && 
    a.isPublic !== false && 
    (!a.endDate || a.endDate >= todayStr)
  ), [activities, todayStr]);

  const closedActivities = useMemo(() => activities.filter(a => 
    (a.category === 'ACADEMIC' || a.category === 'POSTGRADUATE' || a.category === 'GENERAL') && 
    a.isPublic !== false && 
    (a.endDate && a.endDate < todayStr)
  ).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || '')), [activities, todayStr]);

  const handleRutBlur = () => {
    setTimeout(() => {
        if (!enrollForm.rut) return;
        const formatted = cleanRutFormat(enrollForm.rut);
        const rawSearch = normalizeRut(formatted);
        setEnrollForm(prev => ({ ...prev, rut: formatted }));
        const existingUser = users.find(u => normalizeRut(u.rut) === rawSearch);
        if (existingUser) handleSelectUser(existingUser);
    }, 200);
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEnrollForm(prev => ({ ...prev, rut: val }));
    const rawInput = normalizeRut(val);
    if (rawInput.length >= 2) {
        const matches = users.filter(u => normalizeRut(u.rut).includes(rawInput));
        setSuggestions(matches.slice(0, 5));
        setShowSuggestions(true);
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const handleSelectUser = (u: User) => {
    setEnrollForm({
        rut: cleanRutFormat(u.rut), names: u.names, paternalSurname: u.paternalSurname, maternalSurname: u.maternalSurname || '', email: u.email || '', phone: u.phone || '', campus: u.campus || '', faculty: u.faculty || '', department: u.department || '', career: u.career || '', contractType: u.contractType || '', teachingSemester: u.teachingSemester || '', academicRole: u.academicRole || ''
    });
    setShowSuggestions(false);
  };

  const handleOpenEnrollment = (act: Activity) => {
    setActivityToEnroll(act);
    setEnrollStatus(null);
    if (user.rut !== '9.876.543-2') {
        setEnrollForm({
            rut: cleanRutFormat(user.rut), names: user.names, paternalSurname: user.paternalSurname, maternalSurname: user.maternalSurname || '', email: user.email || '', phone: user.phone || '', campus: user.campus || '', faculty: user.faculty || '', department: user.department || '', career: user.career || '', contractType: user.contractType || '', teachingSemester: user.teachingSemester || '', academicRole: user.academicRole || ''
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
          doc.setFont("helvetica", "bold"); doc.setFontSize(17); 
          const fullName = `${student.names} ${student.paternalSurname} ${student.maternalSurname || ''}`.toUpperCase();
          doc.text(fullName, 55, 103, { align: "left" });
          const date = new Date();
          const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
          const dateText = `Valparaíso, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
          doc.setFontSize(11); doc.setFont("helvetica", "normal");
          doc.text(dateText, 60, 113, { align: "left" });
          doc.setFont("helvetica", "bold"); doc.setFontSize(13);
          const splitCourseName = doc.splitTextToSize(activity.name.toUpperCase(), pageWidth - 40);
          doc.text(splitCourseName, 108, 140, { align: "center" });
          doc.setFont("helvetica", "normal"); doc.setFontSize(11);
          const combinedInfo = `Duración: ${activity.hours} horas cronológicas      RUT: ${student.rut}`;
          doc.text(combinedInfo, 108, 180, { align: "center" });
          const certCode = enrollment.certificateCode || `UPLA-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(100, 116, 139); 
          doc.text(`ID VERIFICACIÓN: ${certCode}`, 125, 220);
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?mode=verify_cert&code=${certCode}`)}`;
          const qrImg = await loadImageToPdf(qrUrl);
          doc.addImage(qrImg, 'PNG', 145, 225, 25, 25);
          if (!enrollment.certificateCode) await updateEnrollment(enrollment.id, { certificateCode: certCode });
          doc.save(`Certificado_${student.rut}_${activity.internalCode || 'UPLA'}.pdf`);
      } catch (err) { alert("Error al generar el certificado."); } finally { setIsGeneratingPdf(false); }
  };

  // --- FUNCIÓN DE REMATRICULACIÓN ---
  const handleReenroll = async (oldEnrollment: Enrollment, newActivity: Activity) => {
    setIsProcessingReenroll(true);
    try {
        const student = users.find(u => normalizeRut(u.rut) === normalizeRut(oldEnrollment.rut));
        if (!student) throw new Error("Estudiante no encontrado.");

        const cleanRut = cleanRutFormat(oldEnrollment.rut);
        // 1. Asegurar usuario en Base Maestra
        await upsertUsers([{ 
            rut: cleanRut,
            names: student.names,
            paternalSurname: student.paternalSurname,
            maternalSurname: student.maternalSurname || '',
            email: student.email || '',
            phone: student.phone || '',
            campus: student.campus || '',
            faculty: student.faculty || '',
            department: student.department || '',
            career: student.career || '',
            contractType: student.contractType || '',
            teachingSemester: student.teachingSemester || '',
            academicRole: student.academicRole || '',
            systemRole: UserRole.ESTUDIANTE
        }]);

        // 2. Realizar matrícula en nueva versión
        await enrollUser(cleanRut, newActivity.id);

        // 3. Obtener el ID de la nueva matrícula para traspasar notas (esperamos refresh)
        await executeReload();

        const { data: newEnrData } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_rut', cleanRut)
            .eq('activity_id', newActivity.id)
            .maybeSingle();

        if (newEnrData) {
            // Traspasar calificaciones previas
            await updateEnrollment(newEnrData.id, { 
                grades: oldEnrollment.grades || [],
                finalGrade: oldEnrollment.finalGrade,
                observation: `REMATRICULACIÓN: Continuación de proceso desde versión anterior (${oldEnrollment.activityId}).`
            });
        }

        await executeReload();
        alert(`¡Éxito! Te has rematriculado en la nueva versión vigente de "${newActivity.name}". Tus calificaciones anteriores han sido traspasadas.`);
        setShowDetailModal(false);
        setSelectedEnrollmentId(null);
    } catch (err: any) {
        alert(`Error al rematricular: ${err.message}`);
    } finally {
        setIsProcessingReenroll(false);
    }
  };

  // --- LÓGICA DEL PASAPORTE DE COMPETENCIAS (CORRECCIÓN DE HORAS) ---
  const passportData = useMemo(() => {
    if (!activeSearchRut) return null;
    const normRut = normalizeRut(activeSearchRut);
    const approvedEnrollments = enrollments.filter(e => normalizeRut(e.rut) === normRut && e.state === ActivityState.APROBADO);
    
    const competencyStats: Record<string, { code: string, name: string, dimension?: string, hours: number, activities: {name: string, grade?: number}[] }> = {};
    const masterList = [...PEI_COMPETENCIES, ...PMI_COMPETENCIES, ...ACADEMIC_PROFILE_COMPETENCIES];

    approvedEnrollments.forEach(enr => {
        const act = activities.find(a => a.id === enr.activityId);
        if (act && act.competencyCodes) {
            act.competencyCodes.forEach(code => {
                if (!competencyStats[code]) {
                    const meta = masterList.find(m => m.code === code);
                    let dimension = (meta as any)?.dimension;
                    if (!dimension) {
                        if (code.startsWith('PEI')) dimension = 'Plan Estratégico';
                        else if (code.startsWith('PMI')) dimension = 'Plan de Mejora';
                    }
                    competencyStats[code] = { 
                        code, 
                        name: meta?.name || 'Competencia Institucional', 
                        dimension,
                        hours: 0, 
                        activities: [] 
                    };
                }
                const actHours = Number(act.hours || 0);
                competencyStats[code].hours += actHours;
                competencyStats[code].activities.push({ name: act.name, grade: enr.finalGrade });
            });
        }
    });

    return Object.values(competencyStats).sort((a, b) => b.hours - a.hours);
  }, [activeSearchRut, enrollments, activities]);

  const handleExportPassportHTML = () => {
    if (!passportData || !activeSearchRut) return;
    setIsGeneratingHtml(true);

    const student = users.find(u => normalizeRut(u.rut) === normalizeRut(activeSearchRut));
    const verificationCode = `PAS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // QR robusto: aseguramos el origen de la URL base
    const appBaseUrl = window.location.href.split('?')[0];
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${appBaseUrl}?mode=verify_passport&code=${verificationCode}&rut=${activeSearchRut}`)}`;

    const rowsHtml = passportData.map(c => `
        <div class="competency-card">
            <div class="competency-header">
                <span class="competency-code">${c.code}</span>
                <div style="flex: 1">
                    ${c.dimension ? `<span style="display: block; font-size: 10px; color: #64748b; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">${c.dimension}</span>` : ''}
                    <span class="competency-name">${c.name}</span>
                </div>
                <span class="competency-hours">${c.hours} Horas</span>
            </div>
            <div class="supporting-docs">
                <p><strong>Evidencia de Acreditación:</strong></p>
                <ul>
                    ${c.activities.map(a => `<li>${a.name} ${a.grade ? `(Promedio: ${a.grade})` : ''}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('');

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Micro-credenciales de Competencia UPLA - ${student?.paternalSurname}</title><style>body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: #f8fafc; padding: 40px; color: #1e293b; } .passport-container { max-width: 800px; margin: auto; background: white; border-radius: 24px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; overflow: hidden; } .header { background: linear-gradient(135deg, #647FBC, #4338ca); color: white; padding: 60px 40px; text-align: center; position: relative; } .header h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; } .header p { opacity: 0.8; margin-top: 10px; font-size: 14px; } .student-info { padding: 40px; background: #f1f5f9; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; } .student-details h2 { margin: 0; font-size: 22px; color: #0f172a; } .student-details span { color: #64748b; font-family: monospace; font-weight: bold; } .content { padding: 40px; } .competency-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; transition: transform 0.2s; } .competency-header { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; } .competency-code { background: #e0e7ff; color: #4338ca; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 32px; font-size: 11px; border-radius: 6px; text-align: center; } .competency-name { font-weight: bold; font-size: 16px; flex: 1; } .competency-hours { font-size: 12px; font-weight: 800; color: #059669; background: #ecfdf5; padding: 4px 12px; border-radius: 6px; } .supporting-docs { font-size: 13px; color: #475569; } .supporting-docs ul { margin: 10px 0 0 0; padding-left: 20px; } .footer { padding: 40px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; background: #fafafa; } .verification-info { font-size: 11px; color: #94a3b8; max-width: 400px; } .verification-code { font-family: monospace; color: #647FBC; font-weight: bold; display: block; margin-top: 5px; font-size: 13px; } .qr-box { text-align: center; } .qr-box img { width: 100px; border: 1px solid #eee; border-radius: 8px; padding: 5px; background: white; } .qr-box span { display: block; font-size: 9px; font-weight: bold; color: #647FBC; margin-top: 5px; }</style></head><body><div class="passport-container"><div class="header"><h1>MICRO-CREDENCIALES DE COMPETENCIA UPLA</h1><p>Unidad de Acompañamiento Docente • Universidad de Playa Ancha</p></div><div class="student-info"><div class="student-details"><h2>${student?.names} ${student?.paternalSurname}</h2><span>RUT: ${student?.rut}</span></div><div style="text-align: right"><p style="margin:0; font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase">Estado Global</p><p style="margin:0; font-size: 20px; font-weight: 800; color: #059669">CERTIFICADO</p></div></div><div class="content"><p style="font-size: 14px; margin-bottom: 30px; color: #64748b; line-height: 1.6">Este documento acredita las micro-credenciales y capacidades adquiridas por el docente a través del ciclo de formación continua institucional. Cada competencia está respaldada por la aprobación formal de los programas que tributan a la taxonomía UPLA.</p>${rowsHtml}</div><div class="footer"><div class="verification-info"><p>Este documento es una micro-credencial oficial emitida por GestorSMEAD. Su autenticidad puede ser verificada mediante el código único institucional.</p><span class="verification-code">ID VERIFICACIÓN: ${verificationCode}</span></div><div class="qr-box"><img src="${qrUrl}" alt="QR"><span>ESCANEAR PARA VALIDAR</span></div></div></div></body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MICRO_CREDENCIALES_UPLA_${student?.paternalSurname?.toUpperCase()}_${activeSearchRut}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setIsGeneratingHtml(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
        
        {/* COLUMNA IZQUIERDA: CONTENIDO ESTUDIANTE */}
        <div className="lg:col-span-2 space-y-12">
            
            {/* BUSCADOR DE RESULTADOS */}
            <section className="bg-gradient-to-br from-[#647FBC] to-indigo-700 rounded-3xl p-8 shadow-xl text-center text-white relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-2xl font-black mb-2 uppercase tracking-tight">Consulta Académica</h2>
                    <p className="text-blue-100 max-w-xl mx-auto mb-6 text-sm">Visualiza el estado de tus notas, asistencia y certificaciones oficiales.</p>
                    <div className="max-w-md mx-auto bg-white/10 p-2 rounded-2xl border border-white/20 flex gap-2 backdrop-blur-md">
                        <input type="text" placeholder="Ingrese su RUT (ej: 12345678-9)" value={kioskRut} onChange={(e) => setKioskRut(e.target.value)} className="flex-1 pl-4 py-3 rounded-xl border-none focus:ring-0 text-slate-800 font-bold placeholder-slate-300 bg-white shadow-inner"/>
                        <button onClick={() => setActiveSearchRut(cleanRutFormat(kioskRut))} className="bg-white text-[#647FBC] px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-blue-50 transition-all shadow-lg active:scale-95">Consultar</button>
                    </div>
                </div>
            </section>

            {/* RESULTADOS FILTRADOS (RESULTADOS DE BÚSQUEDA) */}
            {activeSearchRut && (
                <div className="border-t-8 border-[#647FBC] bg-white rounded-3xl shadow-xl p-8 relative animate-fadeInDown">
                    <button onClick={() => { setActiveSearchRut(null); setKioskRut(''); }} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 pr-14">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-3 whitespace-nowrap overflow-hidden">
                            <span>Expediente de:</span> 
                            <span className="text-[#647FBC] font-mono">{activeSearchRut}</span>
                            {(() => { const found = users.find(u => normalizeRut(u.rut) === normalizeRut(activeSearchRut)); return found ? <span className="text-slate-500 font-bold uppercase truncate">— {found.names} {found.paternalSurname}</span> : null; })()}
                        </h3>
                        
                        {/* BOTÓN MICRO CREDENCIALES DE COMPETENCIAS (ACTUALIZADO) */}
                        <button 
                            onClick={() => setShowPassportModal(true)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all transform active:scale-95"
                        >
                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            MICRO CREDENCIALES DE COMPETENCIAS
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).map(enr => {
                            const act = activities.find(a => a.id === enr.activityId);
                            if (!act) return null;
                            return (
                                <div key={enr.id} className="border border-slate-100 rounded-2xl p-6 bg-slate-50 hover:bg-white hover:shadow-lg transition-all border-l-4 border-l-[#647FBC]">
                                    <div className="flex justify-between items-start mb-3"><span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-wider ${enr.state === ActivityState.APROBADO ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{enr.state}</span><span className="text-[9px] text-slate-400 font-mono">{act.internalCode}</span></div>
                                    <h4 className="font-bold text-slate-800 text-sm mb-4 leading-tight min-h-[32px] line-clamp-2">{act.name}</h4>
                                    <button onClick={() => { setSelectedEnrollmentId(enr.id); setShowDetailModal(true); }} className="w-full text-[10px] font-black uppercase tracking-widest bg-[#647FBC] text-white py-2.5 rounded-xl hover:bg-blue-800 transition-all shadow-md flex justify-center items-center gap-2">VER DETALLES ACADÉMICOS</button>
                                </div>
                            );
                        })}
                        {enrollments.filter(e => normalizeRut(e.rut) === normalizeRut(activeSearchRut)).length === 0 && (<p className="col-span-full py-8 text-center text-slate-400 italic">No se encontraron matrículas para el RUT ingresado.</p>)}
                    </div>
                </div>
            )}

            {/* SECCIÓN CURSOS ABIERTOS (OFERTA ACTUAL) */}
            <section className="space-y-8">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </div>
                        OFERTA ACADÉMICA VIGENTE
                    </h2>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full animate-pulse">Matrícula Abierta</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {openActivities.map(act => (
                        <div key={act.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 hover:shadow-2xl transition-all flex flex-col h-full border-t-8 border-t-emerald-500 group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-20">
                                {act.category === 'GENERAL' ? (
                                    <svg className="w-10 h-10 text-teal-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                                ) : (
                                    <svg className="w-10 h-10 text-indigo-50" fill="currentColor" viewBox="0 0 20 20"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3z" /></svg>
                                )}
                            </div>
                            <div className="flex justify-between items-start mb-6">
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase ${
                                    act.category === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                    act.category === 'GENERAL' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                                    'bg-indigo-50 text-indigo-700 border-indigo-100'
                                }`}>
                                    {act.category === 'POSTGRADUATE' ? 'POSTÍTULO' : act.category === 'GENERAL' ? 'EXTENSIÓN' : 'CURSO'}
                                </span>
                                <span className="text-[10px] text-slate-300 font-mono font-bold">{act.internalCode}</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 leading-tight mb-6 flex-1 group-hover:text-emerald-700 transition-colors">{act.name}</h3>
                            <div className="space-y-3 text-xs text-slate-500 mb-8 bg-slate-50 p-4 rounded-2xl">
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>Docente: <span className="font-bold text-slate-700">{act.relator || 'No asignado'}</span></p>
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Inicio: <span className="font-bold text-slate-700">{formatDateCL(act.startDate)}</span></p>
                                <p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Horas: <span className="font-bold text-slate-700">{act.hours}h Cronológicas</span></p>
                            </div>
                            <button onClick={() => handleOpenEnrollment(act)} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>Matricúlate Ahora
                            </button>
                        </div>
                    ))}
                    {openActivities.length === 0 && (
                        <div className="col-span-full py-16 text-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">No hay convocatorias de matrícula abiertas en este momento.</div>
                    )}
                </div>
            </section>

            {/* SECCIÓN CATÁLOGO HISTÓRICO (RESTABLECIDA) */}
            <section className="space-y-8">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <h2 className="text-2xl font-black text-slate-800 flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center shadow-sm">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        </div>
                        CATÁLOGO DE ACTIVIDADES FINALIZADAS
                    </h2>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">Histórico Institucional</span>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4">Tipo / Código</th>
                                <th className="px-6 py-4">Nombre de la Actividad</th>
                                <th className="px-6 py-4">Periodo</th>
                                <th className="px-6 py-4 text-center">Horas</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {closedActivities.map(act => (
                                <tr key={act.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-tighter ${
                                            act.category === 'POSTGRADUATE' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                            act.category === 'GENERAL' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                                            'bg-indigo-50 text-indigo-600 border-indigo-100'
                                        }`}>
                                            {act.category === 'POSTGRADUATE' ? 'POST' : act.category === 'GENERAL' ? 'EXT' : 'CUR'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono font-bold ml-2">{act.internalCode}</span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{act.name}</td>
                                    <td className="px-6 py-4 text-slate-500 font-medium">{act.academicPeriod || act.year}</td>
                                    <td className="px-6 py-4 text-center font-bold text-slate-600">{act.hours}h</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div> Finalizado
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {closedActivities.length === 0 && (
                                <tr><td colSpan={5} className="py-12 text-center text-slate-300 italic">No se registran actividades previas en el sistema.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>

        {/* SIDEBAR DERECHO */}
        <aside className="lg:col-span-1 space-y-8">
            <MiniCalendar activities={activities.filter(a => a.isPublic !== false)} />
            <div className="bg-[#647FBC] rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group border border-white/20"><div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div><div className="relative z-10"><h3 className="font-black text-xl mb-4 tracking-tight">Soporte UAD</h3><p className="text-xs text-blue-100 leading-relaxed mb-6">¿Tienes dudas sobre tus calificaciones? Contáctanos directamente vía correo institucional para recibir asistencia técnica o académica.</p><a href={`mailto:${config.contactEmail}`} className="inline-flex items-center gap-2 bg-white text-[#647FBC] px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Contactar</a></div></div>
        </aside>

        {/* MODAL PASAPORTE DE COMPETENCIAS */}
        {showPassportModal && passportData && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-lg animate-fadeIn">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-indigo-100">
                    <div className="p-10 bg-gradient-to-br from-indigo-700 to-[#647FBC] text-white flex justify-between items-center shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-40 -mt-40"></div>
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center border border-white/30 backdrop-blur-md">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-3xl font-black tracking-tighter uppercase leading-none mb-1">Micro-credenciales de Competencia</h3>
                                <p className="text-xs text-blue-100 font-bold uppercase tracking-widest opacity-80">Capacidades Adquiridas y Acreditadas</p>
                            </div>
                        </div>
                        <button onClick={() => setShowPassportModal(false)} className="text-white/60 hover:text-white text-5xl font-light transition-all active:scale-95 relative z-10">&times;</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-12 bg-[#F9F8F6] custom-scrollbar space-y-12">
                        {passportData.length === 0 ? (
                            <div className="py-20 text-center space-y-6">
                                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <p className="text-slate-400 font-bold text-lg uppercase tracking-tight">Sin micro-credenciales acreditadas</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {passportData.map((comp, idx) => (
                                    <div key={idx} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden flex flex-col h-full border-b-4 border-b-indigo-500">
                                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-indigo-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="flex items-center gap-4 mb-6">
                                            {/* Centrado del código mejorado */}
                                            <div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-xs text-center shadow-inner group-hover:bg-indigo-600 group-hover:text-white transition-colors uppercase">
                                                {comp.code}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {comp.dimension && (
                                                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                                                        {comp.dimension}
                                                    </span>
                                                )}
                                                <h4 className="font-black text-slate-800 uppercase text-xs tracking-tight leading-tight mb-1 group-hover:text-indigo-700 transition-colors truncate">{comp.name}</h4>
                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">Acreditada</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horas</span>
                                                    <span className="text-xl font-black text-slate-700">{comp.hours}h</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((comp.hours/10)*100, 100)}%` }}></div>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cursos de Respaldo:</p>
                                                {comp.activities.map((a, i) => (
                                                    <div key={i} className="flex justify-between items-center text-[10px] text-slate-600 py-1 border-b border-slate-50 last:border-0 italic">
                                                        <span className="truncate pr-4">• {a.name}</span>
                                                        {a.grade && <span className="font-black text-indigo-600">{a.grade}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-10 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="text-left">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1 italic">Strategic Portafolio Unit • Micro-credenciales UPLA</p>
                            <p className="text-xs text-slate-500 max-w-md">Este reporte consolida sus competencias institucionales acumuladas y es válido para su portafolio docente.</p>
                        </div>
                        <button 
                            onClick={handleExportPassportHTML}
                            disabled={isGeneratingHtml || passportData.length === 0}
                            className="bg-slate-800 hover:bg-black text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
                        >
                            {isGeneratingHtml ? "Generando..." : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>DESCARGAR MICRO-CREDENCIAL</>)}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DETALLE DE RESULTADOS */}
        {showDetailModal && selectedEnrollmentId && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200 flex flex-col">
                    {(() => {
                        const enr = enrollments.find(e => e.id === selectedEnrollmentId);
                        const act = activities.find(a => a.id === enr?.activityId);
                        const student = users.find(u => normalizeRut(u.rut) === normalizeRut(enr?.rut || ''));
                        if (!enr || !act || !student) return null;
                        const isApproved = enr.state === ActivityState.APROBADO;

                        // DETECCIÓN DE NUEVA VERSIÓN PARA REMATRICULACIÓN
                        const newVersion = !isApproved ? openActivities.find(oa => 
                            oa.internalCode === act.internalCode && 
                            oa.id !== act.id &&
                            !enrollments.some(e => e.activityId === oa.id && normalizeRut(e.rut) === normalizeRut(student.rut))
                        ) : null;

                        return (
                            <>
                                <div className="p-8 border-b flex justify-between items-start bg-slate-50 relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-[#647FBC]/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div><div className="relative z-10"><span className="text-[10px] font-black text-[#647FBC] uppercase tracking-widest mb-1 block">Ficha de Desempeño Académico</span><h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{act.name}</h3><p className="text-xs text-slate-400 font-mono mt-1">{act.internalCode} • {act.academicPeriod || act.year}</p></div><button onClick={() => setShowDetailModal(false)} className="text-slate-300 hover:text-slate-600 text-3xl font-light leading-none z-20">&times;</button></div>
                                <div className="p-8 space-y-8">
                                    
                                    {/* ALERTA DE REMATRICULACIÓN CON ANIMACIÓN */}
                                    {newVersion && (
                                        <div className="bg-indigo-50 border-2 border-indigo-200 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-fadeInDown shadow-inner border-dashed">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm animate-pulse border border-indigo-100">
                                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-indigo-900 font-black uppercase text-xs tracking-tight">Oportunidad de Nivelación</h4>
                                                    <p className="text-xs text-indigo-700 leading-relaxed mt-1 font-medium">Este curso tiene abierta una nueva versión, <strong>¿te quieres rematricular para terminarlo?</strong> Se conservarán tus registros anteriores.</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleReenroll(enr, newVersion)}
                                                disabled={isProcessingReenroll}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50 whitespace-nowrap animate-bounce"
                                            >
                                                {isProcessingReenroll ? (
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                )}
                                                REMATRICULAR
                                            </button>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="space-y-3 text-xs text-slate-500 bg-slate-50 p-6 rounded-2xl border border-slate-100"><p className="flex items-center gap-3"><svg className="w-4 h-4 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>Docente: <span className="font-bold text-slate-700">{act.relator || 'No asignado'}</span></p><p className="flex items-center gap-3"><svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Inicio: <span className="font-bold text-slate-700">{formatDateCL(act.startDate)}</span></p><p className="flex items-center gap-3"><svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Horas: <span className="font-bold text-slate-700">{act.hours}h Cronológicas</span></p><p className="flex items-center gap-3"><svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Modalidad: <span className="font-bold text-slate-700">{act.modality}</span></p></div><div className="grid grid-cols-2 gap-4"><div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl text-center flex flex-col justify-center"><span className="block text-4xl font-black text-indigo-700 mb-1">{enr.finalGrade || '-'}</span><span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider">Promedio Final</span></div><div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl text-center flex flex-col justify-center"><span className={`block text-4xl font-black ${(enr.attendancePercentage || 0) < 75 ? 'text-red-500' : 'text-emerald-700'}`}>{enr.attendancePercentage || 0}%</span><span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Asistencia</span></div></div></div>
                                    <div className="space-y-4"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2 flex items-center gap-2"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>Desglose de Calificaciones</h4><div className="flex flex-wrap gap-4">{Array.from({ length: act.evaluationCount || 3 }).map((_, idx) => { const grade = enr.grades?.[idx]; return (<div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 w-20 text-center shadow-sm"><span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">N{idx + 1}</span><span className={`text-lg font-black ${grade && grade < 4 ? 'text-red-500' : 'text-slate-700'}`}>{grade || '-'}</span></div>); })}{(!enr.grades || enr.grades.length === 0) && (<p className="text-sm text-slate-400 italic">No hay calificaciones parciales registradas aún.</p>)}</div></div>
                                    <div className="pt-8 border-t border-slate-100 flex flex-col items-center">
                                        {isApproved ? (
                                            <div className="w-full max-w-sm text-center space-y-4"><div className="bg-green-100 text-green-800 p-4 rounded-2xl border-2 border-green-200 flex items-center gap-3 justify-center mb-4"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span className="font-black uppercase text-xs tracking-widest">Aprobado con Éxito</span></div><button onClick={() => handleDownloadCertificate(enr, act, student)} disabled={isGeneratingPdf} className="w-full bg-[#647FBC] hover:bg-blue-800 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50">{isGeneratingPdf ? (<svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>)}Descargar Certificado PDF</button><p className="text-[9px] text-slate-400 mt-4 leading-tight">Su certificado incluye firma digital y código de validación institucional para acreditar su participación.</p></div>
                                        ) : (<div className="text-center p-8 bg-slate-50 border border-dashed border-slate-200 rounded-3xl w-full"><svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><p className="text-sm font-bold text-slate-500">Certificación no disponible aún</p><p className="text-xs text-slate-400 mt-1">Debe cumplir con los requisitos de aprobación (Nota 4.0 y 75% Asistencia) para descargar su certificado.</p></div>)}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>
        )}

        {/* MODAL DE MATRÍCULA */}
        {showEnrollmentModal && activityToEnroll && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col border border-slate-200">
                    <div className="p-8 bg-emerald-600 text-white flex justify-between items-center shadow-lg relative z-10"><div><span className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1 block">Formulario Oficial de Matrícula</span><h3 className="text-2xl font-black tracking-tight leading-none">{activityToEnroll.name.toUpperCase()}</h3></div><button onClick={() => setShowEnrollmentModal(false)} className="text-white/60 hover:text-white text-4xl font-light transition-all">&times;</button></div>
                    <div className="flex-1 overflow-y-auto p-10 bg-[#F9F8F6]">
                        <form onSubmit={handleEnrollSubmit} className="space-y-10">
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8 relative"><div className="absolute top-0 left-8 -translate-y-1/2 bg-emerald-100 text-emerald-700 text-[10px] font-black px-4 py-1.5 rounded-full border border-emerald-200 uppercase tracking-widest">1. Datos Personales</div><div className="grid grid-cols-1 md:grid-cols-4 gap-6"><div className="md:col-span-1 relative"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">RUT *</label><input required name="rut" placeholder="12345678-9" autoComplete="off" value={enrollForm.rut} onChange={handleRutChange} onBlur={handleRutBlur} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-bold shadow-inner bg-slate-50/50"/>{showSuggestions && suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-50 w-full bg-white mt-1 border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto left-0">{suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectUser(s)} className="px-4 py-2 hover:bg-emerald-50 cursor-pointer text-xs border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{cleanRutFormat(s.rut)}</span><span className="text-[10px] text-slate-500">{s.names} {s.paternalSurname}</span></div>))}</div>)}</div><div className="md:col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Nombres *</label><input required name="names" value={enrollForm.names} onChange={e => setEnrollForm({...enrollForm, names: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/></div><div className="md:col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Ap. Paterno *</label><input required name="paternalSurname" value={enrollForm.paternalSurname} onChange={e => setEnrollForm({...enrollForm, paternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/></div><div className="md:col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Ap. Materno</label><input name="maternalSurname" value={enrollForm.maternalSurname} onChange={e => setEnrollForm({...enrollForm, maternalSurname: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/></div><div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Email *</label><input required type="email" name="email" value={enrollForm.email} onChange={e => setEnrollForm({...enrollForm, email: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/></div><div className="md:col-span-2"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Teléfono</label><input name="phone" placeholder="+569 ..." value={enrollForm.phone} onChange={e => setEnrollForm({...enrollForm, phone: e.target.value})} className="w-full px-4 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 shadow-sm"/></div></div></div>
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8 relative"><div className="absolute top-0 left-8 -translate-y-1/2 bg-blue-100 text-blue-700 text-[10px] font-black px-4 py-1.5 rounded-full border border-blue-200 uppercase tracking-widest">2. Ficha Institucional</div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"><SmartSelect label="Sede / Campus *" name="campus" value={enrollForm.campus} options={config.campuses || ["Valparaíso", "San Felipe"]} onChange={(e) => setEnrollForm({...enrollForm, campus: e.target.value})} required /><SmartSelect label="Facultad *" name="faculty" value={enrollForm.faculty} options={FACULTY_LIST} onChange={(e) => setEnrollForm({...enrollForm, faculty: e.target.value})} required /><SmartSelect label="Departamento" name="department" value={enrollForm.department} options={DEPARTMENT_LIST} onChange={(e) => setEnrollForm({...enrollForm, department: e.target.value})} /><SmartSelect label="Carrera Profesional" name="career" value={enrollForm.career} options={CAREER_LIST} onChange={(e) => setEnrollForm({...enrollForm, career: e.target.value})} /><SmartSelect label="Tipo de Contrato" name="contractType" value={enrollForm.contractType} options={CONTRACT_TYPE_LIST} onChange={(e) => setEnrollForm({...enrollForm, contractType: e.target.value})} /><SmartSelect label="Semestre Docencia" name="teachingSemester" value={enrollForm.teachingSemester} options={config.semesters || ["Primer Semestre", "Segundo Semestre"]} onChange={(e) => setEnrollForm({...enrollForm, teachingSemester: e.target.value})} /><SmartSelect label="Rol / Cargo Académico *" name="academicRole" value={enrollForm.academicRole} options={ACADEMIC_ROLES} onChange={(e) => setEnrollForm({...enrollForm, academicRole: e.target.value})} required /></div></div>
                            <div className="flex flex-col gap-6 pt-4"><button type="submit" disabled={isSyncing} className={`w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-emerald-700 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-4 ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}>{isSyncing ? "Procesando Matrícula..." : "Confirmar Matrícula Académica"}</button>{enrollStatus && (<div className={`p-6 rounded-2xl text-center font-black uppercase text-xs tracking-widest animate-fadeIn ${enrollStatus.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>{enrollStatus.text}</div>)}</div>
                        </form>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};