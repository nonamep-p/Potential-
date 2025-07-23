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

const command: Command = {
  name: 'startrpg',
  description: 'Begin your chaotic journey in the world of Plagg!',
  cooldown: 5,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Check if player already exists
      const existingPlayer = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (existingPlayer) {
        await message.reply('🧀 You\'re already on your chaotic journey! Use `$profile` to see your stats.');
        return;
      }

      // Create class selection embed
      const embed = new EmbedBuilder()
        .setTitle('🧀 Welcome to Plagg\'s Chaotic Realm!')
        .setDescription(
          `**Choose your class, mortal!**\n\n` +
          `🗡️ **Warrior** - Strong and sturdy, like aged cheddar!\n` +
          `*+5 STR, +3 DEF, +2 HP per level*\n\n` +
          `✨ **Mage** - Smart and magical, like... uh... magic cheese?\n` +
          `*+5 INT, +3 MANA per level, +2 starting spells*\n\n` +
          `🏹 **Rogue** - Fast and sneaky, perfect for cheese theft!\n` +
          `*+5 DEX, +2 STR, +3 HP per level, stealth abilities*\n\n` +
          `Choose wisely! You can't change this later... probably.`
        )
        .setColor(0xFFD700)
        .setFooter({ text: 'Select your class below!' });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('class_selection')
        .setPlaceholder('Choose your class...')
        .addOptions([
          {
            label: 'Warrior',
            description: 'Strong melee fighter with high defense',
            value: 'warrior',
            emoji: '🗡️'
          },
          {
            label: 'Mage',
            description: 'Magical caster with powerful spells',
            value: 'mage',
            emoji: '✨'
          },
          {
            label: 'Rogue',
            description: 'Agile assassin with stealth abilities',
            value: 'rogue',
            emoji: '🏹'
          }
        ]);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

      const response = await message.reply({
        embeds: [embed],
        components: [row]
      });

      // Wait for class selection
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000,
        filter: (interaction) => interaction.user.id === message.author.id
      });

      collector.on('collect', async (interaction) => {
        const selectedClass = interaction.values[0];
        
        try {
          // Create player with selected class
          await this.createPlayer(message.author.id, message.author.username, selectedClass);
          
          const successEmbed = new EmbedBuilder()
            .setTitle('🧀 Welcome to the Chaos!')
            .setDescription(
              `**Congratulations, ${message.author.username}!**\n\n` +
              `You are now a **${selectedClass.charAt(0).toUpperCase() + selectedClass.slice(1)}**!\n\n` +
              `🧀 Your starter cheese kit includes:\n` +
              `• Basic equipment for your class\n` +
              `• 100 gold coins\n` +
              `• A healthy dose of chaos\n\n` +
              `Use \`$profile\` to view your stats and \`$help\` to see all available commands!\n\n` +
              `*Now go forth and spread chaos... and maybe find some good cheese!*`
            )
            .setColor(0x00FF00)
            .setThumbnail(message.author.displayAvatarURL());

          await interaction.update({
            embeds: [successEmbed],
            components: []
          });

        } catch (error) {
          logger.error('Error creating player:', error);
          await interaction.reply({
            content: '🧀 Oops! Something went wrong while creating your character. Try again!',
            ephemeral: true
          });
        }
      });

      collector.on('end', (collected) => {
        if (collected.size === 0) {
          response.edit({
            embeds: [embed.setDescription('🧀 You took too long to choose! Run the command again when you\'re ready.')],
            components: []
          });
        }
      });

    } catch (error) {
      logger.error('Error in startrpg command:', error);
      await message.reply('🧀 Failed to start your RPG journey! The cheese gods are displeased.');
    }
  },

  async createPlayer(discordId: string, username: string, className: string) {
    // Base stats
    let stats = {
      hp: 100,
      maxHp: 100,
      mana: 50,
      maxMana: 50,
      str: 10,
      int: 10,
      dex: 10,
      def: 10
    };

    // Starting equipment
    let equipment = {};
    let inventory = [];

    // Apply class bonuses
    switch (className.toLowerCase()) {
      case 'warrior':
        stats.str += 5;
        stats.def += 3;
        stats.hp += 20;
        stats.maxHp += 20;
        equipment = { weapon: 'beginner_sword', armor: 'leather_armor' };
        inventory = [
          { itemId: 'health_potion', quantity: 3 },
          { itemId: 'cheese_wheel', quantity: 1 }
        ];
        break;
      
      case 'mage':
        stats.int += 5;
        stats.mana += 30;
        stats.maxMana += 30;
        equipment = { weapon: 'wooden_staff', armor: 'cloth_robes' };
        inventory = [
          { itemId: 'mana_potion', quantity: 3 },
          { itemId: 'spell_scroll_fireball', quantity: 2 },
          { itemId: 'magic_cheese', quantity: 1 }
        ];
        break;
      
      case 'rogue':
        stats.dex += 5;
        stats.str += 2;
        stats.hp += 15;
        stats.maxHp += 15;
        equipment = { weapon: 'rusty_dagger', armor: 'leather_vest' };
        inventory = [
          { itemId: 'health_potion', quantity: 2 },
          { itemId: 'smoke_bomb', quantity: 3 },
          { itemId: 'stolen_cheese', quantity: 1 }
        ];
        break;
    }

    // Create player in database
    await prisma.player.create({
      data: {
        discordId: discordId,
        username: username,
        className: className.charAt(0).toUpperCase() + className.slice(1),
        ...stats,
        inventoryJson: JSON.stringify(inventory),
        equipmentJson: JSON.stringify(equipment)
      }
    });
  }
};

export default command;
