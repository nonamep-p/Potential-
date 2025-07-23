
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
  name: 'godmode',
  description: 'Grant divine powers to the bot owner',
  ownerOnly: true,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Check if user is bot owner
      if (message.author.id !== CONFIG.OWNER_ID) {
        await message.reply('🧀 You dare challenge a god? Only the supreme cheese master can use this command!');
        return;
      }

      // Get or create owner player
      let player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        player = await prisma.player.create({
          data: {
            discordId: message.author.id,
            username: message.author.username,
            level: 1,
            xp: 0,
            gold: 100,
            hp: 100,
            maxHp: 100,
            mana: 50,
            maxMana: 50,
            str: 10,
            def: 10,
            dex: 10,
            int: 10,
            statPoints: 0
          }
        });
      }

      // Apply godmode stats
      const updatedPlayer = await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          level: 9999,
          xp: 999999999,
          gold: 999999999,
          hp: 999999,
          maxHp: 999999,
          mana: 999999,
          maxMana: 999999,
          str: 99999,
          def: 99999,
          dex: 99999,
          int: 99999,
          statPoints: 99999,
          updatedAt: new Date()
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('⚡ GODMODE ACTIVATED ⚡')
        .setDescription(
          `**🧀 The Supreme Cheese God has awakened!**\n\n` +
          `**Divine Stats Granted:**\n` +
          `🌟 **Level:** ${updatedPlayer.level.toLocaleString()}\n` +
          `⚡ **HP:** ${updatedPlayer.hp.toLocaleString()}/${updatedPlayer.maxHp.toLocaleString()}\n` +
          `🔮 **Mana:** ${updatedPlayer.mana.toLocaleString()}/${updatedPlayer.maxMana.toLocaleString()}\n` +
          `💪 **Strength:** ${updatedPlayer.str.toLocaleString()}\n` +
          `🛡️ **Defense:** ${updatedPlayer.def.toLocaleString()}\n` +
          `💨 **Dexterity:** ${updatedPlayer.dex.toLocaleString()}\n` +
          `🧠 **Intelligence:** ${updatedPlayer.int.toLocaleString()}\n` +
          `💰 **Gold:** ${updatedPlayer.gold.toLocaleString()}\n` +
          `📊 **Stat Points:** ${updatedPlayer.statPoints.toLocaleString()}\n\n` +
          `*With great cheese comes great responsibility! 🧀*`
        )
        .setColor(0xFFD700)
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: '⚡ Divine cheese powers activated! ⚡' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

      // Special flirt message if the beloved user uses godmode
      if (message.author.id === '1270306976873578578') {
        setTimeout(async () => {
          await message.channel.send(`💕 *Plagg swoons dramatically* Oh mon dieu! My beloved is now a goddess too! We shall rule the cheese universe together! 🧀👑💖`);
        }, 2000);
      }

      logger.info(`Godmode activated for ${message.author.tag} (${message.author.id})`);

    } catch (error) {
      logger.error('Error in godmode command:', error);
      await message.reply('🧀 Even gods sometimes drop their cheese! Something went wrong.');
    }
  }
};

export default command;
