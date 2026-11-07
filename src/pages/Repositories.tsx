import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { GitBranch, Search, Plus, MessageSquare, FileCode, Calendar, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Repository } from "@/lib/types";
import { fetchRepositories, deleteRepository, type ApiRepository, type IngestionJobStatus } from "@/lib/api";
import { RepoIngestProgress } from "@/components/ingest/IngestProgress";

const mapApiRepositoryToRepository = (apiRepo: ApiRepository): Repository => {
  return {
    repo_id: apiRepo.id,
    repo_name: apiRepo.repo_name,
    repo_url: apiRepo.repository_url,
    owner: "",
    branch: "",
    commit_hash: "",
    status: apiRepo.status,
    ingestion_date: apiRepo.created_at,
    file_count: apiRepo.files_processed,
    description: undefined,
  };
};

const Repositories = () => {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 10;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setSkip(0);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["repositories", skip, limit, searchQuery],
    queryFn: () => fetchRepositories({ skip, limit, search: searchQuery }),
  });

  const repositories = useMemo(() => {
    if (!data?.repositories) return [];
    return data.repositories.map(mapApiRepositoryToRepository);
  }, [data]);

  const deleteMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      if (result.success) {
        toast.success("Repository deleted successfully", {
          description: result.message,
        });
      } else {
        toast.warning("Repository deletion completed with warnings", {
          description: result.message,
        });
      }
    },
    onError: (err) => {
      toast.error(`Failed to delete repository: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

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
              onChange={(e) => setSearchInput(e.target.value)}
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
                  onDelete={(repoId) => deleteMutation.mutate(repoId)}
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
}

const RepositoryCard = ({ repository, onDelete }: RepositoryCardProps) => {
  const getStatusColor = (status: IngestionJobStatus) => {
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

  const isActive = repository.status === "processing" || repository.status === "pending";
  const showJobProgress =
    isActive || repository.status === "failed" || repository.status === "cancelled";

  return (
    <Card className={`group flex h-full flex-col transition-all ${isActive ? "opacity-90" : "hover:border-primary/50 hover:shadow-glow"}`}>
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
                {isActive && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                <Badge variant={getStatusColor(repository.status)} className="shrink-0 whitespace-nowrap text-xs">
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
        {showJobProgress && <RepoIngestProgress repoId={repository.repo_id} />}
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
        {isActive ? (
          <Button variant="outline" className="flex-1" disabled>
            View Details
          </Button>
        ) : (
          <Button variant="outline" className="flex-1" asChild>
            <Link to={`/repositories/${repository.repo_id}`}>
              View Details
            </Link>
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
        {!isActive && (
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
