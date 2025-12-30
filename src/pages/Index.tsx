import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { Code2, Zap, Shield, GitBranch } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="container py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm text-primary">
            <Zap className="h-4 w-4" />
            <span>AI-Powered Code Understanding</span>
          </div>
          
          <h1 className="mb-6 text-5xl font-bold leading-tight text-foreground md:text-6xl">
            Chat with Your{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Codebase
            </span>
          </h1>
          
          <p className="mb-10 text-lg text-muted-foreground md:text-xl">
            Instantly understand any codebase using AI. Ask questions, explore architecture, 
            and get precise answers with contextual code references.
          </p>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link to="/repositories/add">
                <GitBranch className="mr-2 h-5 w-5" />
                Add Repository
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
              <Link to="/repositories">View Repositories</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border bg-card/50 py-20">
        <div className="container">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground">
                Powerful Features for Developers
              </h2>
              <p className="text-muted-foreground">
                Everything you need to understand and navigate complex codebases
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <FeatureCard
                icon={<Code2 className="h-6 w-6" />}
                title="Smart Code Analysis"
                description="AI-powered understanding of code structure, dependencies, and patterns across your entire repository."
              />
              <FeatureCard
                icon={<Zap className="h-6 w-6" />}
                title="Instant Answers"
                description="Get immediate responses to questions about your code with relevant file references and examples."
              />
              <FeatureCard
                icon={<Shield className="h-6 w-6" />}
                title="Context-Aware"
                description="Retrieval-augmented generation ensures accurate answers grounded in your actual codebase."
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-gradient-card p-12 text-center shadow-lg">
          <h2 className="mb-4 text-3xl font-bold text-foreground">
            Ready to Get Started?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Add your first repository and start chatting with your code in minutes
          </p>
          <Button size="lg" asChild>
            <Link to="/repositories/add">
              <GitBranch className="mr-2 h-5 w-5" />
              Get Started Now
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
  return (
    <div className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-glow">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
        {icon}
      </div>
      <h3 className="mb-2 text-xl font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
};

export default Index;
