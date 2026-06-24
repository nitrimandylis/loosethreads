// ponytail: curated topics as a const, not a DB table. Promote to a table when
// you want to manage them from the UI. Each topic owns a region center on the
// infinite canvas; new notes are auto-placed near their topic's center.
export type Topic = {
  id: string;
  label: string;
  cx: number;
  cy: number;
};

export const TOPICS: Topic[] = [
  { id: "celebrities", label: "Celebrities", cx: 0, cy: 0 },
  { id: "tech", label: "Tech", cx: 1600, cy: 0 },
  { id: "politics", label: "Politics", cx: -1600, cy: 0 },
  { id: "local", label: "Local", cx: 0, cy: 1200 },
  { id: "sports", label: "Sports", cx: 1600, cy: 1200 },
  { id: "music", label: "Music", cx: -1600, cy: 1200 },
];

export const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

// Random point inside a topic's region (spread ~±550px around the center).
export function placeInTopic(id: string): { x: number; y: number } {
  const t = topicById(id) ?? TOPICS[0];
  const spread = 550;
  return {
    x: Math.round(t.cx + (Math.random() * 2 - 1) * spread),
    y: Math.round(t.cy + (Math.random() * 2 - 1) * spread),
  };
}
