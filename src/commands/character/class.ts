import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

interface ClassInfo {
  name: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  startingStats: {
    str: number;
    int: number;
    dex: number;
    def: number;
    hp: number;
    mana: number;
  };
  plaggComment: string;
}

const command: Command = {
  name: 'class',
  description: 'View information about character classes',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      if (args.length > 0) {
        // Show specific class info
        const className = args[0].toLowerCase();
        const classInfo = this.getClassInfo(className);

        if (!classInfo) {
          await message.reply('🧀 Unknown class! Available classes: Warrior, Mage, Rogue');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`⚔️ ${classInfo.name} Class`)
          .setDescription(classInfo.description)
          .setColor(this.getClassColor(className))
          .addFields(
            {
              name: '💪 Strengths',
              value: classInfo.strengths.map(s => `• ${s}`).join('\n'),
              inline: true
            },
            {
              name: '⚠️ Weaknesses',
              value: classInfo.weaknesses.map(w => `• ${w}`).join('\n'),
              inline: true
            },
            {
              name: '📊 Starting Stats',
              value: 
                `**STR:** ${classInfo.startingStats.str}\n` +
                `**INT:** ${classInfo.startingStats.int}\n` +
                `**DEX:** ${classInfo.startingStats.dex}\n` +
                `**DEF:** ${classInfo.startingStats.def}\n` +
                `**HP:** ${classInfo.startingStats.hp}\n` +
                `**Mana:** ${classInfo.startingStats.mana}`,
              inline: false
            }
          )
          .setFooter({ text: `🧀 Plagg says: "${classInfo.plaggComment}"` });

        await message.reply({ embeds: [embed] });
        return;
      }

      // Show player's current class or all classes
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (player) {
        // Show player's current class
        const classInfo = this.getClassInfo(player.className.toLowerCase());
        
        if (classInfo) {
          const embed = new EmbedBuilder()
            .setTitle(`⚔️ Your Class: ${player.className}`)
            .setDescription(
              `${classInfo.description}\n\n` +
              `**Your Current Stats:**\n` +
              `**STR:** ${player.str} | **INT:** ${player.int}\n` +
              `**DEX:** ${player.dex} | **DEF:** ${player.def}\n` +
              `**HP:** ${player.hp}/${player.maxHp} | **Mana:** ${player.mana}/${player.maxMana}`
            )
            .setColor(this.getClassColor(player.className.toLowerCase()))
            .addFields(
              {
                name: '💪 Class Strengths',
                value: classInfo.strengths.map(s => `• ${s}`).join('\n'),
                inline: true
              },
              {
                name: '⚠️ Class Weaknesses',
                value: classInfo.weaknesses.map(w => `• ${w}`).join('\n'),
                inline: true
              }
            )
            .setFooter({ text: `🧀 Plagg says: "${classInfo.plaggComment}"` });

          await message.reply({ embeds: [embed] });
        } else {
          await message.reply('🧀 I can\'t find information about your class. That\'s concerning...');
        }
      } else {
        // Show all available classes
        await this.showAllClasses(message);
      }

    } catch (error) {
      logger.error('Error in class command:', error);
      await message.reply('🧀 Failed to load class information! The class registry is covered in cheese.');
    }
  },

  async showAllClasses(message: Message) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Character Classes')
      .setDescription(
        'Choose your class when you start your RPG journey with `$startrpg`!\n\n' +
        'Use `$class <name>` to view detailed information about a specific class.'
      )
      .setColor(0x8B4513)
      .addFields(
        {
          name: '🗡️ Warrior',
          value: 
            '*Strong and sturdy melee fighter*\n' +
            '**Focus:** STR, DEF, HP\n' +
            '**Style:** Tank, high damage melee',
          inline: true
        },
        {
          name: '✨ Mage',
          value: 
            '*Powerful magical spellcaster*\n' +
            '**Focus:** INT, Mana, Magic\n' +
            '**Style:** Ranged damage, utility spells',
          inline: true
        },
        {
          name: '🏹 Rogue',
          value: 
            '*Fast and sneaky assassin*\n' +
            '**Focus:** DEX, Speed, Crits\n' +
            '**Style:** High mobility, critical strikes',
          inline: true
        }
      )
      .setFooter({ text: '🧀 Each class has unique abilities and playstyles!' });

    await message.reply({ embeds: [embed] });
  },

  getClassInfo(className: string): ClassInfo | null {
    const classes: { [key: string]: ClassInfo } = {
      warrior: {
        name: 'Warrior',
        description: 'A mighty melee fighter who excels in close combat and can take heavy damage.',
        strengths: [
          'High health and defense',
          'Strong melee attacks',
          'Can use heavy armor and weapons',
          'Excellent survivability',
          'Good at protecting allies'
        ],
        weaknesses: [
          'Limited ranged options',
          'Low magic resistance',
          'Slower movement speed',
          'Vulnerable to kiting'
        ],
        startingStats: {
          str: 15,
          int: 10,
          dex: 10,
          def: 13,
          hp: 120,
          mana: 50
        },
        plaggComment: 'Strong like aged cheddar! But probably not as smart as cheese.'
      },
      mage: {
        name: 'Mage',
        description: 'A master of arcane arts who wields powerful magic to devastate enemies from afar.',
        strengths: [
          'Powerful ranged magic attacks',
          'Large mana pool',
          'Utility and support spells',
          'Area of effect abilities',
          'Elemental mastery'
        ],
        weaknesses: [
          'Low health and defense',
          'Vulnerable in melee combat',
          'Mana-dependent abilities',
          'Requires strategic positioning'
        ],
        startingStats: {
          str: 10,
          int: 15,
          dex: 10,
          def: 10,
          hp: 100,
          mana: 80
        },
        plaggComment: 'Smart! Can probably figure out the perfect cheese-to-cracker ratio.'
      },
      rogue: {
        name: 'Rogue',
        description: 'A swift and deadly assassin who strikes from the shadows with precision.',
        strengths: [
          'High critical hit chance',
          'Excellent mobility',
          'Stealth abilities',
          'High damage per second',
          'Can dodge attacks effectively'
        ],
        weaknesses: [
          'Lower health than warriors',
          'Requires positioning',
          'Less effective against armor',
          'Limited AoE options'
        ],
        startingStats: {
          str: 12,
          int: 10,
          dex: 15,
          def: 10,
          hp: 115,
          mana: 50
        },
        plaggComment: 'Sneaky! Perfect for stealing cheese when no one\'s looking!'
      }
    };

    return classes[className] || null;
  },

  getClassColor(className: string): number {
    const colors = {
      warrior: 0xFF4500,  // Red-orange
      mage: 0x4169E1,     // Royal blue
      rogue: 0x32CD32     // Lime green
    };
    return colors[className as keyof typeof colors] || 0x808080;
  }
};

export default command;
