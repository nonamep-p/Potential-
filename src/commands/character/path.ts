import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

interface Path {
  id: string;
  name: string;
  description: string;
  requirements: string;
  bonuses: string[];
  plaggComment: string;
}

const command: Command = {
  name: 'path',
  description: 'Choose your character path (Level 20+)',
  cooldown: 10,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Get player data
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (player.level < 20) {
        await message.reply(`🧀 You must be at least level 20 to choose a path! You're currently level ${player.level}.`);
        return;
      }

      if (player.pathName) {
        // Show current path info
        const paths = this.getAvailablePaths();
        const currentPath = paths.find(p => p.id === player.pathName);
        
        if (currentPath) {
          const embed = new EmbedBuilder()
            .setTitle('🌟 Your Current Path')
            .setDescription(
              `**${currentPath.name}**\n\n` +
              `*${currentPath.description}*\n\n` +
              `**Bonuses:**\n${currentPath.bonuses.map(b => `• ${b}`).join('\n')}`
            )
            .setColor(0xFFD700)
            .setFooter({ text: `🧀 Plagg says: "${currentPath.plaggComment}"` });

          await message.reply({ embeds: [embed] });
        } else {
          await message.reply('🧀 You have a path set, but I can\'t find the details. That\'s suspicious...');
        }
        return;
      }

      // Show path selection
      await this.showPathSelection(message, player);

    } catch (error) {
      logger.error('Error in path command:', error);
      await message.reply('🧀 Failed to access path selection! The path is blocked by moldy cheese.');
    }
  },

  async showPathSelection(message: Message, player: any) {
    const paths = this.getAvailablePaths();
    
    const embed = new EmbedBuilder()
      .setTitle('🌟 Choose Your Path')
      .setDescription(
        `**Congratulations on reaching level 20!**\n\n` +
        `You can now choose a specialized path that will enhance your abilities and unlock new possibilities.\n\n` +
        `**Choose wisely - this decision is permanent!**\n\n` +
        `Select a path from the dropdown below to see its details.`
      )
      .setColor(0xFFD700)
      .setFooter({ text: '🧀 This is a big decision! Like choosing between different types of cheese!' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('path_selection')
      .setPlaceholder('Choose your path...')
      .addOptions(
        paths.map(path => ({
          label: path.name,
          description: path.description.substring(0, 100),
          value: path.id,
          emoji: this.getPathEmoji(path.id)
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    const response = await message.reply({
      embeds: [embed],
      components: [row]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 300000, // 5 minutes
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      const selectedPathId = interaction.values[0];
      const selectedPath = paths.find(p => p.id === selectedPathId);

      if (!selectedPath) {
        await interaction.reply({
          content: '🧀 Invalid path selection!',
          ephemeral: true
        });
        return;
      }

      // Show path details with confirmation
      const confirmEmbed = new EmbedBuilder()
        .setTitle(`🌟 Path: ${selectedPath.name}`)
        .setDescription(
          `*${selectedPath.description}*\n\n` +
          `**Requirements:** ${selectedPath.requirements}\n\n` +
          `**Bonuses you'll receive:**\n${selectedPath.bonuses.map(b => `• ${b}`).join('\n')}\n\n` +
          `**Are you sure you want to choose this path?**\n` +
          `*This decision cannot be changed!*`
        )
        .setColor(0xFF6B35)
        .setFooter({ text: `🧀 Plagg says: "${selectedPath.plaggComment}"` });

      const confirmButtons = new ActionRowBuilder<any>()
        .addComponents(
          {
            type: 2,
            style: 3,
            label: 'Yes, Choose This Path',
            custom_id: `confirm_path_${selectedPath.id}`,
            emoji: { name: '✅' }
          },
          {
            type: 2,
            style: 4,
            label: 'Cancel',
            custom_id: 'cancel_path',
            emoji: { name: '❌' }
          }
        );

      await interaction.update({
        embeds: [confirmEmbed],
        components: [confirmButtons]
      });
    });

    // Handle path confirmation
    const confirmCollector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    confirmCollector.on('collect', async (interaction) => {
      if (interaction.customId === 'cancel_path') {
        await interaction.update({
          embeds: [embed],
          components: [row]
        });
        return;
      }

      if (interaction.customId.startsWith('confirm_path_')) {
        const pathId = interaction.customId.replace('confirm_path_', '');
        const selectedPath = paths.find(p => p.id === pathId);

        if (selectedPath) {
          // Apply path bonuses and update player
          const bonuses = this.applyPathBonuses(selectedPath, player);
          
          await prisma.player.update({
            where: { discordId: message.author.id },
            data: {
              pathName: selectedPath.name,
              ...bonuses
            }
          });

          const successEmbed = new EmbedBuilder()
            .setTitle('🌟 Path Chosen!')
            .setDescription(
              `**Congratulations!** You have chosen the path of **${selectedPath.name}**!\n\n` +
              `Your bonuses have been applied:\n${selectedPath.bonuses.map(b => `✅ ${b}`).join('\n')}\n\n` +
              `*Your journey as a ${selectedPath.name} begins now!*`
            )
            .setColor(0x00FF00)
            .setFooter({ text: `🧀 Plagg says: "${selectedPath.plaggComment}"` });

          await interaction.update({
            embeds: [successEmbed],
            components: []
          });
        }
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Path selection timed out! Run the command again when you\'re ready to choose.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  getAvailablePaths(): Path[] {
    return [
      {
        id: 'berserker',
        name: 'Berserker',
        description: 'Embrace rage and chaos in battle. Devastating attacks but reduced defense.',
        requirements: 'High STR, completed 10 combat encounters',
        bonuses: [
          '+15 STR, +10 ATK Power',
          'Berserker Rage ability (2x damage, -50% defense for 3 turns)',
          'Immunity to fear effects',
          'Life steal on critical hits'
        ],
        plaggComment: 'Rage and cheese don\'t mix well, but I admire the passion!'
      },
      {
        id: 'archmage',
        name: 'Archmage',
        description: 'Master of magical arts. Powerful spells and vast mana reserves.',
        requirements: 'High INT, learned 5 different spells',
        bonuses: [
          '+15 INT, +50 Max Mana',
          'Spell mastery (25% reduced mana costs)',
          'Elemental resistance (20% to all)',
          'Can cast two spells per turn'
        ],
        plaggComment: 'Magic is cool, but can you conjure cheese? That\'s the real test!'
      },
      {
        id: 'shadowdancer',
        name: 'Shadowdancer',
        description: 'Master of stealth and precision. Strike from the shadows with deadly accuracy.',
        requirements: 'High DEX, successful stealth kills',
        bonuses: [
          '+15 DEX, +20% Crit Chance',
          'Shadow Step ability (teleport behind enemy)',
          'First strike advantage in combat',
          'Can dodge area attacks'
        ],
        plaggComment: 'Sneaky! Perfect for stealing cheese when no one\'s looking!'
      },
      {
        id: 'guardian',
        name: 'Guardian',
        description: 'Protector of the innocent. Unbreakable defense and healing abilities.',
        requirements: 'High DEF, protected other players',
        bonuses: [
          '+15 DEF, +100 Max HP',
          'Taunt ability (force enemies to target you)',
          'Healing Touch (restore HP to self/allies)',
          'Damage reflection (10% of damage taken)'
        ],
        plaggComment: 'A protector, huh? Can you protect my cheese stash?'
      },
      {
        id: 'cheese_master',
        name: 'Cheese Master',
        description: 'The ultimate path for those who truly understand the power of cheese.',
        requirements: 'Found Plagg\'s blessing, owns cheese-related items',
        bonuses: [
          '+10 to all stats',
          'Cheese Mastery (special cheese-based abilities)',
          'Plagg\'s Favor (luck bonus on all rolls)',
          'Can summon cheese golems in battle'
        ],
        plaggComment: 'NOW WE\'RE TALKING! You understand the true power! I\'m so proud!'
      },
      {
        id: 'dimensional_wanderer',
        name: 'Dimensional Wanderer',
        description: 'One who has touched other realities. Unpredictable but powerful.',
        requirements: 'Completed 3+ Isekai scenarios',
        bonuses: [
          '+8 to all stats',
          'Reality Shift (random beneficial effect each combat)',
          'Dimensional Storage (extra inventory space)',
          'Portal Step (fast travel between locations)'
        ],
        plaggComment: 'Other dimensions? Do they have interdimensional cheese delivery?'
      }
    ];
  },

  applyPathBonuses(path: Path, player: any): any {
    const bonuses: any = {};

    switch (path.id) {
      case 'berserker':
        bonuses.str = player.str + 15;
        bonuses.maxHp = player.maxHp + 50;
        break;
      case 'archmage':
        bonuses.int = player.int + 15;
        bonuses.maxMana = player.maxMana + 50;
        break;
      case 'shadowdancer':
        bonuses.dex = player.dex + 15;
        break;
      case 'guardian':
        bonuses.def = player.def + 15;
        bonuses.maxHp = player.maxHp + 100;
        bonuses.hp = Math.min(player.hp + 100, bonuses.maxHp);
        break;
      case 'cheese_master':
        bonuses.str = player.str + 10;
        bonuses.int = player.int + 10;
        bonuses.dex = player.dex + 10;
        bonuses.def = player.def + 10;
        break;
      case 'dimensional_wanderer':
        bonuses.str = player.str + 8;
        bonuses.int = player.int + 8;
        bonuses.dex = player.dex + 8;
        bonuses.def = player.def + 8;
        break;
    }

    return bonuses;
  },

  getPathEmoji(pathId: string): string {
    const emojis = {
      berserker: '⚔️',
      archmage: '🔮',
      shadowdancer: '🌙',
      guardian: '🛡️',
      cheese_master: '🧀',
      dimensional_wanderer: '🌀'
    };
    return emojis[pathId as keyof typeof emojis] || '🌟';
  }
};

export default command;
