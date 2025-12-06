import { GoogleGenAI } from "@google/genai";
import { SCHEMA_TABLES } from '../constants';

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

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

export const askAiAboutModel = async (userQuestion: string): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Modo Demo: Falta la API Key. Por favor configura la variable de entorno para habilitar las funciones de IA.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userQuestion,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3, // Keep it factual
      }
    });

    return response.text || "No se generó respuesta.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error comunicándose con el servicio de IA. Por favor intenta nuevamente.";
  }
};