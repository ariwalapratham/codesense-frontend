import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, MessageSquare, ArrowLeft, FileCode, Calendar, Database, Trash2, ExternalLink, Loader2, Code, Layers, Hash, Languages, BarChart3 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { fetchRepositoryDetails, fetchRepositoryStats, deleteRepository, type RepositoryDetails, type RepositoryStats } from "@/lib/api";

const RepositoryDetails = () => {
  const { repo_id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: repository, isLoading, error, refetch } = useQuery({
    queryKey: ['repository', repo_id],
    queryFn: () => fetchRepositoryDetails(repo_id!),
    enabled: !!repo_id,
  });

  const { data: stats, isLoading: isLoadingStats, error: statsError } = useQuery({
    queryKey: ['repository-stats', repo_id],
    queryFn: () => fetchRepositoryStats(repo_id!),
    enabled: !!repo_id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: (data) => {
      // Remove stored request_id if exists
      if (repo_id) {
        localStorage.removeItem(`ingestion_request_${repo_id}`);
      }
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      queryClient.invalidateQueries({ queryKey: ['repository', repo_id] });
      
      if (data.success) {
        toast.success("Repository deleted successfully", {
          description: data.message,
        });
      } else {
        toast.warning("Repository deletion completed with warnings", {
          description: data.message,
        });
      }
      
      // Navigate back to repositories list
      navigate("/repositories");
    },
    onError: (error) => {
      toast.error(`Failed to delete repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    },
  });

  const handleDelete = () => {
    if (!repo_id) return;
    deleteMutation.mutate(repo_id);
  };

  const getStatusColor = (status: RepositoryDetails["status"]) => {
    switch (status) {
      case "completed":
        return "success";
      case "processing":
        return "warning";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  if (isLoading || isLoadingStats) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8">
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">Loading repository details...</h3>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !repository) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-8">
          <div className="mb-6">
            <Button variant="ghost" asChild>
              <Link to="/repositories">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Repositories
              </Link>
            </Button>
          </div>
          <Card className="border-destructive">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <h3 className="mb-2 text-lg font-semibold text-destructive">Error loading repository</h3>
              <p className="mb-6 text-center text-muted-foreground">
                {error instanceof Error ? error.message : "Repository not found"}
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
        <div className="mb-6">
          <Button variant="ghost" asChild>
            <Link to="/repositories">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Repositories
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <GitBranch className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl text-foreground">{repository.repo_name}</CardTitle>
                      <CardDescription>{repository.owner}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={getStatusColor(repository.status) as any}>
                    {repository.status}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Repository URL</p>
                    <a 
                      href={repository.repository_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {repository.repository_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Owner</p>
                    <p className="text-sm font-medium text-foreground">{repository.owner}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Branch</p>
                    <p className="text-sm font-medium text-foreground">{repository.branch}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Commit Hash</p>
                    <p className="text-sm font-mono text-foreground">{repository.commit_hash}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Created At</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(repository.created_at).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last Ingested</p>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(repository.last_ingested_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Repository Stats */}
            {stats && (
            <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Repository Statistics
                  </CardTitle>
                  <CardDescription>Detailed code analysis and distribution metrics</CardDescription>
              </CardHeader>
                <CardContent className="space-y-6">
                  {/* Overview Stats */}
                  <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                        <FileCode className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-foreground">{stats.total_files}</p>
                        <p className="text-sm text-muted-foreground">Total Files</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                        <Layers className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-foreground">{stats.total_chunks}</p>
                        <p className="text-sm text-muted-foreground">Total Chunks</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Language Distribution */}
                  {stats.language_distribution && Object.keys(stats.language_distribution).length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Language Distribution</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(stats.language_distribution).map(([language, count]) => (
                          <div key={language} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{language}</Badge>
                            </div>
                            <p className="text-sm font-semibold text-foreground">{count} chunks</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chunk Type Distribution */}
                  {stats.chunk_type_distribution && Object.keys(stats.chunk_type_distribution).length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Chunk Type Distribution</p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(stats.chunk_type_distribution).map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {type.replace('_', ' ')}
                              </Badge>
                            </div>
                            <p className="text-sm font-semibold text-foreground">{count} chunks</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {statsError && (
              <Card className="border-yellow-500/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Unable to load repository statistics. Some features may be limited.
                  </p>
              </CardContent>
            </Card>
            )}
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {repository.status === "completed" && (
                  <Button className="w-full" asChild>
                    <Link to={`/chat/${repo_id}`}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Start Chat
                    </Link>
                  </Button>
                )}
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Repository
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the repository
                        "{repository.repo_name}" and all associated chat history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepositoryDetails;

