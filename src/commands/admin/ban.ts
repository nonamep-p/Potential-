
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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
  name: 'ban',
  description: 'Ban a player from using the bot',
  ownerOnly: true,
  async execute(message: Message, args: string[], client: any) {
    try {
      if (!CONFIG.OWNER_IDS.includes(message.author.id)) {
        await message.reply('🧀 You don\'t have permission to use this command!');
        return;
      }

      if (args.length === 0) {
        await message.reply('🧀 Usage: `$ban <@user or user_id> [reason]`');
        return;
      }

      const targetUser = message.mentions.users.first() || 
                        await client.users.fetch(args[0]).catch(() => null);

      if (!targetUser) {
        await message.reply('🧀 User not found! Please mention a user or provide a valid user ID.');
        return;
      }

      const reason = args.slice(1).join(' ') || 'No reason provided';

      // Check if user exists in database
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id }
      });

      if (!player) {
        await message.reply('🧀 This user is not registered in the RPG system!');
        return;
      }

      if (player.banned) {
        await message.reply('🧀 This user is already banned!');
        return;
      }

      // Ban the user
      await prisma.player.update({
        where: { discordId: targetUser.id },
        data: {
          banned: true,
          banReason: reason,
          bannedAt: new Date(),
          bannedBy: message.author.id
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🚫 Player Banned Successfully')
        .setDescription(
          `**Player:** ${targetUser.username} (${targetUser.id})\n` +
          `**Reason:** ${reason}\n` +
          `**Banned by:** ${message.author.username}\n` +
          `**Date:** ${new Date().toLocaleString()}`
        )
        .setColor(0xFF0000)
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ text: '🧀 Player has been banned from the RPG system' });

      await message.reply({ embeds: [embed] });
      logger.info(`Player ${targetUser.username} (${targetUser.id}) banned by ${message.author.username}`);

    } catch (error) {
      logger.error('Error in ban command:', error);
      await message.reply('🧀 Failed to ban player! Check the logs for details.');
    }
  }
};

export default command;
