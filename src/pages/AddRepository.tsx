import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { GitBranch, ArrowLeft, Loader2 } from "lucide-react";
import { conflictIngestRequestId, createIngestionRequest } from "@/lib/api";

const AddRepository = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    repo_url: "",
    branch: "",
    cleanup: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await createIngestionRequest({
        repo_url: formData.repo_url,
        branch: formData.branch.trim() || undefined,
        cleanup: formData.cleanup,
      });

      if (response.status === "completed" && response.repo_id) {
        toast.success("Repository already indexed");
        navigate(`/repositories/${response.repo_id}`);
        return;
      }

      if (response.request_id) {
        toast.success("Ingestion started");
        navigate(`/ingest/${response.request_id}`);
        return;
      }

      toast.error("Ingestion did not return a request id");
      setIsLoading(false);
    } catch (error) {
      const existingId = conflictIngestRequestId(error);
      if (existingId) {
        toast.info("Ingestion already in progress");
        navigate(`/ingest/${existingId}`);
        return;
      }

      toast.error("Failed to add repository", {
        description: error instanceof Error ? error.message : "Failed to add repository",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container py-8">
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/repositories">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Repositories
          </Link>
        </Button>

        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Add Repository</CardTitle>
                  <CardDescription>
                    Connect a GitHub repository to start chatting with your code
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="repo_url">Repository URL *</Label>
                  <Input
                    id="repo_url"
                    placeholder="https://github.com/username/repository"
                    value={formData.repo_url}
                    onChange={(e) =>
                      setFormData({ ...formData, repo_url: e.target.value })
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the full GitHub repository URL
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    placeholder="Leave empty for the GitHub default branch"
                    value={formData.branch}
                    onChange={(e) =>
                      setFormData({ ...formData, branch: e.target.value })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Optional. Omit to use the repository default branch.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="cleanup"
                      checked={formData.cleanup}
                      onChange={(e) =>
                        setFormData({ ...formData, cleanup: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    <Label htmlFor="cleanup" className="cursor-pointer">
                      Cleanup existing data before ingestion
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">
                    Remove existing repository data before processing (recommended for updates)
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <h4 className="mb-2 font-semibold text-foreground">What happens next?</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Repository will be cloned and analyzed</li>
                    <li>• Code embeddings will be generated using AI</li>
                    <li>• Files will be indexed for semantic search</li>
                    <li>• You can cancel while the job is queued or running</li>
                    <li>• First request after idle can take a minute (cold start)</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Request...
                      </>
                    ) : (
                      "Add Repository"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/repositories")}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AddRepository;
