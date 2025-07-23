import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { Paginator } from '../../structures/Paginator.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

interface Title {
  id: string;
  name: string;
  description: string;
  requirement: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  plaggComment: string;
}

const command: Command = {
  name: 'title',
  description: 'Manage your character titles',
  cooldown: 5,
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

      // Get available titles based on achievements
      const availableTitles = await this.getAvailableTitles(player);
      const achievements = JSON.parse(player.achievementsJson);
      const unlockedTitles = availableTitles.filter(title => 
        this.checkTitleRequirement(title, player, achievements)
      );

      if (args.length === 0) {
        // Show title management menu
        await this.showTitleMenu(message, player, unlockedTitles);
        return;
      }

      const action = args[0].toLowerCase();

      if (action === 'set' && args.length > 1) {
        const titleName = args.slice(1).join(' ').toLowerCase();
        const title = unlockedTitles.find(t => t.name.toLowerCase() === titleName);

        if (!title) {
          await message.reply('🧀 You don\'t have that title unlocked! Use `$title` to see available titles.');
          return;
        }

        // Update player's current title (store in achievements JSON for now)
        const updatedAchievements = achievements;
        updatedAchievements.currentTitle = title.id;

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: { achievementsJson: JSON.stringify(updatedAchievements) }
        });

        const embed = new EmbedBuilder()
          .setTitle('👑 Title Updated!')
          .setDescription(`You are now known as **${title.name}**!\n\n*${title.description}*`)
          .setColor(this.getTitleColor(title.rarity))
          .setFooter({ text: `🧀 Plagg says: "${title.plaggComment}"` });

        await message.reply({ embeds: [embed] });
        return;
      }

      if (action === 'remove') {
        const updatedAchievements = achievements;
        delete updatedAchievements.currentTitle;

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: { achievementsJson: JSON.stringify(updatedAchievements) }
        });

        await message.reply('🧀 Title removed! You\'re back to being a regular cheese-less peasant.');
        return;
      }

      await message.reply('🧀 Usage: `$title` to manage titles, `$title set <name>` to equip, `$title remove` to unequip.');

    } catch (error) {
      logger.error('Error in title command:', error);
      await message.reply('🧀 Failed to manage titles! The title registry is covered in cheese stains.');
    }
  },

  async showTitleMenu(message: Message, player: any, unlockedTitles: Title[]) {
    const achievements = JSON.parse(player.achievementsJson);
    const currentTitle = achievements.currentTitle ? 
      unlockedTitles.find(t => t.id === achievements.currentTitle) : null;

    // Create pages for titles
    const embeds = [];
    const titlesPerPage = 5;
    
    for (let i = 0; i < unlockedTitles.length; i += titlesPerPage) {
      const pageTitles = unlockedTitles.slice(i, i + titlesPerPage);
      
      const embed = new EmbedBuilder()
        .setTitle('👑 Your Titles')
        .setDescription(
          `${currentTitle ? `**Current Title:** ${currentTitle.name}\n\n` : '**No title equipped**\n\n'}` +
          `You have unlocked **${unlockedTitles.length}** titles!\n\n` +
          `Use \`$title set <name>\` to equip a title.`
        )
        .setColor(0xFFD700);

      pageTitles.forEach(title => {
        const isEquipped = currentTitle?.id === title.id;
        embed.addFields({
          name: `${this.getRarityEmoji(title.rarity)} ${title.name} ${isEquipped ? '(Equipped)' : ''}`,
          value: `*${title.description}*\n**Requirement:** ${title.requirement}`,
          inline: false
        });
      });

      embeds.push(embed);
    }

    if (embeds.length === 0) {
      const noTitlesEmbed = new EmbedBuilder()
        .setTitle('👑 Your Titles')
        .setDescription(
          '🧀 You haven\'t unlocked any titles yet!\n\n' +
          'Complete achievements and reach milestones to unlock titles.\n\n' +
          '**Some ways to earn titles:**\n' +
          '• Reach certain levels\n' +
          '• Complete specific achievements\n' +
          '• Win PvP battles\n' +
          '• Complete dungeons\n' +
          '• Find rare items'
        )
        .setColor(0x808080)
        .setFooter({ text: '🧀 Plagg says: "Even I have more titles than you!"' });

      await message.reply({ embeds: [noTitlesEmbed] });
      return;
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    await paginator.start(message);
  },

  async getAvailableTitles(player: any): Promise<Title[]> {
    // Define all available titles
    return [
      {
        id: 'newbie',
        name: 'The Newbie',
        description: 'Fresh as newly made cheese',
        requirement: 'Start your RPG journey',
        rarity: 'common',
        plaggComment: 'Everyone starts somewhere, even cheese!'
      },
      {
        id: 'adventurer',
        name: 'Adventurer',
        description: 'One who seeks adventure and cheese',
        requirement: 'Reach level 5',
        rarity: 'common',
        plaggComment: 'Adventure is good, but have you tried adventure with cheese?'
      },
      {
        id: 'warrior',
        name: 'Seasoned Warrior',
        description: 'Battle-hardened and cheese-approved',
        requirement: 'Reach level 10',
        rarity: 'uncommon',
        plaggComment: 'Seasoned like good cheese! I approve.'
      },
      {
        id: 'champion',
        name: 'Champion',
        description: 'A true champion of the realm',
        requirement: 'Reach level 20',
        rarity: 'rare',
        plaggComment: 'Champion? More like... cham-pion of cheese consumption!'
      },
      {
        id: 'legend',
        name: 'Living Legend',
        description: 'Legends are made of cheese and dreams',
        requirement: 'Reach level 30',
        rarity: 'epic',
        plaggComment: 'Legendary! Like aged Gouda, you\'ve gotten better with time.'
      },
      {
        id: 'cheese_lover',
        name: 'Cheese Enthusiast',
        description: 'One who truly appreciates the finer things',
        requirement: 'Find any cheese-related item',
        rarity: 'uncommon',
        plaggComment: 'FINALLY! Someone with taste!'
      },
      {
        id: 'dungeon_crawler',
        name: 'Dungeon Crawler',
        description: 'Explores the deepest, darkest places',
        requirement: 'Complete 5 dungeons',
        rarity: 'rare',
        plaggComment: 'Dark places are where the best cheese ages!'
      },
      {
        id: 'pvp_warrior',
        name: 'Arena Fighter',
        description: 'Proven in combat against other players',
        requirement: 'Win 10 PvP battles',
        rarity: 'rare',
        plaggComment: 'Fighting other people? Wouldn\'t it be easier to just share cheese?'
      },
      {
        id: 'millionaire',
        name: 'Golden Touch',
        description: 'Wealth beyond measure',
        requirement: 'Accumulate 1,000,000 gold',
        rarity: 'epic',
        plaggComment: 'Rich enough to buy the finest cheese in existence!'
      },
      {
        id: 'isekai_hero',
        name: 'Isekai Protagonist',
        description: 'One who has experienced otherworldly adventures',
        requirement: 'Complete 5 Isekai scenarios',
        rarity: 'legendary',
        plaggComment: 'Another world? Do they have better cheese there?'
      }
    ];
  },

  checkTitleRequirement(title: Title, player: any, achievements: any): boolean {
    switch (title.id) {
      case 'newbie':
        return true; // Everyone gets this
      case 'adventurer':
        return player.level >= 5;
      case 'warrior':
        return player.level >= 10;
      case 'champion':
        return player.level >= 20;
      case 'legend':
        return player.level >= 30;
      case 'cheese_lover':
        // Check if player has any cheese items
        const inventory = JSON.parse(player.inventoryJson);
        return inventory.some((item: any) => item.itemId.includes('cheese'));
      case 'dungeon_crawler':
        return achievements.dungeonsCompleted >= 5;
      case 'pvp_warrior':
        return achievements.pvpWins >= 10;
      case 'millionaire':
        return player.gold >= 1000000;
      case 'isekai_hero':
        return JSON.parse(player.completedScenariosJson).length >= 5;
      default:
        return false;
    }
  },

  getTitleColor(rarity: string): number {
    const colors = {
      common: 0x808080,
      uncommon: 0x00FF00,
      rare: 0x0080FF,
      epic: 0x8000FF,
      legendary: 0xFF8000
    };
    return colors[rarity as keyof typeof colors] || colors.common;
  },

  getRarityEmoji(rarity: string): string {
    const emojis = {
      common: '⚪',
      uncommon: '🟢',
      rare: '🔵',
      epic: '🟣',
      legendary: '🟠'
    };
    return emojis[rarity as keyof typeof emojis] || emojis.common;
  }
};

export default command;
