import { z } from 'zod';

// Base item schema
export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['weapon', 'armor', 'consumable', 'artifact', 'material']),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']),
  description: z.string(),
  plaggComment: z.string(),
  value: z.number().optional(),
  level: z.number().optional(),
  stats: z.record(z.number()).optional(),
  effects: z.array(z.string()).optional(),
  stackable: z.boolean().optional(),
});

// Monster schema
export const MonsterSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  hp: z.number(),
  str: z.number(),
  int: z.number(),
  dex: z.number(),
  def: z.number(),
  xpReward: z.number(),
  goldReward: z.number(),
  lootTable: z.array(z.object({
    itemId: z.string(),
    chance: z.number(),
    quantity: z.number().optional(),
  })),
  weaknesses: z.array(z.string()).optional(),
  resistances: z.array(z.string()).optional(),
  plaggComment: z.string(),
});

// Dungeon schema
export const DungeonSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  minLevel: z.number(),
  maxLevel: z.number(),
  floors: z.number(),
  encounters: z.array(z.object({
    type: z.enum(['monster', 'trap', 'treasure', 'boss']),
    id: z.string(),
    chance: z.number(),
  })),
  rewards: z.array(z.object({
    itemId: z.string(),
    chance: z.number(),
    quantity: z.number().optional(),
  })),
  plaggComment: z.string(),
});

// Recipe schema
export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  result: z.object({
    itemId: z.string(),
    quantity: z.number(),
  }),
  materials: z.array(z.object({
    itemId: z.string(),
    quantity: z.number(),
  })),
  level: z.number(),
  plaggComment: z.string(),
});

// Faction schema
export const FactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  buffs: z.record(z.number()),
  color: z.string(),
  plaggComment: z.string(),
});

// Achievement schema
export const AchievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  requirements: z.record(z.any()),
  rewards: z.object({
    xp: z.number().optional(),
    gold: z.number().optional(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number(),
    })).optional(),
  }),
  plaggComment: z.string(),
});

// Pet schema
export const PetSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  stats: z.object({
    hp: z.number(),
    str: z.number(),
    int: z.number(),
    dex: z.number(),
    def: z.number(),
  }),
  abilities: z.array(z.string()),
  plaggComment: z.string(),
});

// Housing item schema
export const HousingItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['furniture', 'decoration', 'utility']),
  cost: z.number(),
  effects: z.record(z.number()).optional(),
  plaggComment: z.string(),
});

// World event schema
export const WorldEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  duration: z.number(),
  effects: z.record(z.number()),
  requirements: z.record(z.any()).optional(),
  plaggComment: z.string(),
});

// Isekai scenario schema
export const IsekaiScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  trigger: z.object({
    type: z.string(),
    conditions: z.record(z.any()),
  }),
  rewards: z.object({
    permanent: z.boolean(),
    effects: z.record(z.any()),
  }),
  plaggComment: z.string(),
});

// Export types
export type Item = z.infer<typeof ItemSchema>;
export type Monster = z.infer<typeof MonsterSchema>;
export type Dungeon = z.infer<typeof DungeonSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type Pet = z.infer<typeof PetSchema>;
export type HousingItem = z.infer<typeof HousingItemSchema>;
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type IsekaiScenario = z.infer<typeof IsekaiScenarioSchema>;

// Player data types
export interface PlayerInventory {
  itemId: string;
  quantity: number;
}

export interface PlayerEquipment {
  weapon?: string;
  armor?: string;
  accessory?: string;
}

export interface CombatState {
  opponent?: string;
  opponentType: 'monster' | 'player';
  turn: 'player' | 'opponent';
  playerHp: number;
  opponentHp: number;
  buffs: Record<string, number>;
  debuffs: Record<string, number>;
}

export interface DungeonState {
  dungeonId: string;
  floor: number;
  hp: number;
  buffs: Record<string, number>;
  completedRooms: number;
}
