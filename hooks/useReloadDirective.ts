
import { useState, useCallback } from 'react';
import { useData } from '../context/DataContext';

/**
 * DIRECTIVA_RECARGA
 * 
 * Centraliza la lógica de actualización de datos y feedback visual.
 * Se debe invocar después de operaciones CUD (Create, Update, Delete).
 */
export const useReloadDirective = () => {
    const { refreshData } = useData();
    const [isSyncing, setIsSyncing] = useState(false);

    const executeReload = useCallback(async () => {
        setIsSyncing(true);
        try {
            // 1. Forzar recarga de datos desde Supabase
            await refreshData();
            
            // 2. Delay artificial para dar certeza visual al usuario (UX)
            // Esto evita que el mensaje "Sincronizando" parpadee demasiado rápido
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            console.error("Error en Directiva de Recarga:", error);
        } finally {
            setIsSyncing(false);
        }
    }, [refreshData]);

    return {
        isSyncing,
        executeReload
    };
};
