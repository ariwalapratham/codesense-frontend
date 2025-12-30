const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://0.0.0.0:8000';

export interface ApiRepository {
  id: string;
  repo_name: string;
  repository_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  files_processed: number;
  created_at: string;
  updated_at: string;
}

export interface RepositoriesResponse {
  repositories: ApiRepository[];
  total: number;
  skip: number;
  limit: number;
}

export interface RepositoriesQueryParams {
  skip?: number;
  limit?: number;
  search?: string;
}

export async function fetchRepositories(
  params: RepositoriesQueryParams = {}
): Promise<RepositoriesResponse> {
  const { skip = 0, limit = 10, search = '' } = params;
  
  const queryParams = new URLSearchParams({
    skip: skip.toString(),
    limit: limit.toString(),
  });
  
  if (search) {
    queryParams.append('search', search);
  }
  
  const response = await fetch(`${API_BASE_URL}/repository/?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.statusText}`);
  }
  
  return response.json();
}

export interface ParsingStats {
  files_parsed: number;
  total_functions: number;
  total_classes: number;
  total_imports: number;
  languages: string[];
}

export interface RepositoryDetails {
  id: string;
  owner: string;
  repo_name: string;
  repository_url: string;
  branch: string;
  commit_hash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  files_processed: number;
  chunks_count: number;
  chunks_with_embeddings: number;
  parsing_stats: ParsingStats;
  created_at: string;
  updated_at: string;
  last_ingested_at: string;
}

export async function fetchRepositoryDetails(repoId: string): Promise<RepositoryDetails> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repository details: ${response.statusText}`);
  }
  
  return response.json();
}

export interface RepositoryStats {
  id: string;
  repo_name: string;
  total_chunks: number;
  total_files: number;
  language_distribution: Record<string, number>;
  chunk_type_distribution: Record<string, number>;
}

export async function fetchRepositoryStats(repoId: string): Promise<RepositoryStats> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/stats`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch repository stats: ${response.statusText}`);
  }
  
  return response.json();
}

export interface ChatSessionResponse {
  session_id: string;
  repo_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionsListResponse {
  sessions: (ChatSessionResponse & {
    last_message_preview?: string;
  })[];
  total: number;
  skip: number;
  limit: number;
}

export interface ChatSessionsQueryParams {
  skip?: number;
  limit?: number;
}

export async function createChatSession(
  repoId: string,
  title: string = "New Chat"
): Promise<ChatSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create chat session: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchChatSessions(
  repoId: string,
  params: ChatSessionsQueryParams = {}
): Promise<ChatSessionsListResponse> {
  const { skip = 0, limit = 10 } = params;
  
  const queryParams = new URLSearchParams({
    skip: skip.toString(),
    limit: limit.toString(),
  });
  
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch chat sessions: ${response.statusText}`);
  }
  
  return response.json();
}

export async function updateChatSession(
  repoId: string,
  sessionId: string,
  title: string
): Promise<ChatSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update chat session: ${response.statusText}`);
  }
  
  return response.json();
}

export async function deleteChatSession(
  repoId: string,
  sessionId: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'accept': '*/*',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete chat session: ${response.statusText}`);
  }
}

export interface MessageReference {
  chunk_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  score: number;
}

export interface SendMessageResponse {
  message_id: string;
  content: string;
  references: MessageReference[];
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  };
}

export interface ApiChatMessage {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  chunks_used?: string[] | null;
  references?: MessageReference[] | null;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  } | null;
}

export interface MessagesResponse {
  messages: ApiChatMessage[];
  total: number;
  skip: number;
  limit: number;
}

export interface MessagesQueryParams {
  skip?: number;
  limit?: number;
}

export async function sendMessage(
  repoId: string,
  sessionId: string,
  message: string,
  stream: boolean = false
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, stream }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }
  
  return response.json();
}

// Streaming message types
export interface StreamChunkData {
  content: string;
}

export interface StreamDoneData {
  message_id: string;
  references?: MessageReference[];
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  };
}

export interface StreamErrorData {
  error: string;
}

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onDone: (data: StreamDoneData) => void;
  onError: (error: string) => void;
}

/**
 * Send a message using the streaming endpoint with SSE
 * This provides real-time incremental updates as the AI generates the response
 */
export async function sendMessageStream(
  repoId: string,
  sessionId: string,
  message: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/repository/${repoId}/chat-sessions/${sessionId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        stream: true,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    callbacks.onError(`Failed to send message: ${response.statusText} - ${errorText}`);
    return;
  }

  // Check if response is SSE stream
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('text/event-stream')) {
    callbacks.onError('Invalid response type. Expected text/event-stream');
    return;
  }

  // Read the SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('Failed to get response reader');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const event = buffer.trim();
          let currentEventType: string | null = null;
          let eventData: string | null = null;

          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.replace('data: ', '').trim();
            }
          }

          if (eventData) {
            try {
              const data = JSON.parse(eventData);
              if (currentEventType === 'chunk' && data.content) {
                callbacks.onChunk(data.content);
              } else if (currentEventType === 'done') {
                callbacks.onDone({
                  message_id: data.message_id,
                  references: data.references || [],
                  metadata: data.metadata,
                });
              }
            } catch (parseError) {
              console.error('Failed to parse final buffer:', parseError);
            }
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events (separated by \n\n)
      let eventEndIndex;
      while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.substring(0, eventEndIndex);
        buffer = buffer.substring(eventEndIndex + 2);

        if (!event.trim()) continue;

        let currentEventType: string | null = null;
        let eventData: string | null = null;

        // Parse event lines
        const lines = event.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('event: ')) {
            currentEventType = trimmedLine.replace('event: ', '').trim();
          } else if (trimmedLine.startsWith('data: ')) {
            // Handle multi-line data (though SSE spec says data should be single line)
            const dataValue = trimmedLine.replace('data: ', '').trim();
            if (eventData) {
              // If multiple data lines, append them
              eventData += '\n' + dataValue;
            } else {
              eventData = dataValue;
            }
          }
        }

        // Process the event immediately
        if (eventData) {
          try {
            const data = JSON.parse(eventData);

            if (currentEventType === 'chunk') {
              // Handle chunk event - incremental content
              if (data.content !== undefined && data.content !== null) {
                // Call immediately for each chunk
                callbacks.onChunk(data.content);
              }
            } else if (currentEventType === 'done') {
              // Handle done event - message complete
              callbacks.onDone({
                message_id: data.message_id,
                references: data.references || [],
                metadata: data.metadata,
              });
            } else if (currentEventType === 'error') {
              // Handle error event
              callbacks.onError(data.error || 'Unknown error occurred');
              return;
            } else if (!currentEventType) {
              // If no event type specified, try to infer from data
              if (data.content) {
                callbacks.onChunk(data.content);
              } else if (data.message_id) {
                callbacks.onDone({
                  message_id: data.message_id,
                  references: data.references || [],
                  metadata: data.metadata,
                });
              } else if (data.error) {
                callbacks.onError(data.error);
                return;
              }
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError, eventData);
            // Continue processing other events
          }
        }
      }
    }
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error.message : 'Failed to read stream'
    );
  } finally {
    reader.releaseLock();
  }
}

export async function fetchMessages(
  repoId: string,
  sessionId: string,
  params: MessagesQueryParams = {}
): Promise<MessagesResponse> {
  const { skip = 0, limit = 50 } = params;
  
  const queryParams = new URLSearchParams({
    skip: skip.toString(),
    limit: limit.toString(),
  });
  
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}/chat-sessions/${sessionId}/messages?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.statusText}`);
  }
  
  return response.json();
}

// Ingestion API Types and Functions
export interface IngestionRequest {
  repo_url: string;
  branch: string;
  cleanup?: boolean;
}

export interface IngestionResponse {
  request_id: string;
  encoded_id: string;
  repo_id: string;
  owner: string;
  repo_name: string;
  branch: string;
  commit_hash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
}

export interface IngestionStatusResponse {
  request_id: string;
  repo_id: string;
  owner: string;
  repo_name: string;
  branch: string;
  commit_hash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  retry_count: number;
  retry_after: string | null;
  message: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface IngestionConflictResponse {
  request_id: string;
  encoded_id?: string;
  message: string;
}

// Helper function to generate encoded_id from repo info
export function generateEncodedId(owner: string, repoName: string, branch: string = 'main'): string {
  const data = {
    branch: branch,
    owner: owner,
    repo_name: repoName
  };
  
  // Sort keys for consistency (matches backend)
  const sortedKeys = Object.keys(data).sort();
  const sorted: Record<string, string> = {};
  sortedKeys.forEach(key => {
    sorted[key] = data[key as keyof typeof data];
  });
  
  const jsonStr = JSON.stringify(sorted);
  const encoded = btoa(jsonStr);
  return encoded.replace(/=+$/, ''); // Remove padding
}

export async function createIngestionRequest(
  request: IngestionRequest
): Promise<IngestionResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/ingest`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (response.status === 409) {
    const conflictData: IngestionConflictResponse = await response.json();
    throw new Error(`Repository already being processed: ${conflictData.message}`);
  }
  
  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  if (!response.ok) {
    throw new Error(`Failed to create ingestion request: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getIngestionStatus(
  identifier: string // Can be encoded_id or request_id
): Promise<IngestionStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/ingest/status/${identifier}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (response.status === 404) {
    throw new Error('Ingestion request not found');
  }
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ingestion status: ${response.statusText}`);
  }
  
  return response.json();
}

export async function retryIngestion(
  requestId: string
): Promise<IngestionResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/ingest/${requestId}/retry`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (response.status === 400) {
    throw new Error('Cannot retry: ingestion is not in failed state');
  }
  
  if (response.status === 404) {
    throw new Error('Ingestion request not found');
  }
  
  if (response.status === 429) {
    throw new Error('Retry rate limit exceeded. Please try again later.');
  }
  
  if (!response.ok) {
    throw new Error(`Failed to retry ingestion: ${response.statusText}`);
  }
  
  return response.json();
}

// Delete Repository API Types and Functions
export interface DeleteRepositoryResponse {
  success: boolean;
  message: string;
  details?: {
    chunks_deleted?: number;
    queries_deleted?: number;
    vector_store_deleted?: boolean;
  };
}

export async function deleteRepository(
  repoId: string
): Promise<DeleteRepositoryResponse> {
  const response = await fetch(`${API_BASE_URL}/repository/${repoId}`, {
    method: 'DELETE',
    headers: {
      'accept': 'application/json',
    },
  });
  
  if (response.status === 404) {
    const errorData = await response.json().catch(() => ({ detail: 'Repository not found' }));
    throw new Error(errorData.detail || 'Repository not found');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to delete repository: ${response.statusText}`);
  }
  
  return response.json();
}

