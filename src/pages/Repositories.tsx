import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GitBranch, Search, Plus, MessageSquare, FileCode, Calendar, Trash2, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { Repository } from "@/lib/types";
import { fetchRepositories, fetchRepositoryDetails, retryIngestion, deleteRepository, getIngestionStatus, generateEncodedId, type ApiRepository } from "@/lib/api";

// Helper function to get stored repo info
interface StoredRepoInfo {
  owner: string;
  repo_name: string;
  branch: string;
  encoded_id: string;
  request_id: string;
  repo_id: string;
}

const getStoredRepoInfo = (repoId: string): StoredRepoInfo | null => {
  const stored = localStorage.getItem(`ingestion_repo_${repoId}`);
  return stored ? JSON.parse(stored) : null;
};

// Helper function to get stored repo info by encoded_id
const getStoredRepoInfoByEncodedId = (encodedId: string): StoredRepoInfo | null => {
  const stored = localStorage.getItem(`ingestion_encoded_${encodedId}`);
  return stored ? JSON.parse(stored) : null;
};

// Helper function to map API repository to component Repository type
const mapApiRepositoryToRepository = (apiRepo: ApiRepository, overrideStatus?: 'pending' | 'processing' | 'completed' | 'failed'): Repository => {
  // Use override status if provided (from polling), otherwise use status from API
  const status = overrideStatus || apiRepo.status;
  
  return {
    repo_id: apiRepo.id,
    repo_name: apiRepo.repo_name,
    repo_url: apiRepo.repository_url,
    owner: "", // Not provided by API
    branch: "", // Not provided by API
    commit_hash: "", // Not provided by API
    status: status as Repository["status"],
    ingestion_date: apiRepo.created_at,
    file_count: apiRepo.files_processed,
    description: undefined, // Not provided by API
  };
};

const Repositories = () => {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 10;
  const [repositoryStatuses, setRepositoryStatuses] = useState<Record<string, 'pending' | 'processing' | 'completed' | 'failed'>>({});

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setSkip(0); // Reset to first page when search changes
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['repositories', skip, limit, searchQuery],
    queryFn: () => fetchRepositories({ skip, limit, search: searchQuery }),
  });

  // Map repositories with status from API or override from polling
  const repositories = useMemo(() => {
    if (!data?.repositories) return [];
    return data.repositories.map(apiRepo => {
      // Use polled status if available (more up-to-date), otherwise use API status
      const overrideStatus = repositoryStatuses[apiRepo.id];
      return mapApiRepositoryToRepository(apiRepo, overrideStatus);
    });
  }, [data, repositoryStatuses]);

  // Initialize statuses from API response and set up polling for in-progress repos
  useEffect(() => {
    if (!data?.repositories) return;

    // Initialize statuses from API response
    const initialStatuses: Record<string, 'pending' | 'processing' | 'completed' | 'failed'> = {};
    data.repositories.forEach(repo => {
      initialStatuses[repo.id] = repo.status;
    });
    setRepositoryStatuses(prev => {
      // Merge with existing statuses, keeping polled updates if they exist
      return { ...initialStatuses, ...prev };
    });

    // Store repo info for in-progress repositories (for polling)
    data.repositories
      .filter(repo => repo.status === 'pending' || repo.status === 'processing')
      .forEach(repo => {
        // Check if we already have stored info
        const existingInfo = getStoredRepoInfo(repo.id);
        if (!existingInfo) {
          // For in-progress repos, the id is the encoded_id
          // Try to extract owner/repo_name from repository_url or store encoded_id
          const repoInfo: StoredRepoInfo = {
            owner: '', // Will be filled when we get details
            repo_name: repo.repo_name,
            branch: '', // Will be filled when we get details
            encoded_id: repo.id, // For in-progress repos, id is encoded_id
            request_id: '',
            repo_id: repo.id,
          };
          localStorage.setItem(`ingestion_repo_${repo.id}`, JSON.stringify(repoInfo));
          localStorage.setItem(`ingestion_encoded_${repo.id}`, JSON.stringify(repoInfo));
        }
      });
  }, [data]);

  // Poll for status updates if any repositories are processing
  useEffect(() => {
    if (!data?.repositories) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const pollStatus = async () => {
      if (!isMounted || !data?.repositories) return;

      // Get current processing repos - check both API status and local state
      const processingRepos = data.repositories.filter(repo => {
        // Use functional update to get latest state
        return repo.status === 'processing' || repo.status === 'pending';
      });

      if (processingRepos.length === 0) {
        // Stop polling if no processing repos
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }

      const statusPromises = processingRepos.map(async (repo) => {
        if (!isMounted) return;
        
        try {
          // For in-progress repos, the id is the encoded_id
          const encodedId = repo.id;
          
          // Try to get status using encoded_id
          try {
            const ingestionStatus = await getIngestionStatus(encodedId);
            
            if (!isMounted) return;
            
            setRepositoryStatuses(prev => {
              // Only update if status changed
              if (prev[repo.id] === ingestionStatus.status) return prev;
              return {
                ...prev,
                [repo.id]: ingestionStatus.status,
              };
            });
            
            // If completed, invalidate queries to refresh data
            if (ingestionStatus.status === 'completed') {
              queryClient.invalidateQueries({ queryKey: ['repositories'] });
            }
            
            // Update stored repo info if we got owner/branch info
            if (ingestionStatus.owner && ingestionStatus.branch) {
              const storedInfo = getStoredRepoInfo(repo.id);
              if (storedInfo && (!storedInfo.owner || !storedInfo.branch)) {
                const updatedInfo: StoredRepoInfo = {
                  ...storedInfo,
                  owner: ingestionStatus.owner,
                  branch: ingestionStatus.branch,
                };
                localStorage.setItem(`ingestion_repo_${repo.id}`, JSON.stringify(updatedInfo));
                localStorage.setItem(`ingestion_encoded_${encodedId}`, JSON.stringify(updatedInfo));
              }
            }
          } catch (error) {
            // If encoded_id doesn't work, try repository details API
            if (!isMounted) return;
            
            try {
              const details = await fetchRepositoryDetails(repo.id);
              
              if (!isMounted) return;
              
              setRepositoryStatuses(prev => {
                if (prev[repo.id] === details.status) return prev;
                return {
                  ...prev,
                  [repo.id]: details.status,
                };
              });
              
              if (details.status === 'completed') {
                queryClient.invalidateQueries({ queryKey: ['repositories'] });
              }
            } catch (detailsError) {
              console.error(`Failed to poll status for ${repo.id}:`, detailsError);
            }
          }
        } catch (error) {
          console.error(`Failed to poll status for ${repo.id}:`, error);
        }
      });

      await Promise.all(statusPromises);
    };

    // Check if we have any processing repos before starting polling
    const hasProcessingRepos = data.repositories.some(repo => 
      repo.status === 'processing' || repo.status === 'pending'
    );

    if (hasProcessingRepos) {
      // Poll immediately, then every 5 seconds
      pollStatus();
      intervalId = setInterval(pollStatus, 5000);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [data, queryClient]); // Only depend on data and queryClient

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: ({ repoId, requestId }: { repoId: string; requestId: string }) =>
      retryIngestion(requestId),
    onSuccess: (response, { repoId }) => {
      // Update stored repo info with new encoded_id and request_id
      const storedInfo = getStoredRepoInfo(repoId);
      if (storedInfo) {
        const updatedInfo: StoredRepoInfo = {
          ...storedInfo,
          encoded_id: response.encoded_id,
          request_id: response.request_id,
        };
        localStorage.setItem(`ingestion_repo_${repoId}`, JSON.stringify(updatedInfo));
        localStorage.setItem(`ingestion_encoded_${response.encoded_id}`, JSON.stringify(updatedInfo));
      }
      
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      setRepositoryStatuses(prev => ({
        ...prev,
        [repoId]: 'pending',
      }));
      toast.success("Retry initiated", {
        description: "Ingestion will restart shortly.",
      });
    },
    onError: (error) => {
      toast.error(`Failed to retry ingestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: (data, repoId) => {
      // Remove stored request_id if exists
      localStorage.removeItem(`ingestion_request_${repoId}`);
      
      // Remove from status tracking
      setRepositoryStatuses(prev => {
        const updated = { ...prev };
        delete updated[repoId];
        return updated;
      });
      
      // Invalidate and refetch repositories
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      
      if (data.success) {
        toast.success("Repository deleted successfully", {
          description: data.message,
        });
      } else {
        toast.warning("Repository deletion completed with warnings", {
          description: data.message,
        });
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const handleDeleteRepository = (repoId: string) => {
    deleteMutation.mutate(repoId);
  };

  const handleRetryIngestion = async (repoId: string) => {
    try {
      // Try to get request_id from stored info first
      const storedInfo = getStoredRepoInfo(repoId);
      if (storedInfo?.request_id) {
        retryMutation.mutate({ repoId, requestId: storedInfo.request_id });
        return;
      }
      
      // If no stored info, try to get request_id from repository details
      try {
        const details = await fetchRepositoryDetails(repoId);
        // Check if details has request_id field
        const requestId = (details as any).request_id;
        if (requestId) {
          retryMutation.mutate({ repoId, requestId });
          return;
        }
      } catch (detailsError) {
        // If fetching details fails, continue to try repo_id
      }
      
      // As a fallback, try using repo_id as request_id (some APIs accept this)
      retryMutation.mutate({ repoId, requestId: repoId });
    } catch (error) {
      toast.error(`Failed to retry ingestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8">
          <Card className="border-destructive">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <h3 className="mb-2 text-lg font-semibold text-destructive">Error loading repositories</h3>
              <p className="mb-6 text-center text-muted-foreground">
                {error instanceof Error ? error.message : "An unexpected error occurred"}
              </p>
              <Button onClick={() => refetch()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container py-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Your Repositories</h1>
            <p className="mt-2 text-muted-foreground">
              Manage and chat with your ingested codebases
              {data && ` (${data.total} total)`}
            </p>
          </div>
          <Button asChild>
            <Link to="/repositories/add">
              <Plus className="mr-2 h-4 w-4" />
              Add Repository
            </Link>
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">Loading repositories...</h3>
            </CardContent>
          </Card>
        ) : repositories.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">No repositories found</h3>
              <p className="mb-6 text-center text-muted-foreground">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "Get started by adding your first repository"}
              </p>
              {!searchQuery && (
                <Button asChild>
                  <Link to="/repositories/add">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Repository
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {repositories.map((repo) => (
              <RepositoryCard 
                key={repo.repo_id} 
                repository={repo} 
                onDelete={handleDeleteRepository}
                  onRetry={handleRetryIngestion}
              />
            ))}
          </div>
            {data && data.total > limit && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                  disabled={skip === 0 || isLoading}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Showing {skip + 1}-{Math.min(skip + limit, data.total)} of {data.total}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setSkip(skip + limit)}
                  disabled={skip + limit >= data.total || isLoading}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface RepositoryCardProps {
  repository: Repository;
  onDelete: (repoId: string) => void;
  onRetry?: (repoId: string) => void;
}

const RepositoryCard = ({ repository, onDelete, onRetry }: RepositoryCardProps) => {
  const getStatusColor = (status: Repository["status"]) => {
    switch (status) {
      case "completed":
        return "success";
      case "processing":
        return "warning";
      case "failed":
        return "destructive";
      case "pending":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const isProcessing = repository.status === "processing" || repository.status === "pending";
  
  return (
    <Card className={`group flex h-full flex-col transition-all ${isProcessing ? 'opacity-75 cursor-not-allowed' : 'hover:border-primary/50 hover:shadow-glow'}`}>
      <CardHeader className="flex-shrink-0 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="min-w-0 flex-1 break-words text-base font-semibold leading-tight text-foreground">
              {repository.repo_name}
            </CardTitle>
              <div className="flex shrink-0 items-center gap-1.5">
                {repository.status === "processing" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                <Badge variant={getStatusColor(repository.status) as any} className="shrink-0 whitespace-nowrap text-xs">
                  {repository.status}
                </Badge>
              </div>
            </div>
            {repository.description && (
              <CardDescription className="line-clamp-2 text-xs">
                {repository.description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 space-y-2.5 pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileCode className="h-4 w-4 shrink-0" />
          <span>{repository.file_count || 0} files</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{new Date(repository.ingestion_date).toLocaleDateString()}</span>
        </div>
      </CardContent>
      
      <CardFooter className="mt-auto flex gap-2 pt-3">
        {!isProcessing ? (
          <Button variant="outline" className="flex-1" asChild>
            <Link to={`/repositories/${repository.repo_id}`}>
              View Details
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="flex-1" disabled>
            View Details
          </Button>
        )}
        {repository.status === "completed" && (
          <Button className="flex-1" asChild>
            <Link to={`/chat/${repository.repo_id}`}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat
            </Link>
          </Button>
        )}
        {repository.status === "failed" && onRetry && (
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => onRetry(repository.repo_id)}
          >
            <RotateCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
        {!isProcessing && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Repository?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{repository.repo_name}" and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(repository.repo_id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );
};

export default Repositories;
