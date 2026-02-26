import type { ModelConfig, ChatRequest, ChatMessage, StreamChunk, ToolCall } from '../../types/ai';

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
      const entry: Record<string, unknown> = {
        role: msg.role,
      };

      if (msg.role === 'tool') {
        entry.content = typeof msg.content === 'string' ? msg.content : '';
        entry.tool_call_id = msg.tool_call_id;
      } else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        entry.content = msg.content ?? null;
        entry.tool_calls = msg.tool_calls;
      } else {
        entry.content = this.formatContent(msg);
      }

      messages.push(entry);
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
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice ?? 'auto';
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

      // 工具调用累积器 (按 index 累积增量)
      const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

      yield* this.parseSSEWithTools(response, toolCallAccumulator);
    } catch (error) {
      yield { type: 'error', content: `网络错误: ${String(error)}` };
    }
  }

  private async *parseSSEWithTools(
    response: Response,
    toolCallAccumulator: Map<number, { id: string; name: string; arguments: string }>,
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

          try {
            const event = JSON.parse(data);
            const choice = event.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            const finishReason = choice.finish_reason;

            // 处理文本内容
            if (delta?.content) {
              yield { type: 'text', content: delta.content };
            }

            // 处理工具调用增量
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;

                if (tc.id && tc.function?.name) {
                  // 新工具调用开始
                  toolCallAccumulator.set(idx, {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments ?? '',
                  });
                } else if (tc.function?.arguments) {
                  // 追加 arguments 片段
                  const existing = toolCallAccumulator.get(idx);
                  if (existing) {
                    existing.arguments += tc.function.arguments;
                  }
                }

                yield { type: 'tool_call_delta', content: '' };
              }
            }

            // finish_reason === 'tool_calls' 或 'stop'
            if (finishReason === 'tool_calls' && toolCallAccumulator.size > 0) {
              const toolCalls: ToolCall[] = [];
              for (const [, tc] of toolCallAccumulator) {
                toolCalls.push({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments },
                });
              }
              yield { type: 'tool_call_complete', content: '', toolCalls };
              toolCallAccumulator.clear();
            } else if (finishReason === 'stop') {
              // 检查是否有未完成的 tool calls (某些 API 可能用 stop)
              if (toolCallAccumulator.size > 0) {
                const toolCalls: ToolCall[] = [];
                for (const [, tc] of toolCallAccumulator) {
                  toolCalls.push({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.arguments },
                  });
                }
                yield { type: 'tool_call_complete', content: '', toolCalls };
                toolCallAccumulator.clear();
              }
              yield { type: 'done', content: '' };
            }
          } catch {
            // 忽略 JSON 解析错误
          }
        }
      }

      // 流结束，如果还有未emit的工具调用
      if (toolCallAccumulator.size > 0) {
        const toolCalls: ToolCall[] = [];
        for (const [, tc] of toolCallAccumulator) {
          toolCalls.push({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          });
        }
        yield { type: 'tool_call_complete', content: '', toolCalls };
        toolCallAccumulator.clear();
      }

      yield { type: 'done', content: '' };
    } catch (error) {
      yield { type: 'error', content: String(error) };
    } finally {
      reader.releaseLock();
    }
  }

  private formatContent(msg: ChatMessage): string | Array<Record<string, unknown>> | null {
    if (msg.content === null) return null;

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
