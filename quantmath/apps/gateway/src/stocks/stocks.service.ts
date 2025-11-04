import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { StockEntity } from './stock.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.TWELVEDATA_KEY;
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];
  private readonly maxRetries = 3;
  private readonly logger = new Logger(StocksService.name);

  constructor(
    @InjectRepository(StockEntity)
    private readonly stockRepo: Repository<StockEntity>,
  ) {}

  /** 
   * Fetch stock data for clients from DB
   */
  async findAll(): Promise<StockDto[]> {
    const stocks = await this.stockRepo.find();
    return stocks.map((s) => ({
      symbol: s.symbol,
      price: s.price,
      updatedAt: s.updatedAt,
    }));
  }

  /**
   * Scheduled job: fetch stock prices from Twelve Data API every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateStocksFromAPI() {
    if (!this.apiKey) {
      this.logger.warn('Twelve Data API key not set. Skipping update.');
      return;
    }

    for (const symbol of this.symbols) {
      let success = false;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${this.apiKey}`;
          const response = await axios.get(url);
          const price = parseFloat(response.data.price);

          if (!isNaN(price)) {
            let stock = await this.stockRepo.findOneBy({ symbol });

            if (!stock) {
              stock = this.stockRepo.create({ symbol, price, updatedAt: new Date() });
            } else {
              stock.price = price;
              stock.updatedAt = new Date();
            }

            await this.stockRepo.save(stock);
            success = true;
            this.logger.log(`Updated ${symbol} price to ${price}`);
            break;
          } else {
            this.logger.warn(`Invalid price for ${symbol} (attempt ${attempt})`);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch ${symbol} (attempt ${attempt}): ${err.message}`);
          await new Promise((res) => setTimeout(res, 500)); // 0.5s delay before retry
        }
      }

      if (!success) {
        this.logger.warn(`Failed to update ${symbol} after ${this.maxRetries} attempts`);
      }
    }
  }
}
