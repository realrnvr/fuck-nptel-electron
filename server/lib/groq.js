import { Groq } from 'groq-sdk';
import { SYSTEM_PROMPT, DEFAULT_MODEL } from './constants.js';

let _groq;

function getGroqClient() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      console.error('[GROQ] GROQ_API_KEY environment variable is not set!');
      throw new Error('GROQ_API_KEY environment variable is not set');
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

export async function solve(prompt, model) {
  const groq = getGroqClient();
  const modelName = model || DEFAULT_MODEL;
  const startTime = Date.now();

  console.log(`[GROQ] Forwarding prompt (${prompt.length} chars) to model: "${modelName}"`);

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      model: modelName,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const elapsed = Date.now() - startTime;
    const responseText = completion.choices[0]?.message?.content || '';

    console.log(`[GROQ] Received response in ${elapsed}ms`);
    console.log(`[GROQ] Raw Output: ${responseText}`);

    return responseText;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[GROQ] API call failed after ${elapsed}ms: ${err.message || err}`);
    throw err;
  }
}
