
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserRole, User } from '../types';
import { useData } from '../context/DataContext';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect'; 
// @ts-ignore
import { read, utils } from 'xlsx';

// Utility para formatear RUT
const cleanRutFormat = (rut: string): string => {
    let clean = rut.replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return rut;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    return `${body}-${dv}`;
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


export const ParticipantManager: React.FC = () => {
  const { upsertUsers, getUser, deleteUser, users, config } = useData(); 
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  
  // DYNAMIC LISTS FROM CONFIG (Fallback to constants if empty)
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "TAV Invierno", "TAV Verano", "Anual"];

  // Estado para controlar modo Edición vs Creación
  const [isEditing, setIsEditing] = useState(false);
  const [searchTriggered, setSearchTriggered] = useState(false);
  
  // Ref para guardar el estado original del usuario antes de editar (para Smart Fix)
  const originalUserRef = useRef<User | null>(null);

  // --- Audit States ---
  const [filterMode, setFilterMode] = useState<'inconsistent' | 'incomplete' | null>(null);

  // Calculate Stats for Master Base
  const totalUsers = users.length;
  const uniqueFaculties = new Set(users.map(u => u.faculty).filter(f => f && f !== '')).size;
  const uniqueDepartments = new Set(users.map(u => u.department).filter(d => d && d !== '')).size;
  const uniqueCareers = new Set(users.map(u => u.career).filter(c => c && c !== '')).size;

  // --- Audit Logic ---
  const checkInconsistency = (u: User) => {
      if (u.faculty && !listFaculties.includes(u.faculty)) return true;
      if (u.department && !listDepts.includes(u.department)) return true;
      if (u.career && !listCareers.includes(u.career)) return true;
      if (u.contractType && !listContracts.includes(u.contractType)) return true;
      if (u.academicRole && !listRoles.includes(u.academicRole)) return true;
      return false;
  };

  const checkIncomplete = (u: User) => {
      // Definir campos obligatorios para considerar un perfil "Completo"
      if (!u.email || u.email === '') return true;
      if (!u.phone || u.phone === '') return true;
      if (!u.campus || u.campus === '') return true;
      if (!u.contractType || u.contractType === '') return true;
      if (!u.academicRole || u.academicRole === '') return true;
      return false;
  };

  const inconsistentUsers = useMemo(() => users.filter(checkInconsistency), [users, listFaculties, listDepts, listCareers, listContracts, listRoles]);
  const incompleteUsers = useMemo(() => users.filter(checkIncomplete), [users]);

  const filteredUsers = useMemo(() => {
      if (filterMode === 'inconsistent') return inconsistentUsers;
      if (filterMode === 'incomplete') return incompleteUsers;
      return [];
  }, [filterMode, inconsistentUsers, incompleteUsers]);


  // Manual Form State with all 13 fields
  const [manualForm, setManualForm] = useState({
    rut: '',
    names: '',
    paternalSurname: '',
    maternalSurname: '',
    email: '',
    phone: '',
    faculty: '',
    department: '',
    career: '',
    contractType: '',
    teachingSemester: '',
    campus: '',
    academicRole: '', 
    systemRole: UserRole.VISITA
  });
  
  const [manualStatus, setManualStatus] = useState<'idle' | 'error' | 'success' | 'deleted'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [rutError, setRutError] = useState<string | null>(null);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [hasHeaders, setHasHeaders] = useState(true); // Checkbox state, default true
  const [fileReport, setFileReport] = useState<{ 
      total: number, 
      success: number, 
      updated: number, 
      existing: number, 
      errors: any[] 
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Search Logic (Base Maestra) ---
  const handleRutBlur = () => {
      if (!manualForm.rut) return;
      
      const formatted = cleanRutFormat(manualForm.rut);
      // Actualizar input con formato limpio
      setManualForm(prev => ({ ...prev, rut: formatted }));
      loadUserIntoForm(formatted);
  };

  const loadUserIntoForm = (rut: string) => {
      const existingUser = getUser(rut);
      setSearchTriggered(true);

      if (existingUser) {
          // MODO EDICIÓN: Cargar datos
          setIsEditing(true);
          originalUserRef.current = { ...existingUser }; // Guardar copia para detección de cambios
          
          setManualForm({
              rut: existingUser.rut,
              names: existingUser.names || '',
              paternalSurname: existingUser.paternalSurname || '',
              maternalSurname: existingUser.maternalSurname || '',
              email: existingUser.email || '',
              phone: existingUser.phone || '',
              faculty: existingUser.faculty || '',
              department: existingUser.department || '',
              career: existingUser.career || '',
              contractType: existingUser.contractType || '',
              teachingSemester: existingUser.teachingSemester || '',
              campus: existingUser.campus || '',
              academicRole: existingUser.academicRole || '',
              systemRole: existingUser.systemRole || UserRole.VISITA
          });
          setManualStatus('idle');
          setStatusMsg('');
          // Scroll to top to see form
          window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
          // MODO CREACIÓN: Limpiar todo menos RUT
          setIsEditing(false);
          originalUserRef.current = null;
      }
  };

  // --- Manual Handlers ---
  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm(prev => ({ ...prev, [name]: value }));
    if (name === 'rut') {
        setRutError(null);
        setSearchTriggered(false); 
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate basics
    if (!manualForm.rut || !manualForm.names || !manualForm.paternalSurname) {
        setManualStatus('error');
        setRutError('Complete los campos obligatorios');
        return;
    }
    
    // Prepare User Object
    const newUser: User = {
        rut: manualForm.rut,
        names: manualForm.names,
        paternalSurname: manualForm.paternalSurname,
        maternalSurname: manualForm.maternalSurname,
        email: manualForm.email,
        phone: manualForm.phone,
        faculty: manualForm.faculty,
        department: manualForm.department,
        career: manualForm.career,
        contractType: manualForm.contractType,
        teachingSemester: manualForm.teachingSemester,
        campus: manualForm.campus,
        academicRole: manualForm.academicRole,
        systemRole: manualForm.systemRole as UserRole
    };

    // --- SMART BATCH FIX LOGIC ---
    const usersToUpsert = [newUser];
    let autoFixedCount = 0;

    if (isEditing && originalUserRef.current) {
        const original = originalUserRef.current;
        // Campos propensos a error que queremos corregir en lote
        const criticalFields: (keyof User)[] = ['faculty', 'department', 'career', 'academicRole', 'contractType', 'teachingSemester'];
        
        const updatesMap = new Map<string, User>();

        criticalFields.forEach(field => {
            const oldVal = String(original[field] || '').trim();
            const newVal = String(newUser[field] || '').trim();

            // Si el valor cambió y el valor antiguo NO estaba vacío
            // (Asumimos que corregimos un dato erróneo, no un dato faltante)
            if (oldVal && newVal && oldVal !== newVal) {
                
                // Buscar otros usuarios con el MISMO valor erróneo
                const matchingUsers = users.filter(u => 
                    u.rut !== newUser.rut && // Excluir al usuario actual
                    String(u[field] || '').trim() === oldVal
                );

                if (matchingUsers.length > 0) {
                    matchingUsers.forEach(match => {
                        const u = updatesMap.get(match.rut) || { ...match };
                        // @ts-ignore
                        u[field] = newVal; // Aplicar corrección
                        updatesMap.set(match.rut, u);
                    });
                }
            }
        });

        if (updatesMap.size > 0) {
            autoFixedCount = updatesMap.size;
            usersToUpsert.push(...Array.from(updatesMap.values()));
        }
    }
    // -----------------------------

    // Save to Global Store
    upsertUsers(usersToUpsert);

    setManualStatus('success');
    
    // Set dynamic message
    if (autoFixedCount > 0) {
        setStatusMsg(`Usuario actualizado. ¡Corrección Inteligente: Se arreglaron otros ${autoFixedCount} registros con el mismo error!`);
    } else {
        setStatusMsg(isEditing ? 'Usuario actualizado exitosamente.' : 'Usuario creado exitosamente.');
    }

    setTimeout(() => {
        setManualStatus('idle');
        setStatusMsg('');
        if (!isEditing) {
            setManualForm({
                rut: '', names: '', paternalSurname: '', maternalSurname: '', 
                email: '', phone: '', faculty: '', department: '', career: '', 
                contractType: '', teachingSemester: '', campus: '', academicRole: '',
                systemRole: UserRole.VISITA 
            });
            setSearchTriggered(false);
            originalUserRef.current = null;
        }
    }, 3000); // 3 segundos para leer el mensaje largo
  };

  const handleDelete = () => {
      if (confirm(`¿Está seguro de eliminar al usuario ${manualForm.rut} de la Base Maestra?`)) {
          deleteUser(manualForm.rut);
          setManualStatus('deleted');
          setStatusMsg('Usuario eliminado permanentemente.');
          setManualForm({
                rut: '', names: '', paternalSurname: '', maternalSurname: '', 
                email: '', phone: '', faculty: '', department: '', career: '', 
                contractType: '', teachingSemester: '', campus: '', academicRole: '',
                systemRole: UserRole.VISITA 
          });
          setIsEditing(false);
          setSearchTriggered(false);
          originalUserRef.current = null;
          setTimeout(() => { setManualStatus('idle'); setStatusMsg(''); }, 2000);
      }
  };

  // --- CSV/Excel Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setFileReport(null);
    }
  };

  const processFile = () => {
    if (!file) return;
    setIsProcessing(true);

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = (e) => {
      let rows: any[][] = [];
      
      if (isExcel) {
          const data = e.target?.result;
          const workbook = read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rows = utils.sheet_to_json(worksheet, { header: 1 });
      } else {
          const text = e.target?.result as string;
          const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '');
          if (lines.length > 0) {
              const delimiter = lines[0].includes(';') ? ';' : ',';
              rows = lines.map(line => line.split(delimiter));
          }
      }

      if (rows.length === 0) {
          setFileReport({ total: 0, success: 0, updated: 0, existing: 0, errors: [] });
          setIsProcessing(false);
          return;
      }

      const errors: any[] = [];
      const validUsers: User[] = [];
      let processedRows = 0;
      
      // Determine start row based on checkbox
      let startRow = hasHeaders ? 1 : 0;

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const rowStrings = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
        const isRowEmpty = rowStrings.every(cell => cell === '');
        if (isRowEmpty) continue;

        processedRows++;
        const rutRaw = rowStrings[0];
        
        if (!rutRaw) {
             errors.push({ row: i + 1, reason: "Campo RUT vacío" });
        } else {
             const cleanRut = cleanRutFormat(rutRaw);
             
             // Apply Normalization to Critical Fields
             const userObj: User = {
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
                 systemRole: UserRole.VISITA
             };
             
             validUsers.push(userObj);
        }
      }

      const result = upsertUsers(validUsers);
      
      setFileReport({
          total: processedRows,
          success: result.added,
          updated: result.updated,
          existing: processedRows - result.added - result.updated - errors.length,
          errors: errors
      });
      setIsProcessing(false);
      setFile(null); 
    };
    isExcel ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
  };

  // --- Audit Fix Handler ---
  const handleFixAudit = (user: User) => {
      setManualForm({
          rut: user.rut,
          names: user.names || '',
          paternalSurname: user.paternalSurname || '',
          maternalSurname: user.maternalSurname || '',
          email: user.email || '',
          phone: user.phone || '',
          faculty: user.faculty || '',
          department: user.department || '',
          career: user.career || '',
          contractType: user.contractType || '',
          teachingSemester: user.teachingSemester || '',
          campus: user.campus || '',
          academicRole: user.academicRole || '',
          systemRole: user.systemRole || UserRole.VISITA
      });
      setIsEditing(true);
      originalUserRef.current = { ...user }; // Set original user for fixing
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
      
      {/* HEADER: Summary Stats */}
      <div className="bg-[#647FBC]/5 border border-[#647FBC]/20 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-[#647FBC]">Gestión de Base de Datos Maestra</h2>
            <p className="text-[#647FBC]/80">Administración centralizada de usuarios, docentes y estudiantes.</p>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4 md:mt-0">
               {/* AUDIT BUTTONS */}
               <button 
                  onClick={() => setFilterMode(prev => prev === 'inconsistent' ? null : 'inconsistent')}
                  className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-all ${filterMode === 'inconsistent' ? 'bg-red-100 border-red-300 text-red-800 shadow-inner' : 'bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700'}`}
               >
                   <span className={`w-2 h-2 rounded-full ${inconsistentUsers.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></span>
                   <span className="text-xs font-bold uppercase">Inconsistencias:</span>
                   <span className="font-mono font-bold text-lg">{inconsistentUsers.length}</span>
               </button>

               <button 
                  onClick={() => setFilterMode(prev => prev === 'incomplete' ? null : 'incomplete')}
                  className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-all ${filterMode === 'incomplete' ? 'bg-amber-100 border-amber-300 text-amber-800 shadow-inner' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700'}`}
               >
                   <span className={`w-2 h-2 rounded-full ${incompleteUsers.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'}`}></span>
                   <span className="text-xs font-bold uppercase">Perfiles Incompletos:</span>
                   <span className="font-mono font-bold text-lg">{incompleteUsers.length}</span>
               </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
          
          {/* TABS NAVEGACIÓN (Estilo Fichero Mejorado) */}
          <div className="flex items-end gap-2 border-b border-[#647FBC]/30 pl-4 bg-[#F9F8F6] pt-4">
             <button 
               onClick={() => setActiveTab('manual')}
               className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${
                  activeTab === 'manual' 
                  ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] translate-y-[1px] z-10' 
                  : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100 hover:text-slate-800 border-x border-slate-300 mb-px shadow-inner'
               }`}
             >
               <div className="flex items-center gap-2">
                 <svg className={`w-5 h-5 ${activeTab === 'manual' ? 'text-[#647FBC]' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                 <span>Gestión Individual</span>
               </div>
             </button>

             <button 
               onClick={() => setActiveTab('upload')}
               className={`group relative px-6 py-3 rounded-t-xl font-bold text-sm transition-all duration-200 border-t-4 ${
                  activeTab === 'upload' 
                  ? 'bg-white text-[#647FBC] border-t-[#647FBC] border-x border-[#647FBC]/30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] translate-y-[1px] z-10' 
                  : 'bg-slate-200 text-slate-600 border-t-slate-300 hover:bg-slate-100 hover:text-slate-800 border-x border-slate-300 mb-px shadow-inner'
               }`}
             >
               <div className="flex items-center gap-2">
                 <svg className={`w-5 h-5 ${activeTab === 'upload' ? 'text-[#647FBC]' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                 <span>Carga Masiva (CSV)</span>
               </div>
             </button>
          </div>

          <div className="p-8">
            {activeTab === 'manual' && (
              <div className="animate-fadeIn">
                 <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-bold text-slate-700">
                            {isEditing ? 'Editar Usuario Existente' : 'Registrar Nuevo Usuario'}
                        </h3>
                        {/* STATS BADGES */}
                        <div className="flex gap-2">
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] uppercase font-bold rounded border border-blue-100">Usuarios: {totalUsers}</span>
                            <span className="px-2 py-1 bg-teal-50 text-teal-700 text-[10px] uppercase font-bold rounded border border-teal-100">Facultades: {uniqueFaculties}</span>
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 text-[10px] uppercase font-bold rounded border border-purple-100">Depts: {uniqueDepartments}</span>
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] uppercase font-bold rounded border border-indigo-100">Carreras: {uniqueCareers}</span>
                        </div>
                    </div>
                    {isEditing && (
                        <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 animate-pulse">
                            Modo Edición
                        </span>
                    )}
                 </div>

                 <form onSubmit={handleManualSubmit} className="space-y-8">
                    
                    {/* Identification */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Identificación Personal</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Buscar) *</label>
                                <input 
                                    type="text" 
                                    name="rut" 
                                    placeholder="12345678-9"
                                    value={manualForm.rut} 
                                    onChange={handleManualChange}
                                    onBlur={handleRutBlur}
                                    autoComplete="off"
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#647FBC] font-bold ${rutError ? 'border-red-500 bg-red-50' : 'border-slate-300'}`} 
                                />
                                {rutError && <p className="text-xs text-red-500 mt-1">{rutError}</p>}
                            </div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Nombres *</label><input type="text" name="names" value={manualForm.names} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Paterno *</label><input type="text" name="paternalSurname" value={manualForm.paternalSurname} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                            <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label><input type="text" name="maternalSurname" value={manualForm.maternalSurname} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información de Contacto</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Correo Institucional</label><input type="email" name="email" value={manualForm.email} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label><input type="tel" name="phone" value={manualForm.phone} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                        </div>
                    </div>

                    {/* Academic */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Información Académica</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-xs font-medium text-slate-700 mb-1">Sede / Campus</label><input type="text" name="campus" value={manualForm.campus} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]"/></div>
                            <div><SmartSelect label="Facultad" name="faculty" value={manualForm.faculty} options={listFaculties} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Departamento" name="department" value={manualForm.department} options={listDepts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Carrera" name="career" value={manualForm.career} options={listCareers} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Tipo Contrato" name="contractType" value={manualForm.contractType} options={listContracts} onChange={handleManualChange} /></div>
                            <div><SmartSelect label="Semestre Docencia" name="teachingSemester" value={manualForm.teachingSemester} options={listSemesters} onChange={handleManualChange} /></div>
                        </div>
                    </div>

                    {/* Roles */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2">Roles</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><SmartSelect label="Rol / Cargo Académico" name="academicRole" value={manualForm.academicRole} options={listRoles} onChange={handleManualChange} /></div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nivel de Acceso (App)</label>
                                <select name="systemRole" value={manualForm.systemRole} onChange={handleManualChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC]">
                                    <option value={UserRole.VISITA}>Visita (Estudiante)</option>
                                    <option value={UserRole.ASESOR}>Asesor (Gestor)</option>
                                    <option value={UserRole.ADMIN}>Administrador</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-6 flex justify-between items-center">
                        {isEditing && (
                            <button 
                                type="button" 
                                onClick={handleDelete}
                                className="px-6 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
                            >
                                Eliminar Usuario
                            </button>
                        )}
                        <div className="flex-1 flex justify-end gap-3 items-center">
                             {manualStatus === 'success' && <span className="text-green-600 text-sm font-bold self-center animate-pulse">{statusMsg || '¡Guardado Exitosamente!'}</span>}
                             {manualStatus === 'deleted' && <span className="text-red-600 text-sm font-medium self-center">{statusMsg || 'Usuario Eliminado.'}</span>}
                             
                             <button type="submit" className="px-8 py-2.5 bg-[#647FBC] text-white rounded-lg font-bold hover:bg-blue-800 shadow-md transition-all">
                                {isEditing ? 'Actualizar Datos' : 'Crear Usuario'}
                             </button>
                        </div>
                    </div>
                 </form>

                 {/* AUDIT LIST (Bottom) */}
                 {filterMode && (
                     <div className="mt-12 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden animate-fadeIn">
                         <div className={`p-4 border-b flex justify-between items-center ${filterMode === 'inconsistent' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                             <h3 className={`font-bold ${filterMode === 'inconsistent' ? 'text-red-800' : 'text-amber-800'}`}>
                                 {filterMode === 'inconsistent' ? 'Usuarios con Inconsistencias (Datos sucios)' : 'Usuarios con Perfiles Incompletos'}
                             </h3>
                             <button onClick={() => setFilterMode(null)} className="text-xs font-bold underline hover:no-underline opacity-70">Cerrar Lista</button>
                         </div>
                         <div className="max-h-64 overflow-y-auto">
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-white text-slate-500 font-bold sticky top-0 shadow-sm">
                                     <tr>
                                         <th className="px-4 py-2">RUT</th>
                                         <th className="px-4 py-2">Nombre</th>
                                         <th className="px-4 py-2">Problema Detectado</th>
                                         <th className="px-4 py-2 text-right">Acción</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-200">
                                     {filteredUsers.map(u => (
                                         <tr key={u.rut} className="hover:bg-white cursor-pointer" onClick={() => handleFixAudit(u)}>
                                             <td className="px-4 py-2 font-mono text-xs">{u.rut}</td>
                                             <td className="px-4 py-2">{u.names} {u.paternalSurname}</td>
                                             <td className="px-4 py-2 text-xs text-slate-500 italic">
                                                 {filterMode === 'inconsistent' 
                                                    ? 'Valor no coincide con lista maestra (Ver Facultad/Carrera)' 
                                                    : 'Faltan campos obligatorios (Email/Tel/Contrato)'}
                                             </td>
                                             <td className="px-4 py-2 text-right">
                                                 <span className="text-blue-600 font-bold text-xs hover:underline">Corregir &rarr;</span>
                                             </td>
                                         </tr>
                                     ))}
                                     {filteredUsers.length === 0 && (
                                         <tr>
                                             <td colSpan={4} className="px-4 py-8 text-center text-slate-400">¡Excelente! No se encontraron registros con este problema.</td>
                                         </tr>
                                     )}
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 )}
              </div>
            )}

            {activeTab === 'upload' && (
              <div className="max-w-2xl mx-auto py-8 animate-fadeIn">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                       <div className="mx-auto w-16 h-16 bg-blue-50 text-[#647FBC] rounded-full flex items-center justify-center mb-4">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                       </div>
                       <h3 className="text-xl font-bold text-slate-800 mb-2">Carga Masiva de Base Maestra</h3>
                       <p className="text-slate-500 mb-6">Sincronice usuarios masivamente subiendo una planilla CSV o Excel.</p>
                       
                       <input 
                          type="file" 
                          accept=".csv, .xls, .xlsx"
                          onChange={handleFileChange} 
                          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                       />
                        
                       <div className="flex items-center gap-2 mt-4 mb-2 justify-center">
                            <input 
                                type="checkbox" 
                                id="hasHeadersMaster" 
                                checked={hasHeaders} 
                                onChange={e => setHasHeaders(e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer" 
                            />
                            <label htmlFor="hasHeadersMaster" className="text-sm text-slate-700 cursor-pointer select-none">
                                La primera fila contiene encabezados (No importar)
                            </label>
                        </div>

                       {file && (
                           <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-left">
                               <p className="text-sm font-bold text-slate-700">Archivo seleccionado:</p>
                               <p className="text-xs text-slate-500 font-mono mt-1">{file.name}</p>
                               <button 
                                  onClick={processFile} 
                                  disabled={isProcessing}
                                  className="mt-3 w-full bg-[#647FBC] text-white py-2 rounded-lg font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
                               >
                                   {isProcessing ? 'Procesando...' : 'Procesar e Importar'}
                               </button>
                           </div>
                       )}

                       {/* REPORT */}
                       {fileReport && (
                           <div className="mt-8 text-left animate-fadeIn">
                               <h4 className="font-bold text-slate-800 mb-3 border-b pb-2">Reporte de Carga</h4>
                               <div className="grid grid-cols-2 gap-4 mb-4">
                                   <div className="bg-green-50 p-3 rounded border border-green-100">
                                       <span className="block text-2xl font-bold text-green-700">{fileReport.success}</span>
                                       <span className="text-xs text-green-600 uppercase font-bold">Nuevos Creados</span>
                                   </div>
                                   <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                       <span className="block text-2xl font-bold text-blue-700">{fileReport.updated}</span>
                                       <span className="text-xs text-blue-600 uppercase font-bold">Actualizados (Merge)</span>
                                   </div>
                                   <div className="bg-slate-50 p-3 rounded border border-slate-200">
                                       <span className="block text-2xl font-bold text-slate-600">{fileReport.existing}</span>
                                       <span className="text-xs text-slate-500 uppercase font-bold">Sin Cambios</span>
                                   </div>
                                   <div className="bg-red-50 p-3 rounded border border-red-100">
                                       <span className="block text-2xl font-bold text-red-700">{fileReport.errors.length}</span>
                                       <span className="text-xs text-red-600 uppercase font-bold">Errores / Omitidos</span>
                                   </div>
                               </div>
                               
                               {fileReport.errors.length > 0 && (
                                   <div className="bg-red-50 p-4 rounded border border-red-100 max-h-40 overflow-y-auto">
                                       <p className="text-xs font-bold text-red-800 mb-2">Detalle de Errores:</p>
                                       <ul className="list-disc pl-4 space-y-1">
                                           {fileReport.errors.map((err, idx) => (
                                               <li key={idx} className="text-xs text-red-700">
                                                   Fila {err.row}: {err.reason}
                                               </li>
                                           ))}
                                       </ul>
                                   </div>
                               )}
                           </div>
                       )}
                  </div>
              </div>
            )}

          </div>
      </div>
    </div>
  );
};
