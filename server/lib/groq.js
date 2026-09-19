import { Groq } from 'groq-sdk';
import { SYSTEM_PROMPT, DEFAULT_MODEL } from './constants.js';

let _groq;

function getGroqClient() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is not set');
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

export async function solve(prompt, model) {
  const groq = getGroqClient();
  const modelName = model || DEFAULT_MODEL;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    model: modelName,
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  return completion.choices[0]?.message?.content || '';
}
