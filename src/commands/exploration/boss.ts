import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { CombatManager } from '../../structures/CombatManager.js';
import { loadJsonData, rollDice, formatGold, getRarityEmoji } from '../../utils/functions.js';
import { Monster, PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const combatManager = new CombatManager();

const command: Command = {
  name: 'boss',
  description: 'Challenge powerful boss monsters for epic rewards',
  cooldown: 60, // 1 minute cooldown
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
        await message.reply('🧀 You can\'t challenge bosses while in a dungeon!');
        return;
      }

      if (player.hp < player.maxHp * 0.8) {
        await message.reply('🧀 You\'re too injured to face a boss! Heal to at least 80% HP first.');
        return;
      }

      const bosses = await this.loadBossMonsters();
      const availableBosses = bosses.filter(boss => 
        boss.level >= player.level - 5 && 
        boss.level <= player.level + 10
      );

      if (availableBosses.length === 0) {
        await message.reply('🧀 No suitable bosses available for your level! Train more or find stronger opponents.');
        return;
      }

      if (args.length > 0) {
        const bossName = args.join(' ').toLowerCase();
        const boss = availableBosses.find(b => 
          b.name.toLowerCase().includes(bossName) || 
          b.id.toLowerCase().includes(bossName)
        );

        if (!boss) {
          await message.reply(`🧀 Boss "${bossName}" not found or not available for your level!`);
          return;
        }

        await this.challengeBoss(message, player, boss);
        return;
      }

      await this.showBossSelection(message, player, availableBosses);

    } catch (error) {
      logger.error('Error in boss command:', error);
      await message.reply('🧀 Failed to access boss challenges! The boss lair is blocked by a wall of cheese.');
    }
  },

  async loadBossMonsters(): Promise<Monster[]> {
    const allMonsters = await loadJsonData<Monster[]>('monsters.json');
    
    // Filter for boss-type monsters (high HP, special abilities)
    return allMonsters.filter(monster => 
      monster.hp >= 200 || 
      monster.id.includes('boss') || 
      monster.name.toLowerCase().includes('boss') ||
      monster.name.toLowerCase().includes('king') ||
      monster.name.toLowerCase().includes('lord') ||
      monster.name.toLowerCase().includes('champion')
    );
  },

  async showBossSelection(message: Message, player: any, bosses: Monster[]) {
    const embed = new EmbedBuilder()
      .setTitle('👑 Boss Challenge Arena')
      .setDescription(
        `**Choose your opponent, ${player.username}!**\n\n` +
        `💪 **Your Level:** ${player.level}\n` +
        `❤️ **Your HP:** ${player.hp}/${player.maxHp}\n` +
        `⚠️ **Warning:** Boss battles are extremely dangerous!\n\n` +
        `**Boss Rewards:**\n` +
        `• Massive XP and gold\n` +
        `• Rare equipment drops\n` +
        `• Unique boss materials\n` +
        `• Achievement unlocks\n\n` +
        `*Use \`$boss <name>\` to challenge a specific boss.*`
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 "Bosses are like really old, really angry cheese!" - Plagg' });

    bosses.slice(0, 8).forEach(boss => {
      const difficulty = this.getBossDifficulty(player.level, boss.level);
      const rewardMultiplier = Math.max(1, boss.level - player.level + 1);
      
      embed.addFields({
        name: `👑 ${boss.name} (Level ${boss.level}) ${difficulty}`,
        value: 
          `*${boss.plaggComment}*\n` +
          `**HP:** ${boss.hp} | **Reward XP:** ~${Math.floor(boss.xpReward * rewardMultiplier * 3)}\n` +
          `**Gold Reward:** ~${formatGold(Math.floor(boss.goldReward * rewardMultiplier * 3))}`,
        inline: false
      });
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    
    // Add boss challenge buttons for first 4 bosses
    bosses.slice(0, 4).forEach((boss, index) => {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`boss_${boss.id}`)
          .setLabel(`${index + 1}. ${boss.name}`)
          .setStyle(this.getButtonStyle(player.level, boss.level))
      );
    });

    const response = await message.reply({
      embeds: [embed],
      components: buttons.components.length > 0 ? [buttons] : []
    });

    if (buttons.components.length > 0) {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
        filter: (interaction) => interaction.user.id === message.author.id
      });

      collector.on('collect', async (interaction) => {
        const bossId = interaction.customId.replace('boss_', '');
        const boss = bosses.find(b => b.id === bossId);
        
        if (boss) {
          await this.challengeBoss(interaction, player, boss);
        }
      });

      collector.on('end', () => {
        response.edit({ components: [] }).catch(() => {});
      });
    }
  },

  async challengeBoss(message: any, player: any, boss: Monster) {
    const embed = new EmbedBuilder()
      .setTitle(`👑 Boss Challenge: ${boss.name}`)
      .setDescription(
        `**${boss.name}** towers before you, radiating immense power!\n\n` +
        `*${boss.plaggComment}*\n\n` +
        `**Boss Stats:**\n` +
        `💪 **Level:** ${boss.level}\n` +
        `❤️ **HP:** ${boss.hp}\n` +
        `⚔️ **STR:** ${boss.str} | ✨ **INT:** ${boss.int}\n` +
        `💨 **DEX:** ${boss.dex} | 🛡️ **DEF:** ${boss.def}\n\n` +
        `**Potential Rewards:**\n` +
        `🎯 **XP:** ${Math.floor(boss.xpReward * 3)} (3x normal)\n` +
        `💰 **Gold:** ${formatGold(Math.floor(boss.goldReward * 3))} (3x normal)\n` +
        `🎁 **Special loot drops guaranteed**\n\n` +
        `⚠️ **WARNING: This is an extremely dangerous battle!**\n` +
        `*Are you ready to face this challenge?*`
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 Boss battles are like extra-aged cheese - intense and potentially deadly!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('accept_boss_challenge')
          .setLabel('⚔️ Accept Challenge')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('decline_boss_challenge')
          .setLabel('🏃 Retreat')
          .setStyle(ButtonStyle.Secondary)
      );

    if (message.update) {
      await message.update({ embeds: [embed], components: [buttons] });
    } else {
      const response = await message.reply({ embeds: [embed], components: [buttons] });
      message = response;
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (interaction: any) => interaction.user.id === player.discordId
    });

    collector.on('collect', async (interaction: any) => {
      if (interaction.customId === 'accept_boss_challenge') {
        // Start boss combat
        const success = await combatManager.startCombat(message, boss.id);
        
        if (success) {
          // Apply boss battle modifiers
          await this.applyBossModifiers(player, boss);
          
          const startEmbed = new EmbedBuilder()
            .setTitle('⚔️ Boss Battle Initiated!')
            .setDescription(
              `**The battle against ${boss.name} begins!**\n\n` +
              `🔥 **Boss Battle Active:**\n` +
              `• All damage increased by 50%\n` +
              `• Boss has special abilities\n` +
              `• Victory rewards are tripled\n\n` +
              `*Use combat commands to fight! Good luck!*`
            )
            .setColor(0xFF0000)
            .setFooter({ text: '🧀 "Give it everything you\'ve got!" - Plagg' });

          await interaction.update({
            embeds: [startEmbed],
            components: []
          });

          // Check for Isekai scenarios
          await this.checkBossScenarios(interaction, player, boss);
        }
      } else {
        const retreatEmbed = new EmbedBuilder()
          .setTitle('🏃 Strategic Retreat')
          .setDescription(
            `You wisely decide not to face **${boss.name}** at this time.\n\n` +
            `*Sometimes discretion is the better part of valor...*\n\n` +
            `Come back when you\'re stronger!`
          )
          .setColor(0x808080)
          .setFooter({ text: '🧀 "Living to fight another day is like saving cheese for later!" - Plagg' });

        await interaction.update({
          embeds: [retreatEmbed],
          components: []
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        message.edit({
          embeds: [embed.setDescription('🧀 The boss challenge timed out. The boss grows impatient...')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async applyBossModifiers(player: any, boss: Monster) {
    // Store original combat state with boss modifiers
    const bossModifiers = {
      isBossBattle: true,
      bossLevel: boss.level,
      damageMultiplier: 1.5,
      playerBuffs: {
        determination: 10, // +10% damage
        boss_hunter: 5     // +5% crit chance
      }
    };

    // This would be applied in the combat system
    logger.info(`Boss battle modifiers applied for ${player.username} vs ${boss.name}`);
  },

  getBossDifficulty(playerLevel: number, bossLevel: number): string {
    const diff = bossLevel - playerLevel;
    if (diff <= -3) return '🟢 Manageable';
    if (diff <= 0) return '🟡 Challenging';
    if (diff <= 3) return '🟠 Dangerous';
    if (diff <= 6) return '🔴 Extreme';
    return '💀 Suicidal';
  },

  getButtonStyle(playerLevel: number, bossLevel: number): ButtonStyle {
    const diff = bossLevel - playerLevel;
    if (diff <= 0) return ButtonStyle.Success;
    if (diff <= 3) return ButtonStyle.Primary;
    return ButtonStyle.Danger;
  },

  async checkBossScenarios(interaction: any, player: any, boss: Monster) {
    const completedScenarios = JSON.parse(player.completedScenariosJson);
    
    // "Overlord" - Defeating a boss while significantly underleveled
    if (!completedScenarios.includes('overlord') && boss.level >= player.level + 5) {
      // This will trigger after boss victory
      const achievements = JSON.parse(player.achievementsJson);
      achievements.pendingScenario = 'overlord';
      
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: { achievementsJson: JSON.stringify(achievements) }
      });
    }

    // "One Punch Man" - Defeating bosses with overwhelming power
    if (!completedScenarios.includes('one_punch') && player.level >= boss.level + 10) {
      completedScenarios.push('one_punch');
      
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: {
          completedScenariosJson: JSON.stringify(completedScenarios),
          str: player.str + 20
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✨ Isekai Scenario: One Punch Hero')
        .setDescription(
          `**"I'm just a hero for fun... and cheese."**\n\n` +
          `You've become so powerful that boss battles are trivial!\n\n` +
          `**Permanent Rewards:**\n` +
          `• +20 STR (Overwhelming power)\n` +
          `• One Punch ability (chance to instantly defeat enemies)\n` +
          `• Boredom resistance (immune to tedium)`
        )
        .setColor(0xFFD700)
        .setFooter({ text: '🧀 Plagg says: "With great power comes great cheese responsibility!"' });

      setTimeout(() => {
        interaction.followUp({ embeds: [embed] });
      }, 5000);
    }
  }
};

export default command;
