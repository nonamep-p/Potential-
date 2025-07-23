import { z } from 'zod';

const ConfigSchema = z.object({
  TOKEN: z.string().min(1, 'Discord token is required'),
  GEMINI_API_KEY: z.string().min(1, 'Gemini API key is required'),
  OWNER_ID: z.string().min(1, 'Owner ID is required'),
  OWNER_IDS: z.array(z.string()).default([]),
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  PREFIX: z.string().default('$'),
  DATABASE_PATH: z.string().default('./data/plagg.db'),
});

function loadConfig() {
  try {
    const config = {
      TOKEN: process.env.DISCORD_TOKEN || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      OWNER_ID: process.env.OWNER_ID || '1297013439125917766',
      OWNER_IDS: ['1297013439125917766'],
      NODE_ENV: process.env.NODE_ENV || 'production',
      PREFIX: process.env.PREFIX || '$',
      DATABASE_PATH: process.env.DATABASE_PATH || './data/plagg.db',
    };

    return ConfigSchema.parse(config);
  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    process.exit(1);
  }
}

export const CONFIG = loadConfig();