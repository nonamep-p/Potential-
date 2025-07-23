import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { formatXp, formatGold } from '../../utils/functions.js';
import { Paginator } from '../../structures/Paginator.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'leaderboard',
  description: 'View various player rankings and leaderboards',
  cooldown: 10,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      let category = 'level';
      if (args.length > 0) {
        category = args[0].toLowerCase();
      }

      switch (category) {
        case 'level':
        case 'lvl':
          await this.showLevelLeaderboard(message, player);
          break;
        case 'elo':
        case 'pvp':
          await this.showEloLeaderboard(message, player);
          break;
        case 'gold':
        case 'wealth':
          await this.showGoldLeaderboard(message, player);
          break;
        case 'stats':
          await this.showStatsLeaderboard(message, player);
          break;
        case 'achievements':
        case 'achieve':
          await this.showAchievementLeaderboard(message, player);
          break;
        default:
          await this.showLeaderboardMenu(message, player);
      }

    } catch (error) {
      logger.error('Error in leaderboard command:', error);
      await message.reply('🧀 Failed to access leaderboards! The rankings are covered in cheese fingerprints.');
    }
  },

  async showLeaderboardMenu(message: Message, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Leaderboards')
      .setDescription(
        `**Choose a leaderboard category to view!**\n\n` +
        `📊 **Available Categories:**\n` +
        `🎯 **Level** - Highest level players\n` +
        `⚔️ **ELO** - PvP rankings\n` +
        `💰 **Gold** - Wealthiest players\n` +
        `💪 **Stats** - Strongest players\n` +
        `🏅 **Achievements** - Most accomplished players\n\n` +
        `*Use \`$leaderboard <category>\` to view specific rankings.*`
      )
      .setColor(0xFFD700)
      .setFooter({ text: '🧀 "Competition brings out the best in cheese and people!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('leaderboard_level')
          .setLabel('🎯 Level')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('leaderboard_elo')
          .setLabel('⚔️ ELO')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('leaderboard_gold')
          .setLabel('💰 Gold')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('leaderboard_stats')
          .setLabel('💪 Stats')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      const category = interaction.customId.replace('leaderboard_', '');
      
      switch (category) {
        case 'level':
          await this.showLevelLeaderboard(interaction, player);
          break;
        case 'elo':
          await this.showEloLeaderboard(interaction, player);
          break;
        case 'gold':
          await this.showGoldLeaderboard(interaction, player);
          break;
        case 'stats':
          await this.showStatsLeaderboard(interaction, player);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async showLevelLeaderboard(message: any, currentPlayer: any) {
    const topPlayers = await prisma.player.findMany({
      orderBy: { level: 'desc' },
      take: 50,
      select: {
        discordId: true,
        username: true,
        level: true,
        xp: true,
        className: true,
        pathName: true
      }
    });

    const embeds = [];
    const playersPerPage = 10;

    for (let i = 0; i < topPlayers.length; i += playersPerPage) {
      const pageNumber = Math.floor(i / playersPerPage) + 1;
      const pageData = topPlayers.slice(i, i + playersPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('🎯 Level Leaderboard')
        .setDescription('**Top players by level**\n')
        .setColor(0x4169E1)
        .setFooter({ text: `Page ${pageNumber} • 🧀 "Level up like aging cheese!" - Plagg` });

      pageData.forEach((player, index) => {
        const globalRank = i + index + 1;
        const isCurrentPlayer = player.discordId === currentPlayer.discordId;
        const medal = this.getRankMedal(globalRank);
        
        embed.addFields({
          name: `${medal} #${globalRank} ${player.username} ${isCurrentPlayer ? '(You)' : ''}`,
          value: 
            `**Level:** ${player.level}\n` +
            `**XP:** ${formatXp(player.xp)}\n` +
            `**Class:** ${player.className}${player.pathName ? ` - ${player.pathName}` : ''}`,
          inline: true
        });
      });

      embeds.push(embed);
    }

    // Add current player's position if not in top 50
    const currentPlayerRank = await this.getPlayerRank(currentPlayer.discordId, 'level');
    if (currentPlayerRank > 50) {
      const playerEmbed = new EmbedBuilder()
        .setTitle('📍 Your Position')
        .setDescription(
          `**Your Rank:** #${currentPlayerRank}\n` +
          `**Level:** ${currentPlayer.level}\n` +
          `**XP:** ${formatXp(currentPlayer.xp)}\n\n` +
          `*Keep leveling up to climb the rankings!*`
        )
        .setColor(0x8B4513);
      
      embeds.push(playerEmbed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    if (message.update) {
      await message.update({ embeds: [embeds[0]], components: [] });
      setTimeout(() => paginator.start(message.message || message), 100);
    } else {
      await paginator.start(message);
    }
  },

  async showEloLeaderboard(message: any, currentPlayer: any) {
    const topPlayers = await prisma.player.findMany({
      orderBy: { elo: 'desc' },
      take: 50,
      where: { level: { gte: 10 } }, // Only show players eligible for ranked
      select: {
        discordId: true,
        username: true,
        level: true,
        elo: true,
        className: true,
        achievementsJson: true
      }
    });

    const embeds = [];
    const playersPerPage = 10;

    for (let i = 0; i < topPlayers.length; i += playersPerPage) {
      const pageNumber = Math.floor(i / playersPerPage) + 1;
      const pageData = topPlayers.slice(i, i + playersPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('⚔️ PvP ELO Leaderboard')
        .setDescription('**Top PvP fighters by ELO rating**\n')
        .setColor(0xFF0000)
        .setFooter({ text: `Page ${pageNumber} • 🧀 "PvP mastery is like cheese making - it takes skill!" - Plagg` });

      pageData.forEach((player, index) => {
        const globalRank = i + index + 1;
        const isCurrentPlayer = player.discordId === currentPlayer.discordId;
        const medal = this.getRankMedal(globalRank);
        const tier = this.getEloTier(player.elo);
        
        const achievements = JSON.parse(player.achievementsJson);
        const wins = achievements.arenaWins || 0;
        const losses = achievements.arenaLosses || 0;
        const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
        
        embed.addFields({
          name: `${medal} #${globalRank} ${player.username} ${isCurrentPlayer ? '(You)' : ''}`,
          value: 
            `**ELO:** ${player.elo} (${tier})\n` +
            `**Level:** ${player.level} ${player.className}\n` +
            `**Record:** ${wins}W/${losses}L (${winRate}%)`,
          inline: true
        });
      });

      embeds.push(embed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    if (message.update) {
      await message.update({ embeds: [embeds[0]], components: [] });
      setTimeout(() => paginator.start(message.message || message), 100);
    } else {
      await paginator.start(message);
    }
  },

  async showGoldLeaderboard(message: any, currentPlayer: any) {
    const topPlayers = await prisma.player.findMany({
      orderBy: { gold: 'desc' },
      take: 50,
      select: {
        discordId: true,
        username: true,
        level: true,
        gold: true,
        className: true,
        achievementsJson: true
      }
    });

    const embeds = [];
    const playersPerPage = 10;

    for (let i = 0; i < topPlayers.length; i += playersPerPage) {
      const pageNumber = Math.floor(i / playersPerPage) + 1;
      const pageData = topPlayers.slice(i, i + playersPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('💰 Wealth Leaderboard')
        .setDescription('**Richest players in the realm**\n')
        .setColor(0xFFD700)
        .setFooter({ text: `Page ${pageNumber} • 🧀 "Money can't buy happiness, but it can buy cheese!" - Plagg` });

      pageData.forEach((player, index) => {
        const globalRank = i + index + 1;
        const isCurrentPlayer = player.discordId === currentPlayer.discordId;
        const medal = this.getRankMedal(globalRank);
        
        const achievements = JSON.parse(player.achievementsJson);
        const totalSpent = achievements.goldSpent || 0;
        
        embed.addFields({
          name: `${medal} #${globalRank} ${player.username} ${isCurrentPlayer ? '(You)' : ''}`,
          value: 
            `**Gold:** ${formatGold(player.gold)}\n` +
            `**Level:** ${player.level} ${player.className}\n` +
            `**Total Spent:** ${formatGold(totalSpent)}`,
          inline: true
        });
      });

      embeds.push(embed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    if (message.update) {
      await message.update({ embeds: [embeds[0]], components: [] });
      setTimeout(() => paginator.start(message.message || message), 100);
    } else {
      await paginator.start(message);
    }
  },

  async showStatsLeaderboard(message: any, currentPlayer: any) {
    // Get players with highest total stats
    const players = await prisma.player.findMany({
      select: {
        discordId: true,
        username: true,
        level: true,
        str: true,
        int: true,
        dex: true,
        def: true,
        className: true,
        pathName: true
      }
    });

    // Calculate total stats and sort
    const playersWithTotalStats = players.map(player => ({
      ...player,
      totalStats: player.str + player.int + player.dex + player.def
    })).sort((a, b) => b.totalStats - a.totalStats).slice(0, 50);

    const embeds = [];
    const playersPerPage = 10;

    for (let i = 0; i < playersWithTotalStats.length; i += playersPerPage) {
      const pageNumber = Math.floor(i / playersPerPage) + 1;
      const pageData = playersWithTotalStats.slice(i, i + playersPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('💪 Total Stats Leaderboard')
        .setDescription('**Players with the highest combined stats**\n')
        .setColor(0x8B0000)
        .setFooter({ text: `Page ${pageNumber} • 🧀 "Strong stats are like strong cheese - aged to perfection!" - Plagg` });

      pageData.forEach((player, index) => {
        const globalRank = i + index + 1;
        const isCurrentPlayer = player.discordId === currentPlayer.discordId;
        const medal = this.getRankMedal(globalRank);
        
        embed.addFields({
          name: `${medal} #${globalRank} ${player.username} ${isCurrentPlayer ? '(You)' : ''}`,
          value: 
            `**Total Stats:** ${player.totalStats}\n` +
            `**STR:** ${player.str} | **INT:** ${player.int}\n` +
            `**DEX:** ${player.dex} | **DEF:** ${player.def}\n` +
            `**Class:** ${player.className}${player.pathName ? ` - ${player.pathName}` : ''}`,
          inline: true
        });
      });

      embeds.push(embed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    if (message.update) {
      await message.update({ embeds: [embeds[0]], components: [] });
      setTimeout(() => paginator.start(message.message || message), 100);
    } else {
      await paginator.start(message);
    }
  },

  async showAchievementLeaderboard(message: any, currentPlayer: any) {
    const players = await prisma.player.findMany({
      select: {
        discordId: true,
        username: true,
        level: true,
        className: true,
        achievementsJson: true,
        completedScenariosJson: true
      }
    });

    // Calculate achievement scores
    const playersWithScores = players.map(player => {
      const achievements = JSON.parse(player.achievementsJson);
      const scenarios = JSON.parse(player.completedScenariosJson);
      
      let score = 0;
      score += (achievements.itemsCrafted || 0) * 2;
      score += (achievements.monstersKilled || 0) * 1;
      score += (achievements.arenaWins || 0) * 5;
      score += (achievements.dungeonsCompleted || 0) * 10;
      score += scenarios.length * 20; // Isekai scenarios worth more
      score += player.level * 3;
      
      return {
        ...player,
        achievementScore: score,
        scenarios: scenarios.length
      };
    }).sort((a, b) => b.achievementScore - a.achievementScore).slice(0, 50);

    const embeds = [];
    const playersPerPage = 10;

    for (let i = 0; i < playersWithScores.length; i += playersPerPage) {
      const pageNumber = Math.floor(i / playersPerPage) + 1;
      const pageData = playersWithScores.slice(i, i + playersPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('🏅 Achievement Leaderboard')
        .setDescription('**Most accomplished adventurers**\n')
        .setColor(0x800080)
        .setFooter({ text: `Page ${pageNumber} • 🧀 "Achievements are like cheese medals - earned through dedication!" - Plagg` });

      pageData.forEach((player, index) => {
        const globalRank = i + index + 1;
        const isCurrentPlayer = player.discordId === currentPlayer.discordId;
        const medal = this.getRankMedal(globalRank);
        
        embed.addFields({
          name: `${medal} #${globalRank} ${player.username} ${isCurrentPlayer ? '(You)' : ''}`,
          value: 
            `**Achievement Score:** ${player.achievementScore}\n` +
            `**Level:** ${player.level} ${player.className}\n` +
            `**Isekai Scenarios:** ${player.scenarios}/15`,
          inline: true
        });
      });

      embeds.push(embed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    if (message.update) {
      await message.update({ embeds: [embeds[0]], components: [] });
      setTimeout(() => paginator.start(message.message || message), 100);
    } else {
      await paginator.start(message);
    }
  },

  getRankMedal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank <= 10) return '🏆';
    if (rank <= 25) return '🎖️';
    return '📊';
  },

  getEloTier(elo: number): string {
    if (elo >= 2400) return 'Grandmaster';
    if (elo >= 2200) return 'Master';
    if (elo >= 2000) return 'Diamond';
    if (elo >= 1800) return 'Platinum';
    if (elo >= 1600) return 'Gold';
    if (elo >= 1400) return 'Silver';
    if (elo >= 1200) return 'Bronze';
    return 'Iron';
  },

  async getPlayerRank(playerId: string, category: string): Promise<number> {
    let orderBy: any = {};
    
    switch (category) {
      case 'level':
        orderBy = { level: 'desc' };
        break;
      case 'elo':
        orderBy = { elo: 'desc' };
        break;
      case 'gold':
        orderBy = { gold: 'desc' };
        break;
    }

    const playersAbove = await prisma.player.count({
      where: {
        [category]: {
          gt: await prisma.player.findUnique({
            where: { discordId: playerId },
            select: { [category]: true }
          }).then(p => p?.[category as keyof typeof p] || 0)
        }
      }
    });

    return playersAbove + 1;
  }
};

export default command;
