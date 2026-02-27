import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Task, Message, AgentPlan } from '../types/chat';
import type { ToolExecution } from '../types/ai';

interface ChatState {
  tasks: Task[];
  activeTaskId: string | null;
  activeTaskPlan: AgentPlan | null;
  lobbyTaskId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  toolExecutions: ToolExecution[];

  loadTasks: () => Promise<void>;
  initLobby: () => Promise<void>;
  createTask: (title: string, taskType?: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  setActiveTask: (id: string | null) => Promise<void>;
  loadMessages: (taskId: string) => Promise<void>;
  addMessage: (
    taskId: string,
    role: string,
    content: string,
    modelUsed?: string,
    triggerSource?: string,
    imagePaths?: string[],
  ) => Promise<Message>;
  setStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  addToolExecution: (execution: ToolExecution) => void;
  updateToolExecution: (id: string, updates: Partial<ToolExecution>) => void;
  clearToolExecutions: () => void;
  clearLobbyMessages: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  activeTaskPlan: null,
  lobbyTaskId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  toolExecutions: [],

  loadTasks: async () => {
    try {
      const allTasks = await invoke<Task[]>('list_tasks');
      // 过滤掉 lobby 类型的 task，不在侧边栏显示
      const tasks = allTasks.filter((t) => t.task_type !== 'lobby');
      set({ tasks });
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  },

  initLobby: async () => {
    try {
      const allTasks = await invoke<Task[]>('list_tasks');
      const lobbyTask = allTasks.find((t) => t.task_type === 'lobby');

      if (lobbyTask) {
        set({ lobbyTaskId: lobbyTask.id });
      } else {
        // 创建大厅 task
        const task = await invoke<Task>('create_task', {
          request: { title: '大厅', task_type: 'lobby' },
        });
        set({ lobbyTaskId: task.id });
      }

      // 如果当前没有 activeTask，加载大厅消息
      const { activeTaskId, lobbyTaskId } = get();
      const lid = lobbyTaskId || get().lobbyTaskId;
      if (!activeTaskId && lid) {
        await get().loadMessages(lid);
      }
    } catch (error) {
      console.error('Failed to init lobby:', error);
    }
  },

  createTask: async (title: string, taskType?: string) => {
    const task = await invoke<Task>('create_task', {
      request: { title, task_type: taskType || 'manual' },
    });
    set((state) => ({
      tasks: [task, ...state.tasks],
    }));
    return task;
  },

  deleteTask: async (id: string) => {
    await invoke('delete_task', { id });
    const state = get();
    const tasks = state.tasks.filter((t) => t.id !== id);
    set({
      tasks,
      activeTaskId:
        state.activeTaskId === id
          ? null
          : state.activeTaskId,
      messages: state.activeTaskId === id ? [] : state.messages,
    });
    // 如果删了当前 task，回到大厅
    if (state.activeTaskId === id) {
      const lobbyId = get().lobbyTaskId;
      if (lobbyId) {
        await get().loadMessages(lobbyId);
      }
    }
  },

  setActiveTask: async (id: string | null) => {
    let plan: AgentPlan | null = null;
    if (id) {
      const task = get().tasks.find((t) => t.id === id);
      if (task?.agent_plan) {
        try { plan = JSON.parse(task.agent_plan); } catch { /* skip */ }
      }
    }
    set({ activeTaskId: id, activeTaskPlan: plan, messages: [] });
    if (id) {
      await get().loadMessages(id);
    } else {
      // 回到大厅：加载 lobby 消息
      const lobbyId = get().lobbyTaskId;
      if (lobbyId) {
        await get().loadMessages(lobbyId);
      }
    }
  },

  loadMessages: async (taskId: string) => {
    try {
      const messages = await invoke<Message[]>('get_messages', {
        taskId,
      });
      set({ messages });
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  },

  addMessage: async (taskId, role, content, modelUsed, triggerSource, imagePaths) => {
    const message = await invoke<Message>('create_message', {
      request: {
        task_id: taskId,
        role,
        content,
        model_used: modelUsed || null,
        image_paths: imagePaths ? JSON.stringify(imagePaths) : null,
        trigger_source: triggerSource || 'manual',
      },
    });
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return message;
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),

  addToolExecution: (execution) =>
    set((state) => ({
      toolExecutions: [...state.toolExecutions, execution],
    })),

  updateToolExecution: (id, updates) =>
    set((state) => ({
      toolExecutions: state.toolExecutions.map((te) =>
        te.id === id ? { ...te, ...updates } : te,
      ),
    })),

  clearToolExecutions: () => set({ toolExecutions: [] }),

  clearLobbyMessages: async () => {
    const lobbyId = get().lobbyTaskId;
    if (!lobbyId) return;
    try {
      await invoke('clear_messages', { taskId: lobbyId });
      // 只在当前是 lobby 模式时清空前端消息
      if (!get().activeTaskId) {
        set({ messages: [] });
      }
    } catch (error) {
      console.error('Failed to clear lobby messages:', error);
    }
  },
}));
