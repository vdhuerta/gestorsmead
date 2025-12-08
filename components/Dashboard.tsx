
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserRole, User, ActivityState, Activity, Enrollment } from '../types';
import { DataExporter } from './DataExporter';
import { useData } from '../context/DataContext';
import { SmartSelect } from './SmartSelect';
import { FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST, ACADEMIC_ROLES } from '../constants';
import { TabType } from './RoleNavbar'; // Import TabType for navigation
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface DashboardProps {
  user: User;
  onNavigate?: (tab: TabType) => void; // Prop para navegación entre pestañas
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

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const { activities, users, enrollments, enrollUser, upsertUsers, config } = useData();
  
  // State for Asesor View
  const [viewState, setViewState] = useState<'dashboard' | 'courseDetail'>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // --- STATE FOR STUDENT SELF-ENROLLMENT ---
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [targetActivity, setTargetActivity] = useState<Activity | null>(null);
  
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  // --- KIOSK MODE STATES (REACTIVE) ---
  const [kioskRut, setKioskRut] = useState('');
  const [activeSearchRut, setActiveSearchRut] = useState<string | null>(null);
  
  // Reactive Search Results (Updates immediately when enrollments context changes)
  const kioskResults = useMemo(() => {
      if (!activeSearchRut) return null;
      return enrollments.filter(e => e.rut.toLowerCase() === activeSearchRut.toLowerCase());
  }, [enrollments, activeSearchRut]);

  // Reactive User Search
  const searchedUser = useMemo(() => {
      if (!activeSearchRut) return null;
      return users.find(u => u.rut.toLowerCase() === activeSearchRut.toLowerCase()) || null;
  }, [users, activeSearchRut]);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  
  // Reactive Detail Modal (Updates immediately when specific enrollment updates)
  const selectedEnrollmentDetail = useMemo(() => {
      if (!selectedEnrollmentId) return null;
      return enrollments.find(e => e.id === selectedEnrollmentId) || null;
  }, [enrollments, selectedEnrollmentId]);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Calendario
  const [calDate, setCalDate] = useState(new Date());

  // Formulario Inscripción
  const [enrollForm, setEnrollForm] = useState<User>({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      faculty: '', department: '', career: '', contractType: '', teachingSemester: '',
      campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
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
      setActiveSearchRut(clean);
  };

  const handleShowDetail = (enrollmentId: string) => {
      setSelectedEnrollmentId(enrollmentId);
      setShowDetailModal(true);
  };
  
  const handleOpenEnrollModal = (act: Activity) => {
      setTargetActivity(act);
      setEnrollForm({
          rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
          faculty: '', department: '', career: '', contractType: '',
          teachingSemester: '', campus: '', academicRole: '', systemRole: UserRole.ESTUDIANTE
      });
      setIsFoundInMaster(false);
      setEnrollMsg(null);
      setShowEnrollModal(true);
  };

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

  const handleRutBlur = () => {
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

      const userToSave: User = {
          ...enrollForm,
          rut: cleanRut, 
          systemRole: enrollForm.systemRole || UserRole.ESTUDIANTE
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

  // --- GENERACIÓN DE CERTIFICADO HTML ---
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
                body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: 'Helvetica', 'Arial', sans-serif; }
                .certificate-container {
                  position: relative;
                  width: 1123px; /* A4 Landscape width approx px */
                  height: 794px; /* A4 Landscape height approx px */
                  margin: 0 auto;
                  overflow: hidden;
                }
                .bg-img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  position: absolute;
                  top: 0; left: 0; z-index: -1;
                }
                .text-overlay { 
                    position: absolute; 
                    width: 100%; 
                    text-align: center; 
                    left: 0;
                }
                /* Ajustes específicos para la plantilla https://github.com/vdhuerta/assets-aplications/blob/main/Formato_Constancia.png */
                .name { 
                    top: 45%; 
                    font-size: 36px; 
                    font-weight: bold; 
                    color: #000; 
                    text-transform: uppercase;
                }
                .course { 
                    top: 60%; 
                    font-size: 24px; 
                    font-weight: bold; 
                    color: #1a1a64; 
                    padding: 0 100px; 
                    line-height: 1.3;
                    text-transform: uppercase;
                }
                .date { 
                    top: 72%; 
                    left: 58%; 
                    width: 300px;
                    text-align: left;
                    font-size: 16px; 
                    color: #444; 
                }
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
                window.onload = function() { setTimeout(function(){ window.print(); }, 800); }
              </script>
            </body>
          </html>
        `);
        win.document.close();
  };

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
                      
                      // Configuración de texto para jsPDF coincidiendo con la plantilla
                      doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0);
                      const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
                      // Coordenadas aproximadas en mm para A4 Landscape
                      doc.text(fullName, 148.5, 100, { align: "center" });
                      
                      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 100); 
                      // Split text for multiline
                      const splitTitle = doc.splitTextToSize(course.name.toUpperCase(), 200);
                      doc.text(splitTitle, 148.5, 135, { align: "center" });
                      
                      doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50); 
                      doc.text(dateStr, 170, 155); 
                      
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
  // VISTA 1: ESTUDIANTE (VISITA)
  // =========================================================
  if (user.systemRole === UserRole.ESTUDIANTE) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Filtro de cursos disponibles
    const availableCourses = activities.filter(act => {
        if (!act.startDate) return false;
        const [y, m, d] = act.startDate.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const limit = new Date(start);
        limit.setDate(start.getDate() + 10);
        return today <= limit;
    });
    
    // Obtener la actividad y usuario del modal de detalle
    const modalActivity = selectedEnrollmentDetail ? activities.find(a => a.id === selectedEnrollmentDetail.activityId) : null;
    // IMPORTANTE: En modo kiosco, el usuario a certificar es el buscado (searchedUser), no el genérico (user)
    const userToCertify = searchedUser || user;

    return (
        <div className="animate-fadeIn space-y-12">
            <div className="bg-gradient-to-r from-[#AED6CF] to-teal-100 rounded-2xl p-8 shadow-sm text-center">
                <h2 className="text-3xl font-bold text-teal-800 mb-2">Portal del Estudiante</h2>
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
                                                <button onClick={() => handleShowDetail(enr.id)} className="text-xs text-[#647FBC] font-bold bg-blue-50 px-3 py-1.5 rounded-full hover:bg-[#647FBC] hover:text-white transition-colors">Ver Detalle Académico</button>
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

            {/* MODAL DETALLE ACADÉMICO */}
            {showDetailModal && selectedEnrollmentDetail && modalActivity && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header Modal */}
                        <div className="bg-[#647FBC] px-6 py-4 flex justify-between items-start">
                            <div>
                                <h3 className="text-white font-bold text-lg">{modalActivity.name}</h3>
                                <p className="text-blue-100 text-xs mt-1 font-mono">{modalActivity.internalCode} | {modalActivity.year}</p>
                            </div>
                            <button onClick={() => setShowDetailModal(false)} className="text-blue-200 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        {/* Body Modal */}
                        <div className="p-6 overflow-y-auto">
                            
                            {/* Course Metadata */}
                            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="block text-xs text-slate-400 uppercase font-bold">Relator</span>
                                    <span className="font-semibold text-slate-700">{modalActivity.relator}</span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <span className="block text-xs text-slate-400 uppercase font-bold">Modalidad</span>
                                    <span className="font-semibold text-slate-700">{modalActivity.modality}</span>
                                </div>
                            </div>

                            {/* Status Section */}
                            <div className="flex items-center gap-4 mb-6 border-b border-slate-100 pb-6">
                                <div className={`flex-1 p-4 rounded-xl border flex flex-col items-center justify-center gap-1
                                    ${selectedEnrollmentDetail.state === ActivityState.APROBADO ? 'bg-emerald-50 border-emerald-200' : 
                                      selectedEnrollmentDetail.state === ActivityState.REPROBADO ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                                      <span className="text-xs uppercase font-bold opacity-70">Estado Final</span>
                                      <span className={`text-xl font-bold ${
                                          selectedEnrollmentDetail.state === ActivityState.APROBADO ? 'text-emerald-700' :
                                          selectedEnrollmentDetail.state === ActivityState.REPROBADO ? 'text-red-700' : 'text-blue-700'
                                      }`}>
                                          {selectedEnrollmentDetail.state}
                                      </span>
                                </div>
                                <div className="flex-1 p-4 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center gap-1">
                                     <span className="text-xs text-slate-400 uppercase font-bold">Asistencia</span>
                                     <span className="text-xl font-bold text-slate-700">{selectedEnrollmentDetail.attendancePercentage || 0}%</span>
                                </div>
                            </div>

                            {/* Grades Table */}
                            <h4 className="text-sm font-bold text-slate-700 mb-3">Detalle de Calificaciones</h4>
                            <div className="overflow-x-auto border border-slate-200 rounded-lg mb-6">
                                <table className="w-full text-sm text-center">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                        <tr>
                                            {(selectedEnrollmentDetail.grades || []).map((_, i) => (
                                                <th key={i} className="py-2 border-r border-slate-100">N{i + 1}</th>
                                            ))}
                                            <th className="py-2 bg-slate-100 text-slate-700">Final</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        <tr>
                                            {(selectedEnrollmentDetail.grades || []).map((grade, i) => (
                                                <td key={i} className="py-3 border-r border-slate-100 text-slate-600">{grade}</td>
                                            ))}
                                            <td className="py-3 font-bold text-slate-800 bg-slate-50/50">{selectedEnrollmentDetail.finalGrade || '-'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                {(selectedEnrollmentDetail.grades?.length === 0) && (
                                    <p className="text-center text-xs text-slate-400 py-2 italic">Sin calificaciones registradas</p>
                                )}
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
                            {selectedEnrollmentDetail.state === ActivityState.APROBADO || selectedEnrollmentDetail.state === 'Aprobado' ? (
                                <button 
                                    onClick={() => handleGenerateCertificate(userToCertify, modalActivity)}
                                    disabled={isGeneratingPdf}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isGeneratingPdf ? (
                                        <>
                                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            Generando...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            Descargar Certificado
                                        </>
                                    )}
                                </button>
                            ) : (
                                <span className="text-xs text-slate-400 italic py-2">Certificado disponible solo para cursos aprobados.</span>
                            )}
                        </div>
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
