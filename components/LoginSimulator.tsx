
import React from 'react';
import { UserRole, User } from '../types';

interface LoginSimulatorProps {
  onLogin: (user: User) => void;
}

export const LoginSimulator: React.FC<LoginSimulatorProps> = ({ onLogin }) => {
  const handleLogin = (role: UserRole) => {
    // Mock user data based on role
    const mockUser: User = {
      rut: role === UserRole.ADMIN ? '1-9' : role === UserRole.ASESOR ? '2-8' : '3-7',
      names: role === UserRole.ADMIN ? 'Admin' : role === UserRole.ASESOR ? 'Asesor' : 'Estudiante',
      paternalSurname: 'Sistema',
      maternalSurname: 'Demo',
      email: `${role.toLowerCase()}@upla.cl`,
      systemRole: role,
      // Foto específica para Admin, vacía para el resto (o se usará el placeholder por defecto)
      photoUrl: role === UserRole.ADMIN 
        ? 'https://github.com/vdhuerta/assets-aplications/blob/main/Foto%20Vi%CC%81ctor%20Huerta.JPG?raw=true' 
        : undefined
    };
    onLogin(mockUser);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-4">
      {/* Contenedor principal con margen superior para el logo flotante */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full border border-[#91ADC8]/30 mt-12">
        
        {/* Logo Flotante Posicionado Absolutamente (Estilo AsistePRO) */}
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2">
            <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center p-1 border-4 border-[#F9F8F6]">
                <img 
                    src="https://github.com/vdhuerta/assets-aplications/blob/main/Logo_SMEAD.png?raw=true" 
                    alt="Logo SMEAD" 
                    className="w-full h-full object-contain"
                />
            </div>
        </div>

        {/* Cabecera Azul Original (con padding superior extra para espacio visual del logo) */}
        <div className="bg-[#647FBC] p-8 pt-16 text-center flex flex-col items-center rounded-t-2xl">
          <h1 className="text-2xl font-bold text-white mb-2">GestorSMEAD</h1>
          <p className="text-blue-100 text-sm">Selecciona un perfil para ingresar</p>
        </div>
        
        {/* Botones Originales */}
        <div className="p-8 space-y-4">
          <button 
            onClick={() => handleLogin(UserRole.ADMIN)}
            className="w-full group relative flex items-center p-4 border border-slate-200 rounded-xl hover:border-[#647FBC] hover:shadow-md transition-all bg-white"
          >
            <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-[#647FBC] group-hover:bg-[#647FBC] group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div className="ml-4 text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-[#647FBC]">Administrador</h3>
              <p className="text-xs text-slate-500">Acceso total, configuración y usuarios.</p>
            </div>
          </button>

          <button 
            onClick={() => handleLogin(UserRole.ASESOR)}
            className="w-full group relative flex items-center p-4 border border-slate-200 rounded-xl hover:border-[#91ADC8] hover:shadow-md transition-all bg-white"
          >
            <div className="h-10 w-10 bg-[#91ADC8]/10 rounded-full flex items-center justify-center text-[#91ADC8] group-hover:bg-[#91ADC8] group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <div className="ml-4 text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-[#91ADC8]">Asesor</h3>
              <p className="text-xs text-slate-500">Gestión de cursos y alumnos.</p>
            </div>
          </button>

          <button 
            onClick={() => handleLogin(UserRole.VISITA)}
            className="w-full group relative flex items-center p-4 border border-slate-200 rounded-xl hover:border-[#AED6CF] hover:shadow-md transition-all bg-white"
          >
            <div className="h-10 w-10 bg-[#AED6CF]/20 rounded-full flex items-center justify-center text-teal-600 group-hover:bg-[#AED6CF] group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <div className="ml-4 text-left">
              <h3 className="font-bold text-slate-800 group-hover:text-teal-600">Visita / Estudiante</h3>
              <p className="text-xs text-slate-500">Ver mis cursos y certificados.</p>
            </div>
          </button>
        </div>
        
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100 rounded-b-2xl">
          <p className="text-xs text-slate-400">Ambiente de Desarrollo v2.0</p>
        </div>
      </div>
    </div>
  );
};
