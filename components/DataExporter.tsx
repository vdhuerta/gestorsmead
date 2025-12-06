
import React, { useState } from 'react';
import { useData } from '../context/DataContext';

export const DataExporter: React.FC = () => {
  const { users } = useData(); // Accedemos directamente a la Base Maestra de Usuarios
  const [loading, setLoading] = useState(false);

  const handleExportMasterBase = () => {
    setLoading(true);

    // Simulate processing delay
    setTimeout(() => {
      // 1. Definir Encabezados exactos de la Base Maestra
      const headers = [
        "RUT", 
        "Nombres", 
        "Apellido Paterno", 
        "Apellido Materno", 
        "Email", 
        "Telefono",
        "Rol Académico",
        "Facultad", 
        "Departamento",
        "Carrera", 
        "Tipo Contrato",
        "Semestre Docencia",
        "Sede",
        "Nivel Acceso (App)"
      ];

      // 2. Mapear datos directamente del Array de Usuarios (Base Maestra Actual)
      const rows = users.map(u => [
        u.rut,
        u.names,
        u.paternalSurname,
        u.maternalSurname || '',
        u.email || '',
        u.phone || '',
        u.academicRole || '', 
        u.faculty || '',
        u.department || '',
        u.career || '',
        u.contractType || '',
        u.teachingSemester || '',
        u.campus || '',
        u.systemRole
      ]);

      // 3. Generar CSV
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      // 4. Disparar Descarga
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().split('T')[0];
      
      link.setAttribute("href", url);
      link.setAttribute("download", `BASE_MAESTRA_USUARIOS_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setLoading(false);
    }, 1000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Exportación de Base de Datos Maestra</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Descarga el padrón completo de usuarios activos en el sistema (Docentes, Estudiantes, Funcionarios) con sus perfiles actualizados.
          </p>
        </div>
        <div className="p-3 bg-green-50 rounded-full">
             <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        </div>
      </div>

      <div className="mt-6 flex flex-col md:flex-row items-center gap-4">
        <div className="flex-1 w-full bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
             <div className="flex flex-col">
                 <span className="text-xs text-slate-500 font-bold uppercase">Registros Totales</span>
                 <span className="text-lg font-bold text-slate-700">{users.length} Usuarios</span>
             </div>
             <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
        </div>

        <button
            onClick={handleExportMasterBase}
            disabled={loading}
            className="flex-1 w-full bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
        >
            {loading ? (
                 <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generando CSV...
                 </>
            ) : (
                <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Descargar Base Maestra (.csv)
                </>
            )}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-3 text-center">
          * El archivo incluye RUT, Contacto y Datos Académicos actualizados al momento de la descarga.
      </p>
    </div>
  );
};
