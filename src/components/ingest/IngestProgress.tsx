import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw, Ban } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  cancelIngestion,
  fetchRepositoryDetails,
  generateEncodedId,
  getIngestionStatus,
  isApiError,
  retryIngestion,
  type IngestionJobStatus,
  type IngestionStage,
  type IngestionStatusResponse,
} from "@/lib/api";

const STAGES: IngestionStage[] = [
  "queued",
  "fetching",
  "parsing",
  "chunking",
  "embedding",
  "finalizing",
];

const ACTIVE_STATUSES: IngestionJobStatus[] = ["pending", "processing"];

function statusBadgeVariant(status: IngestionJobStatus) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "processing":
      return "warning" as const;
    case "failed":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function progressPercent(job: IngestionStatusResponse): number {
  const progress = job.progress;
  const stage = progress?.stage ?? "queued";
  const useChunks = stage === "embedding" || stage === "finalizing";
  if (useChunks && progress?.chunks_total) {
    return Math.min(100, (progress.chunks_embedded / progress.chunks_total) * 100);
  }
  if (progress?.files_total) {
    return Math.min(100, (progress.files_done / progress.files_total) * 100);
  }
  const index = Math.max(0, STAGES.indexOf(stage));
  return ((index + 1) / STAGES.length) * 100;
}

function useIngestionStatus(identifier: string | null) {
  return useQuery({
    queryKey: ["ingestion-status", identifier],
    queryFn: () => getIngestionStatus(identifier!),
    enabled: Boolean(identifier),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE_STATUSES.includes(status) ? 5000 : false;
    },
  });
}

interface IngestProgressProps {
  identifier: string;
  compact?: boolean;
}

export const IngestProgress = ({ identifier, compact = false }: IngestProgressProps) => {
  const queryClient = useQueryClient();
  const { data: job, error, isLoading } = useIngestionStatus(identifier);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ingestion-status"] });
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
  };

  const cancelMutation = useMutation({
    mutationFn: () => cancelIngestion(job!.request_id),
    onSuccess: () => {
      toast.success("Ingestion cancelled");
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to cancel ingestion");
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryIngestion(job!.request_id),
    onSuccess: () => {
      toast.success("Retry initiated", { description: "Ingestion will restart shortly." });
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to retry ingestion");
    },
  });

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${compact ? "" : "py-8 justify-center"}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading ingestion status...
      </div>
    );
  }

  if (error || !job) {
    if (compact && isApiError(error) && error.code === "not_found") {
      return null;
    }
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load ingestion status"}
      </p>
    );
  }

  const stage = job.progress?.stage ?? "queued";
  const isActive = ACTIVE_STATUSES.includes(job.status);
  const showColdStart = job.status === "pending" || stage === "queued";
  const percent = job.status === "completed" ? 100 : progressPercent(job);
  const title = job.owner && job.repo_name ? `${job.owner}/${job.repo_name}` : "Repository";

  const actions = (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
      {isActive && (
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Ban className="mr-2 h-4 w-4" />
          )}
          Cancel
        </Button>
      )}
      {job.status === "failed" && (
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
        >
          {retryMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="mr-2 h-4 w-4" />
          )}
          Retry
        </Button>
      )}
      {job.status === "completed" && job.repo_id && (
        <Button size={compact ? "sm" : "default"} asChild>
          <Link to={`/repositories/${job.repo_id}`}>View repository</Link>
        </Button>
      )}
      {job.status === "cancelled" && !compact && (
        <Button variant="outline" asChild>
          <Link to="/repositories/add">Add another repository</Link>
        </Button>
      )}
      {compact && job.request_id && job.status !== "completed" && (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/ingest/${job.request_id}`}>View job</Link>
        </Button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium capitalize text-foreground">{stage}</p>
          {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
        {job.message && (
          <p className="text-xs text-muted-foreground">{job.message}</p>
        )}
        {isActive && <Progress value={percent} className="h-2" />}
        <p className="text-xs text-muted-foreground">
          Files {job.progress?.files_done ?? 0}/{job.progress?.files_total ?? 0}
          {" · "}
          Chunks {job.progress?.chunks_embedded ?? 0}/{job.progress?.chunks_total ?? 0}
        </p>
        {showColdStart && isActive && (
          <p className="text-xs text-muted-foreground">
            First request after idle can take a minute (cold start).
          </p>
        )}
        {job.error && job.status === "failed" && (
          <p className="text-xs text-destructive">{job.error}</p>
        )}
        {actions}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {job.branch && (
            <p className="text-sm text-muted-foreground">Branch: {job.branch}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium capitalize text-foreground">{stage}</p>
        <p className="text-sm text-muted-foreground">
          {job.message || "Ingestion in progress"}
        </p>
      </div>

      <Progress value={percent} />

      <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
        <div>
          Files {job.progress?.files_done ?? 0} / {job.progress?.files_total ?? 0}
        </div>
        <div>
          Chunks {job.progress?.chunks_embedded ?? 0} / {job.progress?.chunks_total ?? 0}
        </div>
      </div>

      {showColdStart && isActive && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          First request after idle can take a minute (cold start).
        </p>
      )}

      {job.error && job.status === "failed" && (
        <p className="text-sm text-destructive">{job.error}</p>
      )}

      {job.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">This ingestion was cancelled.</p>
      )}

      {actions}
    </div>
  );
};

/** Resolve encoded_id from a repo document so list cards can poll job progress. */
export const RepoIngestProgress = ({ repoId }: { repoId: string }) => {
  const { data } = useQuery({
    queryKey: ["repository", repoId],
    queryFn: () => fetchRepositoryDetails(repoId),
  });

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking job...
      </div>
    );
  }

  const identifier = generateEncodedId(data.owner, data.repo_name, data.branch || "main");
  return <IngestProgress identifier={identifier} compact />;
};
