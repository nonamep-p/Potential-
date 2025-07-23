import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { DungeonRunner } from '../../structures/DungeonRunner.js';
import { loadJsonData } from '../../utils/functions.js';
import { Dungeon } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const dungeonRunner = new DungeonRunner();

const command: Command = {
  name: 'dungeon',
  description: 'Enter and explore dangerous dungeons for great rewards',
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

      if (player.inCombat) {
        await message.reply('🧀 You can\'t enter a dungeon while in combat!');
        return;
      }

      if (player.inDungeon) {
        // Show current dungeon status
        await this.showCurrentDungeon(message, player);
        return;
      }

      if (args.length === 0) {
        await this.showAvailableDungeons(message, player);
        return;
      }

      const dungeonName = args.join(' ').toLowerCase();
      const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
      const dungeon = dungeons.find(d => 
        d.name.toLowerCase().includes(dungeonName) || 
        d.id.toLowerCase().includes(dungeonName)
      );

      if (!dungeon) {
        await message.reply(`🧀 Dungeon "${dungeonName}" not found! Use \`$dungeon\` to see available dungeons.`);
        return;
      }

      await this.attemptDungeonEntry(message, player, dungeon);

    } catch (error) {
      logger.error('Error in dungeon command:', error);
      await message.reply('🧀 Failed to access dungeons! The entrance is blocked by a giant cheese wheel.');
    }
  },

  async showAvailableDungeons(message: Message, player: any) {
    const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
    
    // Filter dungeons by level
    const availableDungeons = dungeons.filter(d => player.level >= d.minLevel);
    const lockedDungeons = dungeons.filter(d => player.level < d.minLevel);

    const embed = new EmbedBuilder()
      .setTitle('🏰 Available Dungeons')
      .setDescription(
        `**Choose your next adventure, ${player.username}!**\n\n` +
        `💪 **Your Level:** ${player.level}\n` +
        `❤️ **Current HP:** ${player.hp}/${player.maxHp}\n\n` +
        `*Use \`$dungeon <name>\` to enter a specific dungeon.*`
      )
      .setColor(0x8B008B)
      .setFooter({ text: '🧀 "Dungeons are like aged cheese - dark, mysterious, and potentially dangerous!" - Plagg' });

    // Show available dungeons
    if (availableDungeons.length > 0) {
      availableDungeons.forEach(dungeon => {
        const difficulty = this.getDifficultyRating(player.level, dungeon.minLevel, dungeon.maxLevel);
        embed.addFields({
          name: `🏰 ${dungeon.name} ${difficulty}`,
          value: 
            `*${dungeon.description}*\n` +
            `**Level Range:** ${dungeon.minLevel}-${dungeon.maxLevel}\n` +
            `**Floors:** ${dungeon.floors}\n` +
            `*"${dungeon.plaggComment}"*`,
          inline: false
        });
      });
    }

    // Show locked dungeons
    if (lockedDungeons.length > 0) {
      embed.addFields({
        name: '🔒 Locked Dungeons',
        value: lockedDungeons.map(d => 
          `**${d.name}** (Requires Level ${d.minLevel})`
        ).join('\n'),
        inline: false
      });
    }

    if (availableDungeons.length === 0) {
      embed.setDescription('🧀 No dungeons available for your level! Level up to unlock adventures!');
    }

    await message.reply({ embeds: [embed] });
  },

  async showCurrentDungeon(message: Message, player: any) {
    const dungeonState = dungeonRunner.getDungeonState(message.author.id);
    
    if (!dungeonState) {
      // Player is marked as in dungeon but no state found - fix this
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: { inDungeon: false, dungeonStateJson: '{}' }
      });
      
      await message.reply('🧀 Dungeon state corrupted! You\'ve been safely extracted.');
      return;
    }

    const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
    const dungeon = dungeons.find(d => d.id === dungeonState.dungeonId);

    if (!dungeon) {
      await message.reply('🧀 Current dungeon data not found! This is concerning...');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏰 ${dungeon.name} - Floor ${dungeonState.floor}`)
      .setDescription(
        `**You are currently exploring this dungeon.**\n\n` +
        `❤️ **HP:** ${dungeonState.hp}/${player.maxHp}\n` +
        `🏰 **Floor:** ${dungeonState.floor}/${dungeon.floors}\n` +
        `🚪 **Rooms Cleared:** ${dungeonState.completedRooms}\n\n` +
        `*What would you like to do?*`
      )
      .setColor(0x8B008B);

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('dungeon_explore')
          .setLabel('🔍 Explore Room')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('dungeon_rest')
          .setLabel('💤 Rest (Restore 25% HP)')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('dungeon_status')
          .setLabel('📊 Check Status')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('dungeon_exit')
          .setLabel('🚪 Exit Dungeon')
          .setStyle(ButtonStyle.Danger)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000, // 5 minutes
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      switch (interaction.customId) {
        case 'dungeon_explore':
          await this.handleExploration(interaction, player);
          break;
        case 'dungeon_rest':
          await this.handleRest(interaction, player);
          break;
        case 'dungeon_status':
          await this.showDungeonStatus(interaction, player, dungeon, dungeonState);
          break;
        case 'dungeon_exit':
          await this.handleExit(interaction, player);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async attemptDungeonEntry(message: Message, player: any, dungeon: Dungeon) {
    if (player.level < dungeon.minLevel) {
      await message.reply(`🧀 You need to be at least level ${dungeon.minLevel} to enter **${dungeon.name}**!`);
      return;
    }

    if (player.hp < player.maxHp * 0.5) {
      await message.reply('🧀 You\'re too injured to enter a dungeon! Heal up first.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏰 Enter ${dungeon.name}?`)
      .setDescription(
        `${dungeon.description}\n\n` +
        `**Dungeon Details:**\n` +
        `🎯 **Level Range:** ${dungeon.minLevel}-${dungeon.maxLevel}\n` +
        `🏰 **Floors:** ${dungeon.floors}\n` +
        `⚠️ **Difficulty:** ${this.getDifficultyRating(player.level, dungeon.minLevel, dungeon.maxLevel)}\n\n` +
        `**⚠️ Warning:** Dungeons are dangerous! You may encounter:\n` +
        `• Powerful monsters\n` +
        `• Deadly traps\n` +
        `• Environmental hazards\n\n` +
        `*Are you prepared to enter?*`
      )
      .setColor(0x8B008B)
      .setFooter({ text: `🧀 "${dungeon.plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('enter_dungeon')
          .setLabel('🏰 Enter Dungeon')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_entry')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'enter_dungeon') {
        const success = await dungeonRunner.enterDungeon(message, dungeon.id);
        if (success) {
          const enterEmbed = new EmbedBuilder()
            .setTitle('🏰 Dungeon Entered!')
            .setDescription(
              `**You step into ${dungeon.name}...**\n\n` +
              `The air grows cold and mysterious. Ancient stones echo with your footsteps.\n\n` +
              `Your adventure begins now!`
            )
            .setColor(0x00FF00)
            .setFooter({ text: '🧀 Use $dungeon to see your options and continue exploring!' });

          await interaction.update({
            embeds: [enterEmbed],
            components: []
          });
        }
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Entry Cancelled')
          .setDescription('You decided not to enter the dungeon. Perhaps another time...')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Entry timed out. The dungeon entrance sealed itself.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async handleExploration(interaction: any, player: any) {
    const encounter = await dungeonRunner.exploreRoom(player.discordId);
    
    if (!encounter.success) {
      await interaction.reply({
        content: '🧀 Failed to explore room! Try again.',
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔍 Room Exploration')
      .setDescription(encounter.encounter.message)
      .setColor(0x4169E1);

    switch (encounter.encounter.type) {
      case 'monster':
        embed.setColor(0xFF0000);
        embed.addFields({
          name: '⚔️ Combat Initiated!',
          value: 'Use combat commands to fight the monster!',
          inline: false
        });
        break;
      case 'trap':
        embed.setColor(encounter.encounter.avoided ? 0x00FF00 : 0xFF8000);
        if (encounter.encounter.damage) {
          embed.addFields({
            name: '💥 Damage Taken',
            value: `You lost ${encounter.encounter.damage} HP!`,
            inline: false
          });
        }
        break;
      case 'treasure':
        embed.setColor(0xFFD700);
        embed.addFields({
          name: '💰 Gold Found!',
          value: `You gained ${encounter.encounter.gold} gold!`,
          inline: false
        });
        break;
      case 'boss':
        embed.setColor(0x8B0000);
        embed.addFields({
          name: '👑 Floor Boss!',
          value: 'Prepare for a challenging battle!',
          inline: false
        });
        break;
    }

    await interaction.update({
      embeds: [embed],
      components: []
    });

    // Check for Isekai scenarios
    await this.checkDungeonScenarios(interaction, player, encounter);
  },

  async handleRest(interaction: any, player: any) {
    const healAmount = Math.floor(player.maxHp * 0.25);
    const newHp = Math.min(player.hp + healAmount, player.maxHp);

    await prisma.player.update({
      where: { discordId: player.discordId },
      data: { hp: newHp }
    });

    const embed = new EmbedBuilder()
      .setTitle('💤 Rest')
      .setDescription(
        `**You take a moment to rest and recover.**\n\n` +
        `❤️ **HP Restored:** ${healAmount}\n` +
        `❤️ **Current HP:** ${newHp}/${player.maxHp}\n\n` +
        `*You feel slightly refreshed, but the dungeon still looms ahead...*`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Even cheese needs aging time!" - Plagg' });

    await interaction.update({
      embeds: [embed],
      components: []
    });
  },

  async handleExit(interaction: any, player: any) {
    await dungeonRunner.exitDungeon(player.discordId);

    const embed = new EmbedBuilder()
      .setTitle('🚪 Dungeon Exit')
      .setDescription(
        '**You exit the dungeon safely.**\n\n' +
        'You emerge into daylight, grateful to escape the dark depths.\n\n' +
        '*You can enter another dungeon whenever you\'re ready!*'
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Fresh air and cheese - the perfect combination!" - Plagg' });

    await interaction.update({
      embeds: [embed],
      components: []
    });
  },

  async showDungeonStatus(interaction: any, player: any, dungeon: Dungeon, state: any) {
    const embed = new EmbedBuilder()
      .setTitle(`📊 Dungeon Status - ${dungeon.name}`)
      .setDescription(
        `**Current exploration progress**\n\n` +
        `🏰 **Floor:** ${state.floor}/${dungeon.floors}\n` +
        `🚪 **Rooms Cleared:** ${state.completedRooms}\n` +
        `❤️ **HP:** ${state.hp}/${player.maxHp}\n` +
        `🎯 **Level Range:** ${dungeon.minLevel}-${dungeon.maxLevel}\n\n` +
        `**Active Buffs:**\n${Object.keys(state.buffs).length > 0 ? 
          Object.entries(state.buffs).map(([k, v]) => `• ${k}: ${v}`).join('\n') :
          'None'}`
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 Keep exploring to reach the final floor!' });

    await interaction.update({
      embeds: [embed],
      components: []
    });
  },

  getDifficultyRating(playerLevel: number, minLevel: number, maxLevel: number): string {
    const avgLevel = (minLevel + maxLevel) / 2;
    const diff = avgLevel - playerLevel;
    
    if (diff <= -5) return '🟢 Very Easy';
    if (diff <= -2) return '🔵 Easy';
    if (diff <= 2) return '🟡 Moderate';
    if (diff <= 5) return '🟠 Hard';
    return '🔴 Very Hard';
  },

  async checkDungeonScenarios(interaction: any, player: any, encounter: any) {
    const completedScenarios = JSON.parse(player.completedScenariosJson);
    
    // "DanMachi" - Dungeon explorer scenario
    if (!completedScenarios.includes('danmachi') && encounter.encounter.type === 'monster') {
      const achievements = JSON.parse(player.achievementsJson);
      const dungeonsCompleted = achievements.dungeonsCompleted || 0;
      
      if (dungeonsCompleted >= 5) {
        completedScenarios.push('danmachi');
        
        await prisma.player.update({
          where: { discordId: player.discordId },
          data: {
            completedScenariosJson: JSON.stringify(completedScenarios),
            dex: player.dex + 7,
            maxHp: player.maxHp + 50
          }
        });

        const embed = new EmbedBuilder()
          .setTitle('✨ Isekai Scenario: Is It Wrong to Pick Up Girls in a Dungeon?')
          .setDescription(
            `**"The dungeon calls to me... I must become stronger!"**\n\n` +
            `After exploring 5 dungeons, you've become a true dungeon crawler!\n\n` +
            `**Permanent Rewards:**\n` +
            `• +7 DEX (Dungeon agility)\n` +
            `• +50 Max HP (Survivor's endurance)\n` +
            `• Dungeon Navigation expertise`
          )
          .setColor(0x8B008B)
          .setFooter({ text: '🧀 Plagg says: "Dungeons are like cheese caves - full of hidden treasures!"' });

        setTimeout(() => {
          interaction.followUp({ embeds: [embed] });
        }, 3000);
      }
    }
  }
};

export default command;
