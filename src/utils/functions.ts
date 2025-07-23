import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadJsonData<T>(filename: string): Promise<T> {
  try {
    const filePath = join(__dirname, '..', 'data', filename);
    const rawData = readFileSync(filePath, 'utf-8');
    return JSON.parse(rawData) as T;
  } catch (error) {
    logger.error(`Failed to load ${filename}:`, error);
    throw new Error(`Could not load data file: ${filename}`);
  }
}

export function formatXp(xp: number): string {
  if (xp >= 1000000) {
    return `${(xp / 1000000).toFixed(1)}M`;
  }
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}K`;
  }
  return xp.toString();
}

export function formatGold(gold: number): string {
  if (gold >= 1000000) {
    return `${(gold / 1000000).toFixed(1)}M`;
  }
  if (gold >= 1000) {
    return `${(gold / 1000).toFixed(1)}K`;
  }
  return gold.toString();
}

export function rollDice(sides: number = 20): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDiceWithModifier(sides: number, modifier: number): number {
  return rollDice(sides) + modifier;
}

export function calculateLevel(xp: number): number {
  // Level formula: level = floor(sqrt(xp / 100)) + 1
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function calculateXpForLevel(level: number): number {
  // Inverse of level formula: xp = (level - 1)^2 * 100
  return Math.pow(level - 1, 2) * 100;
}

export function getXpToNextLevel(currentXp: number): number {
  const currentLevel = calculateLevel(currentXp);
  const nextLevelXp = calculateXpForLevel(currentLevel + 1);
  return nextLevelXp - currentXp;
}

export function createProgressBar(current: number, max: number, length: number = 10): string {
  const percentage = Math.max(0, Math.min(1, current / max));
  const filledBars = Math.floor(percentage * length);
  const emptyBars = length - filledBars;
  
  return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getRarityColor(rarity: string): number {
  const colors = {
    common: 0x808080,    // Gray
    uncommon: 0x00FF00,  // Green
    rare: 0x0080FF,      // Blue
    epic: 0x8000FF,      // Purple
    legendary: 0xFF8000, // Orange
    mythic: 0xFF0080     // Pink
  };
  
  return colors[rarity as keyof typeof colors] || colors.common;
}

export function getRarityEmoji(rarity: string): string {
  const emojis = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟠',
    mythic: '🌟'
  };
  
  return emojis[rarity as keyof typeof emojis] || emojis.common;
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export function isOwner(userId: string): boolean {
  return userId === process.env.OWNER_ID || userId === '1297013439125917766';
}

export function sanitizeInput(input: string): string {
  return input.replace(/[<>@!&]/g, '').trim();
}

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
