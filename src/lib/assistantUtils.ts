import type { Task } from '../db/schema';

export const cleanAssistantQuery = (value: string) =>
  value.trim().replace(/^['"“”]|['"“”]$/g, '').trim();

export function matchTasksByTitle(tasks: Task[], query: string): Task[] {
  const normalized = cleanAssistantQuery(query).toLowerCase().replace(/^(the task|task)\s+/i, '').trim();
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return tasks
    .map((task) => {
      const title = task.title.toLowerCase();
      let score = title === normalized ? 100 : title.includes(normalized) ? 80 : 0;
      if (!score) score = words.filter((word) => title.includes(word)).length * 10;
      return { task, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title))
    .map((item) => item.task);
}

export function hasAmbiguousTaskMatch(matches: Task[], query: string): boolean {
  if (matches.length < 2) return false;
  const normalized = cleanAssistantQuery(query).toLowerCase();
  return matches.filter((task) => task.title.trim().toLowerCase() === normalized).length !== 1;
}
