import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { loadJsonData } from '../utils/functions.js';
import { Dungeon, Monster, Item, DungeonState } from '../types.js';

export class DungeonRunner {
  private dungeonSessions = new Map<string, DungeonState>();

  async enterDungeon(message: Message, dungeonId: string): Promise<boolean> {
    try {
      // Check if player is already in a dungeon
      if (this.dungeonSessions.has(message.author.id)) {
        await message.reply('🧀 You\'re already exploring a dungeon! Finish your current adventure first.');
        return false;
      }

      // Get player data
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You need to start your RPG journey first! Use `$startrpg` to begin.');
        return false;
      }

      // Load dungeon data
      const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
      const dungeon = dungeons.find(d => d.id === dungeonId);

      if (!dungeon) {
        await message.reply('🧀 That dungeon doesn\'t exist! Are you hallucinating from too much cheese?');
        return false;
      }

      // Check level requirement
      if (player.level < dungeon.minLevel) {
        await message.reply(`🧀 You need to be at least level ${dungeon.minLevel} to enter ${dungeon.name}!`);
        return false;
      }

      // Initialize dungeon state
      const dungeonState: DungeonState = {
        dungeonId: dungeonId,
        floor: 1,
        hp: player.hp,
        buffs: {},
        completedRooms: 0
      };

      this.dungeonSessions.set(message.author.id, dungeonState);

      // Update player dungeon status
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: { 
          inDungeon: true,
          dungeonStateJson: JSON.stringify(dungeonState)
        }
      });

      // Send dungeon entrance embed
      await this.sendDungeonEmbed(message, player, dungeon, dungeonState);
      return true;

    } catch (error) {
      logger.error('Error entering dungeon:', error);
      await message.reply('🧀 Failed to enter dungeon! The entrance is blocked by moldy cheese.');
      return false;
    }
  }

  private async sendDungeonEmbed(message: Message, player: any, dungeon: Dungeon, state: DungeonState) {
    const embed = new EmbedBuilder()
      .setTitle(`🏰 ${dungeon.name} - Floor ${state.floor}`)
      .setDescription(`${dungeon.description}\n\n${dungeon.plaggComment}`)
      .addFields(
        { 
          name: '🧀 Your HP', 
          value: `${state.hp}/${player.maxHp} ${this.createHealthBar(state.hp, player.maxHp)}`, 
          inline: true 
        },
        { 
          name: '🏰 Floor Progress', 
          value: `${state.floor}/${dungeon.floors}`, 
          inline: true 
        },
        { 
          name: '🚪 Rooms Cleared', 
          value: `${state.completedRooms}`, 
          inline: true 
        }
      )
      .setColor(0x8B4513);

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('dungeon_explore')
          .setLabel('🔍 Explore')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('dungeon_rest')
          .setLabel('💤 Rest')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('dungeon_exit')
          .setLabel('🚪 Exit')
          .setStyle(ButtonStyle.Danger)
      );

    await message.reply({ embeds: [embed], components: [buttons] });
  }

  async exploreRoom(userId: string): Promise<{ success: boolean, encounter: any }> {
    const state = this.dungeonSessions.get(userId);
    if (!state) return { success: false, encounter: null };

    try {
      const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
      const dungeon = dungeons.find(d => d.id === state.dungeonId);
      
      if (!dungeon) return { success: false, encounter: null };

      // Random encounter based on dungeon encounters
      const encounterRoll = Math.random();
      let cumulativeChance = 0;
      let selectedEncounter = null;

      for (const encounter of dungeon.encounters) {
        cumulativeChance += encounter.chance;
        if (encounterRoll <= cumulativeChance) {
          selectedEncounter = encounter;
          break;
        }
      }

      if (!selectedEncounter) {
        selectedEncounter = dungeon.encounters[0]; // Fallback
      }

      state.completedRooms++;

      // Handle different encounter types
      switch (selectedEncounter.type) {
        case 'monster':
          return await this.handleMonsterEncounter(userId, selectedEncounter.id);
        case 'trap':
          return await this.handleTrapEncounter(userId);
        case 'treasure':
          return await this.handleTreasureEncounter(userId);
        case 'boss':
          return await this.handleBossEncounter(userId, selectedEncounter.id);
        default:
          return { success: false, encounter: null };
      }

    } catch (error) {
      logger.error('Error exploring dungeon room:', error);
      return { success: false, encounter: null };
    }
  }

  private async handleMonsterEncounter(userId: string, monsterId: string) {
    const monsters = await loadJsonData<Monster[]>('monsters.json');
    const monster = monsters.find(m => m.id === monsterId);
    
    return {
      success: true,
      encounter: {
        type: 'monster',
        data: monster,
        message: `🧀 You encounter a ${monster?.name}! ${monster?.plaggComment}`
      }
    };
  }

  private async handleTrapEncounter(userId: string) {
    const player = await prisma.player.findUnique({
      where: { discordId: userId }
    });

    if (!player) return { success: false, encounter: null };

    const state = this.dungeonSessions.get(userId);
    if (!state) return { success: false, encounter: null };

    // DEX save to avoid trap
    const dexSave = player.dex + Math.floor(Math.random() * 20);
    const trapDC = 15;

    if (dexSave >= trapDC) {
      return {
        success: true,
        encounter: {
          type: 'trap',
          avoided: true,
          message: '🧀 You narrowly avoid a spike trap! Your cheese-enhanced reflexes saved you!'
        }
      };
    } else {
      const damage = Math.floor(Math.random() * 20) + 10;
      state.hp = Math.max(0, state.hp - damage);
      
      return {
        success: true,
        encounter: {
          type: 'trap',
          avoided: false,
          damage: damage,
          message: `🧀 You trigger a spike trap and take ${damage} damage! Ouch!`
        }
      };
    }
  }

  private async handleTreasureEncounter(userId: string) {
    // Random treasure based on player level
    const player = await prisma.player.findUnique({
      where: { discordId: userId }
    });

    if (!player) return { success: false, encounter: null };

    const goldReward = Math.floor(Math.random() * 100) * player.level;
    
    await prisma.player.update({
      where: { discordId: userId },
      data: { gold: { increment: goldReward } }
    });

    return {
      success: true,
      encounter: {
        type: 'treasure',
        gold: goldReward,
        message: `🧀 You found a treasure chest containing ${goldReward} gold! Time to buy more cheese!`
      }
    };
  }

  private async handleBossEncounter(userId: string, bossId: string) {
    const monsters = await loadJsonData<Monster[]>('monsters.json');
    const boss = monsters.find(m => m.id === bossId);
    
    return {
      success: true,
      encounter: {
        type: 'boss',
        data: boss,
        message: `🧀 The floor boss appears! ${boss?.name} blocks your path! ${boss?.plaggComment}`
      }
    };
  }

  async advanceFloor(userId: string): Promise<boolean> {
    const state = this.dungeonSessions.get(userId);
    if (!state) return false;

    const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
    const dungeon = dungeons.find(d => d.id === state.dungeonId);
    
    if (!dungeon) return false;

    if (state.floor >= dungeon.floors) {
      // Dungeon completed
      await this.completeDungeon(userId);
      return true;
    }

    state.floor++;
    state.completedRooms = 0;
    
    return true;
  }

  private async completeDungeon(userId: string) {
    const state = this.dungeonSessions.get(userId);
    if (!state) return;

    // Remove from active sessions
    this.dungeonSessions.delete(userId);

    // Award completion rewards
    const dungeons = await loadJsonData<Dungeon[]>('dungeons.json');
    const dungeon = dungeons.find(d => d.id === state.dungeonId);
    
    if (dungeon) {
      const xpReward = 100 * dungeon.maxLevel;
      const goldReward = 50 * dungeon.maxLevel;
      
      await prisma.player.update({
        where: { discordId: userId },
        data: {
          inDungeon: false,
          dungeonStateJson: '{}',
          hp: state.hp,
          xp: { increment: xpReward },
          gold: { increment: goldReward }
        }
      });
    }
  }

  async exitDungeon(userId: string) {
    const state = this.dungeonSessions.get(userId);
    if (!state) return;

    this.dungeonSessions.delete(userId);

    await prisma.player.update({
      where: { discordId: userId },
      data: {
        inDungeon: false,
        dungeonStateJson: '{}',
        hp: state.hp
      }
    });
  }

  private createHealthBar(current: number, max: number): string {
    const percentage = current / max;
    const barLength = 10;
    const filledBars = Math.floor(percentage * barLength);
    const emptyBars = barLength - filledBars;
    
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  getDungeonState(userId: string): DungeonState | undefined {
    return this.dungeonSessions.get(userId);
  }
}
