
import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { CONFIG } from '../../config';

interface Command {
  name: string;
  description: string;
  ownerOnly: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'unban',
  description: 'Unban a player from the bot',
  ownerOnly: true,
  async execute(message: Message, args: string[], client: any) {
    try {
      if (!CONFIG.OWNER_IDS.includes(message.author.id)) {
        await message.reply('🧀 You don\'t have permission to use this command!');
        return;
      }

      if (args.length === 0) {
        await message.reply('🧀 Usage: `$unban <@user or user_id>`');
        return;
      }

      const targetUser = message.mentions.users.first() || 
                        await client.users.fetch(args[0]).catch(() => null);

      if (!targetUser) {
        await message.reply('🧀 User not found! Please mention a user or provide a valid user ID.');
        return;
      }

      // Check if user exists and is banned
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id }
      });

      if (!player) {
        await message.reply('🧀 This user is not registered in the RPG system!');
        return;
      }

      if (!player.banned) {
        await message.reply('🧀 This user is not banned!');
        return;
      }

      // Unban the user
      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: {
          banned: false,
          banReason: null,
          bannedAt: null,
          bannedBy: null
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Player Unbanned Successfully')
        .setDescription(
          `**Player:** ${targetUser.username} (${targetUser.id})\n` +
          `**Unbanned by:** ${message.author.username}\n` +
          `**Date:** ${new Date().toLocaleString()}`
        )
        .setColor(0x00FF00)
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ text: '🧀 Player can now use the RPG system again' });

      await message.reply({ embeds: [embed] });
      logger.info(`Player ${targetUser.username} (${targetUser.id}) unbanned by ${message.author.username}`);

    } catch (error) {
      logger.error('Error in unban command:', error);
      await message.reply('🧀 Failed to unban player! Check the logs for details.');
    }
  }
};

export default command;
