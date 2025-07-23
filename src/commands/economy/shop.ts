
import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { loadJsonData, formatGold, getRarityEmoji, getRarityColor } from '../../utils/functions';
import { Item } from '../../types';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
  showMainShop: (message: Message, player: any, items: Item[]) => Promise<void>;
  showCategoryShop: (message: any, player: any, items: Item[], category: string) => Promise<void>;
  showItemDetails: (interaction: any, player: any, item: Item) => Promise<void>;
  quickBuy: (interaction: any, player: any, item: Item) => Promise<void>;
}

const command: Command = {
  name: 'shop',
  description: 'Browse the magical item shop',
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

      const [weapons, armor, consumables, artifacts] = await Promise.all([
        loadJsonData<Item[]>('items/weapons.json'),
        loadJsonData<Item[]>('items/armor.json'),
        loadJsonData<Item[]>('items/consumables.json'),
        loadJsonData<Item[]>('items/artifacts.json')
      ]);

      const allItems = [...weapons, ...armor, ...consumables, ...artifacts];
      const shopItems = allItems.filter(item => {
        const maxPrice = player.gold * 3;
        return (item.value || 0) <= maxPrice && 
               !['mythic'].includes(item.rarity) && 
               (item.level || 1) <= player.level + 5;
      });

      if (args.length > 0) {
        const category = args[0].toLowerCase();
        if (['weapons', 'armor', 'consumables', 'artifacts'].includes(category)) {
          const categoryItems = shopItems.filter(item => 
            category === 'weapons' ? item.type === 'weapon' :
            category === 'armor' ? item.type === 'armor' :
            category === 'consumables' ? item.type === 'consumable' :
            item.type === 'artifact'
          );
          await this.showCategoryShop(message, player, categoryItems, category);
          return;
        }
      }

      await this.showMainShop(message, player, shopItems);

    } catch (error) {
      logger.error('Error in shop command:', error);
      await message.reply('🧀 Failed to access shop! The shopkeeper is out getting cheese.');
    }
  },

  async showMainShop(message: Message, player: any, items: Item[]) {
    const categories = {
      weapons: items.filter(item => item.type === 'weapon'),
      armor: items.filter(item => item.type === 'armor'),
      consumables: items.filter(item => item.type === 'consumable'),
      artifacts: items.filter(item => item.type === 'artifact')
    };

    const featuredItems = items
      .filter(item => item.rarity === 'rare' || item.rarity === 'epic')
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    const embed = new EmbedBuilder()
      .setTitle('🏪 Plagg\'s Cheese & Gear Emporium')
      .setDescription(
        `**Welcome, ${player.username}, to the finest shop in the realm!**\n\n` +
        `💰 **Your Gold:** ${formatGold(player.gold)}\n` +
        `🏆 **Player Level:** ${player.level}\n\n` +
        `🛍️ **Shop Categories:**\n` +
        `⚔️ **Weapons** (${categories.weapons.length} items) - Arm yourself for battle\n` +
        `🛡️ **Armor** (${categories.armor.length} items) - Protect yourself from harm\n` +
        `🧪 **Consumables** (${categories.consumables.length} items) - Potions and supplies\n` +
        `✨ **Artifacts** (${categories.artifacts.length} items) - Magical treasures\n\n` +
        `*Browse categories below or check out today's featured items!*`
      )
      .setColor(0xFFD700)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: '🧀 "Quality goods at cheesy prices!" - Plagg, Shopkeeper' });

    if (featuredItems.length > 0) {
      embed.addFields({
        name: '⭐ Today\'s Featured Items',
        value: featuredItems.map(item => {
          const canAfford = player.gold >= (item.value || 0);
          const levelOk = player.level >= (item.level || 1);
          const status = !canAfford ? '💸' : !levelOk ? '🔒' : '✅';
          return `${getRarityEmoji(item.rarity)} **${item.name}** ${status} - ${formatGold(item.value || 0)} gold`;
        }).join('\n'),
        inline: false
      });
    }

    const categoryButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('shop_weapons')
          .setLabel(`Weapons (${categories.weapons.length})`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('shop_armor')
          .setLabel(`Armor (${categories.armor.length})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🛡️'),
        new ButtonBuilder()
          .setCustomId('shop_consumables')
          .setLabel(`Consumables (${categories.consumables.length})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('🧪'),
        new ButtonBuilder()
          .setCustomId('shop_artifacts')
          .setLabel(`Artifacts (${categories.artifacts.length})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✨')
      );

    const utilityButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('shop_featured')
          .setLabel('Featured Items')
          .setStyle(ButtonStyle.Success)
          .setEmoji('⭐'),
        new ButtonBuilder()
          .setCustomId('shop_affordable')
          .setLabel('Affordable Items')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💰'),
        new ButtonBuilder()
          .setCustomId('shop_search')
          .setLabel('Search Items')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId('shop_deals')
          .setLabel('Daily Deals')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎯')
      );

    const response = await message.reply({
      embeds: [embed],
      components: [categoryButtons, utilityButtons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      switch (interaction.customId) {
        case 'shop_weapons':
          await this.showCategoryShop(interaction, player, categories.weapons, 'weapons');
          break;
        case 'shop_armor':
          await this.showCategoryShop(interaction, player, categories.armor, 'armor');
          break;
        case 'shop_consumables':
          await this.showCategoryShop(interaction, player, categories.consumables, 'consumables');
          break;
        case 'shop_artifacts':
          await this.showCategoryShop(interaction, player, categories.artifacts, 'artifacts');
          break;
        case 'shop_featured':
          await this.showFeaturedItems(interaction, player, featuredItems);
          break;
        case 'shop_affordable':
          const affordable = items.filter(item => player.gold >= (item.value || 0));
          await this.showAffordableItems(interaction, player, affordable);
          break;
        case 'shop_deals':
          await this.showDailyDeals(interaction, player, items);
          break;
        default:
          await interaction.reply({ 
            content: '🧀 This feature is coming soon! Like aged cheese, good things take time.',
            ephemeral: true 
          });
      }
    });

    collector.on('end', () => {
      const disabledButtons1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(categoryButtons.components[0]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[1]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[2]).setDisabled(true),
          ButtonBuilder.from(categoryButtons.components[3]).setDisabled(true)
        );
      
      const disabledButtons2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(utilityButtons.components[0]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[1]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[2]).setDisabled(true),
          ButtonBuilder.from(utilityButtons.components[3]).setDisabled(true)
        );
      
      response.edit({ components: [disabledButtons1, disabledButtons2] }).catch(() => {});
    });
  },

  async showCategoryShop(message: any, player: any, items: Item[], category: string) {
    const sortedItems = items.sort((a, b) => {
      if (a.level !== b.level) return (a.level || 0) - (b.level || 0);
      return (a.value || 0) - (b.value || 0);
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${category.charAt(0).toUpperCase() + category.slice(1)} Shop`)
      .setDescription(
        `**Your Gold:** ${formatGold(player.gold)}\n\n` +
        `**Available ${category}:** ${sortedItems.length} items\n` +
        `*Click on an item below to view details and purchase!*`
      )
      .setColor(0xFFD700);

    if (sortedItems.length === 0) {
      embed.addFields({
        name: '❌ No Items Available',
        value: 'Check back later for new arrivals!',
        inline: false
      });
    } else {
      const displayItems = sortedItems.slice(0, 8);
      displayItems.forEach(item => {
        const canAfford = player.gold >= (item.value || 0);
        const levelOk = player.level >= (item.level || 1);
        const status = !canAfford ? '💸 Too Expensive' : !levelOk ? '🔒 Level Required' : '✅ Available';
        
        embed.addFields({
          name: `${getRarityEmoji(item.rarity)} ${item.name}`,
          value: 
            `*${item.description.substring(0, 60)}...*\n` +
            `**Price:** ${formatGold(item.value || 0)} | **Level:** ${item.level || 1}\n` +
            `**Status:** ${status}`,
          inline: true
        });
      });
    }

    const itemSelect = new StringSelectMenuBuilder()
      .setCustomId('item_select')
      .setPlaceholder('Select an item to view details...')
      .setMaxValues(1);

    if (sortedItems.length > 0) {
      const selectOptions = sortedItems.slice(0, 15).map(item => ({
        label: item.name,
        description: `${formatGold(item.value || 0)} gold - Level ${item.level || 1}`,
        value: item.id || item.name,
        emoji: getRarityEmoji(item.rarity)
      }));
      itemSelect.addOptions(selectOptions);
    } else {
      itemSelect.addOptions({
        label: 'No items available',
        description: 'Check back later',
        value: 'none'
      }).setDisabled(true);
    }

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(itemSelect);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('shop_back')
          .setLabel('Back to Shop')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️'),
        new ButtonBuilder()
          .setCustomId('shop_sort_price')
          .setLabel('Sort by Price')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💰'),
        new ButtonBuilder()
          .setCustomId('shop_sort_level')
          .setLabel('Sort by Level')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🏆'),
        new ButtonBuilder()
          .setCustomId('shop_filter')
          .setLabel('Filter Items')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔍')
      );

    const components = sortedItems.length > 0 ? [selectRow, buttonRow] : [buttonRow];

    if (message.update) {
      await message.update({ embeds: [embed], components });
    } else {
      await message.reply({ embeds: [embed], components });
    }
  },

  async showItemDetails(interaction: any, player: any, item: Item) {
    const canAfford = player.gold >= (item.value || 0);
    const levelOk = player.level >= (item.level || 1);
    const canBuy = canAfford && levelOk;

    const embed = new EmbedBuilder()
      .setTitle(`${getRarityEmoji(item.rarity)} ${item.name}`)
      .setDescription(item.description)
      .setColor(getRarityColor(item.rarity))
      .addFields(
        {
          name: '💰 Purchase Info',
          value: 
            `**Price:** ${formatGold(item.value || 0)} gold\n` +
            `**Level Requirement:** ${item.level || 1}\n` +
            `**Your Gold:** ${formatGold(player.gold)}\n` +
            `**Can Afford:** ${canAfford ? '✅ Yes' : '❌ No'}\n` +
            `**Level OK:** ${levelOk ? '✅ Yes' : '❌ No'}`,
          inline: true
        }
      );

    if (item.stats) {
      embed.addFields({
        name: '📊 Item Stats',
        value: Object.entries(item.stats).map(([stat, value]) => 
          `**${stat.toUpperCase()}:** +${value}`
        ).join('\n'),
        inline: true
      });
    }

    if (item.plaggComment) {
      embed.addFields({
        name: '🧀 Plagg\'s Review',
        value: `*"${item.plaggComment}"*`,
        inline: false
      });
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_${item.id || item.name}`)
          .setLabel(`Buy for ${formatGold(item.value || 0)}`)
          .setStyle(canBuy ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji('💰')
          .setDisabled(!canBuy),
        new ButtonBuilder()
          .setCustomId('item_compare')
          .setLabel('Compare with Equipped')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚖️'),
        new ButtonBuilder()
          .setCustomId('item_back')
          .setLabel('Back to Shop')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await interaction.update({ embeds: [embed], components: [buttons] });
  },

  async quickBuy(interaction: any, player: any, item: Item) {
    const canAfford = player.gold >= (item.value || 0);
    const levelOk = player.level >= (item.level || 1);

    if (!canAfford) {
      await interaction.reply({
        content: `🧀 You don't have enough gold! You need ${formatGold((item.value || 0) - player.gold)} more.`,
        ephemeral: true
      });
      return;
    }

    if (!levelOk) {
      await interaction.reply({
        content: `🧀 You need to be level ${item.level} to use this item!`,
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎉 Purchase Successful!')
      .setDescription(
        `**You bought:** ${getRarityEmoji(item.rarity)} **${item.name}**\n\n` +
        `**Paid:** ${formatGold(item.value || 0)} gold\n` +
        `**Remaining Gold:** ${formatGold(player.gold - (item.value || 0))}\n\n` +
        `*The item has been added to your inventory!*`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 Thanks for shopping! Come back for more cheese and gear!' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  async showFeaturedItems(interaction: any, player: any, items: Item[]) {
    const embed = new EmbedBuilder()
      .setTitle('⭐ Featured Items of the Day')
      .setDescription('**Hand-picked by Plagg himself!**')
      .setColor(0xFFD700);

    items.forEach(item => {
      const canAfford = player.gold >= (item.value || 0);
      embed.addFields({
        name: `${getRarityEmoji(item.rarity)} ${item.name}`,
        value: 
          `*${item.description}*\n` +
          `**Price:** ${formatGold(item.value || 0)} ${canAfford ? '✅' : '💸'}\n` +
          `*"${item.plaggComment}"*`,
        inline: false
      });
    });

    await interaction.update({ embeds: [embed] });
  },

  async showAffordableItems(interaction: any, player: any, items: Item[]) {
    const embed = new EmbedBuilder()
      .setTitle('💰 Items You Can Afford')
      .setDescription(`**Within your budget of ${formatGold(player.gold)}**`)
      .setColor(0x32CD32);

    if (items.length === 0) {
      embed.addFields({
        name: '💸 No Affordable Items',
        value: 'Keep adventuring to earn more gold!',
        inline: false
      });
    } else {
      items.slice(0, 10).forEach(item => {
        embed.addFields({
          name: `${getRarityEmoji(item.rarity)} ${item.name}`,
          value: `${formatGold(item.value || 0)} gold - *${item.description.substring(0, 50)}...*`,
          inline: true
        });
      });
    }

    await interaction.update({ embeds: [embed] });
  },

  async showDailyDeals(interaction: any, player: any, items: Item[]) {
    const deals = items.filter(() => Math.random() < 0.3).slice(0, 5);
    
    const embed = new EmbedBuilder()
      .setTitle('🎯 Daily Deals - Limited Time!')
      .setDescription('**Special discounts just for today!**')
      .setColor(0xFF6B6B);

    if (deals.length === 0) {
      embed.addFields({
        name: '😔 No Deals Today',
        value: 'Check back tomorrow for new deals!',
        inline: false
      });
    } else {
      deals.forEach(item => {
        const discount = Math.floor(Math.random() * 30) + 10;
        const originalPrice = item.value || 0;
        const salePrice = Math.floor(originalPrice * (100 - discount) / 100);
        
        embed.addFields({
          name: `🔥 ${item.name} - ${discount}% OFF!`,
          value: 
            `~~${formatGold(originalPrice)}~~ **${formatGold(salePrice)} gold**\n` +
            `*${item.description.substring(0, 60)}...*`,
          inline: false
        });
      });
    }

    await interaction.update({ embeds: [embed] });
  }
};

export default command;
