import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, getRarityEmoji, getRarityColor } from '../../utils/functions.js';
import { Recipe, Item, PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'craft',
  description: 'Craft items using recipes and materials',
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

      const recipes = await loadJsonData<Recipe[]>('recipes.json');
      
      // Filter recipes by player level
      const availableRecipes = recipes.filter(recipe => player.level >= recipe.level);

      if (availableRecipes.length === 0) {
        await message.reply('🧀 You don\'t know any recipes yet! Level up to learn crafting!');
        return;
      }

      if (args.length === 0) {
        await this.showCraftingMenu(message, player, availableRecipes);
        return;
      }

      const recipeName = args.join(' ').toLowerCase();
      const recipe = availableRecipes.find(r => 
        r.name.toLowerCase().includes(recipeName) || 
        r.id.toLowerCase().includes(recipeName)
      );

      if (!recipe) {
        await message.reply(`🧀 Recipe "${recipeName}" not found! Use \`$craft\` to see available recipes.`);
        return;
      }

      await this.attemptCrafting(message, player, recipe);

    } catch (error) {
      logger.error('Error in craft command:', error);
      await message.reply('🧀 Failed to access crafting! The workshop is covered in cheese dust.');
    }
  },

  async showCraftingMenu(message: Message, player: any, recipes: Recipe[]) {
    const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
    
    // Load all items to get material names
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    const embed = new EmbedBuilder()
      .setTitle('🔨 Crafting Workshop')
      .setDescription(
        `**Welcome to the crafting workshop!**\n\n` +
        `You know **${recipes.length}** recipes.\n` +
        `Use \`$craft <recipe name>\` to craft an item!\n\n` +
        `*Green ✅ = You have materials*\n` +
        `*Red ❌ = Missing materials*`
      )
      .setColor(0x8B4513)
      .setFooter({ text: '🧀 "Crafting is like aging cheese - it takes time and skill!" - Plagg' });

    // Show up to 10 recipes
    recipes.slice(0, 10).forEach(recipe => {
      const resultItem = allItems.find(item => item.id === recipe.result.itemId);
      const canCraft = this.checkMaterials(recipe, inventory);
      
      const materialsText = recipe.materials.map(mat => {
        const matItem = allItems.find(item => item.id === mat.itemId);
        const hasQuantity = inventory.find(inv => inv.itemId === mat.itemId)?.quantity || 0;
        const hasEnough = hasQuantity >= mat.quantity;
        
        return `${hasEnough ? '✅' : '❌'} ${matItem?.name || mat.itemId} (${hasQuantity}/${mat.quantity})`;
      }).join('\n');

      embed.addFields({
        name: `${canCraft ? '✅' : '❌'} ${recipe.name} ${resultItem ? getRarityEmoji(resultItem.rarity) : ''}`,
        value: 
          `*Creates ${recipe.result.quantity}x ${resultItem?.name || recipe.result.itemId}*\n` +
          `**Level Required:** ${recipe.level}\n` +
          `**Materials:**\n${materialsText}\n` +
          `*"${recipe.plaggComment}"*`,
        inline: false
      });
    });

    if (recipes.length > 10) {
      embed.setFooter({ text: `🧀 Showing 10 of ${recipes.length} recipes` });
    }

    await message.reply({ embeds: [embed] });
  },

  async attemptCrafting(message: Message, player: any, recipe: Recipe) {
    const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
    
    // Load items to get result item details
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
    const resultItem = allItems.find(item => item.id === recipe.result.itemId);

    if (!resultItem) {
      await message.reply('🧀 Recipe result item not found! This recipe might be corrupted.');
      return;
    }

    // Check if player has all materials
    const missingMaterials = [];
    for (const material of recipe.materials) {
      const hasQuantity = inventory.find(inv => inv.itemId === material.itemId)?.quantity || 0;
      if (hasQuantity < material.quantity) {
        const matItem = allItems.find(item => item.id === material.itemId);
        missingMaterials.push(`${material.quantity - hasQuantity}x ${matItem?.name || material.itemId}`);
      }
    }

    if (missingMaterials.length > 0) {
      await message.reply(
        `🧀 You're missing materials to craft **${recipe.name}**!\n\n` +
        `**Missing:**\n${missingMaterials.map(m => `• ${m}`).join('\n')}`
      );
      return;
    }

    // Show crafting confirmation
    await this.showCraftingConfirmation(message, player, recipe, resultItem);
  },

  async showCraftingConfirmation(message: Message, player: any, recipe: Recipe, resultItem: Item) {
    const embed = new EmbedBuilder()
      .setTitle('🔨 Crafting Confirmation')
      .setDescription(
        `**Are you sure you want to craft this item?**\n\n` +
        `${getRarityEmoji(resultItem.rarity)} **${recipe.name}**\n` +
        `*Creates ${recipe.result.quantity}x ${resultItem.name}*\n\n` +
        `*${resultItem.description}*\n\n` +
        `**This will consume your materials!**`
      )
      .setColor(getRarityColor(resultItem.rarity))
      .setFooter({ text: `🧀 "${recipe.plaggComment}"` });

    // Show materials that will be consumed
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
    
    const materialsText = recipe.materials.map(mat => {
      const matItem = allItems.find(item => item.id === mat.itemId);
      return `• ${mat.quantity}x ${matItem?.name || mat.itemId}`;
    }).join('\n');

    embed.addFields({
      name: '📦 Materials Required',
      value: materialsText,
      inline: false
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_craft')
          .setLabel('🔨 Craft Item')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_craft')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
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
      if (interaction.customId === 'confirm_craft') {
        await this.completeCrafting(interaction, player, recipe, resultItem);
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Crafting Cancelled')
          .setDescription('You decided not to craft the item.')
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
          embeds: [embed.setDescription('🧀 Crafting timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async completeCrafting(interaction: any, player: any, recipe: Recipe, resultItem: Item) {
    try {
      // Get current player data
      const currentPlayer = await prisma.player.findUnique({
        where: { discordId: player.discordId }
      });

      if (!currentPlayer) {
        await interaction.reply({
          content: '🧀 Player data not found!',
          ephemeral: true
        });
        return;
      }

      const inventory: PlayerInventory[] = JSON.parse(currentPlayer.inventoryJson);

      // Double-check materials are still available
      for (const material of recipe.materials) {
        const hasQuantity = inventory.find(inv => inv.itemId === material.itemId)?.quantity || 0;
        if (hasQuantity < material.quantity) {
          await interaction.reply({
            content: '🧀 You no longer have enough materials!',
            ephemeral: true
          });
          return;
        }
      }

      // Remove materials from inventory
      for (const material of recipe.materials) {
        const itemIndex = inventory.findIndex(inv => inv.itemId === material.itemId);
        if (itemIndex !== -1) {
          inventory[itemIndex].quantity -= material.quantity;
          if (inventory[itemIndex].quantity <= 0) {
            inventory.splice(itemIndex, 1);
          }
        }
      }

      // Add crafted item to inventory
      const existingItem = inventory.find(inv => inv.itemId === recipe.result.itemId);
      if (existingItem && resultItem.stackable) {
        existingItem.quantity += recipe.result.quantity;
      } else {
        inventory.push({
          itemId: recipe.result.itemId,
          quantity: recipe.result.quantity
        });
      }

      // Update player
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: {
          inventoryJson: JSON.stringify(inventory)
        }
      });

      // Show success message
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Crafting Successful!')
        .setDescription(
          `**You successfully crafted ${recipe.result.quantity}x ${getRarityEmoji(resultItem.rarity)} ${resultItem.name}!**\n\n` +
          `*${resultItem.description}*\n\n` +
          `The item has been added to your inventory!\n` +
          `Use \`$profile\` to see your items.`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Great craftsmanship! Almost as good as cheese-making!' });

      await interaction.update({
        embeds: [successEmbed],
        components: []
      });

      // Update achievements
      const achievements = JSON.parse(currentPlayer.achievementsJson);
      achievements.itemsCrafted = (achievements.itemsCrafted || 0) + recipe.result.quantity;
      achievements.recipesCrafted = achievements.recipesCrafted || [];
      
      if (!achievements.recipesCrafted.includes(recipe.id)) {
        achievements.recipesCrafted.push(recipe.id);
      }

      await prisma.player.update({
        where: { discordId: player.discordId },
        data: { achievementsJson: JSON.stringify(achievements) }
      });

      // Check for crafting achievements
      if (achievements.itemsCrafted >= 10 && !achievements.craftingNovice) {
        achievements.craftingNovice = true;
        await prisma.player.update({
          where: { discordId: player.discordId },
          data: { achievementsJson: JSON.stringify(achievements) }
        });

        setTimeout(() => {
          interaction.followUp('🎉 **Achievement Unlocked:** Crafting Novice! You\'ve crafted 10 items!');
        }, 2000);
      }

    } catch (error) {
      logger.error('Error completing crafting:', error);
      await interaction.reply({
        content: '🧀 Failed to complete crafting! Try again.',
        ephemeral: true
      });
    }
  },

  checkMaterials(recipe: Recipe, inventory: PlayerInventory[]): boolean {
    return recipe.materials.every(material => {
      const hasQuantity = inventory.find(inv => inv.itemId === material.itemId)?.quantity || 0;
      return hasQuantity >= material.quantity;
    });
  }
};

export default command;
