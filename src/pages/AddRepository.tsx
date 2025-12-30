import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { GitBranch, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createIngestionRequest, generateEncodedId } from "@/lib/api";

const AddRepository = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    repo_url: "",
    branch: "main",
    cleanup: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await createIngestionRequest({
        repo_url: formData.repo_url,
        branch: formData.branch,
        cleanup: formData.cleanup,
      });
      
      // Store repo info for status tracking (can regenerate encoded_id from this)
      const repoInfo = {
        owner: response.owner,
        repo_name: response.repo_name,
        branch: response.branch,
        encoded_id: response.encoded_id,
        request_id: response.request_id,
        repo_id: response.repo_id,
      };
      
      // Store in localStorage keyed by repo_id
      localStorage.setItem(`ingestion_repo_${response.repo_id}`, JSON.stringify(repoInfo));
      
      // Also store by encoded_id for easy lookup
      localStorage.setItem(`ingestion_encoded_${response.encoded_id}`, JSON.stringify(repoInfo));
      
      toast.success("Ingestion request created!", {
        description: "Redirecting to repositories page...",
      });
      
      // Redirect immediately to repositories page
      setTimeout(() => {
      navigate("/repositories");
      }, 500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add repository';
      toast.error("Failed to add repository", {
        description: errorMessage,
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
                    placeholder="main"
                    value={formData.branch}
                    onChange={(e) =>
                      setFormData({ ...formData, branch: e.target.value })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Specify which branch to analyze (default: main)
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
                    <li>• Process typically takes 2-5 minutes</li>
                    <li>• You'll be redirected to the repositories page to track progress</li>
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
                      'Add Repository'
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
