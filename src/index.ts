import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { CONFIG } from './config';
import { logger } from './utils/logger';
import { setupDatabase } from './database/connection';
import { loadCommands } from './handlers/commandHandler';
import { setupEvents } from './handlers/eventHandler';
import { startKeepAlive } from './keep_alive';
import { TimedEventHandler } from './structures/TimedEventHandler';

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Add commands collection to client
client.commands = new Collection();

async function startBot() {
  try {
    logger.info('🧀 Starting Plagg Bot - The Final Testament...');

    // Initialize database
    await setupDatabase();
    logger.info('✅ Database connection established');

    // Load commands
    await loadCommands(client);
    logger.info('✅ Commands loaded');

    // Setup event handlers
    setupEvents(client);
    logger.info('✅ Event handlers registered');

    // Start timed event handler for auctions, etc.
    const timedEventHandler = new TimedEventHandler();
    timedEventHandler.start();
    logger.info('✅ Timed events started');

    // Start keep-alive server for Replit
    startKeepAlive();
    logger.info('✅ Keep-alive server started');

    // Login to Discord
    await client.login(CONFIG.TOKEN);
    logger.info('🚀 Plagg Bot is now online!');

  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down Plagg Bot...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down Plagg Bot...');
  client.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception:', error);
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection at:', promise, 'reason:', reason);
  setTimeout(() => process.exit(1), 500);
});

// Start the bot
startBot();

// Extend the Discord.js Client type
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>;
  }
}
