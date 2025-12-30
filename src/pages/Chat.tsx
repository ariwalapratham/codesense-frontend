import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Send, Code2, FileCode, Loader2, MessageSquare, Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage, ChatSession, FileReference } from "@/lib/types";
import { createChatSession, fetchChatSessions, fetchRepositoryDetails, updateChatSession, deleteChatSession, sendMessageStream, fetchMessages, type ChatSessionResponse, type ApiChatMessage, type MessageReference } from "@/lib/api";

// Helper function to extract reference numbers from content (e.g., [ref 1], [ref 2])
const extractReferencedNumbers = (content: string): number[] => {
  const refPattern = /\[ref\s+(\d+)\]/gi;
  const matches = content.matchAll(refPattern);
  const refNumbers = new Set<number>();
  
  for (const match of matches) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      refNumbers.add(num);
    }
  }
  
  return Array.from(refNumbers).sort((a, b) => a - b);
};

// Helper function to map API message to ChatMessage type
const mapApiMessageToChatMessage = (apiMessage: ApiChatMessage, sessionId: string): ChatMessage => {
  // Extract referenced numbers from content
  const referencedNumbers = extractReferencedNumbers(apiMessage.content);
  
  // Filter references to only include those mentioned in content
  const contextFiles: FileReference[] = apiMessage.references
    ?.map((ref, index) => {
      // Reference index is 1-based in the API response
      const refNumber = index + 1;
      if (referencedNumbers.includes(refNumber)) {
        return {
          file_path: ref.file_path,
          relevance_score: ref.score,
          content_preview: ref.start_line !== undefined && ref.end_line !== undefined 
            ? `Lines ${ref.start_line}-${ref.end_line}` 
            : undefined,
        } as FileReference;
      }
      return null;
    })
    .filter((ref): ref is FileReference => ref !== null) || [];

  return {
    message_id: apiMessage.message_id,
    session_id: sessionId,
    role: apiMessage.role,
    content: apiMessage.content,
    timestamp: apiMessage.timestamp,
    context_files: contextFiles.length > 0 ? contextFiles : undefined,
  };
};

// Helper function to map API session to ChatSession type
const mapApiSessionToChatSession = (apiSession: ChatSessionResponse & { last_message_preview?: string }): ChatSession => {
  return {
    session_id: apiSession.session_id,
    repo_id: apiSession.repo_id,
    title: apiSession.title,
    created_at: apiSession.created_at,
    updated_at: apiSession.updated_at,
    message_count: 0, // API doesn't provide this, we'll need to calculate or get from messages
  };
};

const Chat = () => {
  const { repo_id } = useParams();
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<{ id: string; title: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  // Streaming message state: stores the current streaming assistant message
  const [streamingMessage, setStreamingMessage] = useState<{ content: string; messageId: string | null; references?: MessageReference[] } | null>(null);
  // Buffer for accumulating streaming chunks
  const streamBufferRef = useRef<string>("");
  // Displayed content for word-by-word animation
  const displayedContentRef = useRef<string>("");
  const wordAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const [bufferLength, setBufferLength] = useState<number>(0);

  // Animation running flag
  const animationRunningRef = useRef<boolean>(false);

  // Word-by-word animation function
  const startWordAnimation = () => {
    if (!isStreamingRef.current) {
      return;
    }

    // If animation is already running, don't start another (it will continue automatically)
    if (animationRunningRef.current) {
      return;
    }

    const animateWords = () => {
      if (!isStreamingRef.current) {
        animationRunningRef.current = false;
        return;
      }

      const buffer = streamBufferRef.current;
      const displayed = displayedContentRef.current;

      // If buffer has more content than displayed, reveal next word
      if (buffer.length > displayed.length) {
        animationRunningRef.current = true;
        
        // Find the next word boundary
        const remaining = buffer.slice(displayed.length);
        const nextSpaceIndex = remaining.indexOf(' ');
        const nextNewlineIndex = remaining.indexOf('\n');
        
        let nextBoundary: number;
        if (nextSpaceIndex === -1 && nextNewlineIndex === -1) {
          // No boundary found, show all remaining
          nextBoundary = remaining.length;
        } else if (nextSpaceIndex === -1) {
          nextBoundary = nextNewlineIndex + 1;
        } else if (nextNewlineIndex === -1) {
          nextBoundary = nextSpaceIndex + 1;
        } else {
          nextBoundary = Math.min(nextSpaceIndex, nextNewlineIndex) + 1;
        }

        const newDisplayed = displayed + remaining.slice(0, nextBoundary);
        displayedContentRef.current = newDisplayed;
        
        setStreamingMessage(prev => {
          if (!prev) {
            return { content: newDisplayed, messageId: null };
          }
          return {
            ...prev,
            content: newDisplayed,
          };
        });

        // Continue animating if there's more content
        if (buffer.length > newDisplayed.length) {
          wordAnimationTimeoutRef.current = setTimeout(animateWords, 25); // 25ms delay between words
        } else {
          animationRunningRef.current = false;
        }
      } else {
        animationRunningRef.current = false;
      }
    };

    // Clear any existing timeout before starting
    if (wordAnimationTimeoutRef.current) {
      clearTimeout(wordAnimationTimeoutRef.current);
    }
    
    animateWords();
  };

  // Word-by-word animation effect - triggers when buffer length changes
  useEffect(() => {
    if (isStreamingRef.current && streamBufferRef.current.length > displayedContentRef.current.length) {
      startWordAnimation();
    }
  }, [bufferLength]);

  // Fetch messages for active session
  const { data: messagesData, isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery({
    queryKey: ['chat-messages', repo_id, activeSession],
    queryFn: () => fetchMessages(repo_id!, activeSession!, { skip: 0, limit: 100 }),
    enabled: !!repo_id && !!activeSession,
  });

  const messages = useMemo(() => {
    // Start with API messages if available
    let apiMessages: ChatMessage[] = [];
    if (messagesData?.messages && activeSession) {
      apiMessages = messagesData.messages.map(msg => mapApiMessageToChatMessage(msg, activeSession));
    }
    
    // Filter out optimistic messages that are now in API messages
    const apiMessageIds = new Set(apiMessages.map(m => m.message_id));
    const uniqueOptimistic = optimisticMessages.filter(m => !apiMessageIds.has(m.message_id));
    
    // Combine API messages and unique optimistic messages
    let result = [...apiMessages, ...uniqueOptimistic];
    
    // Add streaming message if it exists and isn't already in API messages
    if (streamingMessage) {
      if (streamingMessage.content !== undefined) {
      // Use a stable ID for streaming messages to prevent remounting
      const streamingMessageId = streamingMessage.messageId || 'streaming-active';
      const isInApiMessages = streamingMessage.messageId 
        ? apiMessages.some(m => m.message_id === streamingMessage.messageId)
        : false;
      
      if (!isInApiMessages) {
        const streamingChatMessage: ChatMessage = {
          message_id: streamingMessageId,
          session_id: activeSession!,
          role: 'assistant',
          content: streamingMessage.content,
          timestamp: new Date().toISOString(),
          context_files: streamingMessage.references?.map((ref, index) => {
            const referencedNumbers = extractReferencedNumbers(streamingMessage.content);
            if (referencedNumbers.includes(index + 1)) {
              return {
                file_path: ref.file_path,
                relevance_score: ref.score,
                content_preview: ref.start_line !== undefined && ref.end_line !== undefined 
                  ? `Lines ${ref.start_line}-${ref.end_line}` 
                  : undefined,
              } as FileReference;
            }
            return null;
          }).filter((ref): ref is FileReference => ref !== null) || undefined,
        };
        result.push(streamingChatMessage);
      }
      }
    }
    
    return result;
  }, [messagesData, activeSession, optimisticMessages, streamingMessage]);

  // Fetch repository details for name
  const { data: repository } = useQuery({
    queryKey: ['repository', repo_id],
    queryFn: () => fetchRepositoryDetails(repo_id!),
    enabled: !!repo_id,
  });

  // Fetch chat sessions
  const { data: sessionsData, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['chat-sessions', repo_id],
    queryFn: () => fetchChatSessions(repo_id!, { skip: 0, limit: 50 }),
    enabled: !!repo_id,
  });

  const sessions = useMemo(() => {
    if (!sessionsData?.sessions) return [];
    return sessionsData.sessions.map(mapApiSessionToChatSession);
  }, [sessionsData]);

  // Set active session to first session when sessions load
  useEffect(() => {
    if (sessions.length > 0 && !activeSession) {
      setActiveSession(sessions[0].session_id);
    }
  }, [sessions, activeSession]);

  // Clear optimistic messages and streaming state when session changes
  useEffect(() => {
    setOptimisticMessages([]);
    setStreamingMessage(null);
    isStreamingRef.current = false;
    streamBufferRef.current = "";
    displayedContentRef.current = "";
    setBufferLength(0);
    if (wordAnimationTimeoutRef.current) {
      clearTimeout(wordAnimationTimeoutRef.current);
    }
    
    // Scroll to bottom when session changes
    setTimeout(() => {
      if (scrollContainerRef.current && messagesEndRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 100);
  }, [activeSession]);

  // Smooth auto-scroll to bottom (throttled to prevent scrollbar shaking during streaming)
  useEffect(() => {
    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Check if user is near bottom (within 150px) before auto-scrolling
    const shouldAutoScroll = () => {
      if (!scrollContainerRef.current) return true;
      const container = scrollContainerRef.current;
      const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      return scrollBottom < 150; // Only auto-scroll if within 150px of bottom
    };

    // During streaming, use instant scroll (scrollTop) instead of smooth scrollIntoView to prevent shaking
    // For non-streaming, use smooth scroll
    const scrollToBottom = () => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      
      if (isStreamingRef.current) {
        // Instant scroll during streaming to prevent shaking
        container.scrollTop = container.scrollHeight;
      } else {
        // Smooth scroll when not streaming
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Throttle scroll updates during streaming - only scroll every 200ms
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;
    const throttleDelay = isStreamingRef.current ? 200 : 0; // Throttle during streaming

    if (timeSinceLastScroll >= throttleDelay && shouldAutoScroll()) {
      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
          lastScrollTimeRef.current = Date.now();
        });
      }, throttleDelay);
    }

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages.length, isLoading]); // Only depend on message count, not content to prevent shaking

  // Send message using streaming API
  const handleSendMessage = async (messageText: string) => {
    if (!repo_id || !activeSession || !messageText.trim() || isLoading) return;

    const userMessageId = `temp-user-${Date.now()}`;
    
    // Optimistically add user message immediately
    const optimisticUserMessage: ChatMessage = {
      message_id: userMessageId,
      session_id: activeSession,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    setOptimisticMessages(prev => [...prev, optimisticUserMessage]);
    setInput("");
    setIsLoading(true);
    streamBufferRef.current = "";
    displayedContentRef.current = "";
    isStreamingRef.current = true;
    animationRunningRef.current = false;
    setBufferLength(0);
    // Initialize streaming message with empty content to show cursor
    setStreamingMessage({ content: '', messageId: null });

    // Clear any existing animation timeout
    if (wordAnimationTimeoutRef.current) {
      clearTimeout(wordAnimationTimeoutRef.current);
      wordAnimationTimeoutRef.current = null;
    }

    try {
      await sendMessageStream(repo_id, activeSession, messageText, {
        onChunk: (content: string) => {
          // Accumulate chunks in buffer
          streamBufferRef.current += content;
          // Update buffer length to trigger useEffect
          setBufferLength(streamBufferRef.current.length);
          
          // Trigger animation when new chunk arrives (useEffect will also trigger)
          // Use setTimeout to ensure state updates have processed
          setTimeout(() => {
            if (isStreamingRef.current && !animationRunningRef.current) {
              startWordAnimation();
            }
          }, 0);
        },
        onDone: (data) => {
          // Save buffer content before clearing (finishAnimation is async)
          const finalBuffer = streamBufferRef.current;
          
          // Wait for animation to finish displaying all content before completing
          const finishAnimation = () => {
            const buffer = finalBuffer; // Use saved buffer, not ref (which might be cleared)
            const displayed = displayedContentRef.current;
            
            if (buffer.length > displayed.length) {
              // Still have content to display, continue animating
              const remaining = buffer.slice(displayed.length);
              const nextSpaceIndex = remaining.indexOf(' ');
              const nextNewlineIndex = remaining.indexOf('\n');
              
              let nextBoundary: number;
              if (nextSpaceIndex === -1 && nextNewlineIndex === -1) {
                nextBoundary = remaining.length;
              } else if (nextSpaceIndex === -1) {
                nextBoundary = nextNewlineIndex + 1;
              } else if (nextNewlineIndex === -1) {
                nextBoundary = nextSpaceIndex + 1;
              } else {
                nextBoundary = Math.min(nextSpaceIndex, nextNewlineIndex) + 1;
              }

              const newDisplayed = displayed + remaining.slice(0, nextBoundary);
              displayedContentRef.current = newDisplayed;
              
              setStreamingMessage(prev => ({
                content: newDisplayed,
                messageId: prev?.messageId || null,
                references: prev?.references,
              }));

              if (buffer.length > newDisplayed.length) {
                wordAnimationTimeoutRef.current = setTimeout(finishAnimation, 25);
              } else {
                // All content displayed, now complete
                displayedContentRef.current = finalBuffer;
                isStreamingRef.current = false;
                animationRunningRef.current = false;
                
                setStreamingMessage(prev => ({
                  content: finalBuffer,
                  messageId: data.message_id,
                  references: data.references,
                }));
                
                // Clear buffers AFTER setting final content
                streamBufferRef.current = "";
                displayedContentRef.current = "";
              }
            } else {
              // All content already displayed
              isStreamingRef.current = false;
              animationRunningRef.current = false;
              
              setStreamingMessage(prev => ({
                content: finalBuffer,
                messageId: data.message_id,
                references: data.references,
              }));
              
              // Clear buffers AFTER setting final content
              streamBufferRef.current = "";
              displayedContentRef.current = "";
            }
          };
          
          // Start finishing animation
          finishAnimation();
          
          // Remove optimistic user message - API will return it
          setOptimisticMessages(prev => prev.filter(m => m.message_id !== userMessageId));
          
          // Invalidate queries to fetch the complete messages from API
          queryClient.invalidateQueries({ queryKey: ['chat-messages', repo_id, activeSession] });
          queryClient.invalidateQueries({ queryKey: ['chat-sessions', repo_id] });
          
          // Clear streaming state after messages are fetched
          setTimeout(() => {
            setStreamingMessage(null);
            setIsLoading(false);
          }, 1000);
        },
        onError: (error: string) => {
          // Remove optimistic messages on error
          setOptimisticMessages(prev => prev.filter(m => m.message_id !== userMessageId));
          setStreamingMessage(null);
          setIsLoading(false);
          isStreamingRef.current = false;
          streamBufferRef.current = "";
          displayedContentRef.current = "";
          setBufferLength(0);
          if (wordAnimationTimeoutRef.current) {
            clearTimeout(wordAnimationTimeoutRef.current);
          }
          toast.error(`Failed to send message: ${error}`);
        },
      });
    } catch (error) {
      // Handle unexpected errors
      setOptimisticMessages(prev => prev.filter(m => m.message_id !== userMessageId));
      setStreamingMessage(null);
      setIsLoading(false);
      toast.error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };


  // Create new chat session mutation
  const createSessionMutation = useMutation({
    mutationFn: () => createChatSession(repo_id!, "New Chat"),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', repo_id] });
      const mappedSession = mapApiSessionToChatSession(newSession);
      setActiveSession(mappedSession.session_id);
      toast.success("New chat session created");
    },
    onError: (error) => {
      toast.error(`Failed to create chat session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  // Update chat session mutation
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      updateChatSession(repo_id!, sessionId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', repo_id] });
      setEditingSession(null);
      toast.success("Chat session updated");
    },
    onError: (error) => {
      toast.error(`Failed to update chat session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  // Delete chat session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => deleteChatSession(repo_id!, sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', repo_id] });
      if (activeSession === sessionId) {
        const remainingSessions = sessions.filter(s => s.session_id !== sessionId);
        if (remainingSessions.length > 0) {
          setActiveSession(remainingSessions[0].session_id);
        } else {
          setActiveSession(null);
        }
      }
      toast.success("Chat session deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete chat session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  const handleRenameSession = (sessionId: string, currentTitle: string) => {
    setEditingSession({ id: sessionId, title: currentTitle });
  };

  const handleSaveRename = () => {
    if (editingSession && editingSession.title.trim()) {
      updateSessionMutation.mutate({
        sessionId: editingSession.id,
        title: editingSession.title.trim(),
      });
    }
  };

  const handleNewChat = () => {
    createSessionMutation.mutate();
  };

  const handleSend = async () => {
    if (!input.trim() || !activeSession || isLoading) return;
    await handleSendMessage(input.trim());
  };

  if (isLoadingSessions) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="container flex flex-1 items-center justify-center py-6">
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading chat sessions...</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <Navbar />
      
      <div className="flex flex-1 gap-4 md:gap-6 py-4 md:py-6 px-4 md:px-6 overflow-hidden min-h-0">
        {/* Chat History Sidebar */}
        <div className="w-64 flex-shrink-0 space-y-4">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Chat History</h3>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={handleNewChat}
                disabled={createSessionMutation.isPending}
              >
                {createSessionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <div className="py-8 text-center">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No chat sessions yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleNewChat}
                    disabled={createSessionMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Start New Chat
                  </Button>
                </div>
              ) : (
                sessions.map((session) => {
                  const apiSession = sessionsData?.sessions.find(s => s.session_id === session.session_id);
                  return (
                    <div
                      key={session.session_id}
                      className={`group relative rounded-lg border p-3 transition-colors cursor-pointer ${
                        activeSession === session.session_id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setActiveSession(session.session_id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-3 w-3 text-primary flex-shrink-0" />
                            <p className="text-sm font-medium text-foreground truncate">
                              {session.title}
                            </p>
                          </div>
                          {apiSession?.last_message_preview && (
                            <p className="mt-1 text-xs text-muted-foreground truncate">
                              {apiSession.last_message_preview}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(session.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameSession(session.session_id, session.title);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{session.title}" and all its messages.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteSession(session.session_id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  disabled={deleteSessionMutation.isPending}
                                >
                                  {deleteSessionMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    'Delete'
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col min-w-0 h-full">
          <Card className="mb-4 border-border bg-card/50 p-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Code2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">
                  {repository?.repo_name || 'Loading...'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Repository ID: {repo_id}
                </p>
              </div>
            </div>
          </Card>

          {/* Messages - Scrollable Area */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto rounded-lg border border-border bg-card/30 p-4 md:p-6 mb-4 min-h-0">
            {!activeSession ? (
              <div className="flex h-full items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">Select a chat session to start</p>
                </div>
              </div>
            ) : isLoadingMessages ? (
              <div className="flex h-full items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading messages...</p>
                </div>
              </div>
            ) : (
              <div>
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center min-h-[400px]">
                    <div className="text-center">
                      <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message, index) => {
                      // Check if this is the streaming message
                      // Show cursor if: streaming is active AND this is an assistant message AND
                      // (it matches the streaming message ID OR it's the last message and we're loading)
                      const isStreaming = isStreamingRef.current && streamingMessage && 
                        message.role === 'assistant' && 
                        (message.message_id === streamingMessage.messageId || 
                         (streamingMessage.messageId === null && message.message_id.startsWith('streaming-')) ||
                         // If it's the last assistant message and we're streaming, it's likely the streaming one
                         (index === messages.length - 1 && isLoading && isStreamingRef.current));
                      
                      return (
                        <MessageBubble 
                          key={`${message.message_id}-${message.content.length}-${isStreaming ? 'streaming' : 'static'}`} 
                          message={message} 
                          isStreaming={!!isStreaming}
                        />
                      );
                    })}
                    {isLoading && !streamingMessage && (
                      <div className="flex items-center gap-2 text-muted-foreground py-2 mb-6">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Input - Fixed at Bottom */}
          <Card className="p-4 flex-shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Ask anything about this codebase..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading || !activeSession}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !input.trim() || !activeSession}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="hidden w-64 xl:block flex-shrink-0">
          <Card className="p-4">
            <h3 className="mb-4 font-semibold text-foreground">Quick Tips</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>• Ask about specific functions or files</p>
              <p>• Request code examples and explanations</p>
              <p>• Explore architecture and design patterns</p>
              <p>• Get help with debugging and refactoring</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Rename Session Dialog */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat Session</DialogTitle>
            <DialogDescription>
              Enter a new name for this chat session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-title">Title</Label>
              <Input
                id="session-title"
                value={editingSession?.title || ''}
                onChange={(e) => editingSession && setEditingSession({ ...editingSession, title: e.target.value })}
                placeholder="Enter session title"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveRename();
                  }
                }}
                disabled={updateSessionMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingSession(null)}
              disabled={updateSessionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRename}
              disabled={updateSessionMutation.isPending || !editingSession?.title.trim()}
            >
              {updateSessionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble = ({ message, isStreaming = false }: MessageBubbleProps) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6`}>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[42rem] space-y-3`}>
        <div
          className={`rounded-lg px-4 py-3 shadow-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="markdown-content prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown
                key={`${message.message_id}-${message.content.length}-${isStreaming ? 'streaming' : 'static'}`} // Force re-render on content change for streaming
                components={{
                  // Style inline code
                  code: ({ node, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    return isInline ? (
                      <code className="bg-muted/50 px-1.5 py-0.5 rounded text-sm font-mono text-foreground border border-border" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Style code blocks
                  pre: ({ node, children, ...props }) => {
                    return (
                      <pre className="bg-muted/50 border border-border p-4 rounded-lg overflow-x-auto my-2" {...props}>
                        {children}
                      </pre>
                    );
                  },
                  // Style links
                  a: ({ node, ...props }) => (
                    <a className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
                  ),
                  // Style lists
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc list-outside my-2 ml-4 space-y-1" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal list-outside my-2 ml-4 space-y-1" {...props} />
                  ),
                  // Style list items
                  li: ({ node, ...props }) => (
                    <li className="leading-relaxed text-foreground" {...props} />
                  ),
                  // Style headings
                  h1: ({ node, ...props }) => (
                    <h1 className="text-xl font-bold mt-4 mb-2 text-foreground first:mt-0" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-lg font-semibold mt-3 mb-2 text-foreground first:mt-0" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-base font-semibold mt-3 mb-1.5 text-foreground first:mt-0" {...props} />
                  ),
                  // Style paragraphs
                  p: ({ node, ...props }) => (
                    <p className="my-2 leading-relaxed text-foreground first:mt-0 last:mb-0" {...props} />
                  ),
                  // Style blockquotes
                  blockquote: ({ node, ...props }) => (
                    <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 text-muted-foreground bg-muted/30 py-2 rounded-r" {...props} />
                  ),
                  // Style horizontal rules
                  hr: ({ node, ...props }) => (
                    <hr className="my-3 border-border" {...props} />
                  ),
                  // Style strong/bold
                  strong: ({ node, ...props }) => (
                    <strong className="font-semibold text-foreground" {...props} />
                  ),
                  // Style emphasis/italic
                  em: ({ node, ...props }) => (
                    <em className="italic" {...props} />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span 
                  className="inline-block ml-1 w-0.5 h-4 bg-primary" 
                  aria-label="Streaming"
                  style={{
                    animation: 'blink 1s infinite',
                    verticalAlign: 'baseline',
                  }}
                />
              )}
            </div>
          )}
        </div>
        
        {message.context_files && message.context_files.length > 0 && (
          <div className={`w-full space-y-2 ${isUser ? "items-end" : "items-start"}`}>
            <p className="text-xs font-medium text-muted-foreground mb-2">Referenced files:</p>
            <div className="space-y-2">
              {message.context_files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="flex-1 font-mono text-xs text-foreground break-all">
                      {file.file_path}
                    </span>
                  </div>
                  {file.content_preview && (
                    <p className="text-xs text-muted-foreground ml-6">
                      {file.content_preview}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
