import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, getRarityEmoji, formatGold } from '../../utils/functions.js';
import { Item, PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

interface TradeOffer {
  initiatorId: string;
  targetId: string;
  initiatorItems: { itemId: string; quantity: number }[];
  targetItems: { itemId: string; quantity: number }[];
  initiatorGold: number;
  targetGold: number;
  initiatorAccepted: boolean;
  targetAccepted: boolean;
  expires: Date;
}

const activeTrades = new Map<string, TradeOffer>();

const command: Command = {
  name: 'trade',
  description: 'Trade items and gold with other players',
  cooldown: 10,
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
        await this.showActiveTradeOrHelp(message, player);
        return;
      }

      const action = args[0].toLowerCase();

      switch (action) {
        case 'with':
        case 'start':
          const targetUser = message.mentions.users.first();
          if (!targetUser) {
            await message.reply('🧀 You need to mention a player to trade with! Example: `$trade with @player`');
            return;
          }
          await this.initiateTrade(message, player, targetUser);
          break;
        case 'add':
          if (args.length < 3) {
            await message.reply('🧀 Usage: `$trade add <item name> <quantity>` or `$trade add gold <amount>`');
            return;
          }
          await this.addToTrade(message, player, args);
          break;
        case 'remove':
          if (args.length < 2) {
            await message.reply('🧀 Usage: `$trade remove <item name>` or `$trade remove gold`');
            return;
          }
          await this.removeFromTrade(message, player, args);
          break;
        case 'accept':
          await this.acceptTrade(message, player);
          break;
        case 'decline':
        case 'cancel':
          await this.cancelTrade(message, player);
          break;
        case 'status':
          await this.showTradeStatus(message, player);
          break;
        default:
          await this.showActiveTradeOrHelp(message, player);
      }

    } catch (error) {
      logger.error('Error in trade command:', error);
      await message.reply('🧀 Failed to process trade! The trading post is covered in cheese grease.');
    }
  },

  async showActiveTradeOrHelp(message: Message, player: any) {
    const activeTrade = this.getActiveTradeForPlayer(player.discordId);

    if (activeTrade) {
      await this.showTradeStatus(message, player);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🤝 Player Trading')
      .setDescription(
        `**Trade items and gold with other players!**\n\n` +
        `📦 **How to Trade:**\n` +
        `1. \`$trade with @player\` - Start a trade\n` +
        `2. \`$trade add <item> <quantity>\` - Add items\n` +
        `3. \`$trade add gold <amount>\` - Add gold\n` +
        `4. \`$trade accept\` - Accept the trade\n` +
        `5. Trade completes when both players accept\n\n` +
        `📋 **Other Commands:**\n` +
        `• \`$trade status\` - View current trade\n` +
        `• \`$trade remove <item>\` - Remove items\n` +
        `• \`$trade cancel\` - Cancel the trade\n\n` +
        `**⚠️ Trading Rules:**\n` +
        `• Both players must be online\n` +
        `• Equipped items cannot be traded\n` +
        `• Trades expire after 10 minutes\n` +
        `• No take-backs once completed!`
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 "Fair trades are like good cheese - everybody wins!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async initiateTrade(message: Message, initiator: any, targetUser: any) {
    if (targetUser.id === message.author.id) {
      await message.reply('🧀 You can\'t trade with yourself! That\'s like eating cheese alone... actually, that\'s perfectly fine.');
      return;
    }

    if (targetUser.bot) {
      await message.reply('🧀 You can\'t trade with bots! They don\'t appreciate the finer things like cheese.');
      return;
    }

    const target = await prisma.player.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!target) {
      await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
      return;
    }

    // Check if either player is already in a trade
    if (this.getActiveTradeForPlayer(initiator.discordId)) {
      await message.reply('🧀 You\'re already in an active trade! Finish it first.');
      return;
    }

    if (this.getActiveTradeForPlayer(target.discordId)) {
      await message.reply('🧀 That player is already in an active trade!');
      return;
    }

    // Check if players are in combat
    if (initiator.inCombat || target.inCombat) {
      await message.reply('🧀 Cannot trade while in combat!');
      return;
    }

    const tradeOffer: TradeOffer = {
      initiatorId: initiator.discordId,
      targetId: target.discordId,
      initiatorItems: [],
      targetItems: [],
      initiatorGold: 0,
      targetGold: 0,
      initiatorAccepted: false,
      targetAccepted: false,
      expires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    activeTrades.set(initiator.discordId, tradeOffer);
    activeTrades.set(target.discordId, tradeOffer);

    const embed = new EmbedBuilder()
      .setTitle('🤝 Trade Initiated!')
      .setDescription(
        `**${initiator.username}** wants to trade with **${target.username}**!\n\n` +
        `${targetUser}, you have been invited to trade.\n\n` +
        `**Next Steps:**\n` +
        `• Both players can add items using \`$trade add <item> <quantity>\`\n` +
        `• Add gold using \`$trade add gold <amount>\`\n` +
        `• Use \`$trade status\` to see the current offer\n` +
        `• Use \`$trade accept\` when you're ready\n` +
        `• Use \`$trade cancel\` to cancel\n\n` +
        `*Trade expires in 10 minutes if not completed.*`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Let the cheese trading begin!" - Plagg' });

    await message.reply({
      content: `${targetUser}`,
      embeds: [embed]
    });

    // Auto-cleanup after expiration
    setTimeout(() => {
      if (activeTrades.has(initiator.discordId)) {
        activeTrades.delete(initiator.discordId);
        activeTrades.delete(target.discordId);
      }
    }, 10 * 60 * 1000);
  },

  async addToTrade(message: Message, player: any, args: string[]) {
    const trade = this.getActiveTradeForPlayer(player.discordId);
    if (!trade) {
      await message.reply('🧀 You\'re not in an active trade! Start one with `$trade with @player`');
      return;
    }

    const isInitiator = trade.initiatorId === player.discordId;
    const itemType = args[1].toLowerCase();

    if (itemType === 'gold') {
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount <= 0) {
        await message.reply('🧀 Please specify a valid gold amount!');
        return;
      }

      if (amount > player.gold) {
        await message.reply(`🧀 You only have ${formatGold(player.gold)} gold!`);
        return;
      }

      if (isInitiator) {
        trade.initiatorGold = amount;
      } else {
        trade.targetGold = amount;
      }

      await message.reply(`🧀 Added ${formatGold(amount)} gold to the trade!`);
    } else {
      // Adding items
      const itemName = args.slice(1, -1).join(' ').toLowerCase();
      const quantity = parseInt(args[args.length - 1]);

      if (isNaN(quantity) || quantity <= 0) {
        await message.reply('🧀 Please specify a valid quantity!');
        return;
      }

      // Load all items to find the item
      const [weapons, armor, consumables, artifacts] = await Promise.all([
        loadJsonData<Item[]>('items/weapons.json'),
        loadJsonData<Item[]>('items/armor.json'),
        loadJsonData<Item[]>('items/consumables.json'),
        loadJsonData<Item[]>('items/artifacts.json')
      ]);

      const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
      const item = allItems.find(i => 
        i.name.toLowerCase().includes(itemName) || 
        i.id.toLowerCase().includes(itemName)
      );

      if (!item) {
        await message.reply(`🧀 Item "${itemName}" not found!`);
        return;
      }

      // Check if player has the item
      const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
      const inventoryItem = inventory.find(inv => inv.itemId === item.id);

      if (!inventoryItem || inventoryItem.quantity < quantity) {
        await message.reply(`🧀 You don't have ${quantity}x ${item.name}!`);
        return;
      }

      // Check if item is equipped
      const equipment = JSON.parse(player.equipmentJson);
      const equippedItems = Object.values(equipment);
      if (equippedItems.includes(item.id)) {
        await message.reply('🧀 You can\'t trade equipped items! Unequip them first.');
        return;
      }

      // Add to trade
      const tradeItems = isInitiator ? trade.initiatorItems : trade.targetItems;
      const existingItem = tradeItems.find(ti => ti.itemId === item.id);

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        tradeItems.push({ itemId: item.id, quantity });
      }

      // Reset acceptance status
      trade.initiatorAccepted = false;
      trade.targetAccepted = false;

      await message.reply(`🧀 Added ${quantity}x ${getRarityEmoji(item.rarity)} ${item.name} to the trade!`);
    }

    await this.showTradeStatus(message, player);
  },

  async removeFromTrade(message: Message, player: any, args: string[]) {
    const trade = this.getActiveTradeForPlayer(player.discordId);
    if (!trade) {
      await message.reply('🧀 You\'re not in an active trade!');
      return;
    }

    const isInitiator = trade.initiatorId === player.discordId;
    const itemType = args[1].toLowerCase();

    if (itemType === 'gold') {
      if (isInitiator) {
        trade.initiatorGold = 0;
      } else {
        trade.targetGold = 0;
      }
      await message.reply('🧀 Removed gold from the trade!');
    } else {
      const itemName = args.slice(1).join(' ').toLowerCase();
      const tradeItems = isInitiator ? trade.initiatorItems : trade.targetItems;
      
      // Load items to match name
      const [weapons, armor, consumables, artifacts] = await Promise.all([
        loadJsonData<Item[]>('items/weapons.json'),
        loadJsonData<Item[]>('items/armor.json'),
        loadJsonData<Item[]>('items/consumables.json'),
        loadJsonData<Item[]>('items/artifacts.json')
      ]);

      const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
      const item = allItems.find(i => 
        i.name.toLowerCase().includes(itemName) || 
        i.id.toLowerCase().includes(itemName)
      );

      if (!item) {
        await message.reply(`🧀 Item "${itemName}" not found in trade!`);
        return;
      }

      const itemIndex = tradeItems.findIndex(ti => ti.itemId === item.id);
      if (itemIndex === -1) {
        await message.reply('🧀 That item is not in the trade!');
        return;
      }

      tradeItems.splice(itemIndex, 1);
      await message.reply(`🧀 Removed ${item.name} from the trade!`);
    }

    // Reset acceptance status
    trade.initiatorAccepted = false;
    trade.targetAccepted = false;

    await this.showTradeStatus(message, player);
  },

  async acceptTrade(message: Message, player: any) {
    const trade = this.getActiveTradeForPlayer(player.discordId);
    if (!trade) {
      await message.reply('🧀 You\'re not in an active trade!');
      return;
    }

    const isInitiator = trade.initiatorId === player.discordId;

    if (isInitiator) {
      trade.initiatorAccepted = true;
    } else {
      trade.targetAccepted = true;
    }

    if (trade.initiatorAccepted && trade.targetAccepted) {
      await this.completeTrade(message, trade);
    } else {
      await message.reply('🧀 You accepted the trade! Waiting for the other player to accept...');
      await this.showTradeStatus(message, player);
    }
  },

  async completeTrade(message: Message, trade: TradeOffer) {
    try {
      // Get both players
      const [initiator, target] = await Promise.all([
        prisma.player.findUnique({ where: { discordId: trade.initiatorId } }),
        prisma.player.findUnique({ where: { discordId: trade.targetId } })
      ]);

      if (!initiator || !target) {
        await message.reply('🧀 Player data not found! Trade cancelled.');
        this.cleanupTrade(trade);
        return;
      }

      // Verify both players still have the required items and gold
      const initiatorInventory: PlayerInventory[] = JSON.parse(initiator.inventoryJson);
      const targetInventory: PlayerInventory[] = JSON.parse(target.inventoryJson);

      // Check initiator has required items and gold
      if (initiator.gold < trade.initiatorGold) {
        await message.reply('🧀 Trade failed! Initiator doesn\'t have enough gold.');
        this.cleanupTrade(trade);
        return;
      }

      for (const tradeItem of trade.initiatorItems) {
        const invItem = initiatorInventory.find(inv => inv.itemId === tradeItem.itemId);
        if (!invItem || invItem.quantity < tradeItem.quantity) {
          await message.reply('🧀 Trade failed! Initiator doesn\'t have the required items.');
          this.cleanupTrade(trade);
          return;
        }
      }

      // Check target has required items and gold
      if (target.gold < trade.targetGold) {
        await message.reply('🧀 Trade failed! Target doesn\'t have enough gold.');
        this.cleanupTrade(trade);
        return;
      }

      for (const tradeItem of trade.targetItems) {
        const invItem = targetInventory.find(inv => inv.itemId === tradeItem.itemId);
        if (!invItem || invItem.quantity < tradeItem.quantity) {
          await message.reply('🧀 Trade failed! Target doesn\'t have the required items.');
          this.cleanupTrade(trade);
          return;
        }
      }

      // Execute the trade
      await prisma.$transaction(async (tx) => {
        // Transfer gold
        await tx.player.update({
          where: { discordId: trade.initiatorId },
          data: { gold: initiator.gold - trade.initiatorGold + trade.targetGold }
        });

        await tx.player.update({
          where: { discordId: trade.targetId },
          data: { gold: target.gold - trade.targetGold + trade.initiatorGold }
        });

        // Transfer items from initiator to target
        for (const tradeItem of trade.initiatorItems) {
          const initiatorItem = initiatorInventory.find(inv => inv.itemId === tradeItem.itemId)!;
          initiatorItem.quantity -= tradeItem.quantity;
          
          if (initiatorItem.quantity <= 0) {
            const index = initiatorInventory.indexOf(initiatorItem);
            initiatorInventory.splice(index, 1);
          }

          const targetItem = targetInventory.find(inv => inv.itemId === tradeItem.itemId);
          if (targetItem) {
            targetItem.quantity += tradeItem.quantity;
          } else {
            targetInventory.push({ itemId: tradeItem.itemId, quantity: tradeItem.quantity });
          }
        }

        // Transfer items from target to initiator
        for (const tradeItem of trade.targetItems) {
          const targetItem = targetInventory.find(inv => inv.itemId === tradeItem.itemId)!;
          targetItem.quantity -= tradeItem.quantity;
          
          if (targetItem.quantity <= 0) {
            const index = targetInventory.indexOf(targetItem);
            targetInventory.splice(index, 1);
          }

          const initiatorItem = initiatorInventory.find(inv => inv.itemId === tradeItem.itemId);
          if (initiatorItem) {
            initiatorItem.quantity += tradeItem.quantity;
          } else {
            initiatorInventory.push({ itemId: tradeItem.itemId, quantity: tradeItem.quantity });
          }
        }

        // Update inventories
        await tx.player.update({
          where: { discordId: trade.initiatorId },
          data: { inventoryJson: JSON.stringify(initiatorInventory) }
        });

        await tx.player.update({
          where: { discordId: trade.targetId },
          data: { inventoryJson: JSON.stringify(targetInventory) }
        });
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Trade Completed!')
        .setDescription(
          `**Trade successfully completed between ${initiator.username} and ${target.username}!**\n\n` +
          `Both players have received their traded items and gold.\n\n` +
          `*Thank you for trading fairly!*`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 "A successful trade is like sharing cheese - everyone\'s happy!" - Plagg' });

      await message.reply({ embeds: [embed] });

      // Cleanup
      this.cleanupTrade(trade);

    } catch (error) {
      logger.error('Error completing trade:', error);
      await message.reply('🧀 Failed to complete trade! The transaction was interrupted.');
      this.cleanupTrade(trade);
    }
  },

  async cancelTrade(message: Message, player: any) {
    const trade = this.getActiveTradeForPlayer(player.discordId);
    if (!trade) {
      await message.reply('🧀 You\'re not in an active trade!');
      return;
    }

    this.cleanupTrade(trade);

    const embed = new EmbedBuilder()
      .setTitle('❌ Trade Cancelled')
      .setDescription('The trade has been cancelled. All items remain with their original owners.')
      .setColor(0xFF0000)
      .setFooter({ text: '🧀 "Sometimes it\'s better to keep your cheese!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async showTradeStatus(message: any, player: any) {
    const trade = this.getActiveTradeForPlayer(player.discordId);
    if (!trade) {
      await message.reply('🧀 You\'re not in an active trade!');
      return;
    }

    // Get player names
    const [initiator, target] = await Promise.all([
      prisma.player.findUnique({ where: { discordId: trade.initiatorId } }),
      prisma.player.findUnique({ where: { discordId: trade.targetId } })
    ]);

    if (!initiator || !target) {
      await message.reply('🧀 Trade data corrupted!');
      this.cleanupTrade(trade);
      return;
    }

    // Load items to show names
    const [weapons, armor, consumables, artifacts] = await Promise.all([
      loadJsonData<Item[]>('items/weapons.json'),
      loadJsonData<Item[]>('items/armor.json'),
      loadJsonData<Item[]>('items/consumables.json'),
      loadJsonData<Item[]>('items/artifacts.json')
    ]);

    const allItems = [...weapons, ...armor, ...consumables, ...artifacts];

    const embed = new EmbedBuilder()
      .setTitle('🤝 Trade Status')
      .setDescription(
        `**${initiator.username}** 🔄 **${target.username}**\n\n` +
        `⏱️ **Time Remaining:** ${Math.max(0, Math.floor((trade.expires.getTime() - Date.now()) / 60000))} minutes`
      )
      .setColor(0x4169E1);

    // Initiator's offer
    let initiatorOffer = '';
    if (trade.initiatorGold > 0) {
      initiatorOffer += `💰 ${formatGold(trade.initiatorGold)} gold\n`;
    }
    trade.initiatorItems.forEach(item => {
      const itemData = allItems.find(i => i.id === item.itemId);
      initiatorOffer += `${getRarityEmoji(itemData?.rarity || 'common')} ${item.quantity}x ${itemData?.name || item.itemId}\n`;
    });

    embed.addFields({
      name: `${initiator.username}'s Offer ${trade.initiatorAccepted ? '✅' : '⏳'}`,
      value: initiatorOffer || 'Nothing offered',
      inline: true
    });

    // Target's offer
    let targetOffer = '';
    if (trade.targetGold > 0) {
      targetOffer += `💰 ${formatGold(trade.targetGold)} gold\n`;
    }
    trade.targetItems.forEach(item => {
      const itemData = allItems.find(i => i.id === item.itemId);
      targetOffer += `${getRarityEmoji(itemData?.rarity || 'common')} ${item.quantity}x ${itemData?.name || item.itemId}\n`;
    });

    embed.addFields({
      name: `${target.username}'s Offer ${trade.targetAccepted ? '✅' : '⏳'}`,
      value: targetOffer || 'Nothing offered',
      inline: true
    });

    embed.setFooter({ 
      text: `🧀 ${trade.initiatorAccepted && trade.targetAccepted ? 'Both players accepted!' : 'Waiting for acceptance...'}`
    });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  getActiveTradeForPlayer(playerId: string): TradeOffer | null {
    return activeTrades.get(playerId) || null;
  },

  cleanupTrade(trade: TradeOffer) {
    activeTrades.delete(trade.initiatorId);
    activeTrades.delete(trade.targetId);
  }
};

export default command;
