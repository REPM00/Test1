// api/chat.js
// Función serverless de Vercel: recibe la conversación desde el navegador,
// llama a la API de Gemini con la clave guardada en el servidor (nunca en el HTML/JS del cliente)
// y devuelve solo el texto de respuesta.

const SYSTEM_PROMPT = `
Eres el asistente virtual del restaurante Milpa, cocina mexicana regional de barrio.
Responde SOLO con la información dada abajo. Si te preguntan algo que no está aquí,
dilo amablemente y sugiere escribir a hola@milpa-restaurante.com o llamar al (55) 1234 5678.
Nunca inventes platillos, precios ni horarios que no estén en esta información.
Responde en español, en 2 a 4 frases, con un tono cálido y cercano, sin emojis.

INFORMACIÓN DE MILPA:
- Restaurante de cocina mexicana regional de barrio. Dirección: Calle Higuera 214, Barrio del Carmen,
  a dos cuadras de la plaza principal, junto a la panadería.
- Horario: martes a viernes 13:00–22:00, sábado 13:00–23:00, domingo 13:00–18:00, lunes cerrado.
- Reservas: teléfono (55) 1234 5678, correo hola@milpa-restaurante.com, Instagram @milpa.barrio.
- Menú (precios por plato):
  Para empezar — Elote callejero $65, Tostadas de tuétano $95, Sopa de milpa $80.
  De comal — Tacos al pastor $110 (picante), Quesabirria $130 (picante).
  Fuertes — Mole negro oaxaqueño $165, Pescado a la talla $190, Chiles en nogada $175.
  Para tomar — Agua de jamaica $35, Mezcal de la casa $90.
- El menú cambia según temporada y mercado; estos son los platos que casi nunca faltan.
`.trim();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Falta el arreglo "messages"' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en Vercel' });
  }

  // Gemini usa "model" en vez de "assistant" para el rol del bot
  const contents = messages
    .slice(-12) // límite razonable de turnos recientes para no crecer sin control
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '').slice(0, 2000) }],
    }));

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { maxOutputTokens: 300, temperature: 0.6 },
        }),
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || 'Error al contactar a Gemini';
      return res.status(upstream.status).json({ error: msg });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      'No pude generar una respuesta. Intenta reformular tu pregunta.';

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo contactar a Gemini en este momento' });
  }
}
