export interface Knowledge {
  id: string;
  category: 'strategy' | 'opinion' | 'preference' | 'lesson';
  title: string;
  content: string;
  stockSymbols: string[];
  sourceTaskId?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  key: string;
  value: string;
  updatedAt: string;
}
