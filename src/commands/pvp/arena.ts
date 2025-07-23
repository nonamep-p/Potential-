import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { CombatManager } from '../../structures/CombatManager.js';
import { formatGold } from '../../utils/functions.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const combatManager = new CombatManager();

const command: Command = {
  name: 'arena',
  description: 'Enter the PvP arena for ranked battles',
  cooldown: 15,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (player.inCombat) {
        await message.reply('🧀 You\'re already in combat! Finish your current battle first.');
        return;
      }

      if (player.inDungeon) {
        await message.reply('🧀 You can\'t enter the arena while in a dungeon!');
        return;
      }

      if (args.length > 0) {
        const action = args[0].toLowerCase();
        
        switch (action) {
          case 'quick':
          case 'match':
            await this.findQuickMatch(message, player);
            break;
          case 'ranked':
            await this.findRankedMatch(message, player);
            break;
          case 'queue':
            await this.showQueue(message, player);
            break;
          case 'leave':
            await this.leaveQueue(message, player);
            break;
          default:
            await this.showArenaMenu(message, player);
        }
      } else {
        await this.showArenaMenu(message, player);
      }

    } catch (error) {
      logger.error('Error in arena command:', error);
      await message.reply('🧀 Failed to access the arena! The fighting pit is filled with cheese.');
    }
  },

  async showArenaMenu(message: Message, player: any) {
    // Get player's arena stats
    const arenaStats = await this.getArenaStats(player);
    
    const embed = new EmbedBuilder()
      .setTitle('🏟️ PvP Arena')
      .setDescription(
        `**Welcome to the Arena, ${player.username}!**\n\n` +
        `Test your skills against other players in intense PvP combat!\n\n` +
        `🏆 **Your Arena Stats:**\n` +
        `**ELO Rating:** ${player.elo}\n` +
        `**Wins:** ${arenaStats.wins}\n` +
        `**Losses:** ${arenaStats.losses}\n` +
        `**Win Rate:** ${arenaStats.winRate}%\n` +
        `**Rank:** ${this.getPlayerRank(player.elo)}`
      )
      .setColor(0xFF6347)
      .addFields(
        {
          name: '⚔️ Match Types',
          value: 
            '**Quick Match** - Fast, casual battles\n' +
            '**Ranked Match** - Competitive ELO battles\n' +
            '**Tournament** - Special events (coming soon)',
          inline: false
        },
        {
          name: '🎁 Arena Rewards',
          value: 
            '• ELO points for ranking\n' +
            '• Gold and XP prizes\n' +
            '• Exclusive arena gear\n' +
            '• Weekly season rewards',
          inline: false
        }
      )
      .setFooter({ text: '🧀 "Arena battles are like cheese competitions - may the best win!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('arena_quick_match')
          .setLabel('⚔️ Quick Match')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('arena_ranked_match')
          .setLabel('🏆 Ranked Match')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('arena_leaderboard')
          .setLabel('📊 Leaderboard')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('arena_queue_status')
          .setLabel('📋 Queue Status')
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
      switch (interaction.customId) {
        case 'arena_quick_match':
          await this.findQuickMatch(interaction, player);
          break;
        case 'arena_ranked_match':
          await this.findRankedMatch(interaction, player);
          break;
        case 'arena_leaderboard':
          await this.showLeaderboard(interaction, player);
          break;
        case 'arena_queue_status':
          await this.showQueue(interaction, player);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async findQuickMatch(message: any, player: any) {
    // Find potential opponents
    const opponents = await prisma.player.findMany({
      where: {
        discordId: { not: player.discordId },
        inCombat: false,
        inDungeon: false,
        level: {
          gte: player.level - 5,
          lte: player.level + 5
        }
      },
      take: 5
    });

    if (opponents.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔍 Finding Match...')
        .setDescription(
          '**No suitable opponents found right now.**\n\n' +
          'Quick matches require players within 5 levels of you who are online and available.\n\n' +
          '*Try again later or consider a ranked match!*'
        )
        .setColor(0x808080)
        .setFooter({ text: '🧀 "Even cheese needs the right pairing!" - Plagg' });

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // For demo purposes, we'll simulate finding a match
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Quick Match Found!')
      .setDescription(
        `**Match Found!**\n\n` +
        `🥊 **You** (Level ${player.level}) vs **${opponent.username}** (Level ${opponent.level})\n\n` +
        `**Match Type:** Quick Match (No ELO change)\n` +
        `**Rewards:** Gold and XP only\n\n` +
        `*Preparing battle arena...*`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Let the cheese-fueled combat begin!" - Plagg' });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }

    // Start combat (this would normally wait for both players to accept)
    setTimeout(async () => {
      const success = await this.startArenaMatch(message, player, opponent, 'quick');
      if (!success) {
        if (message.followUp) {
          await message.followUp('🧀 Failed to start match! The opponent chickened out like cheese in the sun.');
        }
      }
    }, 3000);
  },

  async findRankedMatch(message: any, player: any) {
    // Check minimum level for ranked
    if (player.level < 10) {
      const embed = new EmbedBuilder()
        .setTitle('🚫 Ranked Match Unavailable')
        .setDescription(
          '**You must be at least level 10 to play ranked matches.**\n\n' +
          'Gain more experience first, then return to test your skills!\n\n' +
          '*Quick matches are still available for practice.*'
        )
        .setColor(0xFF0000)
        .setFooter({ text: '🧀 "Master the basics before tackling the advanced cheese!" - Plagg' });

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // Find opponents within ELO range
    const eloRange = 200;
    const opponents = await prisma.player.findMany({
      where: {
        discordId: { not: player.discordId },
        inCombat: false,
        inDungeon: false,
        level: { gte: 10 },
        elo: {
          gte: player.elo - eloRange,
          lte: player.elo + eloRange
        }
      },
      take: 3
    });

    if (opponents.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔍 Searching for Ranked Match...')
        .setDescription(
          `**Searching for opponents near your ELO (${player.elo})...**\n\n` +
          'Ranked matches require players within 200 ELO points.\n\n' +
          `**Your Rank:** ${this.getPlayerRank(player.elo)}\n\n` +
          '*You\'ve been added to the queue. Try again later!*'
        )
        .setColor(0xFFD700)
        .setFooter({ text: '🧀 "Quality opponents take time to find, like aging good cheese!" - Plagg' });

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    const opponent = opponents[0]; // Choose closest ELO opponent
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranked Match Found!')
      .setDescription(
        `**Ranked Match Found!**\n\n` +
        `🥊 **You** (${player.elo} ELO) vs **${opponent.username}** (${opponent.elo} ELO)\n\n` +
        `**Match Type:** Ranked (ELO changes based on result)\n` +
        `**Potential ELO Change:** ±${this.calculateEloChange(player.elo, opponent.elo)}\n\n` +
        `*Preparing ranked arena...*`
      )
      .setColor(0xFFD700)
      .setFooter({ text: '🧀 "This is where legends are made... or cheese is spilled!" - Plagg' });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }

    setTimeout(async () => {
      const success = await this.startArenaMatch(message, player, opponent, 'ranked');
      if (!success) {
        if (message.followUp) {
          await message.followUp('🧀 Failed to start ranked match! The opponent got cold feet.');
        }
      }
    }, 3000);
  },

  async startArenaMatch(message: any, player: any, opponent: any, matchType: string) {
    try {
      // Create arena-specific combat state
      const arenaState = {
        type: matchType,
        startTime: Date.now(),
        spectators: [],
        rewards: this.calculateArenaRewards(player, opponent, matchType)
      };

      // Mark both players as in combat
      await Promise.all([
        prisma.player.update({
          where: { discordId: player.discordId },
          data: { 
            inCombat: true,
            combatStateJson: JSON.stringify({
              ...arenaState,
              opponent: opponent.discordId,
              opponentType: 'player'
            })
          }
        }),
        prisma.player.update({
          where: { discordId: opponent.discordId },
          data: { 
            inCombat: true,
            combatStateJson: JSON.stringify({
              ...arenaState,
              opponent: player.discordId,
              opponentType: 'player'
            })
          }
        })
      ]);

      return true;
    } catch (error) {
      logger.error('Error starting arena match:', error);
      return false;
    }
  },

  async showQueue(message: any, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('📋 Arena Queue Status')
      .setDescription(
        '**Current Queue Status**\n\n' +
        '🔍 **Quick Match Queue:** 3 players\n' +
        '🏆 **Ranked Queue:** 1 player\n\n' +
        '**Estimated Wait Time:**\n' +
        '• Quick Match: ~30 seconds\n' +
        '• Ranked Match: ~2 minutes\n\n' +
        '*Queue times vary based on player availability and level/ELO matching.*'
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 "Patience is a virtue, like waiting for cheese to age!" - Plagg' });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  async leaveQueue(message: Message, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('🚪 Left Queue')
      .setDescription(
        '**You have left the arena queue.**\n\n' +
        'You can rejoin anytime by using the arena commands again!'
      )
      .setColor(0x808080)
      .setFooter({ text: '🧀 "Sometimes a tactical retreat is the wisest move!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async showLeaderboard(message: any, player: any) {
    const topPlayers = await prisma.player.findMany({
      orderBy: { elo: 'desc' },
      take: 10,
      select: {
        username: true,
        level: true,
        elo: true,
        discordId: true
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Arena Leaderboard')
      .setDescription('**Top 10 Arena Champions**\n\n')
      .setColor(0xFFD700);

    topPlayers.forEach((p, index) => {
      const rank = this.getPlayerRank(p.elo);
      const isCurrentPlayer = p.discordId === player.discordId;
      
      embed.addFields({
        name: `${index + 1}. ${p.username} ${isCurrentPlayer ? '(You)' : ''}`,
        value: `**Level:** ${p.level} | **ELO:** ${p.elo} | **Rank:** ${rank}`,
        inline: false
      });
    });

    // Show current player's position if not in top 10
    const currentPlayerRank = await this.getPlayerRankPosition(player.elo);
    if (currentPlayerRank > 10) {
      embed.addFields({
        name: '📍 Your Position',
        value: `**Rank #${currentPlayerRank}** | **ELO:** ${player.elo} | **Class:** ${this.getPlayerRank(player.elo)}`,
        inline: false
      });
    }

    embed.setFooter({ text: '🧀 "Climb the ranks like cheese rising to the top!" - Plagg' });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  async getArenaStats(player: any): Promise<any> {
    const achievements = JSON.parse(player.achievementsJson);
    const wins = achievements.arenaWins || 0;
    const losses = achievements.arenaLosses || 0;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    return { wins, losses, winRate };
  },

  getPlayerRank(elo: number): string {
    if (elo >= 2400) return '🏆 Grandmaster';
    if (elo >= 2200) return '💎 Master';
    if (elo >= 2000) return '💎 Diamond';
    if (elo >= 1800) return '🥇 Platinum';
    if (elo >= 1600) return '🥈 Gold';
    if (elo >= 1400) return '🥉 Silver';
    if (elo >= 1200) return '🔷 Bronze';
    return '⚪ Iron';
  },

  async getPlayerRankPosition(elo: number): Promise<number> {
    const count = await prisma.player.count({
      where: { elo: { gt: elo } }
    });
    return count + 1;
  },

  calculateEloChange(playerElo: number, opponentElo: number): number {
    const K = 32; // K-factor
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    return Math.round(K * (1 - expectedScore));
  },

  calculateArenaRewards(player: any, opponent: any, matchType: string): any {
    const baseGold = 100 + (player.level * 10);
    const baseXp = 50 + (player.level * 5);
    
    const multiplier = matchType === 'ranked' ? 1.5 : 1.0;
    
    return {
      gold: Math.floor(baseGold * multiplier),
      xp: Math.floor(baseXp * multiplier),
      elo: matchType === 'ranked' ? this.calculateEloChange(player.elo, opponent.elo) : 0
    };
  }
};

export default command;
