import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, getRarityEmoji } from '../../utils/functions.js';
import { Recipe, Item } from '../../types.js';
import { Paginator } from '../../structures/Paginator.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'recipes',
  description: 'View all known crafting recipes',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      const recipes = await loadJsonData<Recipe[]>('recipes.json');
      
      // Filter recipes by player level
      const knownRecipes = recipes.filter(recipe => player.level >= recipe.level);
      const unknownRecipes = recipes.filter(recipe => player.level < recipe.level);

      if (args.length > 0) {
        const recipeName = args.join(' ').toLowerCase();
        const recipe = recipes.find(r => 
          r.name.toLowerCase().includes(recipeName) || 
          r.id.toLowerCase().includes(recipeName)
        );

        if (!recipe) {
          await message.reply(`🧀 Recipe "${recipeName}" not found!`);
          return;
        }

        if (player.level < recipe.level) {
          await message.reply(`🧀 You don't know that recipe yet! You need to be level ${recipe.level}.`);
          return;
        }

        await this.showRecipeDetails(message, recipe);
        return;
      }

      await this.showRecipeBook(message, player, knownRecipes, unknownRecipes);

    } catch (error) {
      logger.error('Error in recipes command:', error);
      await message.reply('🧀 Failed to access recipe book! It\'s covered in cheese fingerprints.');
    }
  },

  async showRecipeBook(message: Message, player: any, knownRecipes: Recipe[], unknownRecipes: Recipe[]) {
    const embeds = [];

    // Overview page
    const overviewEmbed = new EmbedBuilder()
      .setTitle('📚 Recipe Book')
      .setDescription(
        `**${player.username}'s Crafting Knowledge**\n\n` +
        `📖 **Known Recipes:** ${knownRecipes.length}\n` +
        `🔒 **Locked Recipes:** ${unknownRecipes.length}\n` +
        `📊 **Total Recipes:** ${knownRecipes.length + unknownRecipes.length}\n\n` +
        `*Use \`$recipes <name>\` for detailed recipe information.*\n` +
        `*Use \`$craft <name>\` to craft an item.*`
      )
      .setColor(0x8B4513)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: '🧀 "Recipes are like cheese - some are simple, others are complex!" - Plagg' });

    embeds.push(overviewEmbed);

    // Load items for recipe details
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    // Group known recipes by category
    const categories = this.categorizeRecipes(knownRecipes, allItems);

    // Create pages for each category
    Object.entries(categories).forEach(([category, recipes]) => {
      if (recipes.length === 0) return;

      const categoryEmbed = new EmbedBuilder()
        .setTitle(`🔨 ${category} Recipes`)
        .setDescription(`**${recipes.length} recipes available**`)
        .setColor(this.getCategoryColor(category));

      recipes.forEach(recipe => {
        const resultItem = allItems.find(item => item.id === recipe.result.itemId);
        const materialsText = recipe.materials.map(mat => {
          const matItem = allItems.find(item => item.id === mat.itemId);
          return `${mat.quantity}x ${matItem?.name || mat.itemId}`;
        }).join(', ');

        categoryEmbed.addFields({
          name: `${resultItem ? getRarityEmoji(resultItem.rarity) : '📦'} ${recipe.name} (Level ${recipe.level})`,
          value: 
            `*Creates ${recipe.result.quantity}x ${resultItem?.name || recipe.result.itemId}*\n` +
            `**Materials:** ${materialsText}\n` +
            `*"${recipe.plaggComment}"*`,
          inline: false
        });
      });

      embeds.push(categoryEmbed);
    });

    // Locked recipes page
    if (unknownRecipes.length > 0) {
      const lockedEmbed = new EmbedBuilder()
        .setTitle('🔒 Locked Recipes')
        .setDescription('**Recipes you can learn by leveling up**')
        .setColor(0x808080);

      unknownRecipes.slice(0, 10).forEach(recipe => {
        const resultItem = allItems.find(item => item.id === recipe.result.itemId);
        
        lockedEmbed.addFields({
          name: `🔒 ${recipe.name} (Requires Level ${recipe.level})`,
          value: 
            `*Creates ${recipe.result.quantity}x ${resultItem?.name || recipe.result.itemId}*\n` +
            `*"${recipe.plaggComment}"*`,
          inline: false
        });
      });

      if (unknownRecipes.length > 10) {
        lockedEmbed.setFooter({ text: `🧀 Showing 10 of ${unknownRecipes.length} locked recipes` });
      }

      embeds.push(lockedEmbed);
    }

    const paginator = new Paginator({
      embeds: embeds,
      time: 120000,
      showPageNumbers: true
    });

    await paginator.start(message);
  },

  async showRecipeDetails(message: Message, recipe: Recipe) {
    // Load items for detailed information
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
    const resultItem = allItems.find(item => item.id === recipe.result.itemId);

    const embed = new EmbedBuilder()
      .setTitle(`📝 Recipe: ${recipe.name}`)
      .setDescription(
        `**Creates ${recipe.result.quantity}x ${resultItem?.name || recipe.result.itemId}**\n\n` +
        `${resultItem ? `*${resultItem.description}*\n\n` : ''}` +
        `**Level Required:** ${recipe.level}`
      )
      .setColor(resultItem ? this.getRarityColor(resultItem.rarity) : 0x8B4513)
      .setFooter({ text: `🧀 "${recipe.plaggComment}"` });

    // Add result item stats if available
    if (resultItem && resultItem.stats) {
      embed.addFields({
        name: '📊 Result Item Stats',
        value: Object.entries(resultItem.stats)
          .map(([stat, value]) => `**${stat.toUpperCase()}:** +${value}`)
          .join('\n'),
        inline: true
      });
    }

    // Add materials required
    const materialsText = recipe.materials.map(mat => {
      const matItem = allItems.find(item => item.id === mat.itemId);
      return `• ${mat.quantity}x ${matItem?.name || mat.itemId}`;
    }).join('\n');

    embed.addFields({
      name: '📦 Materials Required',
      value: materialsText,
      inline: false
    });

    // Add crafting tip
    embed.addFields({
      name: '💡 Crafting Tip',
      value: `Use \`$craft ${recipe.name}\` to craft this item if you have the materials!`,
      inline: false
    });

    await message.reply({ embeds: [embed] });
  },

  categorizeRecipes(recipes: Recipe[], items: Item[]): { [key: string]: Recipe[] } {
    const categories: { [key: string]: Recipe[] } = {
      'Weapons': [],
      'Armor': [],
      'Consumables': [],
      'Artifacts': [],
      'Materials': [],
      'Other': []
    };

    recipes.forEach(recipe => {
      const resultItem = items.find(item => item.id === recipe.result.itemId);
      
      if (resultItem) {
        switch (resultItem.type) {
          case 'weapon':
            categories['Weapons'].push(recipe);
            break;
          case 'armor':
            categories['Armor'].push(recipe);
            break;
          case 'consumable':
            categories['Consumables'].push(recipe);
            break;
          case 'artifact':
            categories['Artifacts'].push(recipe);
            break;
          case 'material':
            categories['Materials'].push(recipe);
            break;
          default:
            categories['Other'].push(recipe);
        }
      } else {
        categories['Other'].push(recipe);
      }
    });

    return categories;
  },

  getCategoryColor(category: string): number {
    const colors = {
      'Weapons': 0xFF4500,
      'Armor': 0x4169E1,
      'Consumables': 0x32CD32,
      'Artifacts': 0x8B008B,
      'Materials': 0x8B4513,
      'Other': 0x808080
    };
    return colors[category as keyof typeof colors] || 0x808080;
  },

  getRarityColor(rarity: string): number {
    const colors = {
      common: 0x808080,
      uncommon: 0x00FF00,
      rare: 0x0080FF,
      epic: 0x8000FF,
      legendary: 0xFF8000,
      mythic: 0xFF0080
    };
    return colors[rarity as keyof typeof colors] || colors.common;
  }
};

export default command;
