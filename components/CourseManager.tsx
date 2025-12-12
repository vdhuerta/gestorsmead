
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Activity, ActivityState, Enrollment, User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';
// @ts-ignore
import { jsPDF } from 'jspdf';

// --- UTILITY FUNCTIONS ---
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut; 
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
};

const formatDateCL = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Pendiente';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

const normalizeValue = (val: string, masterList: string[]): string => {
    if (!val) return '';
    const trimmed = val.trim();
    if (masterList.includes(trimmed)) return trimmed;
    const match = masterList.find(item => item.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed;
};

type ViewState = 'list' | 'create' | 'details' | 'edit';
type DetailTab = 'enrollment' | 'tracking';

interface CourseManagerProps {
    currentUser?: User;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ currentUser }) => {
  const { activities, addActivity, deleteActivity, users, enrollments, upsertUsers, enrollUser, bulkEnroll, updateEnrollment, getUser, config } = useData();
  const isAdmin = currentUser?.systemRole === UserRole.ADMIN;
  const isAdvisor = currentUser?.systemRole === UserRole.ASESOR;
  
  // Dynamic Lists
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listModalities = config.modalities?.length ? config.modalities : ["Presencial", "B-Learning", "E-Learning", "Autoinstruccional", "Presencia Digital"];
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  const academicActivities = activities.filter(a => !a.category || a.category === 'ACADEMIC');

  const [view, setView] = useState<ViewState>('list');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('enrollment');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Auto-jump logic
  useEffect(() => {
      const jumpId = localStorage.getItem('jumpto_course_id');
      const jumpTab = localStorage.getItem('jumpto_tab_course') as DetailTab | null;
      
      if (jumpId && academicActivities.length > 0) {
          const exists = academicActivities.find(a => a.id === jumpId);
          if (exists) {
              setSelectedCourseId(jumpId);
              setView('details');
              if (jumpTab) setActiveDetailTab(jumpTab);
          }
          localStorage.removeItem('jumpto_course_id');
          localStorage.removeItem('jumpto_tab_course');
      }
  }, [academicActivities]);

  // Form States
  const [formData, setFormData] = useState({
    internalCode: '', year: new Date().getFullYear(), semester: '1', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', moduleCount: 0, evaluationCount: 3, linkRecursos: '', linkClase: '', linkEvaluacion: ''
  });
  const [suggestedEndDateDisplay, setSuggestedEndDateDisplay] = useState<string>('');
  const [suggestedEndDateISO, setSuggestedEndDateISO] = useState<string>('');

  const [manualForm, setManualForm] = useState({
      rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
      academicRole: '', faculty: '', department: '', career: '', contractType: '',
      teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
  });

  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionClickedRef = useRef(false);

  const [isFoundInMaster, setIsFoundInMaster] = useState(false);
  const [isAlreadyEnrolled, setIsAlreadyEnrolled] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true);

  const selectedCourse = academicActivities.find(a => a.id === selectedCourseId);
  const courseEnrollments = enrollments.filter(e => e.activityId === selectedCourseId);

  // Sorting
  const sortedEnrollments = useMemo(() => {
      return [...courseEnrollments].sort((a, b) => {
          const userA = users.find(u => u.rut === a.rut);
          const userB = users.find(u => u.rut === b.rut);
          const surnameA = userA?.paternalSurname || '';
          const surnameB = userB?.paternalSurname || '';
          const compareSurname = surnameA.localeCompare(surnameB, 'es', { sensitivity: 'base' });
          if (compareSurname !== 0) return compareSurname;
          const nameA = userA?.names || '';
          const nameB = userB?.names || '';
          return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });
  }, [courseEnrollments, users]);

  // Click outside suggestions
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Suggested End Date
  useEffect(() => {
    if (formData.fechaInicio && formData.moduleCount > 0) {
        const [y, m, d] = formData.fechaInicio.split('-').map(Number);
        const startDate = new Date(y, m - 1, d); 
        const durationWeeks = formData.moduleCount + 2;
        const daysToAdd = (durationWeeks * 7) - 1; 
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + daysToAdd);
        const isoDate = endDate.toISOString().split('T')[0];
        setSuggestedEndDateISO(isoDate);
        setSuggestedEndDateDisplay(`${String(endDate.getDate()).padStart(2, '0')}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${endDate.getFullYear()}`);
    } else {
        setSuggestedEndDateDisplay('');
        setSuggestedEndDateISO('');
    }
  }, [formData.fechaInicio, formData.moduleCount]);

  // --- LOGIC: STATUS CALCULATION (RESTORED & FIXED) ---
  const getComputedStatus = (enrollment: Enrollment, activity: Activity): ActivityState => {
      // 1. Verificar si hay asistencia registrada
      const hasAttendance = [
          enrollment.attendanceSession1, enrollment.attendanceSession2, enrollment.attendanceSession3, 
          enrollment.attendanceSession4, enrollment.attendanceSession5, enrollment.attendanceSession6
      ].some(val => val === true);

      // 2. Verificar si hay notas registradas (mayores a 0)
      const recordedGrades = (enrollment.grades || []).filter(g => typeof g === 'number' && g > 0).length;
      const expectedGrades = activity.evaluationCount || 3;

      // 3. LOGICA RESTAURADA:
      // Si no hay asistencia ni notas -> INSCRITO
      if (!hasAttendance && recordedGrades === 0) {
          return ActivityState.INSCRITO;
      }

      // Si hay algo de avance (asistencia o algunas notas) pero faltan notas -> EN PROCESO
      if (recordedGrades < expectedGrades) {
          // Podríamos diferenciar "Avanzando" si ya tiene notas, pero "En Proceso" es seguro.
          return recordedGrades > 0 ? ActivityState.AVANZANDO : ActivityState.EN_PROCESO;
      }

      // Si ya tiene TODAS las notas -> Evaluar Aprobación
      if (recordedGrades >= expectedGrades) {
          const minGrade = config.minPassingGrade || 4.0;
          const minAtt = config.minAttendancePercentage || 75;
          
          const finalGrade = enrollment.finalGrade || 0;
          const attendancePct = enrollment.attendancePercentage || 0;

          // Solo se aprueba si cumple AMBOS requisitos
          if (finalGrade >= minGrade && attendancePct >= minAtt) {
              return ActivityState.APROBADO;
          } else {
              return ActivityState.REPROBADO;
          }
      }

      return ActivityState.PENDIENTE;
  };

  const stats = useMemo(() => {
      const total = sortedEnrollments.length;
      let empty = 0;
      let inconsistent = 0;
      
      sortedEnrollments.forEach(enr => {
          const user = users.find(u => u.rut === enr.rut);
          if (!user) {
              empty++; 
          } else {
              if (!user.email || !user.faculty) inconsistent++;
          }
      });
      
      return { total, empty, inconsistent };
  }, [sortedEnrollments, users]);

  // --- ACTIONS HANDLERS ---

  const handleCloneActivity = (act: Activity) => {
      const newId = `${act.internalCode}-CLONE-${Date.now().toString().slice(-4)}`;
      const cloned: Activity = {
          ...act,
          id: newId,
          name: `${act.name} (Copia)`,
          version: `${act.version} (Copia)`
      };
      addActivity(cloned);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const cleanCode = formData.internalCode.trim().toUpperCase().replace(/\s+/g, '-');
      const academicPeriodText = `${formData.year}-${formData.semester}`;
      const generatedId = `${cleanCode}-${academicPeriodText}-${formData.version}`;
      
      const finalId = (view === 'edit' && selectedCourseId) ? selectedCourseId : generatedId;

      const newActivity: Activity = {
          id: finalId,
          category: 'ACADEMIC',
          internalCode: formData.internalCode,
          year: formData.year,
          academicPeriod: academicPeriodText,
          name: formData.nombre,
          version: formData.version,
          modality: formData.modality,
          hours: formData.horas,
          moduleCount: formData.moduleCount,
          evaluationCount: formData.evaluationCount,
          relator: formData.relator,
          startDate: formData.fechaInicio,
          endDate: formData.fechaTermino, 
          linkResources: formData.linkRecursos,
          classLink: formData.linkClase,
          evaluationLink: formData.linkEvaluacion,
          isPublic: true 
      };

      addActivity(newActivity);
      
      if (view === 'edit') {
          setView('details');
      } else {
          setFormData({ internalCode: '', year: new Date().getFullYear(), semester: '1', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', moduleCount: 0, evaluationCount: 3, linkRecursos: '', linkClase: '', linkEvaluacion: '' });
          setView('list');
      }
  };

  const handleDeleteActivity = async () => {
      if (!selectedCourseId || !selectedCourse) return;
      const password = prompt(`ADVERTENCIA: ¿Eliminar "${selectedCourse.name}"? Contraseña ADMIN:`);
      if (password === currentUser?.password) {
          await deleteActivity(selectedCourseId);
          alert("Eliminado.");
          setView('list');
          setSelectedCourseId(null);
      } else if (password !== null) {
          alert("Incorrecto.");
      }
  };

  const handleEditCourse = () => {
      if (!selectedCourse) return;
      let sem = '1';
      if (selectedCourse.academicPeriod) {
          const parts = selectedCourse.academicPeriod.split('-');
          if (parts.length > 1) sem = parts[1];
      }

      setFormData({
          internalCode: selectedCourse.internalCode || '',
          year: selectedCourse.year || new Date().getFullYear(),
          semester: sem,
          nombre: selectedCourse.name,
          version: selectedCourse.version || 'V1',
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

  // --- ENROLLMENT HANDLERS ---

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
      
      if (selectedCourseId) {
          const exists = enrollments.some(e => e.activityId === selectedCourseId && e.rut === user.rut);
          setIsAlreadyEnrolled(exists);
          if (exists) setEnrollMsg({ type: 'error', text: 'Usuario ya inscrito.' });
          else setEnrollMsg({ type: 'success', text: 'Datos cargados desde Base Maestra.' });
      }
      
      setTimeout(() => { suggestionClickedRef.current = false; }, 300);
  };

  const handleRutBlur = () => {
      setTimeout(() => {
          if (suggestionClickedRef.current) return;
          if (showSuggestions) setShowSuggestions(false);
          
          if (manualForm.rut) {
              const formatted = cleanRutFormat(manualForm.rut);
              if (!isFoundInMaster) {
                  const user = getUser(formatted);
                  if (user) {
                      handleSelectSuggestion(user);
                  } else {
                      setManualForm(prev => ({ ...prev, rut: formatted }));
                  }
              }
          }
      }, 200);
  };

  const handleManualEnroll = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCourseId || isAlreadyEnrolled) return;
      if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) {
          setEnrollMsg({ type: 'error', text: 'Faltan datos obligatorios.' });
          return;
      }

      const formattedRut = cleanRutFormat(manualForm.rut);
      
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

      try {
          await upsertUsers([userToUpsert]);
          await enrollUser(formattedRut, selectedCourseId);
          setEnrollMsg({ type: 'success', text: 'Matriculado correctamente.' });
          setManualForm({ 
              rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
              academicRole: '', faculty: '', department: '', career: '', contractType: '',
              teachingSemester: '', campus: '', systemRole: UserRole.ESTUDIANTE
          }); 
          setIsFoundInMaster(false);
          setIsAlreadyEnrolled(false);
      } catch (err: any) {
          setEnrollMsg({ type: 'error', text: err.message });
      }
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
          let startRow = hasHeaders ? 1 : 0;

          for (let i = startRow; i < rows.length; i++) {
              const row = rows[i];
              const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
              if (rowStrings.length < 1 || !rowStrings[0]) continue;

              const cleanRut = cleanRutFormat(rowStrings[0]);
              rutsToEnroll.push(cleanRut);

              const hasName = rowStrings[1] && rowStrings[1].length > 1;
              if (hasName) {
                  usersToUpsert.push({
                      rut: cleanRut,
                      names: rowStrings[1] || '',
                      paternalSurname: rowStrings[2] || '',
                      maternalSurname: rowStrings[3] || '',
                      email: rowStrings[4] || '',
                      phone: rowStrings[5] || '',
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
          }

          if (usersToUpsert.length > 0) { await upsertUsers(usersToUpsert); }
          const result = await bulkEnroll(rutsToEnroll, selectedCourseId);
          setEnrollMsg({ type: 'success', text: `Carga Masiva: ${result.success} nuevos inscritos, ${result.skipped} ya existentes.` });
          setUploadFile(null);
      };
      isExcel ? reader.readAsArrayBuffer(uploadFile) : reader.readAsText(uploadFile);
  };

  const handleUpdateGrade = (enrollmentId: string, gradeIndex: number, value: string) => {
      if (!selectedCourse) return;
      const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
      if (!enrollment) return;

      let numValue = parseFloat(value);
      if (value === '') numValue = 0;
      if (isNaN(numValue)) numValue = 0;
      if (numValue > 7.0) numValue = 7.0;
      if (numValue < 0) numValue = 0;

      const currentGrades = [...(enrollment.grades || [])];
      while (currentGrades.length <= gradeIndex) currentGrades.push(0);
      
      currentGrades[gradeIndex] = numValue;

      const validGrades = currentGrades.filter(g => g > 0);
      const finalGrade = validGrades.length > 0 ? parseFloat((validGrades.reduce((a,b)=>a+b,0)/validGrades.length).toFixed(1)) : 0;

      const tempEnrollment: Enrollment = { ...enrollment, grades: currentGrades, finalGrade };
      const newState = getComputedStatus(tempEnrollment, selectedCourse);

      updateEnrollment(enrollmentId, {
          grades: currentGrades,
          finalGrade: finalGrade,
          state: newState
      });
  };

  const handleToggleAttendance = (enrollmentId: string, sessionKey: string) => {
    const enrollment = courseEnrollments.find(e => e.id === enrollmentId);
    if (!enrollment || !selectedCourse) return;

    // @ts-ignore
    const newValue = !enrollment[sessionKey];
    const tempEnrollmentState = { ...enrollment, [sessionKey]: newValue };
    
    let presentCount = 0;
    if (tempEnrollmentState.attendanceSession1) presentCount++;
    if (tempEnrollmentState.attendanceSession2) presentCount++;
    if (tempEnrollmentState.attendanceSession3) presentCount++;
    if (tempEnrollmentState.attendanceSession4) presentCount++;
    if (tempEnrollmentState.attendanceSession5) presentCount++;
    if (tempEnrollmentState.attendanceSession6) presentCount++;
    
    const totalSessions = 6;
    const newPercentage = Math.round((presentCount / totalSessions) * 100);
    const tempEnrollmentForState: Enrollment = { ...tempEnrollmentState, attendancePercentage: newPercentage };
    const newState = getComputedStatus(tempEnrollmentForState, selectedCourse);
    
    updateEnrollment(enrollmentId, { [sessionKey]: newValue, attendancePercentage: newPercentage, state: newState as ActivityState });
  };

  // --- HTML CERTIFICATE GENERATION LOGIC ---
  const generateHTMLCertificate = (user: User, course: Activity, enrollment: Enrollment, dateStr: string) => {
      const win = window.open('', '_blank');
      if (!win) { alert("Por favor habilite las ventanas emergentes para descargar el certificado."); return; }
      
      const fullName = `${user.names} ${user.paternalSurname} ${user.maternalSurname || ''}`.toUpperCase();
      const courseName = course.name.toUpperCase();
      const certCode = enrollment.certificateCode;
      
      // La URL ahora incluye el modo de verificación de certificado
      const qrData = `${window.location.origin}/?mode=verify_cert&code=${certCode}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(qrData)}`;
      
      // Official Logos
      const logoSmead = 'https://raw.githubusercontent.com/vdhuerta/assets-aplications/main/Logo_SMEAD.png';
      const logoUad = 'https://github.com/vdhuerta/assets-aplications/blob/main/Logo-UAD%20(2).png?raw=true';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Constancia - ${fullName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700;800&display=swap');
                @page { size: letter portrait; margin: 0; }
                body { margin: 0; padding: 0; width: 100%; height: 100vh; font-family: 'Montserrat', sans-serif; background-color: #f5f5f5; display: flex; justify-content: center; align-items: center; }
                .certificate-container { position: relative; width: 216mm; height: 279mm; background-color: white; box-shadow: 0 0 20px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column; }
                
                /* Sidebar decorativo */
                .sidebar-left { position: absolute; left: 0; top: 0; bottom: 0; width: 25px; background: linear-gradient(to bottom, #009FE3, #004B87); }
                
                .content { flex: 1; margin: 50px 70px; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 10; }
                
                /* Watermark (AGRANDADO Y POSICIONADO) */
                .watermark { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); opacity: 0.05; width: 650px; z-index: 0; pointer-events: none; }

                /* Header */
                .header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 60px; border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; }
                
                /* Logo GestorSMEAD */
                .header-left { display: flex; align-items: center; gap: 10px; }
                .logo-smead { height: 50px; object-fit: contain; }
                .logo-smead-text { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 20px; color: #555; }

                /* Logo UAD REDUCIDO */
                .logo-uad { height: 42px; object-fit: contain; }

                /* Titles */
                .title-container { text-align: center; margin-bottom: 50px; }
                .title-main { font-size: 48px; font-weight: 800; color: #009FE3; margin: 0; line-height: 0.9; text-transform: uppercase; letter-spacing: -1px; }
                .title-sub { font-size: 36px; font-weight: 300; color: #555; margin: 5px 0 0 0; line-height: 1; text-transform: uppercase; letter-spacing: 4px; }

                /* Text Body */
                .text-body { text-align: justify; font-size: 16px; line-height: 1.8; color: #444; margin-bottom: 40px; width: 100%; }

                /* Student Info */
                .student-section { width: 100%; text-align: center; margin-bottom: 40px; }
                .student-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
                .student-name { font-size: 32px; font-weight: 700; color: #222; text-transform: uppercase; border-bottom: 3px solid #009FE3; padding-bottom: 5px; display: inline-block; min-width: 80%; position: relative; z-index: 10; }

                /* Activity Info */
                .activity-section { width: 100%; margin-bottom: 40px; background-color: #f8fbff; padding: 30px; border-radius: 15px; border: 1px solid #eef4fc; text-align: center; box-shadow: 0 4px 15px rgba(0,159,227,0.05); }
                .activity-label { font-size: 14px; color: #666; margin-bottom: 10px; font-style: italic; }
                .activity-name { font-size: 24px; font-weight: 800; color: #004B87; margin: 0; line-height: 1.3; }
                .activity-meta { font-size: 14px; margin-top: 15px; color: #555; font-weight: 500; }
                
                .date-section { text-align: right; width: 100%; font-size: 14px; color: #666; margin-bottom: 20px; }

                /* VERIFICATION SECTION (QR + STAMP) */
                .verification-container { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: auto; margin-bottom: 40px; padding: 0 20px; }
                
                .qr-box { text-align: center; }
                .qr-img { width: 90px; height: 90px; }
                .qr-text { font-size: 9px; color: #999; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
                .cert-code { font-family: monospace; font-weight: bold; font-size: 10px; margin-top: 2px; color: #555; background: #eee; padding: 2px 4px; border-radius: 4px; }

                .seal-box { width: 110px; height: 110px; border-radius: 50%; border: 2px solid #009FE3; display: flex; align-items: center; justify-content: center; background: white; }
                .seal-img { width: 80%; opacity: 0.8; }

                /* Footer */
                .footer { width: 100%; background-color: #333; color: white; text-align: center; font-size: 10px; padding: 15px 0; position: absolute; bottom: 0; left: 0; text-transform: uppercase; letter-spacing: 2px; }
                
                @media print {
                    body { background: none; display: block; height: auto; }
                    .certificate-container { box-shadow: none; width: 100%; height: 100%; page-break-after: always; margin: 0; border: none; }
                }
            </style>
        </head>
        <body>
            <div class="certificate-container">
                <div class="sidebar-left"></div>
                
                <div class="content">
                    <img src="${logoUad}" class="watermark" alt="Watermark">
                    
                    <div class="header">
                        <div class="header-left">
                            <img src="${logoSmead}" class="logo-smead" alt="GestorSMEAD">
                            <span class="logo-smead-text">GestorSMEAD</span>
                        </div>
                        <img src="${logoUad}" class="logo-uad" alt="UAD UPLA">
                    </div>

                    <div class="title-container">
                        <h1 class="title-main">CONSTANCIA</h1>
                        <h2 class="title-sub">DE PARTICIPACIÓN</h2>
                    </div>

                    <p class="text-body">
                        La <strong>Unidad de Acompañamiento Docente (UAD)</strong>, dependiente de la Dirección General de Pregrado de la Vicerrectoría Académica de la Universidad de Playa Ancha de Ciencias de la Educación, a través del presente documento certifica que:
                    </p>

                    <div class="student-section">
                        <div class="student-label">Don/Doña</div>
                        <span class="student-name">${fullName}</span>
                    </div>

                    <div class="activity-section">
                        <div class="activity-label">Ha finalizado satisfactoriamente la Actividad Formativa denominada:</div>
                        <div class="activity-name">${courseName}</div>
                        <div class="activity-meta">
                            Dictada en modalidad <strong>${course.modality.toUpperCase()}</strong> con una duración cronológica de <strong>${course.hours} horas</strong>.
                        </div>
                    </div>
                    
                    <div class="date-section">
                        Valparaíso, ${dateStr}
                    </div>

                    <div class="verification-container">
                        <div class="qr-box">
                            <img src="${qrUrl}" class="qr-img" alt="QR Verificación">
                            <div class="qr-text">Escanee para verificar</div>
                            <div class="cert-code">${certCode}</div>
                        </div>
                        
                        <div class="seal-box">
                            <img src="${logoUad}" class="seal-img" alt="Sello UAD">
                        </div>
                    </div>
                </div>

                <div class="footer">
                    Vicerrectoría Académica / Dirección General de Pregrado / Unidad de Acompañamiento Docente
                </div>
            </div>
            <script>
                window.onload = function() { setTimeout(function() { window.print(); }, 1000); };
            </script>
        </body>
        </html>
      `;
      
      win.document.write(htmlContent);
      win.document.close();
  };

  const handleGenerateCertificate = async (user: User | undefined, course: Activity | undefined) => {
      if (!user || !course) return;
      
      // Find specific enrollment
      const enrollment = enrollments.find(e => e.rut === user.rut && e.activityId === course.id);
      if (!enrollment) return;

      setIsGeneratingPdf(true);
      
      // 1. Verificar si ya tiene código de certificado, si no, generar uno.
      let updatedEnrollment = enrollment;
      if (!enrollment.certificateCode) {
          const newCode = `CERT-${Math.random().toString(36).substr(2, 5).toUpperCase()}-${Date.now().toString().slice(-4)}`;
          await updateEnrollment(enrollment.id, { certificateCode: newCode });
          updatedEnrollment = { ...enrollment, certificateCode: newCode };
      }

      const date = new Date();
      const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
      const dateStr = date.toLocaleDateString('es-CL', options);
      
      generateHTMLCertificate(user, course, updatedEnrollment, dateStr);
      setIsGeneratingPdf(false);
  };

  if (view === 'list') {
      return (
          <div className="animate-fadeIn space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800">Gestión de Cursos</h2>
                  <button onClick={() => { setFormData({ internalCode: '', year: new Date().getFullYear(), semester: '1', nombre: '', version: 'V1', modality: listModalities[0], horas: 0, relator: '', fechaInicio: '', fechaTermino: '', moduleCount: 0, evaluationCount: 3, linkRecursos: '', linkClase: '', linkEvaluacion: '' }); setView('create'); }} className="bg-[#647FBC] text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Crear Nuevo Curso
                  </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {academicActivities.map(act => (
                      <div key={act.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="flex justify-between items-start mb-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${act.modality === 'Presencial' ? 'bg-blue-50 text-[#647FBC]' : act.modality === 'E-Learning' ? 'bg-[#91ADC8]/20 text-slate-700' : 'bg-[#AED6CF]/30 text-teal-700'}`}>{act.modality}</span>
                              <div className="flex flex-col items-end">
                                  {act.version && <span className="bg-slate-700 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide mb-1">{act.version.split(' ')[0]}</span>}
                                  <span className="text-xs text-slate-400 font-mono" title="ID Compuesto">{act.id}</span>
                              </div>
                          </div>
                          <h3 className="font-bold text-slate-800 text-lg mb-2 truncate" title={act.name}>{act.name}</h3>
                          <div className="text-sm text-slate-500 space-y-1 mb-4">
                              <p className="flex items-center gap-2 text-xs font-mono text-slate-400"><span className="font-bold">COD:</span> {act.internalCode || 'N/A'} | <span className="font-bold">PER:</span> {act.academicPeriod || 'N/A'}</p>
                              <p className="flex items-center gap-2 pt-2"><svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>{act.relator || 'Sin relator'}</p>
                              <p className="flex items-center gap-2"><svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Inicio: {formatDateCL(act.startDate)}</p>
                          </div>
                          <div className="flex gap-2">
                             <button onClick={() => { setSelectedCourseId(act.id); setView('details'); }} className="flex-1 bg-slate-50 border border-slate-300 text-slate-700 py-2 rounded-lg font-medium hover:bg-white hover:border-[#647FBC] transition-colors text-xs">Gestionar</button>
                             <button onClick={() => handleCloneActivity(act)} title="Clonar" className="px-3 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg></button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  // --- VIEW: CREATE/EDIT/DETAILS ---
  if (view === 'create' || view === 'edit') {
      const isDateWarning = formData.fechaTermino && suggestedEndDateISO && formData.fechaTermino < suggestedEndDateISO;
      const isEditMode = view === 'edit';
      return (
          <div className="max-w-4xl mx-auto animate-fadeIn">
              <button onClick={() => isEditMode ? setView('details') : setView('list')} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← {isEditMode ? 'Volver al detalle' : 'Volver al listado'}</button>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6"><h2 className="text-xl font-bold text-slate-800">{isEditMode ? 'Editar Curso Académico' : 'Crear Nuevo Curso Académico'}</h2>{isEditMode && (<span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">Modo Edición</span>)}</div>
                  <form onSubmit={handleCreateSubmit} className="space-y-6">
                      <div className="bg-[#647FBC]/5 p-4 rounded-lg border border-[#647FBC]/20">
                          <h3 className="text-sm font-bold text-[#647FBC] mb-3 uppercase tracking-wide">Cronología Académica & Versión</h3>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div><label className="block text-xs font-bold text-[#647FBC] mb-1">Código (Corto) *</label><input required type="text" placeholder="Ej. IND-01" value={formData.internalCode} onChange={e => setFormData({...formData, internalCode: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] font-mono text-sm uppercase"/></div>
                              <div><label className="block text-xs font-bold text-[#647FBC] mb-1">Año *</label><input required type="number" min="2020" max="2030" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] font-mono text-sm"/></div>
                              <div><label className="block text-xs font-bold text-[#647FBC] mb-1">Semestre *</label><select value={formData.semester} onChange={e => setFormData({...formData, semester: e.target.value})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"><option value="1">1er Semestre</option><option value="2">2do Semestre</option><option value="INV">Invierno</option><option value="VER">Verano</option><option value="ANUAL">Anual</option></select></div>
                              <div><label className="block text-xs font-bold text-[#647FBC] mb-1">Versión *</label><select value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"><option value="V1">V1</option><option value="V2">V2</option><option value="V3">V3</option><option value="VE">Esp</option></select></div>
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2"><label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo *</label><input required type="text" placeholder="Ej. Taller" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                          <div><label className="block text-sm font-medium text-slate-700 mb-1">Modalidad *</label><select value={formData.modality} onChange={e => setFormData({...formData, modality: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]">{listModalities.map(mod => <option key={mod} value={mod}>{mod}</option>)}</select></div>
                          <div><label className="block text-sm font-medium text-slate-700 mb-1">Horas *</label><input required type="number" min="1" value={formData.horas} onChange={e => setFormData({...formData, horas: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                          <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Relator *</label><input required type="text" placeholder="Nombre completo" value={formData.relator} onChange={e => setFormData({...formData, relator: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                      </div>
                      <div className="bg-[#647FBC]/5 p-4 rounded-lg border border-[#647FBC]/20">
                          <h3 className="text-sm font-bold text-[#647FBC] mb-3 uppercase tracking-wide">Gestión Académica del Curso</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">Módulos</label><input type="number" min="0" value={formData.moduleCount} onChange={e => setFormData({...formData, moduleCount: Number(e.target.value)})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/></div>
                              <div><label className="block text-xs font-bold text-slate-700 mb-1">Cantidad Notas</label><input type="number" min="1" max="10" value={formData.evaluationCount} onChange={e => setFormData({...formData, evaluationCount: Number(e.target.value)})} className="w-full px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/></div>
                              <div className="md:col-span-2 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 mt-2">
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Inicio *</label><input required type="date" value={formData.fechaInicio} onChange={e => setFormData({...formData, fechaInicio: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Término</label><input type="date" value={formData.fechaTermino} onChange={e => setFormData({...formData, fechaTermino: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/>{suggestedEndDateDisplay && (<div className="mt-1 flex flex-col gap-1"><span className="text-[10px] text-emerald-600 font-bold">Sugerido: {suggestedEndDateDisplay}</span>{isDateWarning && (<span className="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">Fecha menor a duración estimada.</span>)}</div>)}</div>
                              </div>
                          </div>
                      </div>
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Recursos Digitales</h3>
                          <div><label className="block text-sm font-medium text-slate-700 mb-1">Link Recursos</label><input type="url" placeholder="https://..." value={formData.linkRecursos} onChange={e => setFormData({...formData, linkRecursos: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/></div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Link Clase</label><input type="url" placeholder="https://..." value={formData.linkClase} onChange={e => setFormData({...formData, linkClase: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/></div>
                              <div><label className="block text-sm font-medium text-slate-700 mb-1">Link Evaluación</label><input type="url" placeholder="https://..." value={formData.linkEvaluacion} onChange={e => setFormData({...formData, linkEvaluacion: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] text-sm"/></div>
                          </div>
                      </div>
                      <div className="flex justify-between pt-6">
                          {isEditMode && currentUser?.systemRole === UserRole.ADMIN && (<button type="button" onClick={handleDeleteActivity} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors flex items-center gap-2">Eliminar</button>)}
                          <button type="submit" className="bg-[#647FBC] text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-colors ml-auto">{isEditMode ? 'Guardar Cambios' : 'Guardar Curso'}</button>
                      </div>
                  </form>
              </div>
          </div>
      );
  }

  // --- VIEW DETAILS ---
  if (view === 'details' && selectedCourse) {
      return (
          <div className="animate-fadeIn space-y-6">
               <button onClick={() => { setSelectedCourseId(null); setView('list'); }} className="text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 text-sm">← Volver al listado</button>
              <div className="bg-white border-l-4 border-[#647FBC] rounded-r-xl shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <div className="flex items-center gap-2 mb-1"><span className="bg-[#647FBC]/10 text-[#647FBC] text-xs font-bold px-2 py-0.5 rounded">{selectedCourse.id}</span><span className="text-slate-400 text-xs">|</span><span className="text-slate-500 text-xs font-bold uppercase">{selectedCourse.version}</span></div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedCourse.name}</h2>
                      <p className="text-slate-500 text-sm mt-1 flex items-center gap-4"><span>{selectedCourse.modality}</span><span>•</span><span>{selectedCourse.hours} Horas</span><span>•</span><span>{selectedCourse.relator}</span></p>
                  </div>
                  <div className="flex gap-2">
                       {selectedCourse.linkResources && <a href={selectedCourse.linkResources} target="_blank" rel="noreferrer" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors">📂 Recursos</a>}
                       {selectedCourse.classLink && <a href={selectedCourse.classLink} target="_blank" rel="noreferrer" className="text-xs bg-[#91ADC8]/20 hover:bg-[#91ADC8]/30 text-slate-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors">🎥 Clase</a>}
                       <button onClick={handleEditCourse} className="text-xs bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold">Modificar</button>
                  </div>
              </div>
              <div className="mt-8">
                  <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 mb-0">
                        <button onClick={() => setActiveDetailTab('enrollment')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'enrollment' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Matrícula</button>
                        <button onClick={() => setActiveDetailTab('tracking')} className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${activeDetailTab === 'tracking' ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100'}`}>Seguimiento Académico</button>
                  </div>
                  <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-[#647FBC]/30 border-t-0 p-8">
                      {activeDetailTab === 'enrollment' && (
                          <div className="space-y-8 animate-fadeIn">
                              <div className="grid grid-cols-3 gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                  <div className="text-center border-r border-slate-100"><span className="block text-2xl font-bold text-slate-700">{stats.total}</span><span className="text-xs text-slate-500 uppercase font-semibold">Matriculados</span></div>
                                  <div className="text-center border-r border-slate-100"><span className={`block text-2xl font-bold ${stats.empty > 0 ? 'text-amber-500' : 'text-slate-700'}`}>{stats.empty}</span><span className="text-xs text-slate-500 uppercase font-semibold">Incompletos</span></div>
                                  <div className="text-center"><span className={`block text-2xl font-bold ${stats.inconsistent > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{stats.inconsistent}</span><span className="text-xs text-slate-500 uppercase font-semibold">Inconsistencias</span></div>
                              </div>
                              <div className="grid grid-cols-1 gap-8">
                                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                                      <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-slate-800 text-lg">Matrícula Individual</h3>{isFoundInMaster && (<span className="text-xs px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200">Datos de Base Maestra</span>)}</div>
                                      <form onSubmit={handleManualEnroll} className="space-y-8">
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Identificación Personal</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="md:col-span-1 relative"><label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label><div className="relative"><input type="text" name="rut" placeholder="12345678-9" autoComplete="off" value={manualForm.rut} onChange={handleManualFormChange} onBlur={handleRutBlur} className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647FBC] font-bold ${isFoundInMaster ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-slate-300'} ${isAlreadyEnrolled ? 'border-red-500 bg-red-50 text-red-800' : ''}`} />{showSuggestions && suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-10 w-full bg-white mt-1 border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto left-0">{suggestions.map((s) => (<div key={s.rut} onMouseDown={() => handleSelectSuggestion(s)} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-slate-50 last:border-0"><span className="font-bold block text-slate-800">{s.rut}</span><span className="text-xs text-slate-500">{s.names} {s.paternalSurname}</span></div>))}</div>)}</div></div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                              </div>
                                          </div>
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información de Contacto</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional</label><input type="email" name="email" value={manualForm.email} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualFormChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                                              </div>
                                          </div>
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
                                          <div className="space-y-4">
                                              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Roles</h3>
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  <div><SmartSelect label="Rol / Cargo Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualFormChange} /></div>
                                              </div>
                                          </div>
                                          <button type="submit" disabled={isAlreadyEnrolled} className={`w-full py-2.5 rounded-lg font-bold shadow-md transition-all ${isAlreadyEnrolled ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#647FBC] text-white hover:bg-blue-800'}`}>{isAlreadyEnrolled ? 'Usuario Ya Matriculado' : 'Matricular Usuario'}</button>
                                          {enrollMsg && (<div className={`text-xs p-3 rounded-lg text-center font-medium ${enrollMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{enrollMsg.text}</div>)}
                                      </form>
                                  </div>
                                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                                      <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2"><svg className="w-5 h-5 text-[#647FBC]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>Carga Masiva (CSV / Excel)</h3>
                                      <div className="flex-1 space-y-6"><p className="text-sm text-slate-600">Suba un archivo con las 13 columnas requeridas.<br/><span className="text-xs text-slate-400">.csv, .xls, .xlsx</span></p><label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-[#647FBC]/40 bg-[#647FBC]/5 hover:bg-[#647FBC]/10'}`}><div className="flex flex-col items-center justify-center pt-5 pb-6">{uploadFile ? (<><svg className="w-8 h-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p className="mb-1 text-sm font-bold text-emerald-700">{uploadFile.name}</p></>) : (<><svg className="w-8 h-8 text-[#647FBC] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><p className="mb-1 text-sm text-[#647FBC] font-semibold">Seleccionar archivo</p></>)}</div><input type="file" className="hidden" accept=".csv, .xls, .xlsx" onChange={(e) => { setUploadFile(e.target.files ? e.target.files[0] : null); setEnrollMsg(null); }} /></label><div className="flex items-center justify-center gap-2 mt-2"><input type="checkbox" id="hasHeadersEnrollment" checked={hasHeaders} onChange={e => setHasHeaders(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" /><label htmlFor="hasHeadersEnrollment" className="text-sm text-slate-700 cursor-pointer select-none">Ignorar primera fila (encabezados)</label></div><button onClick={handleBulkEnroll} disabled={!uploadFile} className="mt-4 w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 disabled:opacity-50 shadow-md transition-all">Procesar Archivo</button></div>
                                  </div>
                              </div>
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  <div className="p-4 bg-slate-50 border-b border-slate-200"><h3 className="font-bold text-slate-700">Listado de Matriculados</h3></div>
                                  <div className="overflow-x-auto custom-scrollbar"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200"><tr><th className="px-6 py-4 bg-slate-100 sticky left-0 z-10 border-r border-slate-200">Alumno (RUT)</th><th className="px-4 py-4">Correo</th><th className="px-4 py-4">Rol</th><th className="px-4 py-4">Contrato</th><th className="px-4 py-4">Facultad</th><th className="px-4 py-4">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedEnrollments.map((enr) => { const student = users.find(u => u.rut === enr.rut); return (<tr key={enr.id} className="hover:bg-blue-50/50 transition-colors"><td className="px-6 py-4 font-medium text-slate-900 bg-white sticky left-0 border-r border-slate-100"><div className="flex flex-col">{(student?.names) ? (<span>{student.paternalSurname} {student.maternalSurname || ''}, {student.names}</span>) : (<span className="text-slate-400 italic font-normal">Sin info</span>)}<span className="text-xs text-slate-400 font-mono">{enr.rut}</span></div></td><td className="px-4 py-4 text-xs">{student?.email || '-'}</td><td className="px-4 py-4 text-xs">{student?.academicRole || '-'}</td><td className="px-4 py-4 text-xs">{student?.contractType || '-'}</td><td className="px-4 py-4 text-xs">{student?.faculty || '-'}</td><td className="px-4 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${enr.state === ActivityState.APROBADO ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{enr.state}</span></td></tr>);})}</tbody></table></div>
                              </div>
                          </div>
                      )}
                      {activeDetailTab === 'tracking' && (
                          <div className="animate-fadeIn">
                              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                  {/* Metrics Calculation */}
                                  {(() => {
                                      const advancingCount = sortedEnrollments.filter(e => (e.grades?.some(g => g > 0) || [e.attendanceSession1, e.attendanceSession2, e.attendanceSession3, e.attendanceSession4, e.attendanceSession5, e.attendanceSession6].some(Boolean))).length;
                                      const allGrades = sortedEnrollments.flatMap(e => e.grades || []).filter(g => g > 0);
                                      const globalAvg = allGrades.length ? (allGrades.reduce((a,b)=>a+b,0)/allGrades.length).toFixed(1) : "0.0";
                                      
                                      return (
                                          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-2">
                                              <h3 className="font-bold text-slate-700">Sábana de Notas y Asistencia</h3>
                                              <div className="flex flex-wrap gap-2">
                                                  <span className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-500 font-medium">{sortedEnrollments.length} Estudiantes</span>
                                                  <span className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-full text-indigo-600 font-medium">Avanzando: {advancingCount}</span>
                                                  <span className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-full text-amber-600 font-medium">Promedio General: {globalAvg}</span>
                                              </div>
                                          </div>
                                      );
                                  })()}
                                  <div className="overflow-x-auto custom-scrollbar"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="bg-slate-100 text-slate-600 font-bold"><tr><th className="px-2 py-3 w-40 max-w-[160px] sticky left-0 bg-slate-100 border-r border-slate-200 truncate">Estudiante</th><th className="px-1 py-3 text-center w-8 text-[10px]">S1</th><th className="px-1 py-3 text-center w-8 text-[10px]">S2</th><th className="px-1 py-3 text-center w-8 text-[10px]">S3</th><th className="px-1 py-3 text-center w-8 text-[10px]">S4</th><th className="px-1 py-3 text-center w-8 text-[10px]">S5</th><th className="px-1 py-3 text-center w-8 text-[10px]">S6</th><th className="px-2 py-3 text-center w-16 text-xs">% Asist</th>{Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, i) => (<th key={i} className="px-1 py-3 text-center w-12 text-xs">N{i + 1}</th>))}<th className="px-2 py-3 text-center w-20">Final</th><th className="px-1 py-3 text-center w-24 text-xs">Estado</th><th className="px-1 py-3 text-center w-32 text-xs">Certificado</th></tr></thead><tbody className="divide-y divide-slate-100">{sortedEnrollments.map(enr => { const user = users.find(u => u.rut === enr.rut); const status = getComputedStatus(enr, selectedCourse); const minPassingGrade = config.minPassingGrade || 4.0; const minAttendance = config.minAttendancePercentage || 75; const displayName = (user && user.names) ? `${user.paternalSurname} ${user.maternalSurname || ''}, ${user.names}` : enr.rut; return (<tr key={enr.id} className="hover:bg-blue-50/30"><td className="px-2 py-2 max-w-[160px] sticky left-0 bg-white border-r border-slate-100 font-medium text-slate-700 truncate" title={displayName}>{displayName}</td>{['attendanceSession1', 'attendanceSession2', 'attendanceSession3', 'attendanceSession4', 'attendanceSession5', 'attendanceSession6'].map((key) => (<td key={key} className="px-1 py-2 text-center"><input type="checkbox" checked={!!enr[key as keyof Enrollment]} onChange={() => handleToggleAttendance(enr.id, key)} className="rounded text-[#647FBC] focus:ring-[#647FBC] cursor-pointer w-3 h-3"/></td>))}<td className="px-2 py-2 text-center"><span className={(enr.attendancePercentage || 0) < minAttendance ? 'bg-red-50 text-red-600 font-bold px-2 py-1 rounded' : 'text-slate-600 font-bold'}>{enr.attendancePercentage || 0}%</span></td>{Array.from({ length: selectedCourse.evaluationCount || 3 }).map((_, idx) => { const gradeVal = enr.grades?.[idx]; return (<td key={idx} className="px-1 py-2"><input type="number" step="0.1" min="1" max="7" className={`w-full text-center border border-slate-200 rounded py-1 text-sm font-bold px-1 focus:border-[#647FBC] focus:ring-1 focus:ring-[#647FBC] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${gradeVal !== undefined && gradeVal < minPassingGrade && gradeVal > 0 ? 'text-red-600' : 'text-slate-700'}`} value={enr.grades?.[idx] || ''} onChange={(e) => handleUpdateGrade(enr.id, idx, e.target.value)} /></td>); })}<td className={`px-2 py-2 text-center text-sm ${(enr.finalGrade || 0) < minPassingGrade && (enr.finalGrade || 0) > 0 ? 'text-red-600 font-bold' : 'text-slate-800 font-bold'}`}>{enr.finalGrade || '-'}</td><td className="px-1 py-2 text-center"><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase block w-full truncate ${ ((isAdmin || isAdvisor) && status === ActivityState.APROBADO) ? 'bg-green-50 text-green-700' : ((isAdmin || isAdvisor) && status === ActivityState.REPROBADO) ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{status}</span></td><td className="px-1 py-2 text-center">{status === ActivityState.APROBADO && (<button onClick={() => handleGenerateCertificate(user, selectedCourse)} disabled={isGeneratingPdf} className="text-white bg-[#647FBC] hover:bg-blue-700 px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors flex items-center justify-center gap-1 mx-auto w-full disabled:opacity-50"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span className="hidden xl:inline">{isGeneratingPdf ? '...' : 'Descargar'}</span></button>)}</td></tr>); })}</tbody></table></div>
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
