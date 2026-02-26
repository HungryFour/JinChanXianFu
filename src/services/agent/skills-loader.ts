import { invoke } from '@tauri-apps/api/core';
import type { Skill } from '../../types/agent';

interface SkillFrontmatter {
  name: string;
  description: string;
  keywords: string[];
  tools: string[];
}

function parseSkillMarkdown(filename: string, content: string): Skill | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;

  const fmBlock = fmMatch[1];
  const body = fmMatch[2].trim();

  const fm: Partial<SkillFrontmatter> = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if (key === 'name') fm.name = value;
    else if (key === 'description') fm.description = value;
    else if (key === 'keywords' || key === 'tools') {
      // 解析 YAML 数组 (简单格式: [a, b, c])
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
      }
      (fm as Record<string, unknown>)[key] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const name = fm.name || filename.replace('.md', '');

  return {
    name,
    description: fm.description || '',
    keywords: fm.keywords || [],
    tools: fm.tools || [],
    prompt: body,
    always: false,
  };
}

export async function loadSkills(): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    // 加载 _always 技能
    const alwaysFiles = await invoke<string[]>('cmd_workspace_list', {
      relativePath: 'skills/_always',
    });
    for (const file of alwaysFiles) {
      if (!file.endsWith('.md')) continue;
      const content = await invoke<string>('cmd_workspace_read', {
        relativePath: `skills/_always/${file}`,
      });
      const skill = parseSkillMarkdown(file, content);
      if (skill) {
        skill.always = true;
        skills.push(skill);
      }
    }
  } catch {
    // skills 目录还不存在
  }

  try {
    // 加载 on-demand 技能
    const ondemandFiles = await invoke<string[]>('cmd_workspace_list', {
      relativePath: 'skills/on-demand',
    });
    for (const file of ondemandFiles) {
      if (!file.endsWith('.md')) continue;
      const content = await invoke<string>('cmd_workspace_read', {
        relativePath: `skills/on-demand/${file}`,
      });
      const skill = parseSkillMarkdown(file, content);
      if (skill) {
        skill.always = false;
        skills.push(skill);
      }
    }
  } catch {
    // skills 目录还不存在
  }

  return skills;
}

export function matchSkills(skills: Skill[], userInput: string): Skill[] {
  const input = userInput.toLowerCase();
  const matched: Skill[] = [];

  for (const skill of skills) {
    if (skill.always) {
      matched.push(skill);
      continue;
    }

    const isMatch = skill.keywords.some((kw) => input.includes(kw.toLowerCase()));
    if (isMatch) {
      matched.push(skill);
    }
  }

  return matched;
}
