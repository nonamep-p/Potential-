import { 
  Message, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType,
  InteractionResponse,
  ButtonInteraction
} from 'discord.js';

export interface PaginatorOptions {
  embeds: EmbedBuilder[];
  time?: number;
  showPageNumbers?: boolean;
  showFirstLast?: boolean;
}

export class Paginator {
  private embeds: EmbedBuilder[];
  private currentPage: number = 0;
  private time: number;
  private showPageNumbers: boolean;
  private showFirstLast: boolean;

  constructor(options: PaginatorOptions) {
    this.embeds = options.embeds;
    this.time = options.time || 60000; // 1 minute default
    this.showPageNumbers = options.showPageNumbers ?? true;
    this.showFirstLast = options.showFirstLast ?? true;
  }

  async start(message: Message): Promise<void> {
    if (this.embeds.length === 0) {
      await message.reply('🧀 No pages to display!');
      return;
    }

    if (this.embeds.length === 1) {
      await message.reply({ embeds: [this.embeds[0]] });
      return;
    }

    const embed = this.getCurrentEmbed();
    const buttons = this.createButtons();

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: this.time
    });

    collector.on('collect', async (interaction: ButtonInteraction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: '🧀 This pagination is not for you! Get your own cheese!',
          ephemeral: true
        });
        return;
      }

      const customId = interaction.customId;

      switch (customId) {
        case 'paginator_first':
          this.currentPage = 0;
          break;
        case 'paginator_previous':
          this.currentPage = Math.max(0, this.currentPage - 1);
          break;
        case 'paginator_next':
          this.currentPage = Math.min(this.embeds.length - 1, this.currentPage + 1);
          break;
        case 'paginator_last':
          this.currentPage = this.embeds.length - 1;
          break;
        case 'paginator_stop':
          collector.stop();
          return;
      }

      const newEmbed = this.getCurrentEmbed();
      const newButtons = this.createButtons();

      await interaction.update({
        embeds: [newEmbed],
        components: [newButtons]
      });
    });

    collector.on('end', async () => {
      try {
        const disabledButtons = this.createButtons(true);
        await response.edit({
          embeds: [this.getCurrentEmbed()],
          components: [disabledButtons]
        });
      } catch (error) {
        // Message might have been deleted
      }
    });
  }

  private getCurrentEmbed(): EmbedBuilder {
    const embed = this.embeds[this.currentPage];
    
    if (this.showPageNumbers && this.embeds.length > 1) {
      const footer = embed.data.footer;
      const pageText = `Page ${this.currentPage + 1}/${this.embeds.length}`;
      
      if (footer) {
        embed.setFooter({
          text: `${footer.text} • ${pageText}`,
          iconURL: footer.icon_url
        });
      } else {
        embed.setFooter({ text: pageText });
      }
    }

    return embed;
  }

  private createButtons(disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const buttons = new ActionRowBuilder<ButtonBuilder>();

    if (this.showFirstLast) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('paginator_first')
          .setLabel('⏪')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled || this.currentPage === 0)
      );
    }

    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('paginator_previous')
        .setLabel('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || this.currentPage === 0),
      new ButtonBuilder()
        .setCustomId('paginator_stop')
        .setLabel('⏹️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('paginator_next')
        .setLabel('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || this.currentPage === this.embeds.length - 1)
    );

    if (this.showFirstLast) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('paginator_last')
          .setLabel('⏩')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled || this.currentPage === this.embeds.length - 1)
      );
    }

    return buttons;
  }
}
