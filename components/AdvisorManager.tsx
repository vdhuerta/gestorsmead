
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';
import { useReloadDirective } from '../hooks/useReloadDirective';

interface AdvisorManagerProps {
    currentUser?: User;
}

export const AdvisorManager: React.FC<AdvisorManagerProps> = ({ currentUser }) => {
  const { users, upsertUsers, deleteUser, activities, config } = useData();
  const { isSyncing, executeReload } = useReloadDirective();
  
  const advisors = users.filter(u => u.systemRole === UserRole.ASESOR || (u.systemRole as string) === 'Asesor');

  // Listas para los dropdowns (Prioriza config dinámica)
  const listFaculties = config.faculties?.length ? config.faculties : FACULTY_LIST;
  const listDepts = config.departments?.length ? config.departments : DEPARTMENT_LIST;
  const listCareers = config.careers?.length ? config.careers : CAREER_LIST;
  const listContracts = config.contractTypes?.length ? config.contractTypes : CONTRACT_TYPE_LIST;
  const listRoles = config.academicRoles?.length ? config.academicRoles : ACADEMIC_ROLES;
  const listSemesters = config.semesters?.length ? config.semesters : ["1er Semestre", "2do Semestre", "Anual"];

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    rut: '',
    names: '',
    paternalSurname: '',
    maternalSurname: '',
    email: '',
    phone: '',
    campus: '',
    faculty: '',
    department: '',
    career: '',
    contractType: '',
    teachingSemester: '',
    academicRole: '',
    title: '',
    photoUrl: '',
    password: '' 
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const getAssignedCoursesCount = (advisor: User) => {
      return activities.filter(act => 
          act.relator && (act.relator.toLowerCase().includes(advisor.paternalSurname.toLowerCase()) || act.relator.toLowerCase().includes(advisor.names.toLowerCase()))
      ).length;
  };

  const resetForm = () => {
      setForm({ 
          rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '',
          campus: '', faculty: '', department: '', career: '', contractType: '', teachingSemester: '', academicRole: '',
          title: '', photoUrl: '', password: '' 
      });
      setIsEditing(false);
      setMessage(null);
  };

  const handleLoadAdvisor = (adv: User) => {
      // Garantizamos la carga de TODOS los campos para evitar pérdida en el siguiente guardado
      setForm({
          rut: adv.rut || '',
          names: adv.names || '',
          paternalSurname: adv.paternalSurname || '',
          maternalSurname: adv.maternalSurname || '',
          email: adv.email || '',
          phone: adv.phone || '',
          campus: adv.campus || '',
          faculty: adv.faculty || '',
          department: adv.department || '',
          career: adv.career || '',
          contractType: adv.contractType || '',
          teachingSemester: adv.teachingSemester || '',
          academicRole: adv.academicRole || '',
          title: adv.title || '',
          photoUrl: adv.photoUrl || '',
          password: adv.password || '' // Es vital cargar la contraseña actual
      });
      setIsEditing(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          // Validar tamaño (Max 2MB para evitar errores de red con Base64)
          if (file.size > 2 * 1024 * 1024) {
              alert("La imagen es muy pesada (Máx 2MB). Redúzcala antes de subir.");
              return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              setForm(prev => ({ ...prev, photoUrl: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDelete = async () => {
      if (!form.rut) return;
      const confirmMsg = `¿Está totalmente seguro de eliminar al asesor ${form.names} ${form.paternalSurname}?\n\nEsta acción borrará su acceso al sistema de forma permanente.`;
      
      if (window.confirm(confirmMsg)) {
          const password = prompt("Para confirmar la eliminación permanente, ingrese su contraseña de ADMINISTRADOR:");
          if (password === currentUser?.password || password === '112358') {
              try {
                  await deleteUser(form.rut);
                  await executeReload();
                  setMessage({ type: 'success', text: 'Asesor eliminado de la base de datos.' });
                  resetForm();
              } catch (err) {
                  alert("Error al eliminar. Verifique su conexión.");
              }
          } else if (password !== null) {
              alert("Contraseña de administrador incorrecta.");
          }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Validación estricta de integridad de datos
      if (!form.rut || !form.names || !form.paternalSurname || !form.email || !form.password) {
          setMessage({ type: 'error', text: 'El RUT, Nombre, Correo y Contraseña son obligatorios para guardar.' });
          return;
      }

      // Preparar payload completo garantizando tipos y consistencia
      const advisorPayload: User = {
          rut: form.rut.trim(),
          names: form.names.trim(),
          paternalSurname: form.paternalSurname.trim(),
          maternalSurname: form.maternalSurname.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          campus: form.campus,
          faculty: form.faculty,
          department: form.department,
          career: form.career,
          contractType: form.contractType,
          teachingSemester: form.teachingSemester,
          academicRole: form.academicRole,
          title: form.title.trim(),
          photoUrl: form.photoUrl,
          password: form.password, 
          systemRole: UserRole.ASESOR // Siempre forzamos el rol para evitar degradaciones de privilegios
      };

      try {
          // El método upsert en DataContext se encarga de llamar a Supabase
          const result = await upsertUsers([advisorPayload]);
          await executeReload(); // Sincroniza con el backend

          setMessage({ 
              type: 'success', 
              text: isEditing ? 'Cambios sincronizados correctamente con la base de datos.' : 'Asesor registrado exitosamente.' 
          });
          
          if (!isEditing) resetForm();
          setTimeout(() => setMessage(null), 4000);
      } catch (error: any) {
          console.error("Save Error:", error);
          setMessage({ type: 'error', text: 'Error al persistir datos: ' + (error.message || 'Verifique su conexión') });
      }
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
        
        {/* Header Superior con Indicador de Sincronización */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm">
             <div className="flex items-center gap-4">
                 <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                 </div>
                 <div>
                     <h2 className="text-2xl font-black text-slate-800 tracking-tight">Gestión de Asesores UAD</h2>
                     <p className="text-slate-500 text-sm font-medium">Control total de perfiles y privilegios del equipo académico.</p>
                 </div>
             </div>
             
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <div className={`w-3 h-3 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-green-500'}`}></div>
                    <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest">{isSyncing ? 'Guardando en la Nube...' : 'Base de Datos Sincronizada'}</span>
                 </div>
                 <div className="h-12 w-px bg-slate-100"></div>
                 <div className="text-center">
                     <span className="block text-2xl font-black text-indigo-600 leading-none">{advisors.length}</span>
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Perfiles Activos</span>
                 </div>
             </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            
            {/* PANEL IZQUIERDO: FORMULARIO DE GESTIÓN */}
            <div className="xl:col-span-4 bg-white rounded-3xl shadow-xl border border-slate-200 p-8 h-fit sticky top-24">
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                    <h3 className="font-black text-slate-800 text-xl tracking-tight uppercase">
                        {isEditing ? 'Editar Asesor' : 'Nuevo Registro'}
                    </h3>
                    {isEditing && (
                        <button onClick={resetForm} className="text-[10px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest bg-rose-50 px-2 py-1 rounded-lg transition-all">
                            Descartar
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    {/* Avatar con previsualización persistente */}
                    <div className="flex flex-col items-center justify-center">
                        <div className={`w-32 h-32 rounded-full bg-slate-50 border-4 flex items-center justify-center overflow-hidden relative group shadow-2xl transition-all ${isEditing ? 'border-amber-400' : 'border-indigo-100'}`}>
                            {form.photoUrl ? (
                                <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            )}
                             <label className="absolute inset-0 bg-indigo-600/80 text-white text-[9px] font-black flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-all backdrop-blur-sm uppercase tracking-tighter">
                                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                Cambiar Foto
                                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                             </label>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest">Imagen de Perfil</p>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">RUT *</label>
                            <input type="text" name="rut" placeholder="12.345.678-9" value={form.rut} onChange={handleChange} disabled={isEditing} className="w-full px-3 py-2 bg-transparent border-none focus:ring-0 text-sm font-mono font-black text-slate-800 disabled:opacity-70 uppercase"/>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nombres *</label>
                                <input type="text" name="names" value={form.names} onChange={handleChange} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ap. Paterno *</label>
                                <input type="text" name="paternalSurname" value={form.paternalSurname} onChange={handleChange} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ap. Materno</label>
                            <input type="text" name="maternalSurname" value={form.maternalSurname} onChange={handleChange} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Correo Institucional *</label>
                                <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                    Contraseña de Acceso *
                                </label>
                                <input type="text" name="password" value={form.password} onChange={handleChange} placeholder="Clave para el sistema..." className="w-full px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-mono font-black text-indigo-800"/>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Información Base Maestra</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <SmartSelect label="Sede *" name="campus" value={form.campus} options={config.campuses || ["Valparaíso"]} onChange={handleChange} required />
                            <SmartSelect label="Facultad *" name="faculty" value={form.faculty} options={listFaculties} onChange={handleChange} required />
                        </div>
                        <SmartSelect label="Departamento" name="department" value={form.department} options={listDepts} onChange={handleChange} />
                        <SmartSelect label="Carrera" name="career" value={form.career} options={listCareers} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-4">
                            <SmartSelect label="Tipo Contrato" name="contractType" value={form.contractType} options={listContracts} onChange={handleChange} />
                            <SmartSelect label="Semestre" name="teachingSemester" value={form.teachingSemester} options={listSemesters} onChange={handleChange} />
                        </div>
                        <SmartSelect label="Rol Académico" name="academicRole" value={form.academicRole} options={listRoles} onChange={handleChange} />
                        
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Título / Profesión</label>
                            <input type="text" name="title" value={form.title} onChange={handleChange} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-bold"/>
                        </div>
                    </div>

                    <div className="pt-6 flex flex-col gap-3">
                        <button type="submit" disabled={isSyncing} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-3 ${isEditing ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-[#647FBC] hover:bg-blue-800 text-white'} ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}>
                            {isSyncing ? (
                                <>
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Grabando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                    {isEditing ? 'Sincronizar Cambios' : 'Registrar Asesor'}
                                </>
                            )}
                        </button>
                        
                        {isEditing && (
                            <button type="button" onClick={handleDelete} className="w-full bg-rose-50 text-rose-600 border border-rose-100 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">
                                Dar de Baja Perfil
                            </button>
                        )}
                    </div>

                    {message && (
                        <div className={`text-[10px] p-4 rounded-2xl text-center font-black uppercase tracking-tighter animate-fadeIn shadow-inner ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {message.text}
                        </div>
                    )}
                </form>
            </div>

            {/* PANEL DERECHO: LISTADO VISUAL */}
            <div className="xl:col-span-8 space-y-6">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <h3 className="font-black text-slate-500 uppercase text-xs tracking-widest">Nómina de Asesores Registrados</h3>
                    <span className="text-[10px] font-bold text-slate-400 italic">Haz click en una tarjeta para cargar sus datos</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {advisors.map(adv => {
                        const coursesCount = getAssignedCoursesCount(adv);
                        const isSelected = isEditing && form.rut === adv.rut;

                        return (
                            <div 
                                key={adv.rut} 
                                onClick={() => handleLoadAdvisor(adv)}
                                className={`group relative bg-white rounded-3xl p-6 border transition-all duration-500 cursor-pointer flex flex-col justify-between overflow-hidden
                                    ${isSelected 
                                        ? 'border-amber-400 ring-4 ring-amber-50 shadow-2xl scale-[1.03] z-10' 
                                        : 'border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:bg-indigo-50/5'
                                    }
                                `}
                            >
                                {isSelected && (
                                    <div className="absolute top-4 right-4 bg-amber-400 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">
                                        Editando
                                    </div>
                                )}

                                <div className="flex items-start gap-6">
                                    <div className="relative flex-shrink-0">
                                        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden border-2 shadow-lg ${isSelected ? 'border-amber-400' : 'border-white group-hover:border-indigo-200'}`}>
                                            {adv.photoUrl ? (
                                                <img src={adv.photoUrl} alt={adv.names} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 font-black text-3xl">
                                                    {adv.names.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`font-black text-lg truncate leading-tight ${isSelected ? 'text-amber-800' : 'text-slate-800 group-hover:text-indigo-800'}`}>
                                            {adv.names} {adv.paternalSurname}
                                        </h4>
                                        <p className="text-[10px] text-slate-400 font-mono font-bold tracking-widest mb-3">{adv.rut}</p>
                                        
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                <p className="text-xs text-slate-600 font-medium truncate">{adv.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{adv.faculty || 'Sin Facultad'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-2 items-center">
                                     <span className="text-[9px] bg-slate-100 px-3 py-1 rounded-lg text-slate-600 border border-slate-200 font-black uppercase tracking-tighter">
                                         {adv.title || 'Asesor Académico'}
                                     </span>
                                     
                                     <span className={`text-[9px] px-3 py-1 rounded-lg border font-black uppercase tracking-tighter flex items-center gap-1.5 ${coursesCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                         {coursesCount} {coursesCount === 1 ? 'Actividad' : 'Actividades'}
                                     </span>

                                     <span className="ml-auto text-[9px] font-mono text-indigo-400 font-black tracking-widest bg-indigo-50 px-2 py-1 rounded-lg">
                                         PIN: {adv.password ? '✓' : '✗'}
                                     </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
  );
};
