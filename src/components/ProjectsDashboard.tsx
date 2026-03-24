import { useAgent } from "@/contexts/AgentContext";
import { FolderKanban, FileText, Users, Clock, ChevronRight } from "lucide-react";

interface Project {
  id: string;
  name: string;
  tasks: number;
  completedTasks: number;
  documents: number;
  contacts: number;
  lastActive: string;
  color: string;
}

const mockProjects: Project[] = [
  {
    id: "1",
    name: "Q3 Partnership Deal",
    tasks: 12,
    completedTasks: 8,
    documents: 5,
    contacts: 3,
    lastActive: "Just now",
    color: "hsl(38 92% 50%)",
  },
  {
    id: "2",
    name: "Product Launch v2",
    tasks: 24,
    completedTasks: 16,
    documents: 12,
    contacts: 7,
    lastActive: "2 hrs ago",
    color: "hsl(210 80% 52%)",
  },
  {
    id: "3",
    name: "Board Meeting Prep",
    tasks: 8,
    completedTasks: 3,
    documents: 4,
    contacts: 5,
    lastActive: "Yesterday",
    color: "hsl(152 60% 40%)",
  },
  {
    id: "4",
    name: "Hiring — Senior Engineer",
    tasks: 6,
    completedTasks: 2,
    documents: 3,
    contacts: 12,
    lastActive: "3 days ago",
    color: "hsl(280 60% 50%)",
  },
];

export const ProjectsDashboard = () => {
  const { agentName } = useAgent();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Projects</h1>
        <p className="text-muted-foreground">
          {agentName} manages context across {mockProjects.length} active projects.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mockProjects.map((project, index) => {
          const progress = Math.round((project.completedTasks / project.tasks) * 100);
          return (
            <div
              key={project.id}
              className="glass-card rounded-2xl p-6 hover:approval-glow transition-all duration-300 cursor-pointer group"
              style={{ animation: `fade-up 0.4s ease-out ${index * 0.1}s both` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <h3 className="font-semibold text-foreground">{project.name}</h3>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{project.completedTasks}/{project.tasks} tasks</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: project.color }}
                  />
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {project.documents}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {project.contacts}
                </span>
                <span className="flex items-center gap-1 ml-auto">
                  <Clock className="w-3 h-3" />
                  {project.lastActive}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
