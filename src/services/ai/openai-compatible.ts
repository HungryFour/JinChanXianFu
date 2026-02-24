import type { ModelConfig, ChatRequest, ChatMessage, StreamChunk } from '../../types/ai';
import { parseSSE } from './streaming';

/**
 * 统一 OpenAI 兼容格式 Provider
 * 支持：OpenAI / DeepSeek / 智谱GLM / 以及任何 OpenAI 兼容 API
 */
export class OpenAICompatibleProvider {
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  async *chat(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const messages: Array<Record<string, unknown>> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: this.formatContent(msg),
      });
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      stream: true,
      messages,
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const url = `${this.config.baseUrl}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        yield {
          type: 'error',
          content: `API 错误 ${response.status}: ${error}`,
        };
        return;
      }

      yield* parseSSE(response, (data) => {
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) return { type: 'text', content: delta };
          if (event.choices?.[0]?.finish_reason) return { type: 'done', content: '' };
          return null;
        } catch {
          return null;
        }
      });
    } catch (error) {
      yield { type: 'error', content: `网络错误: ${String(error)}` };
    }
  }

  private formatContent(msg: ChatMessage): string | Array<Record<string, unknown>> {
    if (typeof msg.content === 'string') {
      return msg.content;
    }

    // 如果模型不支持视觉，只保留文本
    if (!this.config.supportsVision) {
      return msg.content
        .filter((c) => c.type === 'text')
        .map((c) => ('text' in c ? c.text : ''))
        .join('\n');
    }

    // 多模态内容：文本 + 图片
    return msg.content.map((c) => {
      if (c.type === 'text') {
        return { type: 'text', text: c.text };
      }
      return { type: 'image_url', image_url: { url: c.image_url.url } };
    });
  }
}
