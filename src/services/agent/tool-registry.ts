import type { ToolDefinition, ToolCall } from '../../types/ai';

type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

interface ToolEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
  skills: string[];
}

class ToolRegistry {
  private tools = new Map<string, ToolEntry>();

  register(name: string, definition: ToolDefinition, executor: ToolExecutor, skills: string[] = []) {
    this.tools.set(name, { definition, executor, skills });
  }

  async executeTool(toolCall: ToolCall): Promise<string> {
    const entry = this.tools.get(toolCall.function.name);
    if (!entry) {
      return JSON.stringify({ error: `未知工具: ${toolCall.function.name}` });
    }

    try {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      return await entry.executor(args);
    } catch (error) {
      return JSON.stringify({ error: `工具执行失败: ${String(error)}` });
    }
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((e) => e.definition);
  }

  getDefinitionsForSkills(skillNames: string[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const entry of this.tools.values()) {
      if (entry.skills.length === 0 || entry.skills.some((s) => skillNames.includes(s))) {
        result.push(entry.definition);
      }
    }
    return result;
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();
