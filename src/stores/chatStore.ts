import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Task, Message } from '../types/chat';

interface ChatState {
  tasks: Task[];
  activeTaskId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;

  loadTasks: () => Promise<void>;
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
  ) => Promise<Message>;
  setStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',

  loadTasks: async () => {
    try {
      const tasks = await invoke<Task[]>('list_tasks');
      set({ tasks });
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  },

  createTask: async (title: string, taskType?: string) => {
    const task = await invoke<Task>('create_task', {
      request: { title, task_type: taskType || 'manual' },
    });
    set((state) => ({
      tasks: [task, ...state.tasks],
      activeTaskId: task.id,
      messages: [],
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
          ? tasks[0]?.id || null
          : state.activeTaskId,
      messages: state.activeTaskId === id ? [] : state.messages,
    });
  },

  setActiveTask: async (id: string | null) => {
    set({ activeTaskId: id, messages: [] });
    if (id) {
      await get().loadMessages(id);
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

  addMessage: async (taskId, role, content, modelUsed, triggerSource) => {
    const message = await invoke<Message>('create_message', {
      request: {
        task_id: taskId,
        role,
        content,
        model_used: modelUsed || null,
        image_paths: null,
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
}));
