/** Level system — derived from total all-time points. */

export type LevelInfo = {
  level: number;
  label: string;
  nextAt: number | null; // null when max level
  progress: number;      // 0-100
};

export function getLevel(points: number): LevelInfo {
  if (points >= 1000)
    return { level: 5, label: "Legend",   nextAt: null, progress: 100 };
  if (points >= 500)
    return { level: 4, label: "Expert",   nextAt: 1000, progress: Math.round(((points - 500) / 500) * 100) };
  if (points >= 200)
    return { level: 3, label: "Pro",      nextAt: 500,  progress: Math.round(((points - 200) / 300) * 100) };
  if (points >= 50)
    return { level: 2, label: "Member",   nextAt: 200,  progress: Math.round(((points - 50) / 150) * 100) };
  return   { level: 1, label: "Newcomer", nextAt: 50,   progress: Math.round((points / 50) * 100) };
}
