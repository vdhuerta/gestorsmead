import { GoogleGenAI, Type } from "@google/genai";
import { SCHEMA_TABLES, PEI_COMPETENCIES, PMI_COMPETENCIES, ACADEMIC_PROFILE_COMPETENCIES } from '../constants';

// Prepare a system prompt that understands the schema
const schemaContext = JSON.stringify(SCHEMA_TABLES, null, 2);

const systemInstruction = `
Eres un experto Arquitecto de Bases de Datos asistiendo a un desarrollador.
El desarrollador ha creado un Modelo de Datos basado en una planilla para "Actividades Formativas".
Aquí está la definición JSON de las Entidades del Esquema que estás analizando:
${schemaContext}

El sistema maneja Usuarios (identificados por RUT), Actividades (Cursos) e Inscripciones (Vinculando Usuarios a Actividades).
Cuando te hagan preguntas, responde brevemente y con precisión referenciando los nombres específicos de las tablas y campos proporcionados anteriormente.
Si te piden SQL, genera sintaxis estándar de PostgreSQL compatible con esta estructura.
RESPONDE SIEMPRE EN ESPAÑOL.
`;

export interface CompetencySuggestion {
  code: string;
  reason: string;
}

/**
 * Analiza el contenido de un programa de asignatura para sugerir competencias PEI, PMI y PA (Perfil Académico).
 * Ahora incluye razonamiento pedagógico para cada sugerencia.
 */
export const suggestCompetencies = async (syllabusText: string): Promise<CompetencySuggestion[]> => {
    if (!process.env.API_KEY) return [];

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const peiList = PEI_COMPETENCIES.map(c => `${c.code}: ${c.name}`).join(", ");
    const pmiList = PMI_COMPETENCIES.map(c => `${c.code}: ${c.name}`).join(", ");
    const paList = ACADEMIC_PROFILE_COMPETENCIES.map(c => `${c.code}: ${c.name} (Dimensión: ${c.dimension})`).join(", ");

    const analyzerPrompt = `
Eres un experto curricular de la Universidad de Playa Ancha (UPLA).
Analiza el siguiente extracto de un programa de asignatura y sugiere a qué competencias tributa.

LISTA DE COMPETENCIAS PEI: [${peiList}]
LISTA DE EJES PMI: [${pmiList}]
LISTA DE DIMENSIONES DEL PERFIL ACADÉMICO (PA): [${paList}]

CONTENIDO DEL PROGRAMA:
"${syllabusText}"

INSTRUCCIONES:
1. Identifica los códigos que apliquen (PEI, PMI o PA).
2. Para cada código, explica brevemente (máximo 15 palabras) por qué los objetivos o contenidos del programa se alinean con esa competencia (intencionalidad).
3. Retorna ÚNICAMENTE un arreglo JSON de objetos con la estructura: {"code": "CODIGO", "reason": "EXPLICACION BREVE"}.
4. Si no encuentras una relación clara, no incluyas el objeto.
5. El resultado debe ser EXCLUSIVAMENTE el JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: analyzerPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { 
                      type: Type.OBJECT,
                      properties: {
                        code: { type: Type.STRING },
                        reason: { type: Type.STRING }
                      }
                    }
                }
            }
        });

        const result = JSON.parse(response.text || "[]");
        return result;
    } catch (error) {
        console.error("Error al analizar programa con Gemini:", error);
        return [];
    }
};

export const askAiAboutModel = async (userQuestion: string): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Modo Demo: Falta la API Key. Por favor configura la variable de entorno para habilitar las funciones de IA.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: userQuestion,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3,
      }
    });

    return response.text || "No se generó respuesta.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error comunicándose con el servicio de IA. Por favor intenta nuevamente.";
  }
};