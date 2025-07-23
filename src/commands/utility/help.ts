
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
  showMainHelp: (message: Message, client: any) => Promise<void>;
  showCategoryHelp: (message: any, category: string, client: any) => Promise<void>;
  showCommandDetails: (message: any, commandName: string, client: any) => Promise<void>;
  getCommandsByCategory: (client: any) => { [key: string]: any[] };
}

const command: Command = {
  name: 'help',
  description: 'Get help with bot commands',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      if (args.length === 0) {
        await this.showMainHelp(message, client);
        return;
      }

      const commandName = args[0].toLowerCase();
      const targetCommand = client.commands.get(commandName);

      if (!targetCommand) {
        await message.reply(`🧀 Command "${commandName}" not found! Use \`$help\` to see all commands.`);
        return;
      }

      await this.showCommandDetails(message, commandName, client);

    } catch (error) {
      logger.error('Error in help command:', error);
      await message.reply('🧀 Failed to show help! The help book is covered in cheese fingerprints.');
    }
  },

  async showMainHelp(message: Message, client: any) {
    const player = await prisma.player.findUnique({
      where: { discordId: message.author.id }
    }).catch(() => null);

    const commandsByCategory = this.getCommandsByCategory(client);
    const totalCommands = Object.values(commandsByCategory).flat().length;

    const embed = new EmbedBuilder()
      .setTitle('📚 Plagg Bot - Complete Command Guide')
      .setDescription(
        `**Welcome to the ultimate RPG experience!**\n\n` +
        `🎮 **Total Commands:** ${totalCommands}\n` +
        `${player ? `👤 **Your Level:** ${player.level}\n` : ''}` +
        `💰 **Prefix:** \`$\` (e.g., \`$help\`, \`$profile\`)\n\n` +
        `**📂 Command Categories:**\n` +
        `⚔️ **Combat** (${commandsByCategory.combat?.length || 0}) - Battle, skills, and techniques\n` +
        `👤 **Character** (${commandsByCategory.character?.length || 0}) - Profile, stats, and progression\n` +
        `🏪 **Economy** (${commandsByCategory.economy?.length || 0}) - Trading, crafting, and shopping\n` +
        `🗺️ **Exploration** (${commandsByCategory.exploration?.length || 0}) - Dungeons, bosses, and adventures\n` +
        `⚔️ **PvP** (${commandsByCategory.pvp?.length || 0}) - Arena battles and competition\n` +
        `👥 **Social** (${commandsByCategory.social?.length || 0}) - Trading and interaction\n` +
        `🔧 **Utility** (${commandsByCategory.utility?.length || 0}) - Basic bot functions\n\n` +
        `*Select a category below to explore specific commands!*`
      )
      .setColor(0xFFD700)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: '🧀 "Knowledge is power! Like cheese is delicious!" - Plagg' });

    const categoryButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('help_combat')
          .setLabel(`Combat (${commandsByCategory.combat?.length || 0})`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('help_character')
          .setLabel(`Character (${commandsByCategory.character?.length || 0})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👤'),
        new ButtonBuilder()
          .setCustomId('help_economy')
          .setLabel(`Economy (${commandsByCategory.economy?.length || 0})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('🏪'),
        new ButtonBuilder()
          .setCustomId('help_exploration')
          .setLabel(`Exploration (${commandsByCategory.exploration?.length || 0})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🗺️')
      );

    const utilityButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('help_pvp')
          .setLabel(`PvP (${commandsByCategory.pvp?.length || 0})`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🏆'),
        new ButtonBuilder()
          .setCustomId('help_social')
          .setLabel(`Social (${commandsByCategory.social?.length || 0})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👥'),
        new ButtonBuilder()
          .setCustomId('help_utility')
          .setLabel(`Utility (${commandsByCategory.utility?.length || 0})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔧'),
        new ButtonBuilder()
          .setCustomId('help_getting_started')
          .setLabel('Getting Started')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🚀')
      );

    const response = await message.reply({
      embeds: [embed],
      components: [categoryButtons, utilityButtons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      const category = interaction.customId.replace('help_', '');
      
      if (category === 'getting_started') {
        await this.showGettingStarted(interaction);
      } else {
        await this.showCategoryHelp(interaction, category, client);
      }
    });

    collector.on('end', () => {
      const disabledButtons1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(categoryButtons.components[0]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[1]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[2]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[3]).setDisabled(true)
        );
      
      const disabledButtons2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(utilityButtons.components[0]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[1]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[2]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[3]).setDisabled(true)
        );
      
      response.edit({ components: [disabledButtons1, disabledButtons2] }).catch(() => {});
    });
  },

  async showCategoryHelp(message: any, category: string, client: any) {
    const commandsByCategory = this.getCommandsByCategory(client);
    const commands = commandsByCategory[category] || [];

    const categoryNames: { [key: string]: string } = {
      combat: '⚔️ Combat Commands',
      character: '👤 Character Commands', 
      economy: '🏪 Economy Commands',
      exploration: '🗺️ Exploration Commands',
      pvp: '🏆 PvP Commands',
      social: '👥 Social Commands',
      utility: '🔧 Utility Commands'
    };

    const embed = new EmbedBuilder()
      .setTitle(categoryNames[category] || `📂 ${category.charAt(0).toUpperCase() + category.slice(1)} Commands`)
      .setDescription(
        `**All commands in the ${category} category**\n\n` +
        `**Total Commands:** ${commands.length}\n` +
        `**Usage:** Type \`$<command>\` to use any command\n\n` +
        `*Click on a command below to see detailed information!*`
      )
      .setColor(this.getCategoryColor(category));

    if (commands.length === 0) {
      embed.addFields({
        name: '❌ No Commands Found',
        value: 'This category has no available commands.',
        inline: false
      });
    } else {
      // Group commands for display
      const commandGroups = [];
      for (let i = 0; i < commands.length; i += 8) {
        commandGroups.push(commands.slice(i, i + 8));
      }

      commandGroups.forEach((group, index) => {
        const commandList = group.map(cmd => 
          `**$${cmd.name}** - ${cmd.description || 'No description'}`
        ).join('\n');

        embed.addFields({
          name: index === 0 ? '📋 Available Commands' : '\u200b',
          value: commandList,
          inline: false
        });
      });
    }

    // Create select menu for commands
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('command_select')
      .setPlaceholder('Select a command for detailed info...')
      .setMaxValues(1);

    if (commands.length > 0) {
      const selectOptions = commands.slice(0, 20).map(cmd => ({
        label: `$${cmd.name}`,
        description: (cmd.description || 'No description').substring(0, 100),
        value: cmd.name,
        emoji: this.getCommandEmoji(cmd.name)
      }));
      selectMenu.addOptions(selectOptions);
    } else {
      selectMenu.addOptions({
        label: 'No commands available',
        description: 'This category is empty',
        value: 'none'
      }).setDisabled(true);
    }

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('help_back')
          .setLabel('Back to Categories')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️'),
        new ButtonBuilder()
          .setCustomId('help_search')
          .setLabel('Search Commands')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId('help_examples')
          .setLabel('Usage Examples')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💡')
      );

    const components = commands.length > 0 ? [selectRow, buttonRow] : [buttonRow];

    await message.update({ embeds: [embed], components });
  },

  async showCommandDetails(message: any, commandName: string, client: any) {
    const targetCommand = client.commands.get(commandName);
    if (!targetCommand) return;

    const embed = new EmbedBuilder()
      .setTitle(`📖 Command: $${commandName}`)
      .setDescription(targetCommand.description || 'No description available')
      .setColor(0x32CD32)
      .addFields(
        {
          name: '📋 Command Information',
          value: 
            `**Name:** \`$${targetCommand.name}\`\n` +
            `**Category:** ${this.getCommandCategory(targetCommand.name)}\n` +
            `**Cooldown:** ${targetCommand.cooldown || 0} seconds\n` +
            `**Admin Only:** ${targetCommand.ownerOnly ? 'Yes' : 'No'}`,
          inline: false
        }
      );

    // Add usage examples
    const examples = this.getCommandExamples(commandName);
    if (examples.length > 0) {
      embed.addFields({
        name: '💡 Usage Examples',
        value: examples.map(ex => `\`${ex}\``).join('\n'),
        inline: false
      });
    }

    // Add related commands
    const relatedCommands = this.getRelatedCommands(commandName, client);
    if (relatedCommands.length > 0) {
      embed.addFields({
        name: '🔗 Related Commands',
        value: relatedCommands.map(cmd => `\`$${cmd}\``).join(', '),
        inline: false
      });
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('help_back_category')
          .setLabel('Back to Category')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️'),
        new ButtonBuilder()
          .setCustomId(`help_try_${commandName}`)
          .setLabel('Try Command')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('▶️'),
        new ButtonBuilder()
          .setCustomId('help_main')
          .setLabel('Main Help')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🏠')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async showGettingStarted(message: any) {
    const embed = new EmbedBuilder()
      .setTitle('🚀 Getting Started with Plagg Bot')
      .setDescription('**Your journey to becoming a legendary adventurer begins here!**')
      .setColor(0x00FF00)
      .addFields(
        {
          name: '1️⃣ Start Your Adventure',
          value: 
            '• Use `$startrpg` to create your character\n' +
            '• Choose your starting class and stats\n' +
            '• Learn about your character with `$profile`',
          inline: false
        },
        {
          name: '2️⃣ Basic Commands',
          value: 
            '• `$help` - View all commands\n' +
            '• `$stats` - Check your character stats\n' +
            '• `$profile` - View your character profile',
          inline: false
        },
        {
          name: '3️⃣ Combat & Adventure',
          value: 
            '• `$hunt` - Fight monsters and gain XP\n' +
            '• `$skills` - Learn and use combat skills\n' +
            '• `$dungeon` - Explore dangerous dungeons',
          inline: false
        },
        {
          name: '4️⃣ Economy & Trading',
          value: 
            '• `$shop` - Buy weapons, armor, and items\n' +
            '• `$craft` - Create powerful equipment\n' +
            '• `$trade` - Trade with other players',
          inline: false
        },
        {
          name: '🧀 Pro Tips from Plagg',
          value: 
            '• Start with hunting easy monsters\n' +
            '• Save gold for better equipment\n' +
            '• Join a faction for bonuses\n' +
            '• Don\'t forget to rest and recover!',
          inline: false
        }
      )
      .setFooter({ text: '🧀 "Every master was once a beginner... even me!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('help_start_rpg')
          .setLabel('Start RPG Now!')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎮'),
        new ButtonBuilder()
          .setCustomId('help_beginner_guide')
          .setLabel('Beginner Guide')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📚'),
        new ButtonBuilder()
          .setCustomId('help_back')
          .setLabel('Back to Help')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  getCommandsByCategory(client: any): { [key: string]: any[] } {
    const categories: { [key: string]: any[] } = {
      combat: [],
      character: [],
      economy: [],
      exploration: [],
      pvp: [],
      social: [],
      utility: [],
      admin: []
    };

    client.commands.forEach((command: any) => {
      const commandName = command.name.toLowerCase();
      
      // Categorize based on command name patterns
      if (['battle', 'hunt', 'flee', 'skills', 'techniques'].includes(commandName)) {
        categories.combat.push(command);
      } else if (['profile', 'stats', 'class', 'path', 'allocate', 'title'].includes(commandName)) {
        categories.character.push(command);
      } else if (['shop', 'buy', 'sell', 'craft', 'market', 'recipes', 'salvage'].includes(commandName)) {
        categories.economy.push(command);
      } else if (['dungeon', 'boss', 'miraculous'].includes(commandName)) {
        categories.exploration.push(command);
      } else if (['arena', 'bounty', 'faction', 'leaderboard', 'spectate'].includes(commandName)) {
        categories.pvp.push(command);
      } else if (['trade', 'chat', 'view'].includes(commandName)) {
        categories.social.push(command);
      } else if (['help', 'startrpg'].includes(commandName)) {
        categories.utility.push(command);
      } else if (command.ownerOnly) {
        categories.admin.push(command);
      } else {
        categories.utility.push(command);
      }
    });

    return categories;
  },

  getCategoryColor(category: string): number {
    const colors: { [key: string]: number } = {
      combat: 0xFF4500,
      character: 0x4169E1,
      economy: 0x32CD32,
      exploration: 0x8B008B,
      pvp: 0xFF6B6B,
      social: 0xFFD700,
      utility: 0x808080,
      admin: 0xFF0000
    };
    return colors[category] || 0x808080;
  },

  getCommandEmoji(commandName: string): string {
    const emojis: { [key: string]: string } = {
      battle: '⚔️', hunt: '🎯', skills: '✨', profile: '👤',
      shop: '🏪', dungeon: '🗺️', arena: '🏟️', help: '📚',
      startrpg: '🚀', craft: '🔨', trade: '🤝'
    };
    return emojis[commandName] || '📋';
  },

  getCommandCategory(commandName: string): string {
    const categoryMap: { [key: string]: string } = {
      battle: 'Combat', hunt: 'Combat', skills: 'Combat',
      profile: 'Character', stats: 'Character', class: 'Character',
      shop: 'Economy', craft: 'Economy', trade: 'Social',
      dungeon: 'Exploration', arena: 'PvP', help: 'Utility'
    };
    return categoryMap[commandName] || 'Utility';
  },

  getCommandExamples(commandName: string): string[] {
    const examples: { [key: string]: string[] } = {
      help: ['$help', '$help combat', '$help shop'],
      profile: ['$profile', '$profile @user'],
      shop: ['$shop', '$shop weapons', '$shop armor'],
      hunt: ['$hunt', '$hunt goblin', '$hunt easy'],
      skills: ['$skills', '$skills fireball'],
      dungeon: ['$dungeon', '$dungeon explore', '$dungeon rest']
    };
    return examples[commandName] || [`$${commandName}`];
  },

  getRelatedCommands(commandName: string, client: any): string[] {
    const related: { [key: string]: string[] } = {
      profile: ['stats', 'class', 'title'],
      shop: ['buy', 'sell', 'craft'],
      hunt: ['battle', 'skills', 'flee'],
      skills: ['techniques', 'hunt', 'battle'],
      dungeon: ['boss', 'hunt']
    };
    
    return (related[commandName] || []).filter(cmd => client.commands.has(cmd));
  }
};

export default command;
