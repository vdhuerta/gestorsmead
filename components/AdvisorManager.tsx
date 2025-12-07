
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { User, UserRole } from '../types';
import { ACADEMIC_ROLES, FACULTY_LIST, DEPARTMENT_LIST, CAREER_LIST, CONTRACT_TYPE_LIST } from '../constants';
import { SmartSelect } from './SmartSelect';

export const AdvisorManager: React.FC = () => {
  const { users, upsertUsers, deleteUser, activities, config } = useData();
  const advisors = users.filter(u => u.systemRole === UserRole.ASESOR);

  // Listas para los dropdowns
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
    
    // Campos Base Maestra
    campus: '',
    faculty: '',
    department: '',
    career: '',
    contractType: '',
    teachingSemester: '',
    academicRole: '',
    
    title: '', // Perfil específico / Profesión
    photoUrl: '',
    password: '' 
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- Helpers ---

  const getAssignedCoursesCount = (advisor: User) => {
      // Heurística simple: Coincidencia de apellido en el campo 'relator'
      // En un sistema real usaríamos el RUT en una tabla relacional, pero el modelo actual usa string en Activity
      return activities.filter(act => 
          act.relator && act.relator.toLowerCase().includes(advisor.paternalSurname.toLowerCase())
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
      setForm({
          rut: adv.rut,
          names: adv.names,
          paternalSurname: adv.paternalSurname,
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
          password: adv.password || ''
      });
      setIsEditing(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
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
      if (confirm(`¿Está seguro de eliminar al asesor ${form.names} ${form.paternalSurname}? Esta acción no se puede deshacer.`)) {
          await deleteUser(form.rut);
          setMessage({ type: 'success', text: 'Asesor eliminado correctamente.' });
          resetForm();
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Validación estricta de campos críticos
      if (!form.rut || !form.names || !form.paternalSurname || !form.email || !form.password || !form.campus) {
          setMessage({ type: 'error', text: 'Por favor complete todos los campos obligatorios (*) para mantener la integridad de la Base Maestra.' });
          return;
      }

      const advisorPayload: User = {
          rut: form.rut,
          names: form.names,
          paternalSurname: form.paternalSurname,
          maternalSurname: form.maternalSurname,
          email: form.email,
          phone: form.phone,
          
          // Base Maestra Completa
          campus: form.campus,
          faculty: form.faculty,
          department: form.department,
          career: form.career,
          contractType: form.contractType,
          teachingSemester: form.teachingSemester,
          academicRole: form.academicRole,
          
          // Asesor Specifics
          title: form.title,
          photoUrl: form.photoUrl,
          password: form.password,
          systemRole: UserRole.ASESOR // Force Role
      };

      upsertUsers([advisorPayload]);
      setMessage({ type: 'success', text: isEditing ? 'Perfil de Asesor actualizado.' : 'Nuevo Asesor registrado exitosamente.' });
      
      if (!isEditing) resetForm();
      setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
        
        {/* Header Stats */}
        <div className="bg-[#91ADC8]/10 border border-[#91ADC8]/30 rounded-xl p-6 flex justify-between items-center">
             <div>
                 <h2 className="text-2xl font-bold text-[#647FBC]">Gestión de Asesores</h2>
                 <p className="text-slate-600">Administración de perfiles con privilegios de gestión académica.</p>
             </div>
             <div className="bg-white px-6 py-3 rounded-lg shadow-sm border border-slate-200 text-center">
                 <span className="block text-3xl font-bold text-[#647FBC]">{advisors.length}</span>
                 <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">Asesores Activos</span>
             </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* COLUMN 1: FORMULARIO */}
            <div className="xl:col-span-1 bg-white rounded-xl shadow-lg border border-slate-200 p-6 h-fit sticky top-24">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-lg">
                        {isEditing ? 'Modificar Perfil' : 'Registrar Nuevo Asesor'}
                    </h3>
                    {isEditing && (
                        <button onClick={resetForm} className="text-xs text-slate-400 hover:text-slate-600 underline">
                            Cancelar
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Photo Upload */}
                    <div className="flex flex-col items-center justify-center mb-4">
                        <div className={`w-28 h-28 rounded-full bg-slate-50 border-4 flex items-center justify-center overflow-hidden mb-2 relative group shadow-inner ${isEditing ? 'border-amber-200' : 'border-slate-200'}`}>
                            {form.photoUrl ? (
                                <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            )}
                             <label className="absolute inset-0 bg-black/40 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-sm">
                                CAMBIAR FOTO
                                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                             </label>
                        </div>
                        <span className="text-[10px] text-slate-400">Click para subir imagen</span>
                    </div>

                    {/* Identificación */}
                    <div className="space-y-3">
                        <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <label className="block text-xs font-bold text-slate-700 mb-1">RUT (Identificador) *</label>
                            <input type="text" name="rut" placeholder="12345678-9" value={form.rut} onChange={handleChange} disabled={isEditing} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm font-mono font-bold disabled:bg-slate-200 disabled:text-slate-500"/>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombres *</label>
                                <input type="text" name="names" value={form.names} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Ap. Paterno *</label>
                                <input type="text" name="paternalSurname" value={form.paternalSurname} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Ap. Materno</label>
                            <input type="text" name="maternalSurname" value={form.maternalSurname} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                        </div>
                    </div>

                    {/* Contacto & Acceso */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Email *</label>
                                <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
                                <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-indigo-700 mb-1 flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                Contraseña de Acceso *
                            </label>
                            <input 
                                type="text" 
                                name="password"
                                value={form.password} 
                                onChange={handleChange}
                                placeholder="Clave sistema" 
                                className="w-full px-3 py-2 border border-indigo-200 bg-indigo-50 rounded focus:ring-2 focus:ring-indigo-500 text-xs font-mono text-indigo-800"
                            />
                        </div>
                    </div>

                    {/* Datos Académicos (Base Maestra) */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Ficha Académica (Base Maestra)</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <SmartSelect label="Sede *" name="campus" value={form.campus} options={config.campuses || ["Valparaíso"]} onChange={handleChange} />
                            <SmartSelect label="Facultad *" name="faculty" value={form.faculty} options={listFaculties} onChange={handleChange} />
                        </div>
                        <SmartSelect label="Departamento" name="department" value={form.department} options={listDepts} onChange={handleChange} />
                        <SmartSelect label="Carrera" name="career" value={form.career} options={listCareers} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-2">
                            <SmartSelect label="Contrato" name="contractType" value={form.contractType} options={listContracts} onChange={handleChange} />
                            <SmartSelect label="Semestre" name="teachingSemester" value={form.teachingSemester} options={listSemesters} onChange={handleChange} />
                        </div>
                        <SmartSelect label="Rol Académico" name="academicRole" value={form.academicRole} options={listRoles} onChange={handleChange} />
                        
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Título Profesional / Cargo</label>
                            <input type="text" name="title" value={form.title} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-xs"/>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex flex-col gap-2">
                        <button type="submit" className={`w-full text-white py-2.5 rounded-lg font-bold shadow-md transition-all flex justify-center items-center gap-2 ${isEditing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#647FBC] hover:bg-blue-800'}`}>
                            {isEditing ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    Guardar Cambios
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                    Crear Perfil Asesor
                                </>
                            )}
                        </button>
                        
                        {isEditing && (
                            <button type="button" onClick={handleDelete} className="w-full bg-white border border-red-200 text-red-600 py-2 rounded-lg font-bold text-xs hover:bg-red-50 transition-colors flex justify-center items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Eliminar Asesor
                            </button>
                        )}
                    </div>

                    {message && (
                        <div className={`text-xs p-3 rounded-lg text-center font-medium animate-fadeIn ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}
                </form>
            </div>

            {/* COLUMN 2 & 3: TARJETAS */}
            <div className="xl:col-span-2 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <h3 className="font-bold text-slate-700">Asesores Registrados (Base Maestra)</h3>
                    <span className="text-xs text-slate-400 italic">Seleccione una tarjeta para editar o eliminar</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {advisors.map(adv => {
                        const coursesCount = getAssignedCoursesCount(adv);
                        const isSelected = isEditing && form.rut === adv.rut;

                        return (
                            <div 
                                key={adv.rut} 
                                onClick={() => handleLoadAdvisor(adv)}
                                className={`
                                    group relative bg-white rounded-xl p-5 border transition-all duration-300 cursor-pointer overflow-hidden
                                    ${isSelected 
                                        ? 'border-amber-400 ring-2 ring-amber-100 shadow-lg scale-[1.02]' 
                                        : 'border-slate-200 hover:border-blue-400 hover:shadow-xl hover:bg-blue-50/10'
                                    }
                                `}
                            >
                                {isSelected && (
                                    <div className="absolute top-0 right-0 bg-amber-400 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                        EDITANDO
                                    </div>
                                )}

                                <div className="flex items-start gap-4">
                                    <div className="relative flex-shrink-0">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 ${isSelected ? 'border-amber-400' : 'border-slate-100 group-hover:border-blue-200'}`}>
                                            {adv.photoUrl ? (
                                                <img src={adv.photoUrl} alt={adv.names} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`font-bold truncate ${isSelected ? 'text-amber-700' : 'text-slate-800 group-hover:text-blue-700'}`}>
                                            {adv.names} {adv.paternalSurname}
                                        </h4>
                                        <p className="text-xs text-slate-500 font-mono mb-1">{adv.rut}</p>
                                        
                                        <div className="flex items-center gap-1 mb-2">
                                            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            <p className="text-xs text-blue-600 font-medium truncate">{adv.email}</p>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mt-2">
                                             {adv.title ? (
                                                 <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200 truncate max-w-full">
                                                     {adv.title}
                                                 </span>
                                             ) : (
                                                 <span className="text-[10px] text-slate-300 italic">Sin título</span>
                                             )}
                                             
                                             <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 ${coursesCount > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                 {coursesCount} Cursos
                                             </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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
