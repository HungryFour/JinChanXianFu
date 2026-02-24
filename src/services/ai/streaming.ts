import type { StreamChunk } from '../../types/ai';

export async function* parseSSE(
  response: Response,
  parseData: (data: string) => StreamChunk | null,
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', content: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        const chunk = parseData(data);
        if (chunk) yield chunk;
      }
    }

    yield { type: 'done', content: '' };
  } catch (error) {
    yield { type: 'error', content: String(error) };
  } finally {
    reader.releaseLock();
  }
}
