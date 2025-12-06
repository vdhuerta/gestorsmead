
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserRole, User, ActivityState, Activity, Enrollment } from '../types';
import { DataExporter } from './DataExporter';
import { useData } from '../context/DataContext';
import { SmartSelect } from './SmartSelect';
import { FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, ACADEMIC_ROLES } from '../constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface DashboardProps {
  user: User;
}

// Colores Institucionales
const COLORS = ['#647FBC', '#91ADC8', '#AED6CF', '#FFBB28', '#FF8042'];
const STATUS_COLORS: Record<string, string> = {
    'Aprobado': '#AED6CF', // Verde agua
    'APROBADO': '#AED6CF',
    'Reprobado': '#FF8042', // Naranja alerta
    'REPROBADO': '#FF8042',
    'Inscrito': '#647FBC', // Azul acero
    'INSCRITO': '#647FBC',
    'No Cursado': '#E2E8F0', // Gris
    'Pendiente': '#91ADC8',
    'En Curso': '#FCD34D' // Amarillo
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

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const { activities, users, enrollments, enrollUser, upsertUsers, config } = useData();
  
  // State for Asesor View
  const [viewState, setViewState] = useState<'dashboard' | 'courseDetail'>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // --- STATE FOR STUDENT SELF-ENROLLMENT ---
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [targetActivity, setTargetActivity] = useState<Activity | null>(null);
  
  // Dynamic Lists for Student Form
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  // --- KIOSK MODE STATES ---
  const [kioskRut, setKioskRut] = useState('');
  const [kioskResults, setKioskResults] = useState<Enrollment[] | null>(null);
  const [searchedUser, setSearchedUser] = useState<User | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEnrollmentDetail, setSelectedEnrollmentDetail] = useState<Enrollment | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Calendario
  const [calDate, setCalDate] = useState(new Date());

  // Formulario Inscripción
  const [enrollForm, setEnrollForm] = useState<User>({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      faculty: '', department: '', career: '', contractType: '', teachingSemester: '',
      campus: '', academicRole: '', systemRole: UserRole.VISITA
  });
  
  // Autocomplete
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- KPIS ADMIN ---
  // 1. Salud de Base Maestra
  const healthData = useMemo(() => {
      const incomplete = users.filter(u => !u.email || !u.contractType || !u.campus).length;
      const complete = users.length - incomplete;
      return [
          { name: 'Perfiles Completos', value: complete, color: '#647FBC' },
          { name: 'Incompletos', value: incomplete, color: '#FF8042' }
      ];
  }, [users]);

  // 2. Tasa de Aprobación
  const approvalData = useMemo(() => {
      const counts = { Aprobado: 0, Reprobado: 0, Inscrito: 0, Otros: 0 };
      enrollments.forEach(e => {
          if (e.state === ActivityState.APROBADO) counts.Aprobado++;
          else if (e.state === ActivityState.REPROBADO) counts.Reprobado++;
          else if (e.state === ActivityState.INSCRITO) counts.Inscrito++;
          else counts.Otros++;
      });
      return [
          { name: 'Aprobado', value: counts.Aprobado },
          { name: 'Reprobado', value: counts.Reprobado },
          { name: 'En Curso', value: counts.Inscrito },
          { name: 'Otros', value: counts.Otros },
      ].filter(d => d.value > 0);
  }, [enrollments]);

  // 3. Ranking Facultades
  const facultyData = useMemo(() => {
      const map: Record<string, number> = {};
      enrollments.forEach(e => {
          const u = users.find(usr => usr.rut === e.rut);
          if (u?.faculty) {
             const shortName = u.faculty.replace('Facultad de ', '').replace('Ciencias de la ', '').substring(0, 15) + '...';
             map[shortName] = (map[shortName] || 0) + 1;
          }
      });
      return Object.entries(map)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
  }, [enrollments, users]);

  // 4. Modalidad
  const modalityData = useMemo(() => {
      const map: Record<string, number> = {};
      activities.forEach(a => {
          map[a.modality] = (map[a.modality] || 0) + 1;
      });
      return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [activities]);

  // 5. Tendencia Asistencia
  const attendanceTrendData = useMemo(() => {
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
  }, [enrollments, activities]);


  // --- HANDLERS (General) ---
  const handleViewStudents = (courseId: string) => {
      setSelectedCourseId(courseId);
      setViewState('courseDetail');
  };

  const handleBackToDashboard = () => {
      setSelectedCourseId(null);
      setViewState('dashboard');
  };

  // --- HANDLERS (Kiosk / Visita) ---
  const handleSearchMyCourses = (e: React.FormEvent) => {
      e.preventDefault();
      if(!kioskRut) return;
      const clean = cleanRutFormat(kioskRut);
      const userFound = users.find(u => u.rut.toLowerCase() === clean.toLowerCase());
      setSearchedUser(userFound || null);
      
      // Refresh logic: Get fresh from context
      const foundEnrollments = enrollments.filter(e => e.rut.toLowerCase() === clean.toLowerCase());
      setKioskResults(foundEnrollments);
  };

  const handleShowDetail = (enr: Enrollment) => {
      setSelectedEnrollmentDetail(enr);
      setShowDetailModal(true);
  };
  
  const handleOpenEnrollModal = (act: Activity) => {
      setTargetActivity(act);
      setEnrollForm({
          rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
          faculty: '', department: '', career: '', contractType: '',
          teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.VISITA
      });
      setIsFoundInMaster(false);
      setEnrollMsg(null);
      setShowEnrollModal(true);
  };

  // Detecta cambios y formatea RUT
  const handleEnrollFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEnrollForm(prev => ({ ...prev, [name]: value }));
      if (name === 'rut') {
          setIsFoundInMaster(false);
          setEnrollMsg(null);
          const rawInput = value.replace(/[^0-9kK]/g, '').toLowerCase();
          if (rawInput.length >= 2) { 
              const matches = users.filter(u => u.rut.replace(/[^0-9kK]/g, '').toLowerCase().includes(rawInput));
              setSuggestions(matches.slice(0, 5));
              setShowSuggestions(matches.length > 0);
          } else {
              setSuggestions([]);
              setShowSuggestions(false);
          }
      }
  };

  // Detecta cuando el usuario deja el campo RUT para buscar si existe
  const handleRutBlur = () => {
      // Usamos un timeout pequeño para permitir que el clic en sugerencia ocurra primero
      setTimeout(() => {
          if (showSuggestions) setShowSuggestions(false);
          if (!enrollForm.rut) return;

          const formatted = cleanRutFormat(enrollForm.rut);
          const existingUser = users.find(u => u.rut === formatted);

          if (existingUser) {
              setEnrollForm(existingUser);
              setIsFoundInMaster(true);
              setEnrollMsg({ type: 'success', text: `¡Bienvenido(a) ${existingUser.names}! Tus datos han sido cargados automáticamente.` });
          } else {
              // Si no existe, solo formateamos el RUT visualmente
              setEnrollForm(prev => ({ ...prev, rut: formatted }));
              setIsFoundInMaster(false);
          }
      }, 200);
  };

  const handleSelectSuggestion = (user: User) => {
      setEnrollForm({ ...user });
      setIsFoundInMaster(true);
      setShowSuggestions(false);
      setSuggestions([]);
      setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
  };

  const handleSubmitSelfEnroll = (e: React.FormEvent) => {
      e.preventDefault();
      if (!targetActivity) return;
      if (!enrollForm.rut || !enrollForm.names || !enrollForm.email) {
          setEnrollMsg({type: 'error', text: 'Por favor complete todos los campos obligatorios.'});
          return;
      }
      
      const cleanRut = cleanRutFormat(enrollForm.rut);
      const alreadyEnrolled = enrollments.some(e => e.rut === cleanRut && e.activityId === targetActivity.id);
      
      if (alreadyEnrolled) {
          setEnrollMsg({type: 'error', text: '¡Ya te encuentras matriculado en este curso!'});
          return;
      }

      // Preparar usuario para Upsert (Guardar en Base Maestra)
      const userToSave: User = {
          ...enrollForm,
          rut: cleanRut, // Asegurar formato
          systemRole: enrollForm.systemRole || UserRole.VISITA
      };

      upsertUsers([userToSave]);
      enrollUser(cleanRut, targetActivity.id);
      
      alert(`¡Inscripción Exitosa!\nTe has matriculado en: ${targetActivity.name}\nTus datos han sido actualizados en el sistema.`);
      setShowEnrollModal(false);
      setTargetActivity(null);
  };

  // Calendar Helpers
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

  // --- GENERACIÓN DE CERTIFICADO HTML (FALLBACK) ---
  const generateHTMLCertificate = (user: User, course: Activity, dateStr: string) => {
        const win = window.open('', '_blank');
        if (!win) {
            alert("Permita los pop-ups para ver el certificado.");
            return;
        }
        
        const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
        const courseName = course.name.toUpperCase();

        win.document.write(`
          <html>
            <head>
              <title>Certificado - ${user.rut}</title>
              <style>
                body, html { margin: 0; padding: 0; width: 100%; height: 100%; }
                .certificate-container {
                  position: relative;
                  width: 1123px; /* A4 Landscape width approx in pixels at 96dpi */
                  height: 794px; /* A4 Landscape height */
                  margin: 0 auto;
                  overflow: hidden;
                }
                .bg-img {
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  position: absolute;
                  top: 0; left: 0; z-index: -1;
                }
                .text-overlay { position: absolute; width: 100%; text-align: center; font-family: 'Helvetica', 'Arial', sans-serif; }
                .name { top: 48%; font-size: 32px; font-weight: bold; color: #000; }
                .course { top: 65%; font-size: 28px; font-weight: bold; color: #1a1a64; padding: 0 100px; line-height: 1.2; }
                .date { top: 76%; left: 58%; font-size: 18px; color: #444; width: auto; text-align: left; }
                @media print {
                  @page { size: landscape; margin: 0; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              </style>
            </head>
            <body>
              <div class="certificate-container">
                <img src="https://github.com/vdhuerta/assets-aplications/blob/main/Formato_Constancia.png?raw=true" class="bg-img" alt="Fondo" crossorigin="anonymous" />
                <div class="text-overlay name">${fullName}</div>
                <div class="text-overlay course">${courseName}</div>
                <div class="text-overlay date">${dateStr}</div>
              </div>
              <script>
                window.onload = function() { setTimeout(function(){ window.print(); }, 500); }
              </script>
            </body>
          </html>
        `);
        win.document.close();
  };

  // --- CERTIFICATE GENERATION (PDF) ---
  const handleGenerateCertificate = async (user: User | undefined, course: Activity | undefined) => {
      if (!user || !course) return;
      setIsGeneratingPdf(true);

      const date = new Date();
      const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
      const dateStr = date.toLocaleDateString('es-CL', options);
      const imageUrl = "https://github.com/vdhuerta/assets-aplications/blob/main/Formato_Constancia.png?raw=true";

      try {
          const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = imageUrl;

          img.onload = () => {
              try {
                  const canvas = document.createElement("canvas");
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                      ctx.drawImage(img, 0, 0);
                      const base64Data = canvas.toDataURL("image/png");
                      doc.addImage(base64Data, 'PNG', 0, 0, 297, 210);
                      doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
                      const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
                      doc.text(fullName, 148.5, 108, { align: "center" });
                      doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 100); 
                      doc.text(course.name.toUpperCase(), 148.5, 145, { align: "center", maxWidth: 250 });
                      doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50); 
                      doc.text(dateStr, 175, 163); 
                      doc.save(`Certificado_${user.paternalSurname}_${course.internalCode}.pdf`);
                      setIsGeneratingPdf(false);
                  }
              } catch (e) {
                  console.warn("PDF Fallback", e);
                  generateHTMLCertificate(user, course, dateStr);
                  setIsGeneratingPdf(false);
              }
          };
          img.onerror = () => {
              generateHTMLCertificate(user, course, dateStr);
              setIsGeneratingPdf(false);
          };
      } catch (error) {
          generateHTMLCertificate(user, course, dateStr);
          setIsGeneratingPdf(false);
      }
  };

  // =========================================================
  // VISTA 1: VISITA / ESTUDIANTE (KIOSCO)
  // =========================================================
  if (user.systemRole === UserRole.VISITA) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // CORRECCIÓN: Filtro de Cursos Disponibles
    const availableCourses = activities.filter(act => {
        if (!act.startDate) return false;
        const [y, m, d] = act.startDate.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        
        const limit = new Date(start);
        limit.setDate(start.getDate() + 10);
        return today <= limit;
    });
    
    const calendarCells = getCalendarCells();

    return (
        <div className="animate-fadeIn space-y-12">
            {/* HERO */}
            <div className="bg-gradient-to-r from-[#AED6CF] to-teal-100 rounded-2xl p-8 shadow-sm text-center">
                <h2 className="text-3xl font-bold text-teal-800 mb-2">Portal de Estudiantes y Visitas</h2>
                <p className="text-teal-700 max-w-2xl mx-auto">
                    Consulta tu historial académico, revisa tus notas y matricúlate en nuevos cursos disponibles.
                </p>
            </div>
            
            {/* 1. BUSCADOR MIS CURSOS */}
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <svg className="w-8 h-8 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Revisar Mis Cursos Activos
                        </h3>
                        <p className="text-slate-500 mt-1">
                            Ingresa tu RUT para consultar tu estado académico, notas y asistencia en cursos actuales.
                        </p>
                    </div>
                </div>
                
                <form onSubmit={handleSearchMyCourses} className="flex gap-4 max-w-2xl">
                    <input type="text" placeholder="Ej: 12345678-9" value={kioskRut} onChange={(e) => setKioskRut(e.target.value)} className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#647FBC] font-mono text-lg shadow-sm" />
                    <button type="submit" className="bg-[#647FBC] text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-800 transition-colors shadow-md">Consultar</button>
                </form>

                {kioskResults && (
                    <div className="mt-8 animate-fadeIn bg-slate-50 p-6 rounded-xl border border-slate-200">
                        {searchedUser && (
                            <div className="mb-4 pb-4 border-b border-slate-200 flex justify-between items-center">
                                <p className="text-lg font-bold text-slate-700">Resultados para: <span className="text-[#647FBC]">{searchedUser.names} {searchedUser.paternalSurname}</span></p>
                                <button onClick={handleSearchMyCourses} className="text-xs bg-white border border-slate-300 px-3 py-1 rounded hover:bg-slate-50 transition-colors flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Actualizar
                                </button>
                            </div>
                        )}
                        {kioskResults.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {kioskResults.map(enr => {
                                    const act = activities.find(a => a.id === enr.activityId);
                                    
                                    // CÁLCULO DINÁMICO DE ESTADO
                                    const computedStatus = (() => {
                                        const minGrade = config.minPassingGrade || 4.0;
                                        const minAtt = config.minAttendancePercentage || 75;
                                        const grade = enr.finalGrade || 0;
                                        const att = enr.attendancePercentage || 0;
                                        const hasGrades = enr.grades && enr.grades.length > 0;

                                        if (grade > 0 && grade >= minGrade && att >= minAtt) return ActivityState.APROBADO;
                                        if (grade > 0 && (grade < minGrade || att < minAtt)) return ActivityState.REPROBADO;
                                        if (!hasGrades && att === 0) return ActivityState.INSCRITO;
                                        return 'En Curso';
                                    })();

                                    let badgeColorClass = 'bg-slate-100 text-slate-600';
                                    if (computedStatus === ActivityState.APROBADO) badgeColorClass = 'bg-emerald-100 text-emerald-700';
                                    if (computedStatus === ActivityState.REPROBADO) badgeColorClass = 'bg-red-100 text-red-700';
                                    if (computedStatus === 'En Curso') badgeColorClass = 'bg-amber-100 text-amber-700';

                                    return (
                                        <div key={enr.id} className="border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all bg-white group">
                                            <div className="flex justify-between items-start mb-3">
                                                <h4 className="font-bold text-slate-800 text-base line-clamp-2 h-12">{act?.name}</h4>
                                                <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${badgeColorClass}`}>
                                                    {computedStatus}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-4">{act?.year} • {act?.modality}</p>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                                <div className="text-xs"><span className="text-slate-400">Nota Final:</span> <span className="font-bold ml-1 text-slate-700 text-lg">{enr.finalGrade || '-'}</span></div>
                                                <button onClick={() => handleShowDetail(enr)} className="text-xs text-[#647FBC] font-bold bg-blue-50 px-3 py-1.5 rounded-full hover:bg-[#647FBC] hover:text-white transition-colors">Ver Detalle Académico</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400">No se encontraron inscripciones para este RUT.</div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. CURSOS DISPONIBLES */}
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                 <div className="mb-6">
                    <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-8 h-8 text-[#66A99D]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        Cursos Disponibles para Inscripción
                    </h3>
                    <p className="text-slate-500 mt-1">
                        Revisa la oferta académica con matrículas abiertas. Las inscripciones cierran 10 días después del inicio.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {availableCourses.length > 0 ? availableCourses.map(act => {
                        const [y, m, d] = act.startDate!.split('-').map(Number);
                        const start = new Date(y, m - 1, d);
                        const limit = new Date(start);
                        limit.setDate(start.getDate() + 10);
                        const now = new Date();
                        now.setHours(0,0,0,0);
                        const diffTime = limit.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        return (
                            <div key={act.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-xl transition-all relative group flex flex-col justify-between h-full hover:border-[#AED6CF]">
                                <div>
                                    <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded ${now < start ? 'bg-indigo-50 text-indigo-700' : 'bg-[#E6F4F1] text-[#4A857D]'}`}>
                                        {now < start ? 'Próximamente' : `Cierra en ${diffDays} días`}
                                    </div>
                                    <h4 className="font-bold text-slate-800 text-lg pr-20 mb-2">{act.name}</h4>
                                    <p className="text-sm text-slate-500 mb-4">{act.modality} • {act.relator}</p>
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Inicio: {formatDateCL(act.startDate)}</span>
                                    <button onClick={() => handleOpenEnrollModal(act)} className="bg-[#66A99D] text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-[#558D83] transition-colors shadow-sm">Inscribirme</button>
                                </div>
                            </div>
                        );
                    }) : (
                         <div className="col-span-full bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center"><p className="text-slate-500 text-lg">No hay cursos con inscripciones abiertas hoy.</p></div>
                    )}
                </div>
            </div>

            {/* 3. CALENDARIO */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-[#647FBC] px-8 py-6 flex justify-between items-center text-white">
                    <div>
                         <h3 className="text-2xl font-bold flex items-center gap-3">
                            <svg className="w-8 h-8 text-[#FFBB28]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            Calendario de Actividades
                        </h3>
                        <p className="text-blue-100 text-sm mt-1">Agenda completa de cursos y eventos de extensión.</p>
                    </div>
                    <div className="flex items-center gap-4 bg-white/20 p-1 rounded-lg">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/30 rounded-md transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        <span className="font-bold text-lg min-w-[150px] text-center uppercase tracking-wider">{calDate.toLocaleString('es-CL', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white/30 rounded-md transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                </div>
                <div className="p-8">
                     <div className="flex justify-end gap-4 mb-4 text-xs font-bold">
                         <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#647FBC]"></span> Curso Académico</div>
                         <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#66A99D]"></span> Extensión / Charla</div>
                     </div>
                     <div className="grid grid-cols-7 border-b border-slate-200">
                         {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => <div key={day} className="text-center py-2 text-slate-400 font-bold uppercase text-xs tracking-wider">{day}</div>)}
                     </div>
                     <div className="grid grid-cols-7 auto-rows-fr border-l border-slate-200 bg-slate-50">
                         {calendarCells.map((date, idx) => {
                             if (!date) return <div key={idx} className="border-r border-b border-slate-200 min-h-[120px] bg-slate-100/50"></div>;
                             const dateStr = date.toISOString().split('T')[0];
                             const dayActivities = activities.filter(act => act.startDate === dateStr);
                             const isToday = new Date().toDateString() === date.toDateString();
                             return (
                                 <div key={idx} className={`border-r border-b border-slate-200 min-h-[120px] p-2 relative group hover:bg-white transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}>
                                     <span className={`text-sm font-bold block mb-2 ${isToday ? 'bg-[#647FBC] text-white w-7 h-7 flex items-center justify-center rounded-full shadow-md' : 'text-slate-500'}`}>{date.getDate()}</span>
                                     <div className="space-y-1">
                                         {dayActivities.map(act => (
                                             <div key={act.id} className={`text-[10px] px-2 py-1 rounded truncate cursor-help border-l-2 shadow-sm ${act.category === 'GENERAL' ? 'bg-[#E6F4F1] text-[#4A857D] border-[#66A99D]' : 'bg-blue-50 text-[#647FBC] border-[#647FBC]'}`} title={`${act.name} (${act.hours} hrs)`}>{act.name}</div>
                                         ))}
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                </div>
            </div>

            {/* MODALES */}
            {showDetailModal && selectedEnrollmentDetail && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full animate-fadeIn overflow-hidden">
                        <div className="bg-[#647FBC] px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">Detalle Académico</h3>
                            <button onClick={() => setShowDetailModal(false)} className="text-white/80 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="p-8">
                             {(() => {
                                 const act = activities.find(a => a.id === selectedEnrollmentDetail.activityId);
                                 // CÁLCULO DE APROBACIÓN PARA MODAL (Consistente con la lista)
                                 const minGrade = config.minPassingGrade || 4.0;
                                 const minAtt = config.minAttendancePercentage || 75;
                                 const grade = selectedEnrollmentDetail.finalGrade || 0;
                                 const att = selectedEnrollmentDetail.attendancePercentage || 0;
                                 const isApproved = grade >= minGrade && att >= minAtt;

                                 return (
                                     <div className="space-y-6">
                                         <div className="border-b border-slate-100 pb-4">
                                             <h4 className="text-xl font-bold text-slate-800">{act?.name}</h4>
                                             <p className="text-slate-500 font-mono text-sm">{act?.internalCode} • {act?.year} • {act?.version}</p>
                                         </div>
                                         
                                         {/* INFORMACIÓN ADICIONAL DEL CURSO (DATOS QUE FALTABAN) */}
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                             <div>
                                                 <p className="text-slate-500 font-bold uppercase text-xs">Relator</p>
                                                 <p className="text-slate-800 font-medium">{act?.relator || 'No asignado'}</p>
                                             </div>
                                             <div>
                                                 <p className="text-slate-500 font-bold uppercase text-xs">Modalidad</p>
                                                 <p className="text-slate-800 font-medium">{act?.modality}</p>
                                             </div>
                                             <div>
                                                 <p className="text-slate-500 font-bold uppercase text-xs">Fechas</p>
                                                 <p className="text-slate-800 font-medium">{formatDateCL(act?.startDate)} - {formatDateCL(act?.endDate)}</p>
                                             </div>
                                             <div>
                                                 <p className="text-slate-500 font-bold uppercase text-xs">Estado Actual</p>
                                                 <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${isApproved ? 'bg-emerald-500' : grade > 0 ? 'bg-red-500' : 'bg-slate-400'}`}>
                                                     {isApproved ? 'Aprobado' : grade > 0 ? 'Reprobado' : 'En Curso'}
                                                 </span>
                                             </div>
                                         </div>

                                         {/* RESUMEN FINAL */}
                                         <div className="grid grid-cols-2 gap-4">
                                             <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100"><span className={`block text-3xl font-bold ${grade >= minGrade ? 'text-[#647FBC]' : 'text-red-500'}`}>{selectedEnrollmentDetail.finalGrade || '-'}</span><span className="text-xs text-slate-500 font-bold uppercase">Nota Final (Min {minGrade})</span></div>
                                             <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100"><span className={`block text-3xl font-bold ${att >= minAtt ? 'text-teal-600' : 'text-red-500'}`}>{selectedEnrollmentDetail.attendancePercentage || 0}%</span><span className="text-xs text-slate-500 font-bold uppercase">Asistencia (Min {minAtt}%)</span></div>
                                         </div>

                                         {/* DESGLOSE DE NOTAS (NUEVO) */}
                                         {selectedEnrollmentDetail.grades && selectedEnrollmentDetail.grades.length > 0 && (
                                             <div className="bg-white border border-slate-200 rounded-lg p-4">
                                                 <h5 className="text-xs font-bold text-slate-500 uppercase mb-3 border-b border-slate-100 pb-2">Desglose de Calificaciones</h5>
                                                 <div className="flex gap-3 flex-wrap">
                                                     {selectedEnrollmentDetail.grades.map((g, idx) => (
                                                         <div key={idx} className="flex flex-col items-center">
                                                             <span className="text-[10px] text-slate-400 font-bold mb-1">N{idx + 1}</span>
                                                             <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 font-bold text-sm ${g < minGrade ? 'border-red-100 bg-red-50 text-red-600' : 'border-blue-100 bg-blue-50 text-blue-600'}`}>
                                                                 {g}
                                                             </div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>
                                         )}

                                         {selectedEnrollmentDetail.observation && <div className="bg-amber-50 p-3 rounded text-sm text-amber-800 border border-amber-200 flex gap-2">
                                             <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                             <div><strong className="block text-xs uppercase opacity-70">Observación Asesor:</strong> {selectedEnrollmentDetail.observation}</div>
                                         </div>}
                                         
                                         {/* BOTÓN DESCARGAR CERTIFICADO */}
                                         <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-xs text-slate-400 italic">
                                                {isApproved ? 'Certificado disponible para descarga digital.' : 'El certificado se habilitará al aprobar el curso.'}
                                            </span>
                                            <button
                                                onClick={() => handleGenerateCertificate(searchedUser || user, act)}
                                                disabled={!isApproved || isGeneratingPdf}
                                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${
                                                    isApproved
                                                    ? 'bg-[#647FBC] text-white hover:bg-blue-800 shadow-md hover:shadow-lg'
                                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                {isGeneratingPdf ? 'Generando...' : 'Descargar Certificado'}
                                            </button>
                                        </div>
                                     </div>
                                 );
                             })()}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL INSCRIPCIÓN (FORMULARIO COMPLETO 13 CAMPOS) */}
            {showEnrollModal && targetActivity && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full animate-fadeIn my-8">
                        <div className="bg-[#66A99D] px-6 py-4 flex justify-between items-center rounded-t-2xl">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Ficha de Auto-Matrícula
                            </h3>
                            <button onClick={() => setShowEnrollModal(false)} className="text-white/80 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="p-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
                            <div className="mb-6 border-b border-slate-100 pb-4">
                                <p className="text-sm text-slate-500 font-bold uppercase">Curso Seleccionado:</p>
                                <h2 className="text-xl font-bold text-slate-800">{targetActivity.name}</h2>
                                <p className="text-xs text-slate-400 mt-1">Complete su ficha para finalizar la matrícula. Sus datos serán validados con la Base Maestra.</p>
                            </div>
                            
                            <form onSubmit={handleSubmitSelfEnroll} className="space-y-6">
                                {/* SECCIÓN 1: IDENTIFICACIÓN */}
                                <div className="space-y-4">
                                     <h4 className="font-bold text-[#4A857D] border-b border-[#AED6CF] pb-2 text-sm uppercase">1. Identificación Personal</h4>
                                     <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                         <div className="relative">
                                             <label className="block text-xs font-bold text-slate-700 mb-1">RUT *</label>
                                             <input type="text" name="rut" autoComplete="off" required value={enrollForm.rut} onChange={handleEnrollFormChange} onBlur={handleRutBlur} placeholder="12345678-9" className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#66A99D] font-bold ${isFoundInMaster ? 'bg-[#E6F4F1] border-[#AED6CF] text-[#4A857D]' : 'bg-white border-slate-300'}`}/>
                                             {showSuggestions && suggestions.length > 0 && (
                                                <div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">
                                                    {suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-[#E6F4F1] cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span></div>))}
                                                </div>
                                            )}
                                         </div>
                                         <div className="md:col-span-1"><label className="block text-xs font-bold text-slate-700 mb-1">Nombres *</label><input type="text" name="names" required value={enrollForm.names} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                         <div className="md:col-span-1"><label className="block text-xs font-bold text-slate-700 mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" required value={enrollForm.paternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                         <div className="md:col-span-1"><label className="block text-xs font-bold text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={enrollForm.maternalSurname} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                     </div>
                                </div>

                                {/* SECCIÓN 2: CONTACTO */}
                                <div className="space-y-4">
                                     <h4 className="font-bold text-[#4A857D] border-b border-[#AED6CF] pb-2 text-sm uppercase">2. Información de Contacto</h4>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional *</label><input type="email" name="email" required value={enrollForm.email} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                          <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={enrollForm.phone} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                     </div>
                                </div>

                                {/* SECCIÓN 3: DATOS ACADÉMICOS Y LABORALES */}
                                <div className="space-y-4">
                                     <h4 className="font-bold text-[#4A857D] border-b border-[#AED6CF] pb-2 text-sm uppercase">3. Datos Académicos y Laborales</h4>
                                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          <div><label className="block text-xs font-medium text-slate-700 mb-1">Sede / Campus *</label><input type="text" name="campus" required value={enrollForm.campus} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D]"/></div>
                                          
                                          {/* Usamos Selectores Estándar para asegurar coincidencia exacta con listas maestras */}
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Facultad *</label>
                                              <select name="faculty" required value={enrollForm.faculty} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listFaculties.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Departamento</label>
                                              <select name="department" value={enrollForm.department} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listDepts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Carrera *</label>
                                              <select name="career" required value={enrollForm.career} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listCareers.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Rol Académico *</label>
                                              <select name="academicRole" required value={enrollForm.academicRole} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listRoles.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Contrato</label>
                                              <select name="contractType" value={enrollForm.contractType} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listContracts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs font-medium text-slate-700 mb-1">Semestre Docencia</label>
                                              <select name="teachingSemester" value={enrollForm.teachingSemester} onChange={handleEnrollFormChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#66A99D] text-sm">
                                                  <option value="">Seleccione...</option>
                                                  {listSemesters.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                              </select>
                                          </div>
                                     </div>
                                </div>

                                {enrollMsg && (<div className={`p-3 rounded text-sm text-center font-bold ${enrollMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-[#E6F4F1] text-[#4A857D]'}`}>{enrollMsg.text}</div>)}
                                
                                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setShowEnrollModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
                                    <button type="submit" className="px-8 py-2 bg-[#66A99D] text-white rounded-lg font-bold hover:bg-[#558D83] shadow-md transition-colors">Confirmar Matrícula</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  }

  // =========================================================
  // VISTA 2: ASESOR (PANEL DE GESTIÓN ESPECÍFICO)
  // =========================================================
  if (user.systemRole === UserRole.ASESOR) {
    // Si estamos en la vista de detalle de un curso específico (mismo lógica que antes)
    if (viewState === 'courseDetail' && selectedCourseId) {
        const course = activities.find(a => a.id === selectedCourseId);
        const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

        return (
            <div className="animate-fadeIn space-y-6">
                <button 
                    onClick={handleBackToDashboard}
                    className="flex items-center text-slate-500 hover:text-[#647FBC] font-medium transition-colors"
                >
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    Volver al Panel Principal
                </button>

                <div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">{course?.name}</h2>
                        <p className="text-slate-500 text-sm mt-1">
                            {course?.modality} • {courseEnrollments.length} Estudiantes Matriculados
                        </p>
                    </div>
                    <div className="bg-blue-50 text-[#647FBC] px-4 py-2 rounded-lg text-sm font-bold">
                        Planilla de Alumnos
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 bg-slate-100 sticky left-0 z-10 border-r border-slate-200">Alumno (RUT)</th>
                                    <th className="px-4 py-4">Correo</th>
                                    <th className="px-4 py-4">Facultad / Depto</th>
                                    <th className="px-4 py-4">Carrera</th>
                                    <th className="px-4 py-4 text-center">Asistencia %</th>
                                    <th className="px-4 py-4 text-center">Nota Final</th>
                                    <th className="px-4 py-4 text-center">Estado</th>
                                    <th className="px-4 py-4">Situación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {courseEnrollments.map((enr) => {
                                    const student = users.find(u => u.rut === enr.rut);
                                    return (
                                        <tr key={enr.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-900 bg-white sticky left-0 border-r border-slate-100 group-hover:bg-blue-50/50">
                                                <div className="flex flex-col">
                                                    <span>{student?.paternalSurname} {student?.maternalSurname}, {student?.names}</span>
                                                    <span className="text-xs text-slate-400 font-mono">{enr.rut}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-600">{student?.email || '-'}</td>
                                            <td className="px-4 py-4 text-slate-600">
                                                <div className="flex flex-col text-xs">
                                                    <span className="font-semibold">{student?.faculty}</span>
                                                    <span>{student?.department}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-600">{student?.career || '-'}</td>
                                            <td className="px-4 py-4 text-center font-mono font-bold text-slate-700">
                                                {enr.attendancePercentage ?? 0}%
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                 <span className={`font-bold ${
                                                    (enr.finalGrade || 0) >= 4.0 ? 'text-[#647FBC]' : 'text-red-500'
                                                }`}>
                                                    {enr.finalGrade || '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                      enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' :
                                                      enr.state === ActivityState.REPROBADO ? 'bg-red-100 text-red-700' :
                                                      'bg-slate-100 text-slate-600'
                                                  }`}>
                                                      {enr.state}
                                                  </span>
                                            </td>
                                            <td className="px-4 py-4 text-xs text-slate-500 italic">
                                                {enr.situation || 'Sin observación'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // --- VISTA PRINCIPAL ASESOR: TABLAS DE GESTIÓN (RESTAURADO) ---
    const myAcademicActivities = activities.filter(a => !a.category || a.category === 'ACADEMIC');
    const myGeneralActivities = activities.filter(a => a.category === 'GENERAL');

    return (
        <div className="animate-fadeIn space-y-8">
             <div className="bg-[#91ADC8]/10 border border-[#91ADC8]/30 rounded-xl p-6">
                <h2 className="text-2xl font-bold text-slate-700">Panel de Gestión Académica</h2>
                <p className="text-slate-600">Acceso rápido a listas de asistencia y calificaciones de cursos activos.</p>
            </div>
            
            {/* Cards Resumen para Asesor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <span className="text-slate-500 text-sm">Cursos Activos</span>
                    <p className="text-3xl font-bold text-slate-800 mt-2">{activities.length}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <span className="text-slate-500 text-sm">Alumnos Totales</span>
                    <p className="text-3xl font-bold text-slate-800 mt-2">{enrollments.length}</p>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <span className="text-slate-500 text-sm">Desglose</span>
                    <p className="text-3xl font-bold text-[#647FBC] mt-2 text-lg">
                        {myAcademicActivities.length} <span className="text-slate-400 font-normal">Acad.</span> / {myGeneralActivities.length} <span className="text-slate-400 font-normal">Ext.</span>
                    </p>
                 </div>
            </div>

            {/* TABLA 1: CURSOS ACADÉMICOS (CON NOTAS) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex justify-between items-center">
                    <h3 className="font-bold text-[#647FBC] flex items-center gap-2">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                        Mis Cursos Académicos
                    </h3>
                    <span className="text-xs text-blue-400 font-bold uppercase">Evaluación Formal</span>
                </div>
                {myAcademicActivities.length > 0 ? (
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-6 py-3">Nombre Curso</th>
                                    <th className="px-6 py-3">Modalidad</th>
                                    <th className="px-6 py-3">Avance de Notas</th>
                                    <th className="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {myAcademicActivities.map((act) => {
                                    const actEnrollments = enrollments.filter(e => e.activityId === act.id);
                                    const enrolledCount = actEnrollments.length;
                                    
                                    // Cálculo de Avance (Notas)
                                    const totalExpectedGrades = enrolledCount * (act.evaluationCount || 3);
                                    const actualGrades = actEnrollments.reduce((sum, enr) => {
                                        return sum + (enr.grades ? enr.grades.filter(g => typeof g === 'number').length : 0);
                                    }, 0);
                                    
                                    // FIX: Cap at 100% to handle inconsistencies where grades > expected
                                    const progressPercentage = totalExpectedGrades > 0 
                                        ? Math.min(100, Math.round((actualGrades / totalExpectedGrades) * 100))
                                        : 0;

                                    return (
                                        <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800">
                                                {act.name}
                                                <span className="text-slate-500 font-normal ml-1.5 text-xs">({enrolledCount} est.)</span>
                                                <div className="text-[10px] text-slate-400">{act.version}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded text-xs border bg-blue-50 text-[#647FBC] border-blue-100">
                                                    {act.modality}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="w-full max-w-[140px]">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-xs font-medium text-slate-700">{progressPercentage}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                                        <div 
                                                            className="bg-[#647FBC] h-2 rounded-full transition-all duration-500" 
                                                            style={{ width: `${progressPercentage}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400">
                                                        {actualGrades}/{totalExpectedGrades} Notas Reg.
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleViewStudents(act.id)}
                                                    className="text-white bg-[#91ADC8] px-3 py-1.5 rounded text-xs font-bold hover:bg-[#647FBC] transition-colors"
                                                >
                                                    Ver Alumnos
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                     <div className="p-8 text-center text-slate-400 text-sm">No tienes cursos académicos activos.</div>
                )}
            </div>

            {/* TABLA 2: ACTIVIDADES DE EXTENSIÓN (SIN NOTAS, SOLO ASISTENCIA) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-teal-50 border-b border-teal-100 px-6 py-4 flex justify-between items-center">
                    <h3 className="font-bold text-teal-700 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        Mis Actividades de Extensión
                    </h3>
                     <span className="text-xs text-teal-500 font-bold uppercase">Participación</span>
                </div>
                 {myGeneralActivities.length > 0 ? (
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-6 py-3">Nombre Actividad</th>
                                    <th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Participación / Asistencia</th>
                                    <th className="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {myGeneralActivities.map((act) => {
                                    const actEnrollments = enrollments.filter(e => e.activityId === act.id);
                                    const enrolledCount = actEnrollments.length;
                                    
                                    // Cálculo de Asistencia Promedio (en vez de notas)
                                    const totalAttendanceSum = actEnrollments.reduce((sum, enr) => sum + (enr.attendancePercentage || 0), 0);
                                    const averageAttendance = enrolledCount > 0 ? Math.round(totalAttendanceSum / enrolledCount) : 0;
                                    
                                    return (
                                        <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800">
                                                {act.name}
                                                <div className="text-[10px] text-slate-400">{act.year}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded text-xs border bg-teal-50 text-teal-700 border-teal-100">
                                                    {act.activityType}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-10 h-10 flex items-center justify-center rounded-full border-2 border-teal-100 bg-teal-50 text-teal-700 font-bold text-xs">
                                                        {averageAttendance}%
                                                    </div>
                                                    <div className="flex flex-col text-xs text-slate-500">
                                                        <span>Promedio Asistencia</span>
                                                        <span className="font-semibold text-slate-700">{enrolledCount} Inscritos</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleViewStudents(act.id)}
                                                    className="text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded text-xs font-bold hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                                                >
                                                    Ver Lista
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-8 text-center text-slate-400 text-sm">No tienes actividades de extensión registradas.</div>
                )}
            </div>
        </div>
    );
  }

  // =========================================================
  // VISTA 3: ADMINISTRADOR (DEFAULT / RESTORED)
  // =========================================================
  return (
    <div className="animate-fadeIn space-y-6">
        <div className="bg-[#647FBC]/5 border border-[#647FBC]/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
                <h2 className="text-2xl font-bold text-[#647FBC]">Panel de Administración</h2>
                <p className="text-[#647FBC]/80">Inteligencia de Negocios y Estado del Sistema</p>
            </div>
            <DataExporter />
        </div>

        {/* 1. ROW KPI CARDS & DATA HEALTH */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Data Health Chart */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">1. Salud Base Maestra (Calidad)</h3>
                <div className="h-48 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={healthData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={60}
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
                    <div className="absolute top-[40%] left-0 right-0 text-center pointer-events-none">
                        <span className="text-2xl font-bold text-slate-700">{users.length}</span>
                        <span className="block text-[10px] text-slate-400">Total Usuarios</span>
                    </div>
                </div>
             </div>

             {/* Modality Stats */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">4. Distribución por Modalidad</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modalityData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 11}} />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="value" fill="#91ADC8" radius={[0, 4, 4, 0]} name="Cursos" barSize={20}>
                                {modalityData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>
        </div>

        {/* 2. ROW: APPROVAL & FACULTIES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">2. Tasa Global de Resultados</h3>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={approvalData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {approvalData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                 <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">3. Participación por Facultad (Top 5)</h3>
                 <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={facultyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-15} textAnchor="end" height={60} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="count" fill="#647FBC" name="Inscripciones" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>

        {/* 3. ROW: ATTENDANCE TREND */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">5. Tendencia de Asistencia Promedio (Mensual)</h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attendanceTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorAsist" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#AED6CF" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#AED6CF" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="month" />
                        <YAxis domain={[0, 100]} />
                        <CartesianGrid strokeDasharray="3 3" />
                        <Tooltip />
                        <Area type="monotone" dataKey="promedio" stroke="#AED6CF" fillOpacity={1} fill="url(#colorAsist)" name="% Asistencia" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

    </div>
  );
};
