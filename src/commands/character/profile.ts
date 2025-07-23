import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { formatXp, formatGold, createProgressBar, calculateLevel, getXpToNextLevel, getRarityEmoji } from '../../utils/functions.js';
import { loadJsonData } from '../../utils/functions.js';
import { Item } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'profile',
  description: 'View your character profile',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Get target user (default to command user)
      const targetUser = message.mentions.users.first() || message.author;
      
      // Get player data
      const player = await prisma.player.findUnique({
        where: { discordId: targetUser.id }
      });

      if (!player) {
        if (targetUser.id === message.author.id) {
          await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        } else {
          await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
        }
        return;
      }

      // Parse JSON data
      const inventory = JSON.parse(player.inventoryJson);
      const equipment = JSON.parse(player.equipmentJson);
      const completedScenarios = JSON.parse(player.completedScenariosJson);

      // Load item data
      const weapons = await loadJsonData<Item[]>('items/weapons.json');
      const armor = await loadJsonData<Item[]>('items/armor.json');
      const artifacts = await loadJsonData<Item[]>('items/artifacts.json');
      const allItems = [...weapons, ...armor, ...artifacts];

      // Get equipped items
      const equippedWeapon = equipment.weapon ? allItems.find(item => item.id === equipment.weapon) : null;
      const equippedArmor = equipment.armor ? allItems.find(item => item.id === equipment.armor) : null;
      const equippedAccessory = equipment.accessory ? allItems.find(item => item.id === equipment.accessory) : null;

      // Calculate level and XP progress
      const currentLevel = calculateLevel(player.xp);
      const xpToNext = getXpToNextLevel(player.xp);
      const levelProgress = player.level > currentLevel ? 100 : 
        Math.floor(((player.xp - (currentLevel - 1) * (currentLevel - 1) * 100) / (currentLevel * currentLevel * 100 - (currentLevel - 1) * (currentLevel - 1) * 100)) * 100);

      // Create main profile embed
      const embed = new EmbedBuilder()
        .setTitle(`${player.username}'s Profile`)
        .setDescription(
          `${targetUser.id === process.env.OWNER_ID ? '👑 **[THE CHOSEN ONE]**\n' : ''}` +
          `**Class:** ${player.className}\n` +
          `${player.pathName ? `**Path:** ${player.pathName}\n` : ''}` +
          `${player.factionId ? `**Faction:** ${player.factionId}\n` : ''}`
        )
        .setColor(targetUser.id === process.env.OWNER_ID ? 0xFFD700 : 0x8B4513)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          {
            name: '📊 Stats',
            value: 
              `**Level:** ${player.level} (${levelProgress}%)\n` +
              `**XP:** ${formatXp(player.xp)} ${xpToNext > 0 ? `(${formatXp(xpToNext)} to next)` : ''}\n` +
              `**Gold:** ${formatGold(player.gold)} 🪙\n` +
              `**ELO:** ${player.elo} 🏆`,
            inline: true
          },
          {
            name: '❤️ Health & Mana',
            value: 
              `**HP:** ${player.hp}/${player.maxHp} ${createProgressBar(player.hp, player.maxHp)}\n` +
              `**Mana:** ${player.mana}/${player.maxMana} ${createProgressBar(player.mana, player.maxMana)}`,
            inline: true
          },
          {
            name: '⚔️ Combat Stats',
            value: 
              `**STR:** ${player.str}\n` +
              `**INT:** ${player.int}\n` +
              `**DEX:** ${player.dex}\n` +
              `**DEF:** ${player.def}`,
            inline: true
          }
        );

      // Add equipment field if any items are equipped
      if (equippedWeapon || equippedArmor || equippedAccessory) {
        let equipmentText = '';
        if (equippedWeapon) {
          equipmentText += `**Weapon:** ${getRarityEmoji(equippedWeapon.rarity)} ${equippedWeapon.name}\n`;
        }
        if (equippedArmor) {
          equipmentText += `**Armor:** ${getRarityEmoji(equippedArmor.rarity)} ${equippedArmor.name}\n`;
        }
        if (equippedAccessory) {
          equipmentText += `**Accessory:** ${getRarityEmoji(equippedAccessory.rarity)} ${equippedAccessory.name}\n`;
        }
        
        embed.addFields({
          name: '🎒 Equipment',
          value: equipmentText || 'No equipment',
          inline: false
        });
      }

      // Add special status indicators
      let statusText = '';
      if (player.inCombat) statusText += '⚔️ In Combat\n';
      if (player.inDungeon) statusText += '🏰 In Dungeon\n';
      if (completedScenarios.length > 0) statusText += `✨ Isekai Scenarios: ${completedScenarios.length}/15\n`;
      
      if (statusText) {
        embed.addFields({
          name: '🔮 Status',
          value: statusText,
          inline: false
        });
      }

      // Add Plagg's comment
      const plaggComments = [
        "Not bad for a cheese-less human.",
        "Needs more cheese in their diet.",
        "I've seen better, but I've also seen worse.",
        "At least they're trying... I guess.",
        "More interesting than watching Adrien do homework.",
        "Could use some of my chaotic energy.",
        "Reminds me of a particularly bland piece of cheese.",
        "Better than expected, still not cheese level though."
      ];
      
      const randomComment = plaggComments[Math.floor(Math.random() * plaggComments.length)];
      embed.setFooter({ text: `🧀 Plagg says: "${randomComment}"` });

      // Create action buttons (only for own profile)
      const buttons = new ActionRowBuilder<ButtonBuilder>();
      
      if (targetUser.id === message.author.id) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId('profile_inventory')
            .setLabel('🎒 Inventory')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('profile_stats')
            .setLabel('📊 Detailed Stats')
            .setStyle(ButtonStyle.Secondary)
        );

        if (player.level >= 20 && !player.pathName) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId('profile_path')
              .setLabel('🌟 Choose Path')
              .setStyle(ButtonStyle.Success)
          );
        }
      }

      const messageOptions: any = { embeds: [embed] };
      if (buttons.components.length > 0) {
        messageOptions.components = [buttons];
      }

      await message.reply(messageOptions);

    } catch (error) {
      logger.error('Error in profile command:', error);
      await message.reply('🧀 Failed to load profile! The cheese-powered database is having issues.');
    }
  }
};

export default command;
