import { invoke } from '@tauri-apps/api/core';
import { toolRegistry } from './tool-registry';
import { getSecret } from './secret-store';
import { invalidateSkillsCache } from './context-builder';
import type { ToolDefinition } from '../../types/ai';

// ── 适配器 JSON 类型定义 ──

export interface AdapterConfig {
  adapter: {
    id: string;
    name: string;
    version: number;
    base_url: string;
  };
  tools: AdapterToolConfig[];
}

export interface AdapterToolConfig {
  name: string;
  description: string;
  skill: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    data_path?: string;
    limit?: number;
  };
  secrets_needed?: string[];
}

// 追踪已注册的适配器工具，用于反注册
const adapterToolMap = new Map<string, string[]>();

// ── 模板引擎 ──

function resolveTemplate(
  template: unknown,
  context: { args: Record<string, unknown>; secrets: Record<string, string>; base_url: string },
): unknown {
  if (typeof template === 'string') {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const parts = path.split('.');
      if (parts[0] === 'args' && parts.length === 2) {
        return String(context.args[parts[1]] ?? '');
      }
      if (parts[0] === 'secrets' && parts.length === 2) {
        return context.secrets[parts[1]] ?? '';
      }
      if (path === 'base_url') {
        return context.base_url;
      }
      return '';
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveTemplate(item, context));
  }

  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      result[key] = resolveTemplate(value, context);
    }
    return result;
  }

  return template;
}

// ── 数据路径提取 ──

function extractByPath(data: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── 创建工具执行器闭包 ──

function createToolExecutor(tool: AdapterToolConfig, baseUrl: string) {
  return async (args: Record<string, unknown>): Promise<string> => {
    // 1. 收集所需密钥
    const secrets: Record<string, string> = {};
    if (tool.secrets_needed) {
      for (const key of tool.secrets_needed) {
        const value = await getSecret(key);
        if (!value) {
          return JSON.stringify({ error: `缺少必要的密钥: ${key}，请先使用 manage_api_secret 设置` });
        }
        secrets[key] = value;
      }
    }

    const context = { args, secrets, base_url: baseUrl };

    // 2. 解析模板
    const url = resolveTemplate(tool.request.url, context) as string;
    const headers = tool.request.headers
      ? (resolveTemplate(tool.request.headers, context) as Record<string, string>)
      : undefined;
    const body = tool.request.body
      ? resolveTemplate(tool.request.body, context)
      : undefined;

    // 3. 发 HTTP 请求
    try {
      const response = await invoke<{ status: number; body: string; headers: Record<string, string> }>(
        'cmd_http_request',
        {
          params: {
            method: tool.request.method,
            url,
            headers,
            body,
            timeout_secs: 30,
          },
        },
      );

      if (response.status >= 400) {
        return JSON.stringify({
          error: `HTTP ${response.status}`,
          body: response.body.slice(0, 500),
        });
      }

      // 4. 解析响应并提取数据
      let data: unknown;
      try {
        data = JSON.parse(response.body);
      } catch {
        data = response.body;
      }

      if (tool.response?.data_path) {
        data = extractByPath(data, tool.response.data_path);
      }

      // 5. 截断限制
      if (tool.response?.limit && Array.isArray(data)) {
        data = data.slice(0, tool.response.limit);
      }

      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ error: `请求失败: ${String(err)}` });
    }
  };
}

// ── 注册单个适配器 ──

export async function registerAdapter(adapterId: string): Promise<void> {
  const content = await invoke<string>('cmd_workspace_read', {
    relativePath: `adapters/${adapterId}.json`,
  });

  if (!content || !content.trim()) {
    throw new Error(`适配器 ${adapterId} 不存在或为空`);
  }

  const config: AdapterConfig = JSON.parse(content);
  const toolNames: string[] = [];

  for (const tool of config.tools) {
    const definition: ToolDefinition = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };

    const executor = createToolExecutor(tool, config.adapter.base_url);
    toolRegistry.register(tool.name, definition, executor, [tool.skill]);
    toolNames.push(tool.name);
  }

  adapterToolMap.set(adapterId, toolNames);
  invalidateSkillsCache();
}

// ── 反注册适配器 ──

export function unregisterAdapter(adapterId: string): void {
  const toolNames = adapterToolMap.get(adapterId);
  if (toolNames) {
    for (const name of toolNames) {
      toolRegistry.unregister(name);
    }
    adapterToolMap.delete(adapterId);
    invalidateSkillsCache();
  }
}

// ── 启动时加载所有适配器 ──

export async function loadAndRegisterAllAdapters(): Promise<void> {
  try {
    const files = await invoke<string[]>('cmd_workspace_list', {
      relativePath: 'adapters',
    });

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const adapterId = file.replace('.json', '');
      try {
        await registerAdapter(adapterId);
        console.log(`[adapter] 已加载适配器: ${adapterId}`);
      } catch (err) {
        console.warn(`[adapter] 加载适配器 ${adapterId} 失败:`, err);
      }
    }
  } catch {
    // adapters 目录不存在，跳过
  }
}

// ── 列出已注册适配器 ──

export function getRegisteredAdapters(): { id: string; tools: string[] }[] {
  const result: { id: string; tools: string[] }[] = [];
  for (const [id, tools] of adapterToolMap) {
    result.push({ id, tools: [...tools] });
  }
  return result;
}
