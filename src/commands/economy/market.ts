import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, formatGold, getRarityEmoji, getRarityColor, formatTime } from '../../utils/functions.js';
import { Item, PlayerInventory } from '../../types.js';
import { Paginator } from '../../structures/Paginator.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'market',
  description: 'Access the auction house to buy and sell items',
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

      if (args.length > 0) {
        const action = args[0].toLowerCase();
        
        switch (action) {
          case 'list':
          case 'sell':
            await this.showListingMenu(message, player);
            break;
          case 'buy':
            if (args.length < 2) {
              await message.reply('🧀 Specify what you want to buy! Use `$market buy <listing ID>`');
              return;
            }
            await this.attemptPurchase(message, player, args[1]);
            break;
          case 'cancel':
            if (args.length < 2) {
              await message.reply('🧀 Specify which listing to cancel! Use `$market cancel <listing ID>`');
              return;
            }
            await this.cancelListing(message, player, args[1]);
            break;
          case 'my':
          case 'mine':
            await this.showMyListings(message, player);
            break;
          default:
            await this.showMarketplace(message, player);
        }
      } else {
        await this.showMarketplace(message, player);
      }

    } catch (error) {
      logger.error('Error in market command:', error);
      await message.reply('🧀 Failed to access the market! The auction house is closed for cheese inventory.');
    }
  },

  async showMarketplace(message: Message, player: any) {
    const listings = await prisma.marketListing.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    if (listings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🏪 Auction House')
        .setDescription(
          '**The market is empty!**\n\n' +
          'Be the first to list an item for sale!\n\n' +
          '📝 **Market Commands:**\n' +
          '• `$market` - Browse current listings\n' +
          '• `$market list` - List an item for sale\n' +
          '• `$market buy <ID>` - Purchase a listing\n' +
          '• `$market my` - View your listings\n' +
          '• `$market cancel <ID>` - Cancel your listing'
        )
        .setColor(0x8B4513)
        .setFooter({ text: '🧀 "No items? This market needs more cheese!" - Plagg' });

      await message.reply({ embeds: [embed] });
      return;
    }

    // Load item data
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    const embed = new EmbedBuilder()
      .setTitle('🏪 Auction House')
      .setDescription(
        `**Current Market Listings**\n\n` +
        `💰 **Your Gold:** ${formatGold(player.gold)}\n` +
        `📋 **Active Listings:** ${listings.length}\n\n` +
        `Use \`$market buy <ID>\` to purchase an item!`
      )
      .setColor(0xFFD700);

    // Show listings
    listings.slice(0, 10).forEach((listing, index) => {
      const item = allItems.find(i => i.id === listing.itemId);
      const timeLeft = listing.expires.getTime() - Date.now();
      const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));

      embed.addFields({
        name: `#${index + 1} ${item ? getRarityEmoji(item.rarity) : '📦'} ${item?.name || listing.itemId}`,
        value: 
          `**Quantity:** ${listing.quantity}\n` +
          `**Price:** ${formatGold(listing.price)} gold\n` +
          `**Seller:** <@${listing.sellerId}>\n` +
          `**Expires:** ${hoursLeft > 0 ? `${hoursLeft}h` : 'Soon'}`,
        inline: true
      });
    });

    if (listings.length > 10) {
      embed.setFooter({ text: `🧀 Showing 10 of ${listings.length} listings. More cheese deals available!` });
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('market_refresh')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('market_list')
          .setLabel('📝 List Item')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('market_my_listings')
          .setLabel('📋 My Listings')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      time: 120000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      switch (interaction.customId) {
        case 'market_refresh':
          await this.showMarketplace(interaction, player);
          break;
        case 'market_list':
          await this.showListingMenu(interaction, player);
          break;
        case 'market_my_listings':
          await this.showMyListings(interaction, player);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async showListingMenu(message: any, player: any) {
    const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
    const equipment = JSON.parse(player.equipmentJson);
    const equippedItems = Object.values(equipment);

    // Get sellable items (not equipped)
    const sellableItems = inventory.filter(item => !equippedItems.includes(item.itemId));

    if (sellableItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📝 List Item for Sale')
        .setDescription('🧀 You have no items to sell! (Equipped items cannot be listed)')
        .setColor(0x808080);

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // Load item data
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    const embed = new EmbedBuilder()
      .setTitle('📝 List Item for Sale')
      .setDescription(
        '**Choose an item to list on the auction house**\n\n' +
        '🏪 **Auction Details:**\n' +
        '• Listings last 24 hours\n' +
        '• 5% market fee on sales\n' +
        '• Items return if unsold\n\n' +
        'Select an item below:'
      )
      .setColor(0x8B4513);

    // Show first 10 sellable items
    sellableItems.slice(0, 10).forEach((invItem, index) => {
      const item = allItems.find(i => i.id === invItem.itemId);
      const suggestedPrice = Math.floor((item?.value || 100) * 1.2); // 20% markup

      embed.addFields({
        name: `${index + 1}. ${item ? getRarityEmoji(item.rarity) : '📦'} ${item?.name || invItem.itemId}`,
        value: 
          `**Quantity:** ${invItem.quantity}\n` +
          `**Suggested Price:** ${formatGold(suggestedPrice)} gold each`,
        inline: true
      });
    });

    const listingMessage = `To list an item, use: \`$market list <item name> <price> [quantity]\`\nExample: \`$market list iron sword 200 1\``;
    embed.setFooter({ text: listingMessage });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  async showMyListings(message: any, player: any) {
    const myListings = await prisma.marketListing.findMany({
      where: { sellerId: player.discordId },
      orderBy: { createdAt: 'desc' }
    });

    if (myListings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 My Market Listings')
        .setDescription('🧀 You have no active listings on the market.')
        .setColor(0x808080);

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // Load item data
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    const embed = new EmbedBuilder()
      .setTitle('📋 My Market Listings')
      .setDescription(
        `**Your active market listings**\n\n` +
        `📊 **Total Listings:** ${myListings.length}\n` +
        `💰 **Total Value:** ${formatGold(myListings.reduce((sum, l) => sum + (l.price * l.quantity), 0))}\n\n` +
        `Use \`$market cancel <listing ID>\` to cancel a listing.`
      )
      .setColor(0x4169E1);

    myListings.forEach((listing, index) => {
      const item = allItems.find(i => i.id === listing.itemId);
      const timeLeft = listing.expires.getTime() - Date.now();
      const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));

      embed.addFields({
        name: `#${index + 1} ${item ? getRarityEmoji(item.rarity) : '📦'} ${item?.name || listing.itemId}`,
        value: 
          `**Quantity:** ${listing.quantity}\n` +
          `**Price:** ${formatGold(listing.price)} gold each\n` +
          `**Total Value:** ${formatGold(listing.price * listing.quantity)}\n` +
          `**Expires:** ${hoursLeft > 0 ? `${hoursLeft}h` : 'Soon'}`,
        inline: true
      });
    });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  async attemptPurchase(message: Message, player: any, listingId: string) {
    const listingIndex = parseInt(listingId) - 1;
    
    const listings = await prisma.marketListing.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    if (listingIndex < 0 || listingIndex >= listings.length) {
      await message.reply('🧀 Invalid listing ID! Use `$market` to see current listings.');
      return;
    }

    const listing = listings[listingIndex];

    if (listing.sellerId === player.discordId) {
      await message.reply('🧀 You can\'t buy your own listing! That would be... cheesy.');
      return;
    }

    const totalCost = listing.price * listing.quantity;
    if (player.gold < totalCost) {
      await message.reply(`🧀 You need ${formatGold(totalCost)} gold but only have ${formatGold(player.gold)}!`);
      return;
    }

    // Complete the purchase
    try {
      await prisma.$transaction(async (tx) => {
        // Remove listing
        await tx.marketListing.delete({
          where: { id: listing.id }
        });

        // Transfer gold to seller (minus 5% fee)
        const fee = Math.floor(totalCost * 0.05);
        const sellerGold = totalCost - fee;

        await tx.player.update({
          where: { discordId: listing.sellerId },
          data: { gold: { increment: sellerGold } }
        });

        // Deduct gold from buyer
        await tx.player.update({
          where: { discordId: player.discordId },
          data: { gold: { decrement: totalCost } }
        });

        // Add item to buyer's inventory
        const buyerInventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
        const existingItem = buyerInventory.find(item => item.itemId === listing.itemId);

        if (existingItem) {
          existingItem.quantity += listing.quantity;
        } else {
          buyerInventory.push({
            itemId: listing.itemId,
            quantity: listing.quantity
          });
        }

        await tx.player.update({
          where: { discordId: player.discordId },
          data: { inventoryJson: JSON.stringify(buyerInventory) }
        });
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Purchase Successful!')
        .setDescription(
          `**You bought ${listing.quantity}x ${listing.itemId}!**\n\n` +
          `💰 **Paid:** ${formatGold(totalCost)} gold\n` +
          `💰 **Remaining Gold:** ${formatGold(player.gold - totalCost)}\n\n` +
          `The item has been added to your inventory!`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Great purchase! The seller will be notified.' });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error completing market purchase:', error);
      await message.reply('🧀 Failed to complete purchase! The transaction was as unstable as aged cheese.');
    }
  },

  async cancelListing(message: Message, player: any, listingId: string) {
    const listingIndex = parseInt(listingId) - 1;
    
    const myListings = await prisma.marketListing.findMany({
      where: { sellerId: player.discordId },
      orderBy: { createdAt: 'desc' }
    });

    if (listingIndex < 0 || listingIndex >= myListings.length) {
      await message.reply('🧀 Invalid listing ID! Use `$market my` to see your listings.');
      return;
    }

    const listing = myListings[listingIndex];

    try {
      await prisma.$transaction(async (tx) => {
        // Remove listing
        await tx.marketListing.delete({
          where: { id: listing.id }
        });

        // Return item to seller's inventory
        const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
        const existingItem = inventory.find(item => item.itemId === listing.itemId);

        if (existingItem) {
          existingItem.quantity += listing.quantity;
        } else {
          inventory.push({
            itemId: listing.itemId,
            quantity: listing.quantity
          });
        }

        await tx.player.update({
          where: { discordId: player.discordId },
          data: { inventoryJson: JSON.stringify(inventory) }
        });
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Listing Cancelled')
        .setDescription(
          `**Your listing has been cancelled!**\n\n` +
          `${listing.quantity}x ${listing.itemId} has been returned to your inventory.`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 Item safely returned to your cheese storage!' });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error cancelling listing:', error);
      await message.reply('🧀 Failed to cancel listing! The paperwork is stuck to cheese.');
    }
  }
};

export default command;
