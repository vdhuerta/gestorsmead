
import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Activity } from '../types';

export const CourseCreator: React.FC = () => {
  const { addActivity } = useData();
  const [formData, setFormData] = useState({
    nombre: '',
    modalidad: 'Presencial',
    horas: 0,
    relator: '',
    fechaInicio: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'horas' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    // Simulate API Delay then Save to Context
    setTimeout(() => {
        const newActivity: Activity = {
            id: `ACT-${Date.now().toString().slice(-4)}`, // Generate Simple ID
            name: formData.nombre,
            modality: formData.modalidad,
            hours: formData.horas,
            relator: formData.relator,
            startDate: formData.fechaInicio
        };

        addActivity(newActivity);
        
        setStatus('success');
        // Reset form after success
        setTimeout(() => {
            setStatus('idle');
            setFormData({
                nombre: '',
                modalidad: 'Presencial',
                horas: 0,
                relator: '',
                fechaInicio: '',
            });
        }, 2000);
    }, 1000);
  };

  const handleDownloadTemplate = () => {
      // Simulate download
      alert("Descargando: plantilla_inscripcion_base.csv\nColumnas: RUT, Nombres, Apellidos, Email, Telefono, Rol, Facultad...");
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Form */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                    <h2 className="text-xl font-bold text-slate-800">Crear Nueva Actividad</h2>
                    <p className="text-sm text-slate-500">Definir metadatos del curso antes de la matriculación.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Curso</label>
                        <input 
                            type="text" 
                            name="nombre"
                            required
                            placeholder="Ej. Taller de Inducción Docente 2025"
                            value={formData.nombre}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Modalidad</label>
                            <select 
                                name="modalidad"
                                value={formData.modalidad}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="Presencial">Presencial</option>
                                <option value="E-Learning">E-Learning</option>
                                <option value="Híbrido">Híbrido</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horas Cronológicas</label>
                            <input 
                                type="number" 
                                name="horas"
                                min="1"
                                required
                                value={formData.horas}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                            <input 
                                type="date" 
                                name="fechaInicio"
                                required
                                value={formData.fechaInicio}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Relator</label>
                            <input 
                                type="text" 
                                name="relator"
                                placeholder="Nombre completo"
                                required
                                value={formData.relator}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        {status === 'success' ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Curso guardado localmente
                            </span>
                        ) : (
                            <span className="text-slate-400 text-sm">Se guardará en LocalStorage</span>
                        )}
                        
                        <button 
                            type="submit" 
                            disabled={status === 'loading'}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm hover:shadow flex items-center gap-2 disabled:opacity-70"
                        >
                             {status === 'loading' && (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                             )}
                            Guardar Curso
                        </button>
                    </div>
                </form>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                  <h3 className="text-indigo-900 font-bold mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Estructura de Matrícula
                  </h3>
                  <p className="text-sm text-indigo-700 mb-4">
                      Este curso requiere una lista de participantes. Para asegurar la carga correcta de datos, descarga la plantilla CSV oficial.
                  </p>
                  
                  <div className="bg-white rounded p-3 text-xs font-mono text-slate-500 mb-4 border border-indigo-200 overflow-x-auto">
                      RUT, Nombres, Ap.Paterno, Ap.Materno, Correo, Telefono, Rol, Facultad, Depto, Carrera, Contrato, Semestre, Sede
                  </div>

                  <button 
                    onClick={handleDownloadTemplate}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2"
                  >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Descargar Plantilla CSV
                  </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                   <h3 className="font-bold text-slate-800 mb-3 text-sm">Reglas de Validación</h3>
                   <ul className="space-y-2 text-xs text-slate-600">
                       <li className="flex items-start gap-2">
                           <span className="text-green-500">✓</span> El nombre debe ser único para el año académico.
                       </li>
                       <li className="flex items-start gap-2">
                           <span className="text-green-500">✓</span> La fecha de inicio no puede ser en el pasado.
                       </li>
                       <li className="flex items-start gap-2">
                           <span className="text-green-500">✓</span> El relator debe estar registrado previamente en la tabla de Usuarios (opcional en borrador).
                       </li>
                   </ul>
              </div>
          </div>

      </div>
    </div>
  );
};
