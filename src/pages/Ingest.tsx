import { Link, useParams } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { IngestProgress } from "@/components/ingest/IngestProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const Ingest = () => {
  const { request_id } = useParams();

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
              <CardTitle className="text-2xl">Ingestion progress</CardTitle>
            </CardHeader>
            <CardContent>
              {request_id ? (
                <IngestProgress identifier={request_id} />
              ) : (
                <p className="text-sm text-destructive">Missing ingestion request id.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Ingest;
