import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { formatXp, formatGold, createProgressBar, calculateLevel, getXpToNextLevel, getRarityEmoji } from '../../utils/functions.js';
import { loadJsonData } from '../../utils/functions.js';
import { Item } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'view',
  description: 'View another player\'s profile and stats',
  cooldown: 5,
  async execute(message: Message, args: string[], client: any) {
    try {
      const viewer = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!viewer) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      let targetUser = message.mentions.users.first();
      let targetPlayer;

      if (!targetUser && args.length > 0) {
        // Search by username
        const username = args.join(' ').toLowerCase();
        targetPlayer = await prisma.player.findFirst({
          where: {
            username: {
              contains: username
            }
          }
        });

        if (targetPlayer) {
          // Get Discord user from client
          try {
            targetUser = await client.users.fetch(targetPlayer.discordId);
          } catch (error) {
            // User might have left Discord or blocked the bot
          }
        }
      } else if (targetUser) {
        targetPlayer = await prisma.player.findUnique({
          where: { discordId: targetUser.id }
        });
      }

      if (!targetUser && !targetPlayer) {
        await message.reply('🧀 Please mention a player or provide their username! Example: `$view @player` or `$view username`');
        return;
      }

      if (!targetPlayer) {
        await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
        return;
      }

      if (targetPlayer.discordId === message.author.id) {
        await message.reply('🧀 You want to view yourself? Use `$profile` instead! Unless you\'re having an identity crisis...');
        return;
      }

      await this.showPlayerProfile(message, viewer, targetPlayer, targetUser);

    } catch (error) {
      logger.error('Error in view command:', error);
      await message.reply('🧀 Failed to view player profile! The profile viewer is covered in cheese smudges.');
    }
  },

  async showPlayerProfile(message: Message, viewer: any, targetPlayer: any, targetUser: any) {
    // Parse JSON data
    const inventory = JSON.parse(targetPlayer.inventoryJson);
    const equipment = JSON.parse(targetPlayer.equipmentJson);
    const completedScenarios = JSON.parse(targetPlayer.completedScenariosJson);
    const achievements = JSON.parse(targetPlayer.achievementsJson);

    // Load item data
    const [weapons, armor, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...artifacts];

    // Get equipped items
    const equippedWeapon = equipment.weapon ? allItems.find(item => item.id === equipment.weapon) : null;
    const equippedArmor = equipment.armor ? allItems.find(item => item.id === equipment.armor) : null;
    const equippedAccessory = equipment.accessory ? allItems.find(item => item.id === equipment.accessory) : null;

    // Calculate level and XP progress
    const currentLevel = calculateLevel(targetPlayer.xp);
    const xpToNext = getXpToNextLevel(targetPlayer.xp);

    // Determine what information to show based on friendship/relationship
    const relationship = this.getRelationship(viewer, targetPlayer);
    const showPrivateInfo = relationship === 'friend' || relationship === 'faction_mate';

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${targetPlayer.username}'s Profile`)
      .setDescription(
        `${targetPlayer.discordId === process.env.OWNER_ID ? '👑 **[THE CHOSEN ONE]**\n' : ''}` +
        `**Class:** ${targetPlayer.className}\n` +
        `${targetPlayer.pathName ? `**Path:** ${targetPlayer.pathName}\n` : ''}` +
        `${targetPlayer.factionId ? `**Faction:** ${targetPlayer.factionId}\n` : ''}` +
        `${this.getOnlineStatus(targetPlayer)}`
      )
      .setColor(targetPlayer.discordId === process.env.OWNER_ID ? 0xFFD700 : 0x8B4513)
      .setThumbnail(targetUser?.displayAvatarURL() || null)
      .addFields(
        {
          name: '📊 Public Stats',
          value: 
            `**Level:** ${targetPlayer.level}\n` +
            `**ELO Rating:** ${targetPlayer.elo} 🏆\n` +
            `**Class:** ${targetPlayer.className}\n` +
            `**Total Stats:** ${targetPlayer.str + targetPlayer.int + targetPlayer.dex + targetPlayer.def}`,
          inline: true
        },
        {
          name: '🏅 Achievements',
          value: 
            `**Isekai Scenarios:** ${completedScenarios.length}/15\n` +
            `**PvP Wins:** ${achievements.arenaWins || 0}\n` +
            `**Dungeons Completed:** ${achievements.dungeonsCompleted || 0}\n` +
            `**Items Crafted:** ${achievements.itemsCrafted || 0}`,
          inline: true
        }
      );

    // Show equipment if visible
    if (equippedWeapon || equippedArmor || equippedAccessory) {
      let equipmentText = '';
      if (equippedWeapon) {
        equipmentText += `**Weapon:** ${getRarityEmoji(equippedWeapon.rarity)} ${equippedWeapon.name}\n`;
      }
      if (equippedArmor) {
        equipmentText += `**Armor:** ${getRarityEmoji(equippedArmor.rarity)} ${equippedArmor.name}\n`;
      }
      if (equippedAccessory) {
        equipmentText += `**Accessory:** ${getRarityEmoji(equippedAccessory.rarity)} ${equippedAccessory.name}\n`;
      }
      
      embed.addFields({
        name: '⚔️ Equipment',
        value: equipmentText || 'No visible equipment',
        inline: false
      });
    }

    // Show detailed stats if friends or faction mates
    if (showPrivateInfo) {
      embed.addFields({
        name: '💪 Detailed Stats (Friend Access)',
        value: 
          `**STR:** ${targetPlayer.str} | **INT:** ${targetPlayer.int}\n` +
          `**DEX:** ${targetPlayer.dex} | **DEF:** ${targetPlayer.def}\n` +
          `**HP:** ${targetPlayer.hp}/${targetPlayer.maxHp}\n` +
          `**XP:** ${formatXp(targetPlayer.xp)} (${xpToNext > 0 ? `${formatXp(xpToNext)} to next` : 'MAX'})`,
        inline: true
      });

      if (targetPlayer.gold && relationship === 'friend') {
        embed.addFields({
          name: '💰 Wealth (Friend Access)',
          value: `**Gold:** ${formatGold(targetPlayer.gold)}`,
          inline: true
        });
      }
    }

    // Show status indicators
    let statusText = '';
    if (targetPlayer.inCombat) statusText += '⚔️ In Combat\n';
    if (targetPlayer.inDungeon) statusText += '🏰 In Dungeon\n';
    
    const rank = this.getPlayerRank(targetPlayer.elo);
    statusText += `**Rank:** ${rank}`;
    
    embed.addFields({
      name: '🔮 Status',
      value: statusText,
      inline: false
    });

    // Add comparison if both are similar level
    if (Math.abs(viewer.level - targetPlayer.level) <= 5) {
      embed.addFields({
        name: '⚖️ Comparison',
        value: this.getComparison(viewer, targetPlayer),
        inline: false
      });
    }

    // Add Plagg's comment
    const plaggComment = this.getPlaggComment(targetPlayer, viewer);
    embed.setFooter({ text: `🧀 Plagg says: "${plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('view_achievements')
          .setLabel('🏅 Achievements')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('view_compare')
          .setLabel('⚖️ Compare')
          .setStyle(ButtonStyle.Secondary)
      );

    // Add interaction buttons if appropriate
    if (!targetPlayer.inCombat && !viewer.inCombat) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('challenge_player')
          .setLabel('⚔️ Challenge')
          .setStyle(ButtonStyle.Danger)
      );
    }

    if (!this.getActiveTradeForPlayer(viewer.discordId) && !this.getActiveTradeForPlayer(targetPlayer.discordId)) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('trade_player')
          .setLabel('🤝 Trade')
          .setStyle(ButtonStyle.Success)
      );
    }

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
        case 'view_achievements':
          await this.showDetailedAchievements(interaction, targetPlayer);
          break;
        case 'view_compare':
          await this.showDetailedComparison(interaction, viewer, targetPlayer);
          break;
        case 'challenge_player':
          await this.initiatePvPChallenge(interaction, viewer, targetPlayer, targetUser);
          break;
        case 'trade_player':
          await this.initiateTradeOffer(interaction, viewer, targetPlayer, targetUser);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async showDetailedAchievements(interaction: any, player: any) {
    const achievements = JSON.parse(player.achievementsJson);
    const scenarios = JSON.parse(player.completedScenariosJson);

    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${player.username}'s Achievements`)
      .setDescription('**Detailed achievement breakdown**\n')
      .setColor(0xFFD700)
      .addFields(
        {
          name: '⚔️ Combat',
          value: 
            `**Arena Wins:** ${achievements.arenaWins || 0}\n` +
            `**Arena Losses:** ${achievements.arenaLosses || 0}\n` +
            `**Monsters Killed:** ${achievements.monstersKilled || 0}\n` +
            `**Bosses Defeated:** ${achievements.bossesDefeated || 0}`,
          inline: true
        },
        {
          name: '🏰 Exploration',
          value: 
            `**Dungeons Completed:** ${achievements.dungeonsCompleted || 0}\n` +
            `**Floors Cleared:** ${achievements.floorsCleared || 0}\n` +
            `**Items Found:** ${achievements.itemsFound || 0}\n` +
            `**Secrets Discovered:** ${achievements.secretsFound || 0}`,
          inline: true
        },
        {
          name: '💰 Economy',
          value: 
            `**Items Crafted:** ${achievements.itemsCrafted || 0}\n` +
            `**Gold Earned:** ${achievements.goldEarned || 0}\n` +
            `**Gold Spent:** ${achievements.goldSpent || 0}\n` +
            `**Trades Completed:** ${achievements.tradesCompleted || 0}`,
          inline: true
        },
        {
          name: '✨ Special',
          value: 
            `**Isekai Scenarios:** ${scenarios.length}/15\n` +
            `**Plagg Approvals:** ${achievements.plaggApprovals || 0}\n` +
            `**Cheese Items Found:** ${achievements.cheeseItems || 0}\n` +
            `**Legendary Items:** ${achievements.legendaryItems || 0}`,
          inline: false
        }
      )
      .setFooter({ text: '🧀 "Achievements are like cheese medals - earned through dedication!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  async showDetailedComparison(interaction: any, viewer: any, target: any) {
    const embed = new EmbedBuilder()
      .setTitle(`⚖️ ${viewer.username} vs ${target.username}`)
      .setDescription('**Head-to-head comparison**\n')
      .setColor(0x4169E1)
      .addFields(
        {
          name: `👤 ${viewer.username}`,
          value: 
            `**Level:** ${viewer.level}\n` +
            `**ELO:** ${viewer.elo}\n` +
            `**STR:** ${viewer.str} | **INT:** ${viewer.int}\n` +
            `**DEX:** ${viewer.dex} | **DEF:** ${viewer.def}\n` +
            `**Total Stats:** ${viewer.str + viewer.int + viewer.dex + viewer.def}`,
          inline: true
        },
        {
          name: `👤 ${target.username}`,
          value: 
            `**Level:** ${target.level}\n` +
            `**ELO:** ${target.elo}\n` +
            `**STR:** ${target.str} | **INT:** ${target.int}\n` +
            `**DEX:** ${target.dex} | **DEF:** ${target.def}\n` +
            `**Total Stats:** ${target.str + target.int + target.dex + target.def}`,
          inline: true
        },
        {
          name: '📊 Analysis',
          value: this.getDetailedComparison(viewer, target),
          inline: false
        }
      )
      .setFooter({ text: '🧀 "Comparisons are like cheese tastings - educational!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  async initiatePvPChallenge(interaction: any, challenger: any, target: any, targetUser: any) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ PvP Challenge')
      .setDescription(
        `**${challenger.username}** wants to challenge **${target.username}** to PvP combat!\n\n` +
        `Use \`$battle @${targetUser?.username || target.username}\` to accept the challenge!`
      )
      .setColor(0xFF0000)
      .setFooter({ text: '🧀 "May the best cheese warrior win!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  async initiateTradeOffer(interaction: any, initiator: any, target: any, targetUser: any) {
    const embed = new EmbedBuilder()
      .setTitle('🤝 Trade Offer')
      .setDescription(
        `**${initiator.username}** wants to trade with **${target.username}**!\n\n` +
        `Use \`$trade with @${targetUser?.username || target.username}\` to start trading!`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Fair trades make everyone happy!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  getRelationship(viewer: any, target: any): string {
    // Check if same faction
    if (viewer.factionId && viewer.factionId === target.factionId) {
      return 'faction_mate';
    }
    
    // In a real implementation, you'd check friend lists
    // For now, we'll simulate based on level similarity
    if (Math.abs(viewer.level - target.level) <= 2) {
      return 'friend';
    }
    
    return 'stranger';
  },

  getOnlineStatus(player: any): string {
    // In a real implementation, you'd track last seen
    // For now, simulate based on recent activity
    const lastActive = player.updatedAt.getTime();
    const now = Date.now();
    const timeDiff = now - lastActive;
    
    if (timeDiff < 5 * 60 * 1000) return '🟢 Online';
    if (timeDiff < 30 * 60 * 1000) return '🟡 Recently Active';
    if (timeDiff < 24 * 60 * 60 * 1000) return '🟠 Today';
    return '🔴 Offline';
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

  getComparison(viewer: any, target: any): string {
    const levelDiff = target.level - viewer.level;
    const eloDiff = target.elo - viewer.elo;
    const statDiff = (target.str + target.int + target.dex + target.def) - (viewer.str + viewer.int + viewer.dex + viewer.def);

    let comparison = '';
    if (levelDiff > 0) comparison += `📈 ${levelDiff} levels ahead\n`;
    else if (levelDiff < 0) comparison += `📉 ${Math.abs(levelDiff)} levels behind\n`;
    else comparison += '📊 Same level\n';

    if (eloDiff > 50) comparison += `⚔️ ${eloDiff} ELO higher\n`;
    else if (eloDiff < -50) comparison += `⚔️ ${Math.abs(eloDiff)} ELO lower\n`;
    else comparison += '⚔️ Similar ELO\n';

    if (statDiff > 10) comparison += `💪 ${statDiff} total stats ahead`;
    else if (statDiff < -10) comparison += `💪 ${Math.abs(statDiff)} total stats behind`;
    else comparison += '💪 Similar stat total';

    return comparison;
  },

  getDetailedComparison(viewer: any, target: any): string {
    const predictions = [];
    
    // Combat prediction
    const viewerPower = viewer.str + viewer.dex + (viewer.level * 2);
    const targetPower = target.str + target.dex + (target.level * 2);
    
    if (viewerPower > targetPower) {
      predictions.push('⚔️ You would likely win in combat');
    } else if (targetPower > viewerPower) {
      predictions.push('⚔️ They would likely win in combat');
    } else {
      predictions.push('⚔️ Combat would be evenly matched');
    }

    // Magic comparison
    if (viewer.int > target.int + 5) {
      predictions.push('✨ You have superior magical abilities');
    } else if (target.int > viewer.int + 5) {
      predictions.push('✨ They have superior magical abilities');
    }

    // Speed comparison
    if (viewer.dex > target.dex + 5) {
      predictions.push('💨 You are significantly faster');
    } else if (target.dex > viewer.dex + 5) {
      predictions.push('💨 They are significantly faster');
    }

    return predictions.join('\n') || 'Very evenly matched in all aspects';
  },

  getPlaggComment(target: any, viewer: any): string {
    const comments = [];

    if (target.level > viewer.level + 10) {
      comments.push('Wow, they\'re way ahead! Like aged cheese vs fresh milk.');
    } else if (viewer.level > target.level + 10) {
      comments.push('You\'re much stronger! Don\'t pick on the little cheese.');
    } else {
      comments.push('Pretty evenly matched! Like two equally aged cheeses.');
    }

    if (target.completedScenariosJson && JSON.parse(target.completedScenariosJson).length > 5) {
      comments.push('Impressive Isekai experience! They know their anime.');
    }

    if (target.elo > 2000) {
      comments.push('A PvP master! Respect the cheese champion.');
    }

    return comments[Math.floor(Math.random() * comments.length)] || 'Another cheese enthusiast, I see.';
  },

  // Placeholder methods (would need to import from other files)
  getActiveTradeForPlayer(playerId: string): any {
    return null; // Would check active trades
  }
};

export default command;
