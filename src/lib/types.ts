// Repository Types
export interface Repository {
  repo_id: string;
  repo_name: string;
  repo_url: string;
  owner: string;
  branch: string;
  commit_hash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  ingestion_date: string;
  file_count?: number;
  total_size?: number;
  description?: string;
}

// Chat Types
export interface ChatMessage {
  message_id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context_files?: FileReference[];
  code_snippets?: CodeSnippet[];
}

export interface ChatSession {
  session_id: string;
  repo_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface FileReference {
  file_path: string;
  relevance_score: number;
  content_preview?: string;
}

export interface CodeSnippet {
  language: string;
  code: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
}

export type { IngestionJobStatus, IngestionProgress, IngestionStage } from './api';

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
