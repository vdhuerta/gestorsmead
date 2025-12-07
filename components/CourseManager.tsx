import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
// @ts-ignore
import { jsPDF } from 'jspdf';

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

// --- Helper de Normalización ---
const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    // 1. Busqueda Exacta
    if (masterList.includes(trimmed)) return trimmed;
    // 2. Busqueda Case Insensitive
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed; // Si encuentra coincidencia retorna el valor oficial, si no, el original
};

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking';

interface CourseManagerProps {
    currentUser?: User; // Pass user for role check if needed, though this module is shared for now
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, getUser, config } = useData();
  
  // DYNAMIC LISTS FROM CONFIG (Fallback to constants if empty)
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // FILTER: Only show ACADEMIC courses here
  const academicActivities = activities.filter(a => !a.category || a.category === 'ACADEMIC');

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // --- CREATE FORM STATE ---
  const [formData, setFormData] = useState({
    internalCode: '',
    year: new Date().getFullYear(),
    semester: '1',
    nombre: '', 
    version: 'V1', 
    modality: listModalities[0], 
    horas: 0, 
    relator: '', 
    fechaInicio: '',
    fechaTermino: '',
    moduleCount: 0,
    evaluationCount: 3,
    linkRecursos: '',
    linkClase: '',
    linkEvaluacion: ''
  });

  const [suggestedEndDateDisplay, setSuggestedEndDateDisplay] = useState<string>('');
  const [suggestedEndDateISO, setSuggestedEndDateISO] = useState<string>(''); // Para comparación lógica

  // --- ENROLLMENT STATE (FULL FIELDS) ---
  const [manualForm, setManualForm] = useState({
      rut: '',
      names: '',
      paternalSurname: '',
      maternalSurname: '',
      email: '',
      phone: '',
      academicRole: '',
      faculty: '',
      department: '',
      career: '',
      contractType: '',
      teachingSemester: '',
      campus: '',
      systemRole: UserRole.ESTUDIANTE
  });

  // --- AUTOCOMPLETE & VALIDATION STATE ---
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);

  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true); // Checkbox for skipping header row

  const selectedCourse = academicActivities.find(a => a.id === selectedCourseId);
  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect to calculate suggested end date
  useEffect(() => {
    if (formData.fechaInicio && formData.moduleCount > 0) {
        // Parse manual para evitar problemas de zona horaria UTC
        const [y, m, d] = formData.fechaInicio.split('-').map(Number);
        const startDate = new Date(y, m - 1, d); // Mes es 0-indexado en JS
        
        // Lógica: Módulos + 2 semanas de extensión
        const durationWeeks = formData.moduleCount + 2;
        // Descontamos 1 día para cerrar la semana (ej: Lunes -> Domingo)
        const daysToAdd = (durationWeeks * 7) - 1; 

        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + daysToAdd);
        
        // Formato ISO para lógica (YYYY-MM-DD)
        const isoDate = endDate.toISOString().split('T')[0];
        setSuggestedEndDateISO(isoDate);

        // Formato Visual (dd-mm-aaaa)
        const dd = String(endDate.getDate()).padStart(2, '0');
        const mm = String(endDate.getMonth() + 1).padStart(2, '0');
        const yyyy = endDate.getFullYear();
        setSuggestedEndDateDisplay(`${dd}-${mm}-${yyyy}`);
    } else {
        setSuggestedEndDateDisplay('');
        setSuggestedEndDateISO('');
    }
  }, [formData.fechaInicio, formData.moduleCount]);

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
              
              /* Print specific styles to ensure background prints */
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
              // Wait slightly for image to load before printing
              window.onload = function() { setTimeout(function(){ window.print(); }, 500); }
            </script>
          </body>
        </html>
      `);
      win.document.close();
  };

  // --- CERTIFICATE GENERATION (PDF FIRST, HTML FALLBACK) ---
  const handleGenerateCertificate = async (user: User | undefined, course: Activity | undefined) => {
      if (!user || !course) return;
      setIsGeneratingPdf(true);

      const date = new Date();
      const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
      const dateStr = date.toLocaleDateString('es-CL', options);

      // Use the image URL. Using raw.githubusercontent or ?raw=true
      const imageUrl = "https://github.com/vdhuerta/assets-aplications/blob/main/Formato_Constancia.png?raw=true";

      try {
          // Initialize jsPDF
          const doc = new jsPDF({
              orientation: 'landscape',
              unit: 'mm',
              format: 'a4'
          });

          // Use HTML Image object to load data
          const img = new Image();
          img.crossOrigin = "Anonymous"; // Crucial for CORS
          img.src = imageUrl;

          img.onload = () => {
              try {
                  // Create a canvas to convert image to Base64 (safest way for jsPDF)
                  const canvas = document.createElement("canvas");
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                      ctx.drawImage(img, 0, 0);
                      const base64Data = canvas.toDataURL("image/png");

                      // Add to PDF
                      doc.addImage(base64Data, 'PNG', 0, 0, 297, 210);

                      // Add Text
                      doc.setFontSize(22);
                      doc.setFont("helvetica", "bold");
                      doc.setTextColor(0, 0, 0);
                      const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
                      doc.text(fullName, 148.5, 108, { align: "center" });

                      doc.setFontSize(20);
                      doc.setFont("helvetica", "bold");
                      doc.setTextColor(20, 20, 100); 
                      doc.text(course.name.toUpperCase(), 148.5, 145, { align: "center", maxWidth: 250 });

                      doc.setFontSize(12);
                      doc.setFont("helvetica", "normal");
                      doc.setTextColor(50, 50, 50); 
                      doc.text(dateStr, 175, 163); 

                      doc.save(`Certificado_${user.paternalSurname}_${course.internalCode}.pdf`);
                      setIsGeneratingPdf(false);
                  } else {
                      throw new Error("Canvas Context Error");
                  }
              } catch (pdfError) {
                  console.warn("PDF Generation failed (CORS/Canvas), switching to HTML View", pdfError);
                  generateHTMLCertificate(user, course, dateStr);
                  setIsGeneratingPdf(false);
              }
          };

          img.onerror = () => {
              console.warn("Image Load Error, switching to HTML View");
              generateHTMLCertificate(user, course, dateStr);
              setIsGeneratingPdf(false);
          };

      } catch (error) {
          console.error("General Error", error);
          generateHTMLCertificate(user, course, dateStr);
          setIsGeneratingPdf(false);
      }
  };

  // --- STATS CALCULATION ---
  const getEnrollmentStats = () => {
      const students = courseEnrollments.map(e => users.find(u => u.rut === e.rut)).filter(Boolean) as User[];
      let emptyFieldsCount = 0;
      let inconsistenciesCount = 0;

      students.forEach(u => {
          if (!u.email || !u.phone || !u.contractType || !u.campus) emptyFieldsCount++;
          if (u.faculty && !listFaculties.includes(u.faculty)) inconsistenciesCount++;
          if (u.department && !listDepts.includes(u.department)) inconsistenciesCount++;
          if (u.career && !listCareers.includes(u.career)) inconsistenciesCount++;
          if (u.academicRole && !listRoles.includes(u.academicRole)) inconsistenciesCount++;
          if (u.contractType && !listContracts.includes(u.contractType)) inconsistenciesCount++;
      });

      return {
          total: students.length,
          empty: emptyFieldsCount,
          inconsistent: inconsistenciesCount
      };
  };

  const stats = getEnrollmentStats();

  // --- HELPER: CALCULATE DYNAMIC STATUS ---
  const getComputedStatus = (enr: Enrollment, act: Activity) => {
      // 1. Check Attendance (Si hay al menos 1 ticket marcado)
      const hasAttendance = [
          enr.attendanceSession1, enr.attendanceSession2, enr.attendanceSession3,
          enr.attendanceSession4, enr.attendanceSession5, enr.attendanceSession6
      ].some(Boolean);

      // 2. Check Grades
      const expectedGrades = act.evaluationCount || 3;
      const recordedGrades = (enr.grades || []).filter(g => g !== undefined && g !== null && g > 0).length;

      // 3. Logic Tree
      // Si no tiene asistencia y no tiene notas -> INSCRITO
      if (!hasAttendance && recordedGrades === 0) return 'INSCRITO';
      
      // Si tiene asistencia pero 0 notas -> EN PROCESO
      if (hasAttendance && recordedGrades === 0) return 'EN PROCESO';
      
      // Si tiene alguna nota pero no todas -> AVANZANDO
      if (recordedGrades > 0 && recordedGrades < expectedGrades) return 'AVANZANDO';

      // 4. Final Calculation (All grades present or forced calculation)
      if (recordedGrades >= expectedGrades) {
          // Check Global Config Params
          const minGrade = config.minPassingGrade || 4.0;
          const minAtt = config.minAttendancePercentage || 75;

          const isGradePass = (enr.finalGrade || 0) >= minGrade;
          const isAttPass = (enr.attendancePercentage || 0) >= minAtt;

          if (isGradePass && isAttPass) return 'APROBADO';
          return 'REPROBADO';
      }

      return 'PENDIENTE'; // Fallback
  };

  // --- HANDLERS: CREATE / EDIT ---
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
    const academicPeriodText = `${formData.year}-${formData.semester}`;
    // ID Generation
    const generatedId = `${cleanCode}-${academicPeriodText}-${formData.version}`;
    const versionDisplay = `${formData.version} - ${formData.semester === '1' ? 'Primer Semestre' : formData.semester === '2' ? 'Segundo Semestre' : formData.semester}`;

    // Decide ID: If Editing, keep original ID to maintain Enrollment FKs. If Creating, use generated.
    const finalId = (view === 'edit' && selectedCourseId) ? selectedCourseId : generatedId;

    const newActivity: Activity = {
        id: finalId,
        category: 'ACADEMIC', // Mark as Academic
        internalCode: formData.internalCode,
        year: formData.year,
        academicPeriod: academicPeriodText,
        name: formData.nombre,
        version: versionDisplay,
        modality: formData.modality,
        hours: formData.horas,
        moduleCount: formData.moduleCount,
        evaluationCount: formData.evaluationCount,
        relator: formData.relator,
        startDate: formData.fechaInicio,
        endDate: formData.fechaTermino,
        linkResources: formData.linkRecursos,
        classLink: formData.linkClase,
        evaluationLink: formData.linkEvaluacion
    };
    addActivity(newActivity);
    
    // Reset or Redirect
    if (view === 'edit') {
        setView('details'); // Back to details
    } else {
        setFormData({ 
            internalCode: '', year: new Date().getFullYear(), semester: '1',
            nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', 
            fechaInicio: '', fechaTermino: '', moduleCount: 0, evaluationCount: 3,
            linkRecursos: '', linkClase: '', linkEvaluacion: ''
        });
        setSuggestedEndDateDisplay('');
        setView('list');
    }
  };

  const handleEditCourse = () => {
    if (!selectedCourse) return;
    // Extract Semester from period or version if possible, simplistic logic for demo
    const sem = selectedCourse.academicPeriod ? selectedCourse.academicPeriod.split('-')[1] || '1' : '1';
    
    setFormData({
        internalCode: selectedCourse.internalCode || '',
        year: selectedCourse.year || new Date().getFullYear(),
        semester: sem,
        nombre: selectedCourse.name,
        version: selectedCourse.version ? selectedCourse.version.split(' - ')[0] : 'V1', 
        modality: selectedCourse.modality,
        horas: selectedCourse.hours,
        relator: selectedCourse.relator || '',
        fechaInicio: selectedCourse.startDate || '',
        fechaTermino: selectedCourse.endDate || '',
        moduleCount: selectedCourse.moduleCount || 0,
        evaluationCount: selectedCourse.evaluationCount || 3,
        linkRecursos: selectedCourse.linkResources || '',
        linkClase: selectedCourse.classLink || '',
        linkEvaluacion: selectedCourse.evaluationLink || ''
    });
    setView('edit');
  };

  const handleCloneActivity = (act: Activity) => {
      let nextVersion = "V1";
      if (act.version && act.version.startsWith('V')) {
          const num = parseInt(act.version.charAt(1));
          if (!isNaN(num)) nextVersion = `V${num + 1}`;
      }

      setFormData({
          internalCode: act.internalCode || 'N/A',
          year: act.year || new Date().getFullYear(),
          semester: act.academicPeriod ? act.academicPeriod.split('-')[1] || '1' : '1',
          nombre: act.name,
          version: nextVersion,
          modality: act.modality,
          horas: act.hours,
          relator: act.relator || '',
          fechaInicio: '', fechaTermino: '',
          moduleCount: act.moduleCount || 0,
          evaluationCount: act.evaluationCount || 3,
          linkRecursos: act.linkResources || '',
          linkClase: act.classLink || '',
          linkEvaluacion: act.evaluationLink || ''
      });
      setView('create');
  };

  // --- LOGIC: CHECK USER ON RUT INPUT ---
  const handleManualFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setManualForm(prev => ({ ...prev, [name]: value }));

      if (name === 'rut') {
          setIsFoundInMaster(false);
          setIsAlreadyEnrolled(false);
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

  const checkEnrollmentStatus = (rut: string) => {
      const existsInCourse = courseEnrollments.some(e => e.rut.toLowerCase() === rut.toLowerCase());
      setIsAlreadyEnrolled(existsInCourse);
      
      if (existsInCourse) {
          setEnrollMsg({ type: 'error', text: '¡Este usuario ya se encuentra matriculado en este curso!' });
      }
      return existsInCourse;
  };

  const handleSelectSuggestion = (user: User) => {
      suggestionClickedRef.current = true;
      
      setManualForm({
          rut: user.rut,
          names: user.names,
          paternalSurname: user.paternalSurname,
          maternalSurname: user.maternalSurname || '',
          email: user.email || '',
          phone: user.phone || '',
          academicRole: user.academicRole || '',
          faculty: user.faculty || '',
          department: user.department || '',
          career: user.career || '',
          contractType: user.contractType || '',
          teachingSemester: user.teachingSemester || '',
          campus: user.campus || '',
          systemRole: user.systemRole
      });
      
      setIsFoundInMaster(true);
      setShowSuggestions(false);
      setSuggestions([]); 
      
      const alreadyEnrolled = checkEnrollmentStatus(user.rut);
      if (!alreadyEnrolled) setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
      
      setTimeout(() => { suggestionClickedRef.current = false; }, 300);
  };

  const handleRutBlur = () => {
      setTimeout(() => {
          if (suggestionClickedRef.current) return;
          if (showSuggestions) setShowSuggestions(false);
          
          if(!manualForm.rut) return;
          const formatted = cleanRutFormat(manualForm.rut);
          
          if (!isFoundInMaster) {
            const user = getUser(formatted);
            if(user) {
                setManualForm(prev => ({
                     ...prev, rut: user.rut, names: user.names, paternalSurname: user.paternalSurname,
                     maternalSurname: user.maternalSurname || '', email: user.email || '',
                     phone: user.phone || '', academicRole: user.academicRole || '',
                     faculty: user.faculty || '', department: user.department || '',
                     career: user.career || '', contractType: user.contractType || '',
                     teachingSemester: user.teachingSemester || '', campus: user.campus || '',
                     systemRole: user.systemRole
                }));
                setIsFoundInMaster(true);
                const alreadyEnrolled = checkEnrollmentStatus(user.rut);
                if (!alreadyEnrolled) setEnrollMsg({ type: 'success', text: 'Usuario encontrado en Base Maestra.' });
            } else {
                setManualForm(prev => ({ ...prev, rut: formatted }));
                checkEnrollmentStatus(formatted);
            }
          }
      }, 200);
  };

  // --- HANDLERS: ENROLLMENT MANUAL ---
  const handleManualEnroll = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId) return;
      if (isAlreadyEnrolled) return;
      
      if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) {
          setEnrollMsg({ type: 'error', text: 'Complete los campos obligatorios.' });
          return;
      }

      const formattedRut = cleanRutFormat(manualForm.rut);
      if (checkEnrollmentStatus(formattedRut)) return;

      const userToUpsert: User = {
          rut: formattedRut,
          names: manualForm.names,
          paternalSurname: manualForm.paternalSurname,
          maternalSurname: manualForm.maternalSurname,
          email: manualForm.email,
          phone: manualForm.phone,
          academicRole: manualForm.academicRole,
          faculty: manualForm.faculty,
          department: manualForm.department,
          career: manualForm.career,
          contractType: manualForm.contractType,
          teachingSemester: manualForm.teachingSemester,
          campus: manualForm.campus,
          systemRole: manualForm.systemRole as UserRole
      };

      upsertUsers([userToUpsert]);
      enrollUser(formattedRut, selectedCourseId);
      
      setEnrollMsg({ type: 'success', text: isFoundInMaster ? `Usuario actualizado y matriculado.` : `Nuevo usuario matriculado.` });
      setManualForm({
          rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
          academicRole: '', faculty: '', department: '', career: '', contractType: '',
          teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
      });
      setIsFoundInMaster(false);
      setIsAlreadyEnrolled(false);
  };

  const handleBulkEnroll = () => {
      if (!uploadFile || !selectedCourseId) return;
      const reader = new FileReader();
      const isExcel = uploadFile.name.endsWith('.xlsx') || uploadFile.name.endsWith('.xls');

      reader.onload = async (e) => {
          let rows: any[][] = [];
          if (isExcel) {
              const data = e.target?.result;
              const workbook = read(data, { type: 'array' });
              rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
          } else {
              const text = e.target?.result as string;
              const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
              if (lines.length > 0) {
                  const delimiter = lines[0].includes(';') ? ';' : ',';
                  rows = lines.map(line => line.split(delimiter));
              }
          }

          if (rows.length < 1) return;
          const usersToUpsert: User[] = [];
          const rutsToEnroll: string[] = [];
          
          // Determine start row based on checkbox
          let startRow = hasHeaders ? 1 : 0;

          for (let i = startRow; i < rows.length; i++) {
              const row = rows[i];
              const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
              if (rowStrings.length < 1 || !rowStrings[0]) continue;

              const cleanRut = cleanRutFormat(rowStrings[0]);
              rutsToEnroll.push(cleanRut);
              
              // Apply Normalization to Critical Fields
              usersToUpsert.push({
                  rut: cleanRut,
                  names: rowStrings[1] || '',
                  paternalSurname: rowStrings[2] || '',
                  maternalSurname: rowStrings[3] || '',
                  email: rowStrings[4] || '',
                  phone: rowStrings[5] || '',
                  
                  // Normalize against master lists
                  academicRole: normalizeValue(rowStrings[6], listRoles),
                  faculty: normalizeValue(rowStrings[7], listFaculties),
                  department: normalizeValue(rowStrings[8], listDepts),
                  career: normalizeValue(rowStrings[9], listCareers),
                  contractType: normalizeValue(rowStrings[10], listContracts),
                  teachingSemester: normalizeValue(rowStrings[11], listSemesters),
                  
                  campus: rowStrings[12] || '',
                  systemRole: UserRole.ESTUDIANTE
              });
          }

          upsertUsers(usersToUpsert);
          const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
          setEnrollMsg({ type: 'success', text: `¡Éxito! Procesado Masivo: ${result.success} nuevos inscritos, ${result.skipped} ya estaban en el curso.` });
          setUploadFile(null);
      };
      isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  const handleUpdateGrade = (enrollmentId: string, index: number, value: string) => {
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;
      const newGrades = [...(enrollment.grades || [])];
      newGrades[index] = parseFloat(value) || 0;
      const final = newGrades.length > 0 ? parseFloat((newGrades.reduce((a, b) => a + b, 0) / newGrades.length).toFixed(1)) : 0;

      // Update state calculation happens in updateEnrollment logic, but here we can prepare basic data
      // The definitive status logic for display is in getComputedStatus
      updateEnrollment(enrollmentId, { 
          grades: newGrades,
          finalGrade: final,
          state: final >= (config.minPassingGrade || 4.0) ? ActivityState.APROBADO : ActivityState.REPROBADO
      });
  };

  const handleToggleAttendance = (enrollmentId: string, sessionKey: string) => {
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;
      // @ts-ignore
      const currentVal = enrollment[sessionKey];
      let presentCount = 0;
      // Recalculate based on current state + new change
      if (enrollment.attendanceSession1) presentCount++;
      if (enrollment.attendanceSession2) presentCount++;
      if (enrollment.attendanceSession3) presentCount++;
      if (enrollment.attendanceSession4) presentCount++;
      if (enrollment.attendanceSession5) presentCount++;
      if (enrollment.attendanceSession6) presentCount++;
      if (!currentVal) presentCount++; else presentCount--; // Adjust for toggle
      
      updateEnrollment(enrollmentId, { [sessionKey]: !currentVal, attendancePercentage: Math.round((presentCount / 6) * 100) });
  };


  // --- VIEW: LIST ---
  if (view === 'list') {
      return (
          <div className="animate-fadeIn space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos</h2>
                  <button 
                    onClick={() => {
                        setFormData({
                            internalCode: '', year: new Date().getFullYear(), semester: '1',
                            nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', 
                            fechaInicio: '', fechaTermino: '', moduleCount: 0, evaluationCount: 3,
                            linkRecursos: '', linkClase: '', linkEvaluacion: ''
                        });
                        setView('create');
                    }} 
                    className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
                  >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Crear Nuevo Curso
                  </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {academicActivities.map(act => (
                      <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="flex justify-between items-start mb-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  act.modality === 'Presencial' ? 'bg-blue-50 text-[#647FBC]' : 
                                  act.modality === 'E-Learning' ? 'bg-[#91ADC8]/20 text-slate-700' :
                                  'bg-[#AED6CF]/30 text-teal-700'
                              }`}>{act.modality}</span>
                              <div className="flex flex-col items-end">
                                  {act.version && <span className="bg-slate-700 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide mb-1">{act.version.split(' ')[0]}</span>}
                                  <span className="text-xs text-slate-400 font-mono" title="ID Compuesto">{act.id}</span>
                              </div>
                          </div>
                          <h3 className="font-bold text-slate-800 text-lg mb-2 truncate" title={act.name}>{act.name}</h3>
                          
                          <div className="text-sm text-slate-500 space-y-1 mb-4">
                              <p className="flex items-center gap-2 text-xs font-mono text-slate-400">
                                   <span className="font-bold">COD:</span> {act.internalCode || 'N/A'} | <span className="font-bold">PER:</span> {act.academicPeriod || 'N/A'}
                              </p>
                              <p className="flex items-center gap-2 pt-2">
                                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                  {act.relator || 'Sin relator'}
                              </p>
                              <p className="flex items-center gap-2">
                                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  Inicio: {formatDateCL(act.startDate)}
                              </p>
                          </div>
                          
                          <div className="flex gap-2">
                             <button 
                                onClick={() => { setSelectedCourseId(act.id); setView('details'); }}
                                className="flex-1 bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-[#647FBC] transition-colors text-xs"
                             >
                                Gestionar
                             </button>
                             <button 
                                onClick={() => handleCloneActivity(act)}
                                title="Clonar / Nueva Versión"
                                className="px-3 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                             >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                             </button>
                          </div>
                      </div>
                  ))}
                  {academicActivities.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                          No hay cursos académicos creados.
                      </div>
                  )}
              </div>
          </div>
      );
  }

  // --- VIEW: CREATE / EDIT ---
  if (view === 'create' || view === 'edit') {
      const isDateWarning = formData.fechaTermino && suggestedEndDateISO && formData.fechaTermino < suggestedEndDateISO;
      const isEditMode = view === 'edit';

      return (
          <div className="max-w-4xl mx-auto animate-fadeIn">
              <button 
                onClick={() => isEditMode ? setView('details') : setView('list')} 
                className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm"
              >
                  ← {isEditMode ? 'Volver al detalle' : 'Volver al listado'}
              </button>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <h2 className="text-xl font-bold text-slate-800">
                          {isEditMode ? 'Editar Curso Académico' : 'Crear Nuevo Curso Académico'}
                      </h2>
                      {isEditMode && (
                          <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                              Modo Edición
                          </span>
                      )}
                  </div>
                  
                  <form onSubmit={handleCreateSubmit} className="space-y-6">
                      
                      {/* Identificadores del Curso */}
                      <div className="bg-[#647FBC]/5 p-4 rounded-lg border border-[#647FBC]/20">
                          <h3 className="text-sm font-bold text-[#647FBC] mb-3 uppercase tracking-wide">Cronología Académica & Versión</h3>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-[#647FBC] mb-1">Código (Corto) *</label>
                                <input required type="text" placeholder="Ej. IND-01" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] font-mono text-sm uppercase"/>
                                <p className="text-[10px] text-blue-600 mt-1">ID base.</p>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-[#647FBC] mb-1">Año *</label>
                                <input required type="number" min="2020" max="2030" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] font-mono text-sm"/>
                                <p className="text-[10px] text-blue-600 mt-1">Histórico o Actual.</p>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-[#647FBC] mb-1">Semestre / Periodo *</label>
                                <select value={formData.semester} onChange={e => setFormData({...formData, semester: e.target.value})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm">
                                    <option value="1">1er Semestre</option>
                                    <option value="2">2do Semestre</option>
                                    <option value="INV">Invierno (TAV)</option>
                                    <option value="VER">Verano (TAV)</option>
                                    <option value="ANUAL">Anual</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-[#647FBC] mb-1">Versión *</label>
                                <select value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm">
                                    <option value="V1">V1</option>
                                    <option value="V2">V2</option>
                                    <option value="V3">V3</option>
                                    <option value="V4">V4</option>
                                    <option value="VE">Esp</option>
                                </select>
                                <p className="text-[10px] text-blue-600 mt-1">Iteración en el año.</p>
                              </div>
                          </div>
                      </div>

                      {/* Datos Básicos */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo del Curso *</label>
                            <input required type="text" placeholder="Ej. Taller de Habilidades Docentes" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad *</label>
                            <select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]">
                                {listModalities.map(mod => <option key={mod} value={mod}>{mod}</option>)}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horas Cronológicas *</label>
                            <input required type="number" min="1" value={formData.horas} onChange={e => setFormData({...formData, horas: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Relator (Instructor) *</label>
                            <input required type="text" placeholder="Nombre completo del docente" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                          </div>
                      </div>

                      {/* GESTIÓN DEL CURSO (NUEVO) */}
                      <div className="bg-[#647FBC]/5 p-4 rounded-lg border border-[#647FBC]/20">
                          <h3 className="text-sm font-bold text-[#647FBC] mb-3 uppercase tracking-wide flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                              Gestión Académica del Curso
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad de Módulos</label>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    value={formData.moduleCount} 
                                    onChange={e => setFormData({...formData, moduleCount: Number(e.target.value)})} 
                                    className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">
                                      {formData.moduleCount > 0 
                                        ? `Duración estimada: ${formData.moduleCount + 2} semanas (+2 sem. extensión).`
                                        : 'Ingrese módulos para estimar duración.'}
                                  </p>
                              </div>
                              
                              <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad de Notas (Evaluaciones)</label>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    max="10"
                                    value={formData.evaluationCount} 
                                    onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} 
                                    className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">Número de columnas de notas en el seguimiento.</p>
                              </div>

                              <div className="md:col-span-2 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 mt-2">
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio *</label>
                                    <input required type="date" value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Término</label>
                                    <input type="date" value={formData.fechaTermino} onChange={e => setFormData({...formData, fechaTermino: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>
                                    {suggestedEndDateDisplay && (
                                        <div className="mt-1 flex flex-col gap-1">
                                            <span className="text-[10px] text-emerald-600 font-bold">
                                                Sugerido: {suggestedEndDateDisplay} (Según módulos)
                                            </span>
                                            {isDateWarning && (
                                                <span className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                    Advertencia: La fecha es menor a la duración estimada.
                                                </span>
                                            )}
                                        </div>
                                    )}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Enlaces y Recursos */}
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Recursos Digitales</h3>
                          
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Link de Recursos (Drive/Moodle)</label>
                            <input type="url" placeholder="https://..." value={formData.linkRecursos} onChange={e => setFormData({...formData, linkRecursos: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Link de la Clase (Meet/Zoom)</label>
                                <input type="url" placeholder="https://meet.google.com/..." value={formData.linkClase} onChange={e => setFormData({...formData, linkClase: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Link de Evaluación</label>
                                <input type="url" placeholder="https://forms..." value={formData.linkEvaluacion} onChange={e => setFormData({...formData, linkEvaluacion: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end pt-6">
                          <button type="submit" className="bg-[#647FBC] text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-colors">
                              {isEditMode ? 'Guardar Cambios' : 'Guardar Curso'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      );
  }

  // --- VIEW: DETAILS ---
  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
               <button onClick={() => { setSelectedCourseId(null); setView('list'); }} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">
                  ← Volver al listado
              </button>

              {/* Header Course Info */}
              <div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <div className="flex items-center gap-2 mb-1">
                          <span className="bg-[#647FBC]/10 text-[#647FBC] text-xs font-bold px-2 py-0.5 rounded">{selectedCourse.id}</span>
                          <span className="text-slate-400 text-xs">|</span>
                          <span className="text-slate-500 text-xs font-bold uppercase">{selectedCourse.version}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2>
                      <p className="text-slate-500 text-sm mt-1 flex items-center gap-4">
                          <span>{selectedCourse.modality}</span>
                          <span>•</span>
                          <span>{selectedCourse.hours} Horas</span>
                          <span>•</span>
                          <span>{selectedCourse.relator}</span>
                      </p>
                  </div>
                  <div className="flex gap-2">
                       {selectedCourse.linkResources && <a href={selectedCourse.linkResources} target="_blank" rel="noreferrer" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors">📂 Recursos</a>}
                       {selectedCourse.classLink && <a href={selectedCourse.classLink} target="_blank" rel="noreferrer" className="text-xs bg-[#91ADC8]/20 hover:bg-[#91ADC8]/30 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors">🎥 Clase</a>}
                       <button 
                          onClick={handleEditCourse}
                          className="text-xs bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold"
                       >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          Modificar
                       </button>
                  </div>
              </div>

              {/* Tabs Container */}
              <div className="mt-8">
                  <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 mb-0">
                        <button
                          onClick={() => setActiveDetailTab('enrollment')}
                          className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${
                             activeDetailTab === 'enrollment' 
                             ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] translate-y-[1px] z-10' 
                             : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100 hover:text-slate-800 border-x border-slate-300 mb-px shadow-inner'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className={`w-5 h-5 ${activeDetailTab === 'enrollment' ? 'text-[#647FBC]' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            <span>Matrícula</span>
                          </div>
                        </button>

                        <button
                          onClick={() => setActiveDetailTab('tracking')}
                          className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${
                             activeDetailTab === 'tracking' 
                             ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] translate-y-[1px] z-10' 
                             : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100 hover:text-slate-800 border-x border-slate-300 mb-px shadow-inner'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className={`w-5 h-5 ${activeDetailTab === 'tracking' ? 'text-[#647FBC]' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            <span>Seguimiento Académico</span>
                          </div>
                        </button>
                  </div>

                  <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-[#647FBC]/30 border-t-0 p-8">
                      {activeDetailTab === 'enrollment' && (
                          <div className="space-y-8 animate-fadeIn">
                              <div className="grid grid-cols-3 gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                  <div className="text-center border-r border-slate-100">
                                      <span className="block text-2xl font-bold text-slate-700">{stats.total}</span>
                                      <span className="text-xs text-slate-500 uppercase font-semibold">Matriculados</span>
                                  </div>
                                  <div className="text-center border-r border-slate-100">
                                      <span className={`block text-2xl font-bold ${stats.empty > 0 ? 'text-amber-500' : 'text-slate-700'}`}>{stats.empty}</span>
                                      <span className="text-xs text-slate-500 uppercase font-semibold">Perfiles Incompletos</span>
                                  </div>
                                  <div className="text-center">
                                      <span className={`block text-2xl font-bold ${stats.inconsistent > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{stats.inconsistent}</span>
                                      <span className="text-xs text-slate-500 uppercase font-semibold">Inconsistencias</span>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 gap-8">
                                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                      <div className="flex justify-between items-center mb-6">
                                            <h3 className="font-bold text-slate-800 text-lg">Matrícula Individual</h3>
                                            {isFoundInMaster && (
                                                <span className="text-xs px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">Datos de Base Maestra</span>
                                            )}
                                      </div>
                                      <form onSubmit={handleManualEnroll} className="space-y-8">
                                          {/* Identification */}
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Identificación Personal</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="md:col-span-1 relative">
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                                    <div className="relative">
                                                        <input type="text" name="rut" placeholder="12345678-9" autoComplete="off" value={manualForm.rut} onChange={handleManualFormChange} onBlur={handleRutBlur} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647FBC] font-bold ${isFoundInMaster ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-slate-300'} ${isAlreadyEnrolled ? 'border-red-500 bg-red-50 text-red-800' : ''}`} />
                                                        {showSuggestions && suggestions.length > 0 && (
                                                            <div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">
                                                                {suggestions.map((s) => (
                                                                    <div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0">
                                                                        <span className="font-bold block text-slate-800">{s.rut}</span>
                                                                        <span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                              </div>
                                          </div>
                                          {/* Contact */}
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información de Contacto</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional</label><input type="email" name="email" value={manualForm.email} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                              </div>
                                          </div>
                                          {/* Academic */}
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información Académica</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Sede / Campus</label><input type="text" name="campus" value={manualForm.campus} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                  <div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleManualFormChange} /></div>
                                                  <div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleManualFormChange} /></div>
                                                  <div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleManualFormChange} /></div>
                                                  <div><SmartSelect label="Tipo Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleManualFormChange} /></div>
                                                  <div><SmartSelect label="Semestre Docencia" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleManualFormChange} /></div>
                                              </div>
                                          </div>
                                          {/* Roles */}
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Roles</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  <div><SmartSelect label="Rol / Cargo Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualFormChange} /></div>
                                              </div>
                                          </div>

                                          <button type="submit" disabled={isAlreadyEnrolled} className={`w-full py-2.5 rounded-lg font-bold shadow-md transition-all ${isAlreadyEnrolled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#647FBC] text-white hover:bg-blue-800'}`}>
                                              {isAlreadyEnrolled ? 'Usuario Ya Matriculado' : 'Matricular Usuario'}
                                          </button>
                                          
                                          {enrollMsg && (
                                              <div className={`text-xs p-3 rounded-lg text-center font-medium ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                  {enrollMsg.text}
                                              </div>
                                          )}
                                      </form>
                                  </div>

                                  {/* Bulk Upload (Visual Improvement) */}
                                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                                      <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                                          <svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                          Carga Masiva (CSV / Excel)
                                      </h3>
                                      <div className="flex-1 space-y-6">
                                          <p className="text-sm text-slate-600">
                                              Suba un archivo con las 13 columnas requeridas para matricular alumnos masivamente.
                                              <br/><span className="text-xs text-slate-400">Formatos soportados: .csv, .xls, .xlsx</span>
                                          </p>
                                          
                                          {/* Enhanced Dropzone */}
                                          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-[#647FBC]/40 bg-[#647FBC]/5 hover:bg-[#647FBC]/10'}`}>
                                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                  {uploadFile ? (
                                                      <>
                                                        <svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        <p className="mb-1 text-sm font-bold text-emerald-700">{uploadFile.name}</p>
                                                        <p className="text-xs text-emerald-600">Click para cambiar archivo</p>
                                                      </>
                                                  ) : (
                                                      <>
                                                        <svg className="w-8 h-8 text-[#647FBC] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                        <p className="mb-1 text-sm text-[#647FBC] font-semibold">Click para seleccionar archivo</p>
                                                        <p className="text-xs text-slate-500">o arrastra y suelta aquí</p>
                                                      </>
                                                  )}
                                              </div>
                                              <input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => {
                                                  setUploadFile(e.target.files ? e.target.files[0] : null);
                                                  setEnrollMsg(null); // Clear previous messages
                                              }} />
                                          </label>
                                          
                                          <div className="flex items-center justify-center gap-2 mt-2">
                                                <input 
                                                    type="checkbox" 
                                                    id="hasHeadersEnrollment" 
                                                    checked={hasHeaders} 
                                                    onChange={e => setHasHeaders(e.target.checked)}
                                                    className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" 
                                                />
                                                <label htmlFor="hasHeadersEnrollment" className="text-sm text-slate-700 cursor-pointer select-none">
                                                    La primera fila contiene encabezados (No importar)
                                                </label>
                                           </div>

                                          <div className="bg-slate-50 p-3 rounded text-[10px] font-mono text-slate-500 overflow-x-auto border border-slate-200">
                                              RUT, Nombres, Ap.Paterno, Ap.Materno, Correo, Teléfono, Rol, Facultad, Depto, Carrera, Contrato, Semestre, Sede
                                          </div>
                                      </div>

                                      {/* Success / Error Message Box */}
                                      {enrollMsg && (
                                          <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 animate-fadeIn ${enrollMsg.type === 'success' ? 'bg-emerald-100 border-emerald-200' : 'bg-red-100 border-red-200'}`}>
                                              <div className={`p-1 rounded-full ${enrollMsg.type === 'success' ? 'bg-emerald-200 text-emerald-700' : 'bg-red-200 text-red-700'}`}>
                                                  {enrollMsg.type === 'success' ? (
                                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                  ) : (
                                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                  )}
                                              </div>
                                              <div>
                                                  <h4 className={`font-bold text-sm ${enrollMsg.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                                                      {enrollMsg.type === 'success' ? 'Operación Exitosa' : 'Error'}
                                                  </h4>
                                                  <p className={`text-xs mt-1 ${enrollMsg.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                                                      {enrollMsg.text}
                                                  </p>
                                              </div>
                                          </div>
                                      )}

                                      <button onClick={handleBulkEnroll} disabled={!uploadFile} className="mt-4 w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 disabled:opacity-50 shadow-md transition-all">
                                          Procesar Archivo Seleccionado
                                      </button>
                                  </div>
                              </div>

                              {/* Student Table */}
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-slate-50 border-b border-slate-200">
                                      <h3 className="font-bold text-slate-700">Listado de Matriculados</h3>
                                  </div>
                                  <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-sm text-left whitespace-nowrap">
                                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 bg-slate-100 sticky left-0 z-10 border-r border-slate-200">Alumno (RUT)</th>
                                                <th className="px-4 py-4">Correo</th>
                                                <th className="px-4 py-4">Rol Académico</th>
                                                <th className="px-4 py-4">Contrato</th>
                                                <th className="px-4 py-4">Facultad</th>
                                                <th className="px-4 py-4">Depto</th>
                                                <th className="px-4 py-4">Carrera</th>
                                                <th className="px-4 py-4 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {courseEnrollments.map((enr) => {
                                                const student = users.find(u => u.rut === enr.rut);
                                                
                                                // Validate fields
                                                const facultyError = student?.faculty && !listFaculties.includes(student.faculty);
                                                const deptError = student?.department && !listDepts.includes(student.department);
                                                const careerError = student?.career && !listCareers.includes(student.career);
                                                const contractError = student?.contractType && !listContracts.includes(student.contractType);
                                                const roleError = student?.academicRole && !listRoles.includes(student.academicRole);

                                                return (
                                                    <tr key={enr.id} className="hover:bg-blue-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-slate-900 bg-white sticky left-0 border-r border-slate-100">
                                                            <div className="flex flex-col">
                                                                <span>{student?.paternalSurname} {student?.maternalSurname}, {student?.names}</span>
                                                                <span className="text-xs text-slate-400 font-mono">{enr.rut}</span>
                                                            </div>
                                                        </td>
                                                        <td className={`px-4 py-4 ${!student?.email ? 'text-red-300 italic' : 'text-slate-600'}`}>{student?.email || 'Sin correo'}</td>
                                                        <td className={`px-4 py-4 ${roleError ? 'text-red-500 font-bold' : 'text-slate-600'}`}>{student?.academicRole || 'Sin Rol'}</td>
                                                        <td className={`px-4 py-4 ${contractError ? 'text-red-500 font-bold' : 'text-slate-600'}`}>{student?.contractType || 'Sin Contrato'}</td>
                                                        <td className={`px-4 py-4 ${facultyError ? 'text-red-500' : 'text-slate-600'}`}>{student?.faculty || '-'}</td>
                                                        <td className={`px-4 py-4 ${deptError ? 'text-red-500' : 'text-slate-600'}`}>{student?.department || '-'}</td>
                                                        <td className={`px-4 py-4 ${careerError ? 'text-red-500' : 'text-slate-600'}`}>{student?.career || '-'}</td>
                                                        <td className="px-4 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : enr.state === ActivityState.REPROBADO ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{enr.state}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                              </div>
                          </div>
                      )}

                      {/* Tab Content: Tracking */}
                      {activeDetailTab === 'tracking' && (
                          <div className="animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                      <h3 className="font-bold text-slate-700">Sábana de Notas y Asistencia</h3>
                                      <span className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-500">{courseEnrollments.length} Estudiantes</span>
                                  </div>
                                  <div className="overflow-x-auto custom-scrollbar">
                                      <table className="w-full text-sm text-left whitespace-nowrap">
                                          <thead className="bg-slate-100 text-slate-600 font-bold">
                                              <tr>
                                                  <th className="px-2 py-3 w-40 max-w-[160px] sticky left-0 bg-slate-100 border-r border-slate-200 truncate">Estudiante</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S1</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S2</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S3</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S4</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S5</th>
                                                  <th className="px-1 py-3 text-center w-8 text-[10px]">S6</th>
                                                  <th className="px-2 py-3 text-center w-16 text-xs">% Asist</th>
                                                  
                                                  {/* Dynamic Grade Columns - NARROWED */}
                                                  {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (
                                                      <th key={i} className="px-1 py-3 text-center w-12 text-xs">N{i + 1}</th>
                                                  ))}

                                                  <th className="px-2 py-3 text-center w-20">Final</th>
                                                  {/* Reduced padding/width for Status and Certificate */}
                                                  <th className="px-1 py-3 text-center w-24 text-xs">Estado</th>
                                                  <th className="px-1 py-3 text-center w-32 text-xs">Cert.</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {courseEnrollments.map(enr => {
                                                  const user = users.find(u => u.rut === enr.rut);
                                                  const status = getComputedStatus(enr, selectedCourse);
                                                  const minPassingGrade = config.minPassingGrade || 4.0;
                                                  const minAttendance = config.minAttendancePercentage || 75;
                                                  
                                                  // Visual Styles based on status
                                                  let statusClass = 'bg-slate-100 text-slate-600';
                                                  if (status === 'EN PROCESO') statusClass = 'bg-amber-100 text-amber-700';
                                                  if (status === 'AVANZANDO') statusClass = 'bg-indigo-100 text-indigo-700';
                                                  if (status === 'APROBADO') statusClass = 'bg-emerald-100 text-emerald-700';
                                                  if (status === 'REPROBADO') statusClass = 'bg-red-100 text-red-700';

                                                  // Attendance Low Alert Style
                                                  const attClass = (enr.attendancePercentage || 0) < minAttendance 
                                                        ? 'bg-red-50 text-red-600 font-bold px-2 py-1 rounded' 
                                                        : 'text-slate-600 font-bold';

                                                  // Final Grade Low Alert Style
                                                  const finalGradeClass = (enr.finalGrade || 0) < minPassingGrade && (enr.finalGrade || 0) > 0
                                                        ? 'text-red-600 font-bold'
                                                        : 'text-slate-800 font-bold';

                                                  return (
                                                      <tr key={enr.id} className="hover:bg-blue-50/30">
                                                          <td className="px-2 py-2 max-w-[160px] sticky left-0 bg-white border-r border-slate-100 font-medium text-slate-700 truncate" title={user ? `${user.paternalSurname} ${user.maternalSurname || ''}, ${user.names}` : enr.rut}>
                                                              {user ? `${user.paternalSurname} ${user.maternalSurname || ''}, ${user.names}` : enr.rut}
                                                          </td>
                                                          {/* Session Checkboxes - tighter */}
                                                          {['attendanceSession1', 'attendanceSession2', 'attendanceSession3', 'attendanceSession4', 'attendanceSession5', 'attendanceSession6'].map((key) => (
                                                              <td key={key} className="px-1 py-2 text-center"><input type="checkbox" checked={!!enr[key as keyof Enrollment]} onChange={() => handleToggleAttendance(enr.id, key)} className="rounded text-[#647FBC] focus:ring-[#647FBC] cursor-pointer w-3 h-3"/></td>
                                                          ))}
                                                          <td className="px-2 py-2 text-center"><span className={attClass}>{enr.attendancePercentage || 0}%</span></td>
                                                          
                                                          {/* Dynamic Grade Inputs - Tighter width and padding */}
                                                          {Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => {
                                                              const gradeVal = enr.grades?.[idx];
                                                              const isLowGrade = gradeVal !== undefined && gradeVal < minPassingGrade && gradeVal > 0;
                                                              return (
                                                                  <td key={idx} className="px-1 py-2">
                                                                      <input 
                                                                        type="number" step="0.1" min="1" max="7" 
                                                                        className={`w-full text-center border border-slate-200 rounded py-1 text-sm font-bold px-1 focus:border-[#647FBC] focus:ring-1 focus:ring-[#647FBC] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isLowGrade ? 'text-red-600' : 'text-slate-700'}`} 
                                                                        value={enr.grades?.[idx] || ''} 
                                                                        onChange={(e) => handleUpdateGrade(enr.id, idx, e.target.value)} 
                                                                      />
                                                                  </td>
                                                              );
                                                          })}

                                                          <td className={`px-2 py-2 text-center text-sm ${finalGradeClass}`}>{enr.finalGrade || '-'}</td>
                                                          {/* Status - Tighter padding */}
                                                          <td className="px-1 py-2 text-center">
                                                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase block w-full truncate ${statusClass}`}>
                                                                  {status}
                                                              </span>
                                                          </td>
                                                          {/* Certificate - Tighter padding */}
                                                          <td className="px-1 py-2 text-center">
                                                              {status === 'APROBADO' && (
                                                                  <button 
                                                                    onClick={() => handleGenerateCertificate(user, selectedCourse)}
                                                                    disabled={isGeneratingPdf}
                                                                    className="text-white bg-[#647FBC] hover:bg-blue-700 px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors flex items-center justify-center gap-1 mx-auto w-full disabled:opacity-50"
                                                                  >
                                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                      <span className="hidden xl:inline">{isGeneratingPdf ? '...' : 'PDF'}</span>
                                                                  </button>
                                                              )}
                                                          </td>
                                                      </tr>
                                                  );
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  return <div>Estado desconocido</div>;
};