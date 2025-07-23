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
  name: 'buy',
  description: 'Purchase an item from the shop',
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

      if (args.length === 0) {
        await message.reply('🧀 What do you want to buy? Use `$buy <item name>` or `$shop` to browse items!');
        return;
      }

      const itemName = args.join(' ').toLowerCase();
      
      // Load all items
      const [weapons, armor, consumables, artifacts] = await Promise.all([
        loadJsonData<Item[]>('items/weapons.json'),
        loadJsonData<Item[]>('items/armor.json'),
        loadJsonData<Item[]>('items/consumables.json'),
        loadJsonData<Item[]>('items/artifacts.json')
      ]);

      const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
      
      // Find the item
      const item = allItems.find(i => 
        i.name.toLowerCase().includes(itemName) || 
        i.id.toLowerCase().includes(itemName)
      );

      if (!item) {
        await message.reply(`🧀 Item "${itemName}" not found! Use \`$shop\` to see available items.`);
        return;
      }

      // Check if item is available for purchase (not mythic)
      if (item.rarity === 'mythic') {
        await message.reply('🧀 Mythic items cannot be purchased! They must be found or earned.');
        return;
      }

      // Check level requirement
      if (player.level < (item.level || 1)) {
        await message.reply(`🧀 You need to be level ${item.level} to buy this item! You're currently level ${player.level}.`);
        return;
      }

      // Check if player can afford it
      const price = item.value || 0;
      if (player.gold < price) {
        await message.reply(`🧀 You can't afford this item! You need ${formatGold(price)} but only have ${formatGold(player.gold)}.`);
        return;
      }

      // Check inventory space (if stackable, check if already have some)
      const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
      const existingItem = inventory.find(invItem => invItem.itemId === item.id);
      
      if (!item.stackable && existingItem) {
        await message.reply('🧀 You already own this item and it\'s not stackable!');
        return;
      }

      const maxInventorySize = 50 + (player.level * 2); // Inventory grows with level
      if (!existingItem && inventory.length >= maxInventorySize) {
        await message.reply(`🧀 Your inventory is full! (${inventory.length}/${maxInventorySize} slots)`);
        return;
      }

      // Show purchase confirmation
      await this.showPurchaseConfirmation(message, player, item, price);

    } catch (error) {
      logger.error('Error in buy command:', error);
      await message.reply('🧀 Failed to purchase item! The cash register is covered in cheese.');
    }
  },

  async showPurchaseConfirmation(message: Message, player: any, item: Item, price: number) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Purchase Confirmation')
      .setDescription(
        `**Are you sure you want to buy this item?**\n\n` +
        `${getRarityEmoji(item.rarity)} **${item.name}**\n` +
        `*${item.description}*\n\n` +
        `**Price:** ${formatGold(price)} gold\n` +
        `**Your Gold:** ${formatGold(player.gold)}\n` +
        `**After Purchase:** ${formatGold(player.gold - price)}\n\n` +
        `${item.stats ? `**Stats:** ${Object.entries(item.stats).map(([k, v]) => `${k.toUpperCase()}: +${v}`).join(', ')}\n` : ''}` +
        `${item.effects ? `**Effects:** ${item.effects.join(', ')}\n` : ''}`
      )
      .setColor(getRarityColor(item.rarity))
      .setFooter({ text: `🧀 "${item.plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_purchase')
          .setLabel('✅ Buy Item')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_purchase')
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
      if (interaction.customId === 'confirm_purchase') {
        await this.completePurchase(interaction, player, item, price);
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Purchase Cancelled')
          .setDescription('You decided not to buy the item.')
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
          embeds: [embed.setDescription('🧀 Purchase timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async completePurchase(interaction: any, player: any, item: Item, price: number) {
    try {
      // Double-check player still has enough gold
      const currentPlayer = await prisma.player.findUnique({
        where: { discordId: player.discordId }
      });

      if (!currentPlayer || currentPlayer.gold < price) {
        await interaction.reply({
          content: '🧀 You no longer have enough gold for this purchase!',
          ephemeral: true
        });
        return;
      }

      // Add item to inventory
      const inventory: PlayerInventory[] = JSON.parse(currentPlayer.inventoryJson);
      const existingItem = inventory.find(invItem => invItem.itemId === item.id);

      if (existingItem && item.stackable) {
        existingItem.quantity += 1;
      } else {
        inventory.push({
          itemId: item.id,
          quantity: 1
        });
      }

      // Update player
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: {
          gold: currentPlayer.gold - price,
          inventoryJson: JSON.stringify(inventory)
        }
      });

      // Show success message
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Purchase Successful!')
        .setDescription(
          `**You bought ${getRarityEmoji(item.rarity)} ${item.name}!**\n\n` +
          `💰 **Paid:** ${formatGold(price)} gold\n` +
          `💰 **Remaining Gold:** ${formatGold(currentPlayer.gold - price)}\n\n` +
          `The item has been added to your inventory!\n` +
          `Use \`$profile\` to see your items.`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Thanks for shopping! Come back for more cheese... I mean items!' });

      await interaction.update({
        embeds: [successEmbed],
        components: []
      });

      // Check for achievement: First Purchase
      const achievements = JSON.parse(currentPlayer.achievementsJson);
      if (!achievements.firstPurchase) {
        achievements.firstPurchase = true;
        achievements.totalPurchases = (achievements.totalPurchases || 0) + 1;
        achievements.goldSpent = (achievements.goldSpent || 0) + price;

        await prisma.player.update({
          where: { discordId: player.discordId },
          data: { achievementsJson: JSON.stringify(achievements) }
        });

        setTimeout(() => {
          message.channel.send('🎉 **Achievement Unlocked:** First Purchase! You\'ve made your first shop purchase!');
        }, 2000);
      } else {
        achievements.totalPurchases = (achievements.totalPurchases || 0) + 1;
        achievements.goldSpent = (achievements.goldSpent || 0) + price;

        await prisma.player.update({
          where: { discordId: player.discordId },
          data: { achievementsJson: JSON.stringify(achievements) }
        });
      }

      // Check for big spender achievement
      if (achievements.goldSpent >= 10000 && !achievements.bigSpender) {
        achievements.bigSpender = true;
        await prisma.player.update({
          where: { discordId: player.discordId },
          data: { achievementsJson: JSON.stringify(achievements) }
        });

        setTimeout(() => {
          message.channel.send('🎉 **Achievement Unlocked:** Big Spender! You\'ve spent over 10,000 gold!');
        }, 3000);
      }

    } catch (error) {
      logger.error('Error completing purchase:', error);
      await interaction.reply({
        content: '🧀 Failed to complete purchase! Try again.',
        ephemeral: true
      });
    }
  }
};

export default command;
