import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { rollDice, getRandomElement, formatGold } from '../../utils/functions.js';
import { PlayerInventory } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'miraculous',
  description: 'Search for miraculous items and mysterious encounters',
  cooldown: 30, // 30 second cooldown due to powerful nature
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (player.inCombat) {
        await message.reply('🧀 You can\'t search for miraculous items while in combat!');
        return;
      }

      if (player.inDungeon) {
        await message.reply('🧀 Focus on your current dungeon adventure! No miraculous distractions.');
        return;
      }

      // Base search with different outcomes
      const searchRoll = rollDice(100);
      const outcome = this.determineOutcome(searchRoll, player.level);

      await this.handleMiraculousOutcome(message, player, outcome);

    } catch (error) {
      logger.error('Error in miraculous command:', error);
      await message.reply('🧀 Failed to search for miraculous items! The magical energies are blocked by cheese residue.');
    }
  },

  determineOutcome(roll: number, playerLevel: number): any {
    // Higher level players get better outcomes
    const levelBonus = Math.floor(playerLevel / 5);
    const adjustedRoll = roll + levelBonus;

    if (adjustedRoll >= 95) {
      return { type: 'miraculous_find', rarity: 'legendary' };
    } else if (adjustedRoll >= 85) {
      return { type: 'miraculous_find', rarity: 'epic' };
    } else if (adjustedRoll >= 70) {
      return { type: 'miraculous_find', rarity: 'rare' };
    } else if (adjustedRoll >= 50) {
      return { type: 'mysterious_encounter' };
    } else if (adjustedRoll >= 30) {
      return { type: 'minor_treasure' };
    } else if (adjustedRoll >= 15) {
      return { type: 'strange_vision' };
    } else {
      return { type: 'nothing_found' };
    }
  },

  async handleMiraculousOutcome(message: Message, player: any, outcome: any) {
    switch (outcome.type) {
      case 'miraculous_find':
        await this.handleMiraculousFind(message, player, outcome.rarity);
        break;
      case 'mysterious_encounter':
        await this.handleMysteriousEncounter(message, player);
        break;
      case 'minor_treasure':
        await this.handleMinorTreasure(message, player);
        break;
      case 'strange_vision':
        await this.handleStrangeVision(message, player);
        break;
      case 'nothing_found':
        await this.handleNothingFound(message, player);
        break;
    }
  },

  async handleMiraculousFind(message: Message, player: any, rarity: string) {
    const miraculousItems = this.getMiraculousItems(rarity);
    const foundItem = getRandomElement(miraculousItems);

    // Add item to inventory
    const inventory: PlayerInventory[] = JSON.parse(player.inventoryJson);
    const existingItem = inventory.find(item => item.itemId === foundItem.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      inventory.push({
        itemId: foundItem.id,
        quantity: 1
      });
    }

    await prisma.player.update({
      where: { discordId: message.author.id },
      data: { inventoryJson: JSON.stringify(inventory) }
    });

    const embed = new EmbedBuilder()
      .setTitle('✨ Miraculous Discovery!')
      .setDescription(
        `**You found a miraculous item!**\n\n` +
        `🌟 **${foundItem.name}** (${rarity})\n` +
        `*${foundItem.description}*\n\n` +
        `${foundItem.effect ? `**Special Effect:** ${foundItem.effect}\n\n` : ''}` +
        `*The item radiates with mysterious power and has been added to your inventory!*`
      )
      .setColor(this.getRarityColor(rarity))
      .setFooter({ text: `🧀 Plagg says: "${foundItem.plaggComment}"` });

    await message.reply({ embeds: [embed] });

    // Check for Isekai scenarios
    await this.checkMiraculousScenarios(message, player, foundItem);
  },

  async handleMysteriousEncounter(message: Message, player: any) {
    const encounters = [
      {
        title: 'Wise Old Sage',
        description: 'You meet a mysterious sage who shares ancient wisdom.',
        reward: { type: 'xp', amount: player.level * 50 },
        message: 'The sage nods approvingly and disappears in a puff of cheese-scented smoke.'
      },
      {
        title: 'Lost Spirit',
        description: 'A lost spirit asks for your help finding peace.',
        reward: { type: 'gold', amount: player.level * 100 },
        message: 'The spirit blesses you with good fortune before fading away.'
      },
      {
        title: 'Magical Fountain',
        description: 'You discover a fountain that restores your vitality.',
        reward: { type: 'heal', amount: player.maxHp },
        message: 'The fountain\'s waters taste surprisingly like cheese.'
      },
      {
        title: 'Time Distortion',
        description: 'Reality warps around you, granting insight into combat.',
        reward: { type: 'stats', str: 2, int: 2, dex: 2, def: 2 },
        message: 'You feel fundamentally changed by the experience.'
      }
    ];

    const encounter = getRandomElement(encounters);

    // Apply rewards
    const updateData: any = {};
    let rewardText = '';

    switch (encounter.reward.type) {
      case 'xp':
        updateData.xp = player.xp + encounter.reward.amount;
        rewardText = `+${encounter.reward.amount} XP`;
        break;
      case 'gold':
        updateData.gold = player.gold + encounter.reward.amount;
        rewardText = `+${formatGold(encounter.reward.amount)} gold`;
        break;
      case 'heal':
        updateData.hp = player.maxHp;
        rewardText = 'Full HP restoration';
        break;
      case 'stats':
        updateData.str = player.str + encounter.reward.str;
        updateData.int = player.int + encounter.reward.int;
        updateData.dex = player.dex + encounter.reward.dex;
        updateData.def = player.def + encounter.reward.def;
        rewardText = '+2 to all stats';
        break;
    }

    await prisma.player.update({
      where: { discordId: message.author.id },
      data: updateData
    });

    const embed = new EmbedBuilder()
      .setTitle(`🌟 Mysterious Encounter: ${encounter.title}`)
      .setDescription(
        `${encounter.description}\n\n` +
        `**Reward:** ${rewardText}\n\n` +
        `*${encounter.message}*`
      )
      .setColor(0x8B008B)
      .setFooter({ text: '🧀 "The mysterious is like cheese - better when aged!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async handleMinorTreasure(message: Message, player: any) {
    const treasures = [
      { name: 'Ancient Coin', gold: player.level * 50, description: 'A coin from a forgotten era.' },
      { name: 'Gemstone Shard', gold: player.level * 75, description: 'A fragment of a precious gem.' },
      { name: 'Old Map Fragment', gold: player.level * 25, description: 'Part of an ancient treasure map.' },
      { name: 'Mysterious Potion', heal: Math.floor(player.maxHp * 0.3), description: 'A small vial of healing liquid.' }
    ];

    const treasure = getRandomElement(treasures);
    const updateData: any = {};
    let rewardText = '';

    if (treasure.gold) {
      updateData.gold = player.gold + treasure.gold;
      rewardText = `${formatGold(treasure.gold)} gold`;
    } else if (treasure.heal) {
      updateData.hp = Math.min(player.hp + treasure.heal, player.maxHp);
      rewardText = `${treasure.heal} HP restored`;
    }

    await prisma.player.update({
      where: { discordId: message.author.id },
      data: updateData
    });

    const embed = new EmbedBuilder()
      .setTitle('💎 Minor Treasure Found')
      .setDescription(
        `**You discovered: ${treasure.name}**\n\n` +
        `*${treasure.description}*\n\n` +
        `**Reward:** ${rewardText}`
      )
      .setColor(0xFFD700)
      .setFooter({ text: '🧀 "Small treasures add up, like cheese crumbs!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async handleStrangeVision(message: Message, player: any) {
    const visions = [
      {
        title: 'Vision of the Past',
        description: 'You see glimpses of ancient battles and forgotten heroes.',
        wisdom: 'The past teaches that strength comes from perseverance.'
      },
      {
        title: 'Prophetic Dream',
        description: 'A brief glimpse of potential futures flashes before your eyes.',
        wisdom: 'The future is shaped by present choices.'
      },
      {
        title: 'Cosmic Revelation',
        description: 'For a moment, you understand the fundamental nature of reality.',
        wisdom: 'All things are connected, like cheese and crackers.'
      },
      {
        title: 'Memory of Power',
        description: 'You remember techniques from a life you\'ve never lived.',
        wisdom: 'Knowledge transcends individual existence.'
      }
    ];

    const vision = getRandomElement(visions);

    // Small permanent benefit
    const statBoost = rollDice(4);
    const statNames = ['str', 'int', 'dex', 'def'];
    const chosenStat = statNames[statBoost - 1];

    await prisma.player.update({
      where: { discordId: message.author.id },
      data: { [chosenStat]: player[chosenStat as keyof typeof player] + 1 }
    });

    const embed = new EmbedBuilder()
      .setTitle(`🔮 ${vision.title}`)
      .setDescription(
        `${vision.description}\n\n` +
        `**Wisdom Gained:** *"${vision.wisdom}"*\n\n` +
        `**Permanent Reward:** +1 ${chosenStat.toUpperCase()}\n\n` +
        `*The vision fades, but its impact remains...*`
      )
      .setColor(0x4B0082)
      .setFooter({ text: '🧀 "Visions are like cheese dreams - strange but enlightening!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async handleNothingFound(message: Message, player: any) {
    const responses = [
      'You search thoroughly but find nothing miraculous... just some cheese crumbs.',
      'The magical energies seem dormant today. Maybe try again later?',
      'You sense something was here recently, but it\'s gone now.',
      'Sometimes the miraculous hides from those who seek it too eagerly.',
      'Your search yields nothing but the sweet scent of aged cheese in the air.'
    ];

    const response = getRandomElement(responses);

    const embed = new EmbedBuilder()
      .setTitle('🔍 Search Complete')
      .setDescription(
        `**Nothing miraculous found this time...**\n\n` +
        `*${response}*\n\n` +
        `*Don't give up! The miraculous reveals itself to those who persist.*`
      )
      .setColor(0x808080)
      .setFooter({ text: '🧀 "Even empty searches are like aged cheese - they build character!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  getMiraculousItems(rarity: string): any[] {
    const items = {
      rare: [
        {
          id: 'miraculous_cheese',
          name: 'Miraculous Cheese Wheel',
          description: 'A wheel of cheese blessed by Plagg himself.',
          effect: 'Restores 50% HP and Mana when consumed',
          plaggComment: 'FINALLY! Someone found my special stash!'
        },
        {
          id: 'lucky_charm',
          name: 'Lucky Charm',
          description: 'A small trinket that brings good fortune.',
          effect: '+10% critical hit chance for 24 hours',
          plaggComment: 'Lucky like finding the perfect cheese!'
        },
        {
          id: 'wisdom_scroll',
          name: 'Scroll of Ancient Wisdom',
          description: 'Contains knowledge from forgotten ages.',
          effect: 'Permanently increases one random stat by 3',
          plaggComment: 'Ancient wisdom, but does it mention cheese recipes?'
        }
      ],
      epic: [
        {
          id: 'kwami_blessing',
          name: 'Kwami\'s Blessing',
          description: 'A blessing from a powerful Kwami spirit.',
          effect: 'Permanently increases all stats by 5',
          plaggComment: 'A blessing from one of my cousins! How thoughtful!'
        },
        {
          id: 'miraculous_stone',
          name: 'Miraculous Stone',
          description: 'A gemstone pulsing with miraculous energy.',
          effect: 'Grants immunity to all debuffs for one battle',
          plaggComment: 'Shiny! Almost as beautiful as molten cheese!'
        },
        {
          id: 'time_fragment',
          name: 'Fragment of Time',
          description: 'A shard containing temporal energy.',
          effect: 'Allows one action to be taken twice in combat',
          plaggComment: 'Time magic! Can it age cheese instantly?'
        }
      ],
      legendary: [
        {
          id: 'plagg_miraculous',
          name: 'Ring of Destruction',
          description: 'The legendary Black Cat Miraculous, source of Plagg\'s power.',
          effect: 'Grants Cataclysm ability - destroy any non-boss enemy instantly (once per day)',
          plaggComment: 'MY MIRACULOUS! How did you... actually, keep it. You\'ve earned it!'
        },
        {
          id: 'creators_gift',
          name: 'Creator\'s Gift',
          description: 'A direct blessing from the creators of the Miraculous.',
          effect: 'Choose any three stats to permanently increase by 10',
          plaggComment: 'The big bosses themselves! This is unprecedented!'
        },
        {
          id: 'cheese_of_power',
          name: 'The Ultimate Cheese',
          description: 'The most perfect cheese in all existence.',
          effect: 'Permanently doubles all stats and grants cheese mastery',
          plaggComment: 'THE ULTIMATE CHEESE! My life\'s purpose is complete!'
        }
      ]
    };

    return items[rarity as keyof typeof items] || items.rare;
  },

  getRarityColor(rarity: string): number {
    const colors = {
      rare: 0x0080FF,
      epic: 0x8000FF,
      legendary: 0xFF8000
    };
    return colors[rarity as keyof typeof colors] || colors.rare;
  },

  async checkMiraculousScenarios(message: Message, player: any, item: any) {
    const completedScenarios = JSON.parse(player.completedScenariosJson);
    
    // "Miraculous Ladybug" - Finding Plagg's Miraculous
    if (!completedScenarios.includes('miraculous_ladybug') && item.id === 'plagg_miraculous') {
      completedScenarios.push('miraculous_ladybug');
      
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          completedScenariosJson: JSON.stringify(completedScenarios),
          str: player.str + 15,
          dex: player.dex + 15,
          maxHp: player.maxHp + 100
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✨ Isekai Scenario: Miraculous Wielder')
        .setDescription(
          `**"With great power comes great responsibility... and great cheese!"**\n\n` +
          `You have found and been chosen by the Black Cat Miraculous!\n\n` +
          `**Permanent Rewards:**\n` +
          `• +15 STR (Miraculous strength)\n` +
          `• +15 DEX (Cat-like agility)\n` +
          `• +100 Max HP (Miraculous resilience)\n` +
          `• Cataclysm ability unlocked`
        )
        .setColor(0x000000)
        .setFooter({ text: '🧀 Plagg says: "Finally! A worthy partner for chaos and cheese!"' });

      setTimeout(() => {
        message.channel.send({ embeds: [embed] });
      }, 2000);
    }
  }
};

export default command;
