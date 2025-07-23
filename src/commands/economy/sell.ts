import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, formatGold, getRarityEmoji, getRarityColor } from '../../utils/functions.js';
import { Item, PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'sell',
  description: 'Sell items from your inventory',
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

      const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
      
      if (inventory.length === 0) {
        await message.reply('🧀 Your inventory is empty! Nothing to sell except maybe some cheese crumbs.');
        return;
      }

      if (args.length === 0) {
        await this.showSellMenu(message, player, inventory);
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

      await this.showSellConfirmation(message, player, itemData, invItem);

    } catch (error) {
      logger.error('Error in sell command:', error);
      await message.reply('🧀 Failed to sell item! The cashier is busy eating cheese.');
    }
  },

  async showSellMenu(message: Message, player: any, inventory: PlayerInventory[]) {
    // Load all items to get details
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
    
    // Get sellable items (not equipped)
    const equipment = JSON.parse(player.equipmentJson);
    const equippedItems = Object.values(equipment);
    
    const sellableItems = inventory
      .filter(invItem => !equippedItems.includes(invItem.itemId))
      .map(invItem => {
        const itemData = allItems.find(i => i.id === invItem.itemId);
        return { invItem, itemData };
      })
      .filter(item => item.itemData);

    if (sellableItems.length === 0) {
      await message.reply('🧀 No sellable items in your inventory! (Equipped items cannot be sold)');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('💰 Sell Items')
      .setDescription(
        `**Choose items to sell from your inventory**\n\n` +
        `💰 **Your Gold:** ${formatGold(player.gold)}\n\n` +
        `*Items sell for 50% of their shop value*\n` +
        `*Equipped items cannot be sold*\n\n` +
        `Use \`$sell <item name>\` to sell a specific item.`
      )
      .setColor(0xFFD700);

    // Show up to 10 sellable items
    sellableItems.slice(0, 10).forEach(({ invItem, itemData }) => {
      if (!itemData) return;
      
      const sellPrice = Math.floor((itemData.value || 0) * 0.5);
      embed.addFields({
        name: `${getRarityEmoji(itemData.rarity)} ${itemData.name} (x${invItem.quantity})`,
        value: 
          `*${itemData.description.substring(0, 50)}...*\n` +
          `**Sell Price:** ${formatGold(sellPrice)} each\n` +
          `**Total Value:** ${formatGold(sellPrice * invItem.quantity)}`,
        inline: true
      });
    });

    if (sellableItems.length > 10) {
      embed.setFooter({ text: `🧀 Showing 10 of ${sellableItems.length} sellable items` });
    }

    await message.reply({ embeds: [embed] });
  },

  async showSellConfirmation(message: Message, player: any, item: Item, invItem: PlayerInventory) {
    const sellPrice = Math.floor((item.value || 0) * 0.5);
    const totalValue = sellPrice * invItem.quantity;

    const embed = new EmbedBuilder()
      .setTitle('💰 Sell Confirmation')
      .setDescription(
        `**Are you sure you want to sell this item?**\n\n` +
        `${getRarityEmoji(item.rarity)} **${item.name}**\n` +
        `*${item.description}*\n\n` +
        `**Quantity:** ${invItem.quantity}\n` +
        `**Price per item:** ${formatGold(sellPrice)} gold\n` +
        `**Total value:** ${formatGold(totalValue)} gold\n\n` +
        `**Your Gold:** ${formatGold(player.gold)}\n` +
        `**After Sale:** ${formatGold(player.gold + totalValue)}`
      )
      .setColor(getRarityColor(item.rarity))
      .setFooter({ text: `🧀 "${item.plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>();

    // If quantity > 1, offer options
    if (invItem.quantity > 1) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('sell_one')
          .setLabel(`Sell 1 (${formatGold(sellPrice)})`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sell_all')
          .setLabel(`Sell All (${formatGold(totalValue)})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_sell')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('sell_one')
          .setLabel(`✅ Sell Item`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_sell')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
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
      
      if (action === 'cancel_sell') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Sale Cancelled')
          .setDescription('You decided not to sell the item.')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      const quantityToSell = action === 'sell_all' ? invItem.quantity : 1;
      await this.completeSale(interaction, player, item, invItem, quantityToSell);
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Sale timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async completeSale(interaction: any, player: any, item: Item, invItem: PlayerInventory, quantityToSell: number) {
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

      // Calculate sale value
      const sellPrice = Math.floor((item.value || 0) * 0.5);
      const totalValue = sellPrice * quantityToSell;

      // Update inventory
      if (quantityToSell >= inventory[itemIndex].quantity) {
        // Remove item completely
        inventory.splice(itemIndex, 1);
      } else {
        // Reduce quantity
        inventory[itemIndex].quantity -= quantityToSell;
      }

      // Update player
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: {
          gold: currentPlayer.gold + totalValue,
          inventoryJson: JSON.stringify(inventory)
        }
      });

      // Show success message
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Sale Successful!')
        .setDescription(
          `**You sold ${quantityToSell}x ${getRarityEmoji(item.rarity)} ${item.name}!**\n\n` +
          `💰 **Earned:** ${formatGold(totalValue)} gold\n` +
          `💰 **Total Gold:** ${formatGold(currentPlayer.gold + totalValue)}\n\n` +
          `${quantityToSell < invItem.quantity ? 
            `You still have ${invItem.quantity - quantityToSell} left.` : 
            'All items sold!'
          }`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Thanks for the business! *counts gold while eating cheese*' });

      await interaction.update({
        embeds: [successEmbed],
        components: []
      });

      // Update achievements
      const achievements = JSON.parse(currentPlayer.achievementsJson);
      achievements.totalSales = (achievements.totalSales || 0) + 1;
      achievements.goldEarned = (achievements.goldEarned || 0) + totalValue;

      await prisma.player.update({
        where: { discordId: player.discordId },
        data: { achievementsJson: JSON.stringify(achievements) }
      });

    } catch (error) {
      logger.error('Error completing sale:', error);
      await interaction.reply({
        content: '🧀 Failed to complete sale! Try again.',
        ephemeral: true
      });
    }
  }
};

export default command;
