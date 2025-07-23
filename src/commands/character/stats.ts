import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { formatXp, formatGold, createProgressBar, calculateLevel, getXpToNextLevel } from '../../utils/functions.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'stats',
  description: 'View detailed character statistics',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Get target user (default to command user)
      const targetUser = message.mentions.users.first() || message.author;
      
      // Get player data
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id }
      });

      if (!player) {
        if (targetUser.id === message.author.id) {
          await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        } else {
          await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
        }
        return;
      }

      // Calculate derived stats
      const currentLevel = calculateLevel(player.xp);
      const xpToNext = getXpToNextLevel(player.xp);
      const totalStats = player.str + player.int + player.dex + player.def;
      
      // Calculate combat ratings
      const attackPower = player.str * 2 + Math.floor(player.level * 1.5);
      const magicPower = player.int * 2 + Math.floor(player.level * 1.5);
      const defense = player.def * 1.5 + Math.floor(player.level * 1.2);
      const speed = player.dex * 1.8 + Math.floor(player.level * 1.1);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Detailed Stats - ${player.username}`)
        .setColor(0x4169E1)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          {
            name: '🎯 Core Stats',
            value: 
              `**Level:** ${player.level} (${Math.floor(((player.xp - (currentLevel - 1) ** 2 * 100) / ((currentLevel ** 2 * 100) - ((currentLevel - 1) ** 2 * 100))) * 100)}% progress)\n` +
              `**Experience:** ${formatXp(player.xp)}\n` +
              `**Next Level:** ${xpToNext > 0 ? formatXp(xpToNext) + ' XP needed' : 'MAX LEVEL'}\n` +
              `**Gold:** ${formatGold(player.gold)} 🪙\n` +
              `**ELO Rating:** ${player.elo} 🏆`,
            inline: false
          },
          {
            name: '💪 Attributes',
            value: 
              `**Strength (STR):** ${player.str}\n` +
              `**Intelligence (INT):** ${player.int}\n` +
              `**Dexterity (DEX):** ${player.dex}\n` +
              `**Defense (DEF):** ${player.def}\n` +
              `**Total Stats:** ${totalStats}\n` +
              `**Available Points:** ${player.statPoints}`,
            inline: true
          },
          {
            name: '❤️ Health & Mana',
            value: 
              `**HP:** ${player.hp}/${player.maxHp}\n` +
              `${createProgressBar(player.hp, player.maxHp, 15)}\n\n` +
              `**Mana:** ${player.mana}/${player.maxMana}\n` +
              `${createProgressBar(player.mana, player.maxMana, 15)}`,
            inline: true
          },
          {
            name: '⚔️ Combat Ratings',
            value: 
              `**Attack Power:** ${attackPower}\n` +
              `**Magic Power:** ${magicPower}\n` +
              `**Defense Rating:** ${defense}\n` +
              `**Speed Rating:** ${speed}`,
            inline: true
          },
          {
            name: '🏷️ Character Info',
            value: 
              `**Class:** ${player.className}\n` +
              `${player.pathName ? `**Path:** ${player.pathName}\n` : ''}` +
              `${player.factionId ? `**Faction:** ${player.factionId}\n` : ''}` +
              `**Account Created:** <t:${Math.floor(player.createdAt.getTime() / 1000)}:R>`,
            inline: false
          }
        );

      // Add status effects if any
      let statusText = '';
      if (player.inCombat) statusText += '⚔️ Currently in combat\n';
      if (player.inDungeon) statusText += '🏰 Currently in dungeon\n';
      
      const completedScenarios = JSON.parse(player.completedScenariosJson);
      if (completedScenarios.length > 0) {
        statusText += `✨ Isekai Scenarios Completed: ${completedScenarios.length}/15\n`;
      }

      if (statusText) {
        embed.addFields({
          name: '🔮 Current Status',
          value: statusText,
          inline: false
        });
      }

      // Plagg's analysis
      const plaggAnalysis = this.getPlaggAnalysis(player);
      embed.setFooter({ text: `🧀 Plagg's Analysis: "${plaggAnalysis}"` });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error in stats command:', error);
      await message.reply('🧀 Failed to load stats! The cheese-powered calculator is broken.');
    }
  },

  getPlaggAnalysis(player: any): string {
    const totalStats = player.str + player.int + player.dex + player.def;
    const analyses = [];

    if (player.level >= 25) {
      analyses.push("Impressive level! Almost as impressive as aged Gouda.");
    } else if (player.level >= 15) {
      analyses.push("Getting stronger! Like cheese getting moldier.");
    } else if (player.level < 5) {
      analyses.push("Still a newbie. Fresh cheese, barely developed.");
    }

    if (totalStats > 100) {
      analyses.push("Those are some serious stats!");
    } else if (totalStats < 50) {
      analyses.push("Could use more stat points, like cheese needs more aging.");
    }

    if (player.gold > 10000) {
      analyses.push("Rich enough to buy premium cheese!");
    } else if (player.gold < 100) {
      analyses.push("Broke as a cracker without cheese.");
    }

    if (player.str > player.int + player.dex + player.def) {
      analyses.push("A muscle-head, I see. All brawn, no brain.");
    } else if (player.int > player.str + player.dex + player.def) {
      analyses.push("Smart cookie! Or should I say, smart cheese?");
    } else if (player.dex > player.str + player.int + player.def) {
      analyses.push("Quick as melted cheese on hot bread!");
    }

    return analyses.length > 0 ? analyses[Math.floor(Math.random() * analyses.length)] : "Needs more cheese in their diet.";
  }
};

export default command;
