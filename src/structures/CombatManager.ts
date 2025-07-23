import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { loadJsonData } from '../utils/functions.js';
import { Monster, Item, CombatState } from '../types.js';

export class CombatManager {
  private combatSessions = new Map<string, CombatState>();

  async startCombat(message: Message, monsterId: string): Promise<boolean> {
    try {
      // Check if player is already in combat
      if (this.combatSessions.has(message.author.id)) {
        await message.reply('🧀 You\'re already in combat! Finish your current battle first.');
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

      // Load monster data
      const monsters = await loadJsonData<Monster[]>('monsters.json');
      const monster = monsters.find(m => m.id === monsterId);

      if (!monster) {
        await message.reply('🧀 That monster doesn\'t exist! Did you make it up?');
        return false;
      }

      // Check level requirement
      if (player.level < monster.level - 5) {
        await message.reply(`🧀 That ${monster.name} is way too strong for you! You need to be at least level ${monster.level - 5}.`);
        return false;
      }

      // Initialize combat state
      const combatState: CombatState = {
        opponent: monsterId,
        opponentType: 'monster',
        turn: this.calculateTurnOrder(player.dex, monster.dex),
        playerHp: player.hp,
        opponentHp: monster.hp,
        buffs: {},
        debuffs: {}
      };

      this.combatSessions.set(message.author.id, combatState);

      // Update player combat status
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: { 
          inCombat: true,
          combatStateJson: JSON.stringify(combatState)
        }
      });

      // Send combat embed
      await this.sendCombatEmbed(message, player, monster, combatState);
      return true;

    } catch (error) {
      logger.error('Error starting combat:', error);
      await message.reply('🧀 Failed to start combat! The cheese gods are not pleased.');
      return false;
    }
  }

  private calculateTurnOrder(playerDex: number, opponentDex: number): 'player' | 'opponent' {
    const playerSpeed = playerDex + Math.random() * 10;
    const opponentSpeed = opponentDex + Math.random() * 10;
    return playerSpeed >= opponentSpeed ? 'player' : 'opponent';
  }

  private async sendCombatEmbed(message: Message, player: any, monster: Monster, state: CombatState) {
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Combat: ${player.username} vs ${monster.name}`)
      .setDescription(`${monster.plaggComment}\n\n**Turn:** ${state.turn === 'player' ? '🧀 Your turn!' : '👹 Enemy turn'}`)
      .addFields(
        { 
          name: '🧀 Your HP', 
          value: `${state.playerHp}/${player.maxHp} ${this.createHealthBar(state.playerHp, player.maxHp)}`, 
          inline: true 
        },
        { 
          name: '👹 Enemy HP', 
          value: `${state.opponentHp}/${monster.hp} ${this.createHealthBar(state.opponentHp, monster.hp)}`, 
          inline: true 
        }
      )
      .setColor(0xFF6B35);

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('combat_attack')
          .setLabel('⚔️ Attack')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(state.turn !== 'player'),
        new ButtonBuilder()
          .setCustomId('combat_skills')
          .setLabel('✨ Skills')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(state.turn !== 'player'),
        new ButtonBuilder()
          .setCustomId('combat_flee')
          .setLabel('🏃 Flee')
          .setStyle(ButtonStyle.Secondary)
      );

    await message.reply({ embeds: [embed], components: [buttons] });
  }

  private createHealthBar(current: number, max: number): string {
    const percentage = current / max;
    const barLength = 10;
    const filledBars = Math.floor(percentage * barLength);
    const emptyBars = barLength - filledBars;
    
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  async executeAttack(userId: string, damage: number): Promise<{ success: boolean, result: string }> {
    const state = this.combatSessions.get(userId);
    if (!state) return { success: false, result: 'No active combat session.' };

    // Apply damage
    if (state.turn === 'player') {
      state.opponentHp = Math.max(0, state.opponentHp - damage);
    } else {
      state.playerHp = Math.max(0, state.playerHp - damage);
    }

    // Check for combat end
    if (state.opponentHp <= 0) {
      await this.endCombat(userId, true);
      return { success: true, result: 'victory' };
    }
    
    if (state.playerHp <= 0) {
      await this.endCombat(userId, false);
      return { success: true, result: 'defeat' };
    }

    // Switch turns
    state.turn = state.turn === 'player' ? 'opponent' : 'player';
    
    return { success: true, result: 'continue' };
  }

  calculateDamage(attackerStats: any, weapon: Item | null, defenderDef: number): number {
    const baseAttack = weapon?.type === 'weapon' ? (weapon.stats?.atk || 0) : 0;
    const statMultiplier = weapon?.stats?.type === 'magic' ? attackerStats.int : attackerStats.str;
    
    const baseDamage = (statMultiplier * 0.5) + baseAttack;
    const mitigation = 100 / (100 + defenderDef);
    const critMultiplier = Math.random() < 0.1 ? 2 : 1; // 10% crit chance
    
    return Math.floor(baseDamage * mitigation * critMultiplier);
  }

  private async endCombat(userId: string, victory: boolean) {
    const state = this.combatSessions.get(userId);
    if (!state) return;

    // Remove from active sessions
    this.combatSessions.delete(userId);

    // Update player in database
    await prisma.player.update({
      where: { discordId: userId },
      data: {
        inCombat: false,
        combatStateJson: '{}',
        hp: state.playerHp
      }
    });

    if (victory) {
      // Award XP and gold
      const monsters = await loadJsonData<Monster[]>('monsters.json');
      const monster = monsters.find(m => m.id === state.opponent);
      
      if (monster) {
        await prisma.player.update({
          where: { discordId: userId },
          data: {
            xp: { increment: monster.xpReward },
            gold: { increment: monster.goldReward }
          }
        });
      }
    }
  }

  getCombatState(userId: string): CombatState | undefined {
    return this.combatSessions.get(userId);
  }
}
