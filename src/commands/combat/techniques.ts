
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
  showTechniquesMenu: (message: Message, techniques: Technique[]) => Promise<void>;
  showTechniqueDetails: (message: Message, technique: Technique) => Promise<void>;
  getCombatTechniques: () => Technique[];
  getCategoryColor: (category: string) => number;
}

interface Technique {
  id: string;
  name: string;
  description: string;
  category: 'offensive' | 'defensive' | 'utility';
  requirements: string;
  effects: string[];
  plaggComment: string;
}

const command: Command = {
  name: 'techniques',
  description: 'Learn about advanced combat techniques',
  cooldown: 5,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      const techniques = this.getCombatTechniques();
      
      if (args.length > 0) {
        const techniqueName = args.join(' ').toLowerCase();
        const technique = techniques.find(t => t.name.toLowerCase().includes(techniqueName));

        if (!technique) {
          await message.reply('🧀 Unknown technique! Use `$techniques` to see all available techniques.');
          return;
        }

        await this.showTechniqueDetails(message, technique);
        return;
      }

      await this.showTechniquesMenu(message, techniques);

    } catch (error) {
      logger.error('Error in techniques command:', error);
      await message.reply('🧀 Failed to access combat techniques! The manual is covered in cheese grease.');
    }
  },

  async showTechniquesMenu(message: Message, techniques: Technique[]) {
    const categories = {
      offensive: techniques.filter(t => t.category === 'offensive'),
      defensive: techniques.filter(t => t.category === 'defensive'),
      utility: techniques.filter(t => t.category === 'utility')
    };

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Combat Techniques Mastery')
      .setDescription(
        `**Master the Art of Advanced Combat!**\n\n` +
        `Combat techniques are sophisticated strategies that separate novices from masters. Study them well!\n\n` +
        `📊 **Available Categories:**\n` +
        `⚔️ **Offensive:** ${categories.offensive.length} techniques - Overwhelm your enemies\n` +
        `🛡️ **Defensive:** ${categories.defensive.length} techniques - Protect yourself from harm\n` +
        `🔧 **Utility:** ${categories.utility.length} techniques - Tactical advantages\n\n` +
        `*Select a category below to explore specific techniques!*`
      )
      .setColor(0xFFD700)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: '🧀 Knowledge is power! Like cheese is delicious!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('tech_offensive')
          .setLabel(`Offensive (${categories.offensive.length})`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('tech_defensive')
          .setLabel(`Defensive (${categories.defensive.length})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🛡️'),
        new ButtonBuilder()
          .setCustomId('tech_utility')
          .setLabel(`Utility (${categories.utility.length})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔧'),
        new ButtonBuilder()
          .setCustomId('tech_random')
          .setLabel('Random Technique')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🎲')
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
      let techniqueEmbed: EmbedBuilder;

      switch (interaction.customId) {
        case 'tech_offensive':
          techniqueEmbed = new EmbedBuilder()
            .setTitle('⚔️ Offensive Techniques')
            .setDescription('**Techniques focused on dealing damage and overwhelming opponents**')
            .setColor(0xFF4500);

          categories.offensive.forEach((technique, index) => {
            techniqueEmbed.addFields({
              name: `${index + 1}. ⚔️ ${technique.name}`,
              value: 
                `*${technique.description}*\n` +
                `**Requirements:** ${technique.requirements}\n` +
                `**Key Effects:** ${technique.effects.slice(0, 2).join(', ')}\n` +
                `*"${technique.plaggComment}"*`,
              inline: false
            });
          });
          break;

        case 'tech_defensive':
          techniqueEmbed = new EmbedBuilder()
            .setTitle('🛡️ Defensive Techniques')
            .setDescription('**Techniques focused on protection and survival**')
            .setColor(0x4169E1);

          categories.defensive.forEach((technique, index) => {
            techniqueEmbed.addFields({
              name: `${index + 1}. 🛡️ ${technique.name}`,
              value: 
                `*${technique.description}*\n` +
                `**Requirements:** ${technique.requirements}\n` +
                `**Key Effects:** ${technique.effects.slice(0, 2).join(', ')}\n` +
                `*"${technique.plaggComment}"*`,
              inline: false
            });
          });
          break;

        case 'tech_utility':
          techniqueEmbed = new EmbedBuilder()
            .setTitle('🔧 Utility Techniques')
            .setDescription('**Techniques that provide various tactical advantages**')
            .setColor(0x32CD32);

          categories.utility.forEach((technique, index) => {
            techniqueEmbed.addFields({
              name: `${index + 1}. 🔧 ${technique.name}`,
              value: 
                `*${technique.description}*\n` +
                `**Requirements:** ${technique.requirements}\n` +
                `**Key Effects:** ${technique.effects.slice(0, 2).join(', ')}\n` +
                `*"${technique.plaggComment}"*`,
              inline: false
            });
          });
          break;

        case 'tech_random':
          const randomTechnique = techniques[Math.floor(Math.random() * techniques.length)];
          await this.showTechniqueDetails(interaction, randomTechnique);
          return;

        default:
          return;
      }

      const backButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('tech_back')
            .setLabel('Back to Categories')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️'),
          new ButtonBuilder()
            .setCustomId('tech_training')
            .setLabel('Training Guide')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📚')
        );

      await interaction.update({ embeds: [techniqueEmbed], components: [backButton] });
    });

    collector.on('end', () => {
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(buttons.components[0]).setDisabled(true),
          ButtonBuilder.from(buttons.components[1]).setDisabled(true),
          ButtonBuilder.from(buttons.components[2]).setDisabled(true),
          ButtonBuilder.from(buttons.components[3]).setDisabled(true)
        );
      
      response.edit({ components: [disabledButtons] }).catch(() => {});
    });
  },

  async showTechniqueDetails(message: any, technique: Technique) {
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${technique.name}`)
      .setDescription(technique.description)
      .setColor(this.getCategoryColor(technique.category))
      .addFields(
        {
          name: '📋 Technique Details',
          value: 
            `**Category:** ${technique.category.charAt(0).toUpperCase() + technique.category.slice(1)}\n` +
            `**Requirements:** ${technique.requirements}`,
          inline: false
        },
        {
          name: '✨ All Effects',
          value: technique.effects.map((effect, index) => `${index + 1}. ${effect}`).join('\n'),
          inline: false
        },
        {
          name: '🧀 Plagg\'s Wisdom',
          value: `*"${technique.plaggComment}"*`,
          inline: false
        }
      )
      .setFooter({ text: 'Master these techniques to become a true combat expert!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('tech_practice')
          .setLabel('Practice Guide')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚡'),
        new ButtonBuilder()
          .setCustomId('tech_related')
          .setLabel('Related Techniques')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId('tech_back_main')
          .setLabel('Back to Menu')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    if (message.update) {
      await message.update({ embeds: [embed], components: [buttons] });
    } else {
      await message.reply({ embeds: [embed], components: [buttons] });
    }
  },

  getCombatTechniques(): Technique[] {
    return [
      {
        id: 'berserker_fury',
        name: 'Berserker Fury',
        description: 'Channel your rage into devastating attacks, trading defense for raw power.',
        category: 'offensive',
        requirements: 'High STR, Warrior class, low HP',
        effects: [
          'Double damage when below 25% HP',
          'Take 50% more damage while active',
          'Cannot flee while in fury',
          'Lasts for 3 turns',
          'Intimidates weaker enemies'
        ],
        plaggComment: 'Angry fighting! Like me when someone eats my cheese!'
      },
      {
        id: 'combo_strikes',
        name: 'Combo Strikes',
        description: 'Chain multiple attacks together for increasing damage.',
        category: 'offensive',
        requirements: 'High DEX, successful consecutive hits',
        effects: [
          'Each successive hit deals 25% more damage',
          'Combo breaks if you miss',
          'Maximum 5 hit combo',
          'Critical hits extend combo by 1',
          'Final hit in combo has guaranteed crit'
        ],
        plaggComment: 'Chain attacks! Like eating cheese slices one after another!'
      },
      {
        id: 'elemental_fusion',
        name: 'Elemental Fusion',
        description: 'Combine different magical elements for explosive results.',
        category: 'offensive',
        requirements: 'High INT, Mage class, multiple element spells',
        effects: [
          'Combine fire + ice for steam explosion',
          'Mix lightning + water for chain lightning',
          'Earth + fire creates lava attacks',
          'Costs double mana but triple damage',
          'Area of effect damage'
        ],
        plaggComment: 'Mixing elements! Like mixing different cheeses for the perfect fondue!'
      },
      {
        id: 'perfect_block',
        name: 'Perfect Block',
        description: 'Time your defense perfectly to negate all damage.',
        category: 'defensive',
        requirements: 'High DEF, shield equipped, precise timing',
        effects: [
          'Negate 100% damage from one attack',
          'Reflect 25% damage back to attacker',
          'Requires precise timing',
          'Failure results in double damage taken',
          'Builds momentum for counter-attack'
        ],
        plaggComment: 'Perfect timing! Like knowing exactly when cheese is perfectly aged!'
      },
      {
        id: 'damage_absorption',
        name: 'Damage Absorption',
        description: 'Convert incoming damage into mana or health.',
        category: 'defensive',
        requirements: 'High INT or high DEF, meditation skill',
        effects: [
          'Convert 50% damage to mana',
          'Heal for 25% of damage absorbed',
          'Works better with magical attacks',
          'Limited uses per battle',
          'Temporary stat boost from absorbed energy'
        ],
        plaggComment: 'Turn pain into power! Like how aging makes cheese stronger!'
      },
      {
        id: 'battle_meditation',
        name: 'Battle Meditation',
        description: 'Find inner peace to restore mana and focus during combat.',
        category: 'utility',
        requirements: 'High INT, meditation training',
        effects: [
          'Restore 50% mana over 2 turns',
          'Immunity to mental effects',
          'Increase accuracy by 25%',
          'Cannot attack while meditating',
          'Next spell deals double damage'
        ],
        plaggComment: 'Inner peace! I find mine in cheese contemplation!'
      },
      {
        id: 'tactical_analysis',
        name: 'Tactical Analysis',
        description: 'Study your opponent to exploit their weaknesses.',
        category: 'utility',
        requirements: 'High INT, multiple combat encounters',
        effects: [
          'Reveal enemy stats and weaknesses',
          '+15% damage against analyzed enemy',
          'Predict enemy next move',
          'Takes one turn to analyze',
          'Share analysis with party members'
        ],
        plaggComment: 'Know your enemy! Like knowing which cheese pairs with what!'
      },
      {
        id: 'environmental_usage',
        name: 'Environmental Usage',
        description: 'Use your surroundings as weapons and tools.',
        category: 'utility',
        requirements: 'High perception, creative thinking',
        effects: [
          'Throw objects for bonus damage',
          'Use terrain for advantage',
          'Create improvised weapons',
          'Bonus in varied environments',
          'Can set environmental traps'
        ],
        plaggComment: 'Creative fighting! I once used a cheese wheel as a shield!'
      }
    ];
  },

  getCategoryColor(category: string): number {
    const colors = {
      offensive: 0xFF4500,
      defensive: 0x4169E1,
      utility: 0x32CD32
    };
    return colors[category as keyof typeof colors] || 0x808080;
  }
};

export default command;
