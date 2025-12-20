
import React, { useEffect } from 'react';
import { driver } from 'driver.js';
import { TabType } from './RoleNavbar';

interface AppTourProps {
    onTabChange: (tab: TabType) => void;
    trigger: boolean;
    setTrigger: (val: boolean) => void;
}

export const AppTour: React.FC<AppTourProps> = ({ onTabChange, trigger, setTrigger }) => {
    
    useEffect(() => {
        if (!trigger) return;

        const driverObj = driver({
            showProgress: true,
            nextBtnText: 'Siguiente →',
            prevBtnText: '← Anterior',
            doneBtnText: '¡Finalizar Guía!',
            allowClose: true,
            overlayColor: '#0f172a',
            overlayOpacity: 0.85,
            steps: [
                {
                    element: '#nav-dashboard',
                    popover: {
                        title: '🏠 Inicio: Centro de Control',
                        description: 'Bienvenido a su tablero principal. Desde aquí tendrá una visión panorámica de la gestión docente del año vigente.',
                        side: "bottom",
                        align: 'start'
                    }
                },
                {
                    element: '#tour-kpi-aprobacion',
                    popover: {
                        title: '📈 ¿Cómo entender un KPI?',
                        description: 'Los KPIs (Indicadores Clave) muestran datos críticos al instante. Por ejemplo, la Tasa de Aprobación le indica qué porcentaje de inscritos ha finalizado exitosamente sus cursos. Al pasar el mouse, verá el detalle por cada facultad.',
                        side: "bottom"
                    }
                },
                {
                    element: '#tour-kpi-riesgo',
                    popover: {
                        title: '⚠️ Detección Temprana de Riesgo',
                        description: 'Este indicador es vital. Le alerta sobre docentes que tienen promedios bajos o inasistencias críticas ANTES de que termine el curso, permitiéndole realizar una intervención oportuna.',
                        side: "bottom"
                    }
                },
                {
                    element: '#tour-courses-section',
                    popover: {
                        title: '📋 Lectura de Cursos Actuales',
                        description: 'Las tarjetas de cursos están ordenadas por semestre vigente. Puede identificar rápidamente cuántos inscritos hay y el avance global de calificaciones por cada asignatura.',
                        side: "top"
                    }
                },
                {
                    element: '#nav-courses',
                    popover: {
                        title: '📚 Creación y Gestión de Cursos',
                        description: 'Ahora vamos a la sección de Cursos Curriculares.',
                        side: "bottom"
                    },
                    onHighlightStarted: () => onTabChange('courses')
                },
                {
                    element: '#tour-courses-btn-create',
                    popover: {
                        title: '🆕 ¿Cómo crear un curso?',
                        description: 'Use este botón para definir el nombre, director y cantidad de evaluaciones. El sistema autogenerará un código único para su seguimiento.',
                        side: "left"
                    }
                },
                {
                    element: '#tour-courses-btn-manage',
                    popover: {
                        title: '🖊️ Gestión e Ingreso de Notas',
                        description: 'Al pinchar en "Gestionar", podrá acceder a la "Sábana de Notas". Allí podrá registrar asistencias sesión por sesión e ingresar calificaciones que se promedian automáticamente.',
                        side: "top"
                    }
                },
                {
                    element: '#nav-generalActivities',
                    popover: {
                        title: '🎤 Actividades de Extensión',
                        description: 'Aquí gestionamos charlas y talleres de jornada única.',
                        side: "bottom"
                    },
                    onHighlightStarted: () => onTabChange('generalActivities')
                },
                {
                    element: '#tour-genact-btn-create',
                    popover: {
                        title: '🏷️ Lógica de Códigos Externos',
                        description: 'Al crear una actividad, el sistema usa un código externo (ej: CHA-DDMMAA) para facilitar la vinculación con sistemas de certificación masiva.',
                        side: "left"
                    }
                },
                {
                    element: '#nav-postgraduate',
                    popover: {
                        title: '🎓 Postítulos Modulares',
                        description: 'Los postítulos tienen una lógica de "Módulos" independiente.',
                        side: "bottom"
                    },
                    onHighlightStarted: () => onTabChange('postgraduate')
                },
                {
                    element: '#tour-postgrad-btn-manage',
                    popover: {
                        title: '🧱 Configuración de Módulos',
                        description: 'Dentro de cada programa puede crear múltiples módulos, cada uno con su propia ponderación, académico a cargo y fechas de clase específicas.',
                        side: "top"
                    }
                },
                {
                    element: '#nav-advisory',
                    popover: {
                        title: '🤝 Acompañamiento Docente',
                        description: 'Esta es el área más personalizada del Asesor.',
                        side: "bottom"
                    },
                    onHighlightStarted: () => onTabChange('advisory')
                },
                {
                    element: '#tour-advisory-btn-new',
                    popover: {
                        title: '📂 Apertura de Expediente',
                        description: 'Abrir un expediente significa crear una ficha única para un docente. Esto permite centralizar todas las sesiones de asesoría que tenga con él durante el año.',
                        side: "left"
                    }
                },
                {
                    element: '#tour-advisory-btn-manage',
                    popover: {
                        title: '📱 Firma Digital con QR',
                        description: 'Al terminar una sesión, usted genera un código QR. El docente lo escanea desde su celular y firma digitalmente. Esto valida la asistencia de forma inmediata y segura sin usar papel.',
                        side: "top"
                    }
                },
                {
                    popover: {
                        title: '🏁 Tour Completado',
                        description: 'Usted ya conoce la lógica de funcionamiento de GestorSMEAD. ¡Éxito en su gestión académica!',
                    }
                }
            ],
            onDestroyed: () => {
                setTrigger(false);
                onTabChange('dashboard');
            }
        });

        driverObj.drive();
        
    }, [trigger, onTabChange, setTrigger]);

    return null;
};
