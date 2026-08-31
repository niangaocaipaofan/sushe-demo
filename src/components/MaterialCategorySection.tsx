import type { GenerationTask } from "../types/material-generation";
import { MaterialImageCard } from "./MaterialImageCard";

export function MaterialCategorySection({
  index,
  label,
  tasks,
  onPreview,
}: {
  index: number;
  label: string;
  tasks: GenerationTask[];
  onPreview?: (imageUrl: string, imageLabel: string) => void;
}) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  return (
    <section className="material-category-section">
      <header>
        <h3><span>{String(index + 1).padStart(2, "0")}</span>{label}</h3>
        <small>{completed} / {tasks.length}</small>
      </header>
      <div className="material-category-grid">
        {tasks.map((task) => <MaterialImageCard key={task.taskId} task={task} onPreview={onPreview} />)}
      </div>
    </section>
  );
}
