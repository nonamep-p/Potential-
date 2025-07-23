import { prisma } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { loadJsonData } from '../utils/functions.js';

export class TimedEventHandler {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('🕒 Starting timed event handlers');

    // Check market auctions every 60 seconds
    const marketInterval = setInterval(() => {
      this.checkMarketAuctions().catch(error => {
        logger.error('Error checking market auctions:', error);
      });
    }, 60000);

    // Check world events every 5 minutes
    const worldEventInterval = setInterval(() => {
      this.checkWorldEvents().catch(error => {
        logger.error('Error checking world events:', error);
      });
    }, 300000);

    // Performance monitoring every minute
    const metricsInterval = setInterval(() => {
      this.logMetrics();
    }, 60000);

    this.intervals.push(marketInterval, worldEventInterval, metricsInterval);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    logger.info('🕒 Stopped timed event handlers');
  }

  private async checkMarketAuctions() {
    try {
      const expiredListings = await prisma.marketListing.findMany({
        where: {
          expires: {
            lte: new Date()
          }
        }
      });

      for (const listing of expiredListings) {
        // Handle expired auction logic here
        await this.handleExpiredAuction(listing);
        
        // Remove expired listing
        await prisma.marketListing.delete({
          where: { id: listing.id }
        });
      }

      if (expiredListings.length > 0) {
        logger.info(`🏪 Processed ${expiredListings.length} expired market listings`);
      }

    } catch (error) {
      logger.error('Error processing market auctions:', error);
    }
  }

  private async handleExpiredAuction(listing: any) {
    try {
      // Return item to seller if no bids or handle winner
      // This would need to be implemented based on your auction system
      logger.debug(`Handling expired auction: ${listing.id}`);
      
      // Example: Return item to seller
      const seller = await prisma.player.findUnique({
        where: { discordId: listing.sellerId }
      });

      if (seller) {
        const inventory = JSON.parse(seller.inventoryJson);
        const existingItem = inventory.find((item: any) => item.itemId === listing.itemId);
        
        if (existingItem) {
          existingItem.quantity += listing.quantity;
        } else {
          inventory.push({
            itemId: listing.itemId,
            quantity: listing.quantity
          });
        }

        await prisma.player.update({
          where: { discordId: listing.sellerId },
          data: { inventoryJson: JSON.stringify(inventory) }
        });
      }

    } catch (error) {
      logger.error('Error handling expired auction:', error);
    }
  }

  private async checkWorldEvents() {
    try {
      // Check for active world events and their expiration
      const globalData = await prisma.globalData.findUnique({
        where: { key: 'activeWorldEvent' }
      });

      if (globalData) {
        const eventData = JSON.parse(globalData.valueJson);
        
        if (eventData.expires && new Date(eventData.expires) <= new Date()) {
          // Event expired, remove it
          await prisma.globalData.delete({
            where: { key: 'activeWorldEvent' }
          });
          
          logger.info(`🌍 World event '${eventData.name}' has ended`);
        }
      }

    } catch (error) {
      logger.error('Error checking world events:', error);
    }
  }

  private logMetrics() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    logger.debug('📊 Performance Metrics:', {
      uptime: `${Math.floor(uptime / 60)} minutes`,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`
      }
    });
  }
}
