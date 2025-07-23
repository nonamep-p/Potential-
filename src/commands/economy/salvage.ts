import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, getRarityEmoji, getRarityColor, rollDice } from '../../utils/functions.js';
import { Item, PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'salvage',
  description: 'Salvage items for crafting materials',
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

      const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
      
      if (inventory.length === 0) {
        await message.reply('🧀 Your inventory is empty! Nothing to salvage except maybe some cheese crumbs.');
        return;
      }

      if (args.length === 0) {
        await this.showSalvageMenu(message, player, inventory);
        return;
      }

      const itemName = args.join(' ').toLowerCase();
      
      // Load all items to get details
      const [weapons, armor, consumables, artifacts] = await Promise.all([
        loadJsonData<Item[]>('items/weapons.json'),
        loadJsonData<Item[]>('items/armor.json'),
        loadJsonData<Item[]>('items/consumables.json'),
        loadJsonData<Item[]>('items/artifacts.json')
      ]);

      const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
      
      // Find the item in inventory
      const invItem = inventory.find(item => {
        const itemData = allItems.find(i => i.id === item.itemId);
        return itemData && (
          itemData.name.toLowerCase().includes(itemName) || 
          itemData.id.toLowerCase().includes(itemName)
        );
      });

      if (!invItem) {
        await message.reply(`🧀 You don't have "${itemName}" in your inventory!`);
        return;
      }

      const itemData = allItems.find(i => i.id === invItem.itemId);
      if (!itemData) {
        await message.reply('🧀 Item data not found! This is suspicious...');
        return;
      }

      // Check if item can be salvaged
      if (!this.canSalvageItem(itemData)) {
        await message.reply(`🧀 **${itemData.name}** cannot be salvaged! ${this.getSalvageRestrictionReason(itemData)}`);
        return;
      }

      await this.showSalvageConfirmation(message, player, itemData, invItem);

    } catch (error) {
      logger.error('Error in salvage command:', error);
      await message.reply('🧀 Failed to salvage item! The salvage equipment is covered in melted cheese.');
    }
  },

  async showSalvageMenu(message: Message, player: any, inventory: PlayerInventory[]) {
    // Load all items to get details
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
    
    // Get salvageable items (not equipped and not consumables)
    const equipment = JSON.parse(player.equipmentJson);
    const equippedItems = Object.values(equipment);
    
    const salvageableItems = inventory
      .filter(invItem => !equippedItems.includes(invItem.itemId))
      .map(invItem => {
        const itemData = allItems.find(i => i.id === invItem.itemId);
        return { invItem, itemData };
      })
      .filter(item => item.itemData && this.canSalvageItem(item.itemData));

    if (salvageableItems.length === 0) {
      await message.reply('🧀 No salvageable items in your inventory! (Equipped items, consumables, and special items cannot be salvaged)');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚒️ Salvage Workshop')
      .setDescription(
        `**Break down items for crafting materials**\n\n` +
        `🔨 **How salvaging works:**\n` +
        `• Higher rarity = better materials\n` +
        `• Level affects material quantity\n` +
        `• Some chance of rare materials\n` +
        `• **WARNING: This destroys the item!**\n\n` +
        `Use \`$salvage <item name>\` to salvage a specific item.`
      )
      .setColor(0x8B4513);

    // Show up to 10 salvageable items
    salvageableItems.slice(0, 10).forEach(({ invItem, itemData }) => {
      if (!itemData) return;
      
      const materials = this.calculateSalvageMaterials(itemData);
      const materialsText = materials.map(mat => 
        `${mat.min === mat.max ? mat.min : `${mat.min}-${mat.max}`}x ${mat.name}`
      ).join(', ');

      embed.addFields({
        name: `${getRarityEmoji(itemData.rarity)} ${itemData.name} (x${invItem.quantity})`,
        value: 
          `*Level ${itemData.level || 1} ${itemData.type}*\n` +
          `**Materials:** ${materialsText}\n` +
          `*"${itemData.plaggComment}"*`,
        inline: true
      });
    });

    if (salvageableItems.length > 10) {
      embed.setFooter({ text: `🧀 Showing 10 of ${salvageableItems.length} salvageable items` });
    }

    await message.reply({ embeds: [embed] });
  },

  async showSalvageConfirmation(message: Message, player: any, item: Item, invItem: PlayerInventory) {
    const materials = this.calculateSalvageMaterials(item);
    
    const embed = new EmbedBuilder()
      .setTitle('⚒️ Salvage Confirmation')
      .setDescription(
        `**⚠️ Are you sure you want to salvage this item?**\n\n` +
        `${getRarityEmoji(item.rarity)} **${item.name}**\n` +
        `*${item.description}*\n\n` +
        `**⚠️ WARNING: This will DESTROY the item permanently!**\n\n` +
        `**Potential Materials:**`
      )
      .setColor(getRarityColor(item.rarity))
      .setFooter({ text: `🧀 "${item.plaggComment}"` });

    const materialsText = materials.map(mat => 
      `• ${mat.min === mat.max ? mat.min : `${mat.min}-${mat.max}`}x ${mat.name} (${mat.chance}% chance)`
    ).join('\n');

    embed.addFields({
      name: '🔧 Salvage Materials',
      value: materialsText,
      inline: false
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>();

    if (invItem.quantity > 1) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('salvage_one')
          .setLabel('⚒️ Salvage 1')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('salvage_all')
          .setLabel('⚒️ Salvage All')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_salvage')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('salvage_one')
          .setLabel('⚒️ Salvage Item')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_salvage')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    }

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
      const action = interaction.customId;
      
      if (action === 'cancel_salvage') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Salvage Cancelled')
          .setDescription('You decided not to salvage the item.')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      const quantityToSalvage = action === 'salvage_all' ? invItem.quantity : 1;
      await this.completeSalvage(interaction, player, item, invItem, quantityToSalvage);
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Salvage timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async completeSalvage(interaction: any, player: any, item: Item, invItem: PlayerInventory, quantityToSalvage: number) {
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
      const itemIndex = inventory.findIndex(i => i.itemId === invItem.itemId);

      if (itemIndex === -1) {
        await interaction.reply({
          content: '🧀 Item no longer in inventory!',
          ephemeral: true
        });
        return;
      }

      // Calculate materials gained
      const materialsGained = [];
      const materialTemplate = this.calculateSalvageMaterials(item);

      for (let i = 0; i < quantityToSalvage; i++) {
        for (const mat of materialTemplate) {
          if (rollDice(100) <= mat.chance) {
            const quantity = Math.floor(Math.random() * (mat.max - mat.min + 1)) + mat.min;
            const existing = materialsGained.find(m => m.name === mat.name);
            if (existing) {
              existing.quantity += quantity;
            } else {
              materialsGained.push({ name: mat.name, quantity });
            }
          }
        }
      }

      // Update inventory - remove salvaged items
      if (quantityToSalvage >= inventory[itemIndex].quantity) {
        inventory.splice(itemIndex, 1);
      } else {
        inventory[itemIndex].quantity -= quantityToSalvage;
      }

      // Add materials to inventory
      for (const material of materialsGained) {
        const existingMaterial = inventory.find(inv => inv.itemId === material.name);
        if (existingMaterial) {
          existingMaterial.quantity += material.quantity;
        } else {
          inventory.push({
            itemId: material.name,
            quantity: material.quantity
          });
        }
      }

      // Update player
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: {
          inventoryJson: JSON.stringify(inventory)
        }
      });

      // Show success message
      const materialsText = materialsGained.length > 0 ? 
        materialsGained.map(m => `• ${m.quantity}x ${m.name}`).join('\n') :
        'No materials obtained (bad luck!)';

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Salvage Complete!')
        .setDescription(
          `**Successfully salvaged ${quantityToSalvage}x ${getRarityEmoji(item.rarity)} ${item.name}!**\n\n` +
          `**Materials Obtained:**\n${materialsText}\n\n` +
          `${quantityToSalvage < invItem.quantity ? 
            `You still have ${invItem.quantity - quantityToSalvage} left.` : 
            'All items salvaged!'
          }`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Recycling at its finest! Even cheese rinds have their uses!' });

      await interaction.update({
        embeds: [successEmbed],
        components: []
      });

      // Update achievements
      const achievements = JSON.parse(currentPlayer.achievementsJson);
      achievements.itemsSalvaged = (achievements.itemsSalvaged || 0) + quantityToSalvage;

      await prisma.player.update({
        where: { discordId: player.discordId },
        data: { achievementsJson: JSON.stringify(achievements) }
      });

    } catch (error) {
      logger.error('Error completing salvage:', error);
      await interaction.reply({
        content: '🧀 Failed to complete salvage! Try again.',
        ephemeral: true
      });
    }
  },

  canSalvageItem(item: Item): boolean {
    // Cannot salvage consumables, special items, or mythic items
    return item.type !== 'consumable' && 
           item.rarity !== 'mythic' &&
           !item.id.includes('cheese') && // Protect cheese items!
           !item.effects?.includes('unsalvageable');
  },

  getSalvageRestrictionReason(item: Item): string {
    if (item.type === 'consumable') return 'Consumables cannot be salvaged.';
    if (item.rarity === 'mythic') return 'Mythic items are too powerful to salvage.';
    if (item.id.includes('cheese')) return 'NEVER salvage cheese! That\'s Plagg\'s rule #1!';
    if (item.effects?.includes('unsalvageable')) return 'This item is protected from salvaging.';
    return 'This item cannot be salvaged.';
  },

  calculateSalvageMaterials(item: Item): { name: string; min: number; max: number; chance: number }[] {
    const level = item.level || 1;
    const materials = [];

    // Base materials based on item type
    switch (item.type) {
      case 'weapon':
        materials.push(
          { name: 'iron_scraps', min: 1, max: 3, chance: 80 },
          { name: 'metal_fragments', min: 1, max: 2, chance: 60 }
        );
        break;
      case 'armor':
        materials.push(
          { name: 'leather_scraps', min: 2, max: 4, chance: 85 },
          { name: 'fabric_pieces', min: 1, max: 3, chance: 70 }
        );
        break;
      case 'artifact':
        materials.push(
          { name: 'magic_dust', min: 1, max: 2, chance: 75 },
          { name: 'crystal_shards', min: 1, max: 1, chance: 50 }
        );
        break;
    }

    // Rarity bonuses
    switch (item.rarity) {
      case 'uncommon':
        materials.push({ name: 'refined_materials', min: 1, max: 1, chance: 25 });
        break;
      case 'rare':
        materials.push(
          { name: 'refined_materials', min: 1, max: 2, chance: 50 },
          { name: 'rare_essence', min: 1, max: 1, chance: 20 }
        );
        break;
      case 'epic':
        materials.push(
          { name: 'refined_materials', min: 2, max: 3, chance: 75 },
          { name: 'rare_essence', min: 1, max: 2, chance: 40 },
          { name: 'epic_core', min: 1, max: 1, chance: 15 }
        );
        break;
      case 'legendary':
        materials.push(
          { name: 'refined_materials', min: 3, max: 5, chance: 90 },
          { name: 'rare_essence', min: 2, max: 3, chance: 60 },
          { name: 'epic_core', min: 1, max: 2, chance: 30 },
          { name: 'legendary_fragment', min: 1, max: 1, chance: 10 }
        );
        break;
    }

    // Level scaling (higher level items give more materials)
    const levelMultiplier = Math.max(1, Math.floor(level / 5));
    materials.forEach(mat => {
      mat.min *= levelMultiplier;
      mat.max *= levelMultiplier;
    });

    return materials;
  }
};

export default command;
