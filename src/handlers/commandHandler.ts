
import { Client, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client: Client) {
  const commandsPath = join(__dirname, '..', 'commands');
  const commandFolders = readdirSync(commandsPath);

  for (const folder of commandFolders) {
    const folderPath = join(commandsPath, folder);
    const commandFiles = readdirSync(folderPath).filter(file => file.endsWith('.ts'));

    for (const file of commandFiles) {
      const filePath = join(folderPath, file);
      try {
        const commandModule = await import(`file://${filePath}`);
        const command = commandModule.default || commandModule;
        
        if (command && command.name) {
          client.commands.set(command.name, command);
          logger.debug(`Loaded command: ${command.name}`);
        } else {
          logger.warn(`Command file ${file} missing name or default export`);
        }
      } catch (error) {
        logger.error(`Failed to load command ${file}:`, error);
      }
    }
  }

  logger.info(`📝 Loaded ${client.commands.size} commands`);
}
