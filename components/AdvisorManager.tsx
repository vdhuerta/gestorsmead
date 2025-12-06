
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { User, UserRole } from '../types';

export const AdvisorManager: React.FC = () => {
  const { users, upsertUsers } = useData();
  const advisors = users.filter(u => u.systemRole === UserRole.ASESOR);

  const [form, setForm] = useState({
    rut: '',
    names: '',
    paternalSurname: '',
    maternalSurname: '',
    email: '',
    phone: '',
    campus: '',
    title: '', // Profesión
    photoUrl: '',
    password: '' // New field
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.rut || !form.names || !form.email) {
          setMessage({ type: 'error', text: 'Complete los campos obligatorios (*)' });
          return;
      }

      const newAdvisor: User = {
          rut: form.rut,
          names: form.names,
          paternalSurname: form.paternalSurname,
          maternalSurname: form.maternalSurname,
          email: form.email,
          phone: form.phone,
          campus: form.campus,
          title: form.title,
          photoUrl: form.photoUrl,
          // Datos por defecto para el sistema
          systemRole: UserRole.ASESOR,
          contractType: 'Planta Jornada Completa', // Default
          academicRole: 'Asesor/(a) Pedagógico' // Default
      };

      upsertUsers([newAdvisor]);
      setMessage({ type: 'success', text: 'Asesor registrado exitosamente.' });
      setForm({ rut: '', names: '', paternalSurname: '', maternalSurname: '', email: '', phone: '', campus: '', title: '', photoUrl: '', password: '' });
      setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-[#91ADC8]/10 border border-[#91ADC8]/30 rounded-xl p-6 flex justify-between items-center">
             <div>
                 <h2 className="text-2xl font-bold text-[#647FBC]">Gestión de Asesores</h2>
                 <p className="text-slate-600">Registro y administración de credenciales para el equipo de gestión curricular.</p>
             </div>
             <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 text-center">
                 <span className="block text-2xl font-bold text-[#647FBC]">{advisors.length}</span>
                 <span className="text-xs text-slate-500 font-bold uppercase">Asesores Activos</span>
             </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Formulario de Creación */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Registrar Nuevo Asesor</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Photo Upload Preview */}
                    <div className="flex flex-col items-center justify-center mb-4">
                        <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden mb-2 relative group">
                            {form.photoUrl ? (
                                <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            )}
                             <label className="absolute inset-0 bg-black/50 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                CAMBIAR
                                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                             </label>
                        </div>
                        <p className="text-xs text-slate-500">Foto de Perfil (Opcional)</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">RUT *</label>
                        <input type="text" placeholder="12345678-9" value={form.rut} onChange={e => setForm({...form, rut: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm font-mono"/>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Nombres *</label>
                            <input type="text" value={form.names} onChange={e => setForm({...form, names: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Apellidos *</label>
                            <input type="text" value={form.paternalSurname} onChange={e => setForm({...form, paternalSurname: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Correo Institucional *</label>
                        <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                    </div>
                    
                    {/* Password Field (Disabled) */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
                            Contraseña de Acceso
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-normal">Pendiente</span>
                        </label>
                        <div className="relative">
                            <input 
                                type="password" 
                                value={form.password} 
                                disabled 
                                placeholder="Generación automática (Fase 2)" 
                                className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-100 text-slate-400 text-sm cursor-not-allowed focus:outline-none"
                            />
                            <div className="absolute right-3 top-2.5 text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Profesión / Título</label>
                        <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Sede / Campus</label>
                        <input type="text" value={form.campus} onChange={e => setForm({...form, campus: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-[#647FBC] text-sm"/>
                    </div>

                    <button type="submit" className="w-full bg-[#647FBC] text-white py-2 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-colors mt-4">
                        Guardar Asesor
                    </button>
                    {message && (
                        <div className={`text-xs p-2 rounded text-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}
                </form>
            </div>

            {/* Listado de Asesores */}
            <div className="lg:col-span-2 space-y-4">
                <h3 className="font-bold text-slate-700 pb-2 border-b border-slate-200">Equipo de Asesores Registrados</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {advisors.map(adv => (
                        <div key={adv.rut} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                                {adv.photoUrl ? (
                                    <img src={adv.photoUrl} alt={adv.names} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800">{adv.names} {adv.paternalSurname}</h4>
                                <p className="text-xs text-slate-500 font-mono">{adv.rut} | {adv.email}</p>
                                <div className="mt-1 flex gap-2">
                                     {adv.campus && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">{adv.campus}</span>}
                                     {adv.title && <span className="text-[10px] bg-blue-50 px-2 py-0.5 rounded text-blue-600 border border-blue-100">{adv.title}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {advisors.length === 0 && (
                        <div className="col-span-full py-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                            No hay asesores registrados aún.
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};
