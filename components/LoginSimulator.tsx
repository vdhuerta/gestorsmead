
import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { MOCK_USERS } from '../constants';

interface LoginSimulatorProps {
  onLogin: (user: User) => void;
}

export const LoginSimulator: React.FC<LoginSimulatorProps> = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simular retardo de red
    setTimeout(() => {
        const { email, password } = credentials;

        // 1. VALIDACIÓN ADMINISTRADOR
        if (email === 'victor.huerta@upla.cl' && password === 'Huerta&2025') {
            const adminUser = MOCK_USERS.find(u => u.systemRole === UserRole.ADMIN) || {
                rut: '1-9',
                names: 'Víctor',
                paternalSurname: 'Huerta',
                maternalSurname: '',
                email: 'victor.huerta@upla.cl',
                systemRole: UserRole.ADMIN,
                photoUrl: 'https://github.com/vdhuerta/assets-aplications/blob/main/Foto%20Vi%CC%81ctor%20Huerta.JPG?raw=true'
            };
            onLogin(adminUser);
            return;
        }

        // 2. VALIDACIÓN ASESOR
        if (email === 'juan.perez@upla.cl' && password === 'Perez&2025') {
            const asesorUser = MOCK_USERS.find(u => u.email === 'juan.perez@upla.cl') || {
                rut: '12.345.678-9',
                names: 'Juan Andrés',
                paternalSurname: 'Pérez',
                maternalSurname: 'Gómez',
                email: 'juan.perez@upla.cl',
                systemRole: UserRole.ASESOR,
                contractType: 'Planta Jornada Completa',
                academicRole: 'Académico/(a) Planta',
                photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg'
            };
            onLogin(asesorUser);
            return;
        }

        // 3. FALLO
        setError('Credenciales incorrectas. Verifique su correo y contraseña.');
        setIsLoading(false);
    }, 800);
  };

  const handleGuestAccess = () => {
      // Mock estudiante para visita
      const studentUser: User = {
          rut: '9.876.543-2',
          names: 'Maria Elena',
          paternalSurname: 'Silva',
          maternalSurname: 'Rojas',
          email: 'maria.silva@upla.cl',
          systemRole: UserRole.VISITA,
          academicRole: 'Estudiante',
          career: 'Licenciatura En Arte'
      };
      onLogin(studentUser);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-4">
      {/* Contenedor principal con margen superior para el logo flotante */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full border border-[#91ADC8]/30 mt-12 overflow-hidden">
        
        {/* Logo Flotante */}
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
            <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center p-1 border-4 border-[#F9F8F6]">
                <img 
                    src="https://github.com/vdhuerta/assets-aplications/blob/main/Logo_SMEAD.png?raw=true" 
                    alt="Logo SMEAD" 
                    className="w-full h-full object-contain"
                />
            </div>
        </div>

        {/* Cabecera */}
        <div className="bg-[#647FBC] p-8 pt-16 text-center flex flex-col items-center">
          <h1 className="text-2xl font-bold text-white mb-1">GestorSMEAD</h1>
          <p className="text-blue-100 text-sm">Plataforma de Gestión Académica</p>
        </div>
        
        {/* Formulario de Login */}
        <div className="p-8">
          <form onSubmit={handleLoginSubmit} className="space-y-5">
              
              <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Correo Institucional</label>
                  <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                      </div>
                      <input 
                        type="email" 
                        name="email"
                        required
                        placeholder="nombre.apellido@upla.cl"
                        value={credentials.email}
                        onChange={handleChange}
                        className="pl-10 w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:bg-white transition-all text-sm text-slate-800 font-medium"
                      />
                  </div>
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Contraseña</label>
                  <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      </div>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        name="password"
                        required
                        placeholder="••••••••"
                        value={credentials.password}
                        onChange={handleChange}
                        className="pl-10 w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#647FBC] focus:bg-white transition-all text-sm text-slate-800 font-medium"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                          {showPassword ? (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          )}
                      </button>
                  </div>
              </div>

              {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2 animate-fadeIn">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                  </div>
              )}

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#647FBC] text-white py-3 rounded-lg font-bold text-sm hover:bg-blue-800 transition-colors shadow-md hover:shadow-lg disabled:opacity-70 flex justify-center items-center gap-2"
              >
                {isLoading ? (
                    <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Autenticando...
                    </>
                ) : 'Iniciar Sesión'}
              </button>
          </form>

          {/* Divisor */}
          <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-400">Acceso Estudiantes</span>
              </div>
          </div>

          <button 
            onClick={handleGuestAccess}
            className="w-full border border-slate-200 bg-white text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-[#AED6CF] hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Ingresar como Visita / Alumno
          </button>

        </div>
        
        <div className="bg-slate-50 p-3 text-center border-t border-slate-100">
          <p className="text-[10px] text-slate-400">Universidad de Playa Ancha • Plataforma v2.1</p>
        </div>
      </div>
    </div>
  );
};
